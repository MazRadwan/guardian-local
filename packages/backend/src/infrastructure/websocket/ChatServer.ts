/**
 * ChatServer - Slim WebSocket orchestrator for Guardian chat functionality
 *
 * Story 28.11.2: Refactored to ~200 lines. All business logic delegated to handlers.
 * Story 36.3.2: Wired SendMessageOrchestrator, deleted MessageHandler.
 *
 * Responsibilities:
 * - Constructor: Dependency injection and handler initialization
 * - setupNamespace(): Event routing to handlers
 * - emitToConversation(): Public helper for external event emission
 * - streamMessage(): Public helper for streaming messages
 *
 * Handler Delegation:
 * - ConnectionHandler: Auth middleware, connection/disconnect events
 * - ConversationHandler: get_conversations, start_new_conversation, delete_conversation, get_history
 * - ModeSwitchHandler: switch_mode event
 * - SendMessageOrchestrator: 7-step send_message pipeline (validation, routing, streaming)
 * - ClaudeStreamingService: Claude API streaming with tool loop support
 * - TitleUpdateService: title generation (consult/assessment) and scoring title updates (Epic 35)
 * - ScoringHandler: scoring operations, vendor_selected event
 * - QuestionnaireHandler: generate_questionnaire, get_export_status events
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationService } from '../../application/services/ConversationService.js';
import { AssessmentService } from '../../application/services/AssessmentService.js';
import { QuestionnaireGenerationService } from '../../application/services/QuestionnaireGenerationService.js';
import { QuestionService } from '../../application/services/QuestionService.js';
import type { IScoringService } from '../../application/interfaces/IScoringService.js';
import type { IClaudeClient } from '../../application/interfaces/IClaudeClient.js';
import type { IFileRepository } from '../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../application/interfaces/IFileStorage.js';
import type { ITextExtractionService } from '../../application/interfaces/ITextExtractionService.js';
import type { IIntakeDocumentParser } from '../../application/interfaces/IIntakeDocumentParser.js';
import { PromptCacheManager } from '../ai/PromptCacheManager.js';
import { RateLimiter } from './RateLimiter.js';
import { QuestionnaireReadyService } from '../../application/services/QuestionnaireReadyService.js';
import { ConnectionHandler } from './handlers/ConnectionHandler.js';
import { ConversationHandler } from './handlers/ConversationHandler.js';
import { ModeSwitchHandler } from './handlers/ModeSwitchHandler.js';
import { ScoringHandler } from './handlers/ScoringHandler.js';
import { QuestionnaireHandler } from './handlers/QuestionnaireHandler.js';
import { SendMessageValidator } from './services/SendMessageValidator.js';
import { SendMessageOrchestrator, type SendMessageOrchestratorDeps } from './services/SendMessageOrchestrator.js';
import type { SendMessagePayload } from './types/SendMessage.js';
import { ToolUseRegistry } from './ToolUseRegistry.js';
import { WebSearchToolService } from '../../application/services/WebSearchToolService.js';
import { ConsultToolLoopService } from './services/ConsultToolLoopService.js';
import { ClaudeStreamingService } from './services/ClaudeStreamingService.js';
import { TitleUpdateService } from './services/TitleUpdateService.js';
import { BackgroundEnrichmentService } from './services/BackgroundEnrichmentService.js';
import type { IJinaClient } from '../../application/interfaces/IJinaClient.js';
import type { VendorValidationService } from '../../application/services/VendorValidationService.js';
import type { ITitleGenerationService } from '../../application/interfaces/ITitleGenerationService.js';
import type { IVisionContentBuilder } from '../../application/interfaces/IVisionContentBuilder.js';
import { ConversationContextBuilder } from './context/ConversationContextBuilder.js';
import { FileContextBuilder } from './context/FileContextBuilder.js';
import { StreamingHandler } from './StreamingHandler.js';
import { ChatContext, createChatContext, IAuthenticatedSocket } from './ChatContext.js';
import { sanitizeErrorForClient } from '../../utils/sanitize.js';

/** Socket.IO socket with user authentication fields */
interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  conversationId?: string;
}

/**
 * Story 33.3.1: Tool status event payload
 * Emitted when web search tool changes status
 */
export interface ToolStatusPayload {
  conversationId: string;
  status: 'searching' | 'reading' | 'idle';
}

export class ChatServer {
  private readonly chatContext: ChatContext;
  private readonly contextBuilder: ConversationContextBuilder;
  private readonly connectionHandler: ConnectionHandler;
  private readonly conversationHandler: ConversationHandler;
  private readonly modeSwitchHandler: ModeSwitchHandler;
  private readonly scoringHandler: ScoringHandler;
  private readonly questionnaireHandler: QuestionnaireHandler;
  private readonly orchestrator: SendMessageOrchestrator;
  private readonly validator: SendMessageValidator;
  private readonly toolRegistry: ToolUseRegistry;
  private readonly streamingService: ClaudeStreamingService;
  private readonly titleUpdateService: TitleUpdateService;
  private readonly backgroundEnrichmentService: BackgroundEnrichmentService;
  private readonly webSearchEnabled: boolean;  // Epic 33: Track if web search is available

  constructor(
    private readonly io: SocketIOServer,
    private readonly conversationService: ConversationService,
    claudeClient: IClaudeClient,
    rateLimiter: RateLimiter,
    jwtSecret: string,
    promptCacheManager: PromptCacheManager,
    assessmentService: AssessmentService,
    _vendorService: unknown, // Preserved for API compatibility
    questionnaireReadyService: QuestionnaireReadyService,
    questionnaireGenerationService: QuestionnaireGenerationService,
    questionService: QuestionService,
    fileRepository: IFileRepository,
    scoringService?: IScoringService,
    fileStorage?: IFileStorage,
    textExtractionService?: ITextExtractionService,
    intakeParser?: IIntakeDocumentParser,
    vendorValidationService?: VendorValidationService,
    titleGenerationService?: ITitleGenerationService,  // Optional - TitleUpdateService handles absence gracefully
    visionContentBuilder?: IVisionContentBuilder,      // Epic 30 Sprint 3: Vision API for image files
    jinaClient?: IJinaClient                          // Epic 33: Jina client for web search in consult mode
  ) {
    // Initialize shared state
    this.chatContext = createChatContext(rateLimiter, promptCacheManager);

    // Initialize context builders
    this.contextBuilder = new ConversationContextBuilder(conversationService, promptCacheManager, fileRepository);
    // Epic 30 Sprint 3: Pass visionContentBuilder to FileContextBuilder for image file support
    const fileContextBuilder = new FileContextBuilder(fileRepository, fileStorage, textExtractionService, visionContentBuilder);
    const streamingHandler = new StreamingHandler();

    // Initialize handlers
    // Epic 30: Pass visionContentBuilder to ConnectionHandler for cache cleanup on disconnect
    this.connectionHandler = new ConnectionHandler(conversationService, jwtSecret, visionContentBuilder);
    this.conversationHandler = new ConversationHandler(conversationService);
    this.modeSwitchHandler = new ModeSwitchHandler(conversationService);
    this.scoringHandler = new ScoringHandler(scoringService, fileRepository, fileStorage, conversationService, claudeClient, vendorValidationService, this.contextBuilder);
    this.questionnaireHandler = new QuestionnaireHandler(questionnaireGenerationService, conversationService, streamingHandler, assessmentService, questionService);

    // Initialize tool registry
    this.toolRegistry = new ToolUseRegistry();
    this.toolRegistry.register(questionnaireReadyService);

    // Epic 33: Register web search tool service if Jina client provided
    // Story 33.3.1: Create status callback factory for tool_status WebSocket events
    this.webSearchEnabled = !!jinaClient;
    if (jinaClient) {
      // Create callback factory that emits tool_status events with conversationId
      const createStatusCallback = (conversationId: string) => {
        return (status: 'searching' | 'reading' | 'idle') => {
          this.io.of('/chat').emit('tool_status', {
            conversationId,
            status,
          } satisfies ToolStatusPayload);
        };
      };

      const webSearchService = new WebSearchToolService(jinaClient, createStatusCallback);
      this.toolRegistry.register(webSearchService);
      console.log('[ChatServer] Web search tool registered for consult mode with status events');
    }

    // Story 34.1.3: Create ConsultToolLoopService for consult mode tool execution
    const consultToolLoopService = new ConsultToolLoopService(
      claudeClient,
      this.toolRegistry,
      conversationService
    );

    // Story 36.2.2: Create ClaudeStreamingService (extracted from MessageHandler)
    this.streamingService = new ClaudeStreamingService(claudeClient, conversationService, consultToolLoopService);

    // Epic 35: Create TitleUpdateService for title generation (extracted from MessageHandler)
    this.titleUpdateService = new TitleUpdateService(conversationService, titleGenerationService);

    // Create BackgroundEnrichmentService for assessment mode file enrichment
    this.backgroundEnrichmentService = new BackgroundEnrichmentService(fileRepository, fileStorage!, intakeParser!);

    // Story 36.1.2: Create validator for send_message validation (extracted from MessageHandler)
    this.validator = new SendMessageValidator(conversationService, fileRepository, rateLimiter);

    // Story 36.3.2: Wire SendMessageOrchestrator (replaces MessageHandler)
    const orchestratorDeps: SendMessageOrchestratorDeps = {
      validator: this.validator,
      streamingService: this.streamingService,
      conversationService,
      contextBuilder: this.contextBuilder,
      fileContextBuilder,
      scoringHandler: this.scoringHandler,
      toolRegistry: this.toolRegistry,
      titleUpdateService: this.titleUpdateService,
      backgroundEnrichmentService: this.backgroundEnrichmentService,
      webSearchEnabled: this.webSearchEnabled,
    };
    this.orchestrator = new SendMessageOrchestrator(orchestratorDeps);

    this.setupNamespace();
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [userId, { timestamp }] of this.chatContext.pendingCreations.entries()) {
        if (now - timestamp > 1000) this.chatContext.pendingCreations.delete(userId);
      }
    }, 5000).unref();
  }

  private setupNamespace(): void {
    const chatNamespace = this.io.of('/chat');
    chatNamespace.use(this.connectionHandler.createAuthMiddleware());

    chatNamespace.on('connection', async (socket: AuthenticatedSocket) => {
      await this.connectionHandler.handleConnection(socket);

      // send_message - Main message handling with mode-specific routing
      // Story 36.3.2: Delegates to SendMessageOrchestrator, ChatServer is the safety net
      socket.on('send_message', async (payload: SendMessagePayload) => {
        try {
          await this.orchestrator.execute(socket as IAuthenticatedSocket, payload);
        } catch (error) {
          console.error('[ChatServer] Error sending message:', error);
          socket.emit('error', { event: 'send_message', message: sanitizeErrorForClient(error, 'Failed to send message') });
        }
      });

      // Conversation lifecycle events
      socket.on('get_history', (p) => this.conversationHandler.handleGetHistory(socket as IAuthenticatedSocket, p));
      socket.on('get_conversations', () => this.conversationHandler.handleGetConversations(socket as IAuthenticatedSocket));
      socket.on('start_new_conversation', (p) => this.conversationHandler.handleStartNewConversation(socket as IAuthenticatedSocket, p, this.chatContext));
      socket.on('delete_conversation', (p) => this.conversationHandler.handleDeleteConversation(socket as IAuthenticatedSocket, p));

      // Mode and scoring events
      socket.on('switch_mode', (p) => this.modeSwitchHandler.handleSwitchMode(socket as IAuthenticatedSocket, p));
      socket.on('vendor_selected', (p) => this.scoringHandler.handleVendorSelected(socket as IAuthenticatedSocket, p));

      // Questionnaire events
      socket.on('generate_questionnaire', async (p) => {
        if (!socket.userId) { socket.emit('error', { event: 'generate_questionnaire', message: 'Not authenticated' }); return; }
        await this.questionnaireHandler.handleGenerateQuestionnaire(socket as IAuthenticatedSocket, p, socket.userId, this.chatContext);
      });
      socket.on('get_export_status', (p) => this.questionnaireHandler.handleGetExportStatus(socket as IAuthenticatedSocket, p));

      // Stream abort handling
      socket.on('abort_stream', () => {
        socket.data.abortRequested = true;
        if (socket.conversationId) this.chatContext.abortedStreams.add(socket.conversationId);
        socket.emit('stream_aborted', { conversationId: socket.conversationId });
      });

      socket.on('disconnect', (reason) => this.connectionHandler.handleDisconnect(socket, reason));
    });

    console.log('[ChatServer] WebSocket /chat namespace configured');
  }

  /** Emit event to all sockets in a conversation room */
  emitToConversation(conversationId: string, event: string, data: unknown): void {
    this.io.of('/chat').emit(event, { conversationId, ...(data as object) });
  }

  /** Stream a message chunk to a conversation */
  streamMessage(conversationId: string, chunk: string): void {
    this.io.of('/chat').emit('message:stream', { conversationId, chunk });
  }
}
