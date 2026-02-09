/**
 * ChatServer - Slim WebSocket orchestrator for Guardian chat functionality
 *
 * Story 28.11.2: Refactored to ~200 lines. All business logic delegated to handlers.
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
 * - MessageHandler: send_message validation, streaming, auto-summarize, enrichment
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
import { MessageHandler, type SendMessagePayload } from './handlers/MessageHandler.js';
import { ToolUseRegistry } from './ToolUseRegistry.js';
import type { ToolUseInput, ToolUseContext } from '../../application/interfaces/IToolUseHandler.js';
import { assessmentModeTools, consultModeTools } from '../ai/tools/index.js';
import { WebSearchToolService } from '../../application/services/WebSearchToolService.js';
import { ConsultToolLoopService } from './services/ConsultToolLoopService.js';
import { TitleUpdateService } from './services/TitleUpdateService.js';
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
  private readonly messageHandler: MessageHandler;
  private readonly toolRegistry: ToolUseRegistry;
  private readonly titleUpdateService: TitleUpdateService;
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
    titleGenerationService?: ITitleGenerationService,  // Optional - MessageHandler handles absence gracefully
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

    // Epic 35: Create TitleUpdateService for title generation (extracted from MessageHandler)
    this.titleUpdateService = new TitleUpdateService(conversationService, titleGenerationService);

    // Initialize MessageHandler with all dependencies for Story 28.11.2
    // Story 34.1.3: Pass consultToolLoopService instead of toolRegistry
    // Story 35.1.2: Removed titleGenerationService (now in TitleUpdateService)
    this.messageHandler = new MessageHandler(
      conversationService, fileRepository, rateLimiter, fileContextBuilder, claudeClient,
      fileStorage, intakeParser, this.toolRegistry, consultToolLoopService
    );

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
      socket.on('send_message', async (payload: SendMessagePayload) => {
        try {
          await this.handleSendMessage(socket, payload);
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

  /**
   * Handle send_message event - orchestrates validation, routing, and streaming
   */
  private async handleSendMessage(socket: AuthenticatedSocket, payload: SendMessagePayload): Promise<void> {
    // Step 1: Validate
    const validation = await this.messageHandler.validateSendMessage(socket as IAuthenticatedSocket, payload);
    if (!validation.valid) {
      // Story 31.2: Emit file_processing_error when files are missing after retry
      if (validation.emitFileProcessingError && validation.conversationId) {
        socket.emit('file_processing_error', {
          conversationId: validation.conversationId,
          missingFileIds: validation.missingFileIds || [],
          message: validation.error?.message || 'Some files are still processing. Please wait a moment and try again.',
        });
        return;
      }
      socket.emit('error', validation.error);
      return;
    }

    const { conversationId, messageText, enrichedAttachments } = validation;
    const hasAttachments = !!(enrichedAttachments && enrichedAttachments.length > 0);

    // Step 2: Save user message (skip for regenerate - message already exists in DB)
    // When isRegenerate is true, the user message already exists from the original send,
    // we're just requesting a different assistant response
    let finalText = messageText || '';
    if (!finalText && hasAttachments) {
      finalText = `[Uploaded file for analysis: ${enrichedAttachments!.map(a => a.filename).join(', ')}]`;
    }
    if (!payload.isRegenerate) {
      const message = await this.conversationService.sendMessage({
        conversationId: conversationId!,
        role: 'user',
        content: { text: finalText, components: payload.components },
        attachments: enrichedAttachments,
      });
      (socket as IAuthenticatedSocket).emit('message_sent', {
        messageId: message.id,
        conversationId: message.conversationId,
        timestamp: message.createdAt,
        attachments: enrichedAttachments,
      });
    } else {
      // Delete old assistant message so Claude gets clean context (no stale tool_use/tool_result)
      const history = await this.conversationService.getHistory(conversationId!, 1, 0);
      const lastMsg = history[0];
      if (lastMsg?.role === 'assistant') {
        await this.conversationService.deleteMessage(lastMsg.id);
      }
    }

    // Step 3: Get context and mode config
    const { messages, systemPrompt, promptCache, mode } = await this.contextBuilder.build(conversationId!, payload.isRegenerate);
    const modeConfig = this.messageHandler.getModeConfig(mode);

    // Step 4: Scoring mode bypass
    if (modeConfig.bypassClaude && hasAttachments) {
      const fileIds = enrichedAttachments!.map(a => a.fileId);
      if (enrichedAttachments![0]?.filename) await this.titleUpdateService.updateScoringTitle(socket as IAuthenticatedSocket, conversationId!, enrichedAttachments![0].filename);
      const userQuery = messageText && !messageText.startsWith('[Uploaded file') ? messageText : undefined;
      await this.scoringHandler.triggerScoringOnSend(socket as IAuthenticatedSocket, conversationId!, socket.userId!, fileIds, userQuery, (id) => this.contextBuilder.build(id));
      return;
    }

    // Step 5: Auto-summarize in consult mode
    if (this.messageHandler.shouldAutoSummarize(mode, !!messageText, hasAttachments)) {
      await this.messageHandler.autoSummarizeDocuments(socket as IAuthenticatedSocket, conversationId!, socket.userId!, enrichedAttachments!.map(a => a.fileId));
      return;
    }

    // Step 6: Build enhanced prompt with file context (Epic 30 Sprint 3: now includes imageBlocks)
    // Epic 30 Sprint 4 Story 30.4.3: Pass mode for Vision API gating (only consult gets imageBlocks)
    let enhancedPrompt = systemPrompt;
    let imageBlocks: import('../ai/types/vision.js').ImageContentBlock[] = [];
    if (mode === 'consult' || mode === 'assessment') {
      const fileContextResult = await this.messageHandler.buildFileContext(conversationId!, undefined, mode);
      if (fileContextResult.textContext) {
        enhancedPrompt = `${systemPrompt}${fileContextResult.textContext}`;
      }
      imageBlocks = fileContextResult.imageBlocks;
    }

    // Step 7: Stream Claude response (Epic 30 Sprint 3: pass imageBlocks for Vision API)
    // Epic 33: Use mode-specific tool arrays (consult gets web_search, assessment gets questionnaire_ready)
    // Story 33.2.2: Pass mode and source for tool loop gating
    // Epic 33 Fix: Only pass consultModeTools if webSearchToolService is registered (prevents "Tool execution failed")
    const tools = modeConfig.enableTools
      ? (mode === 'consult'
          ? (this.webSearchEnabled ? consultModeTools : undefined)  // Gate consult tools by handler presence
          : assessmentModeTools)
      : undefined;
    const result = await this.messageHandler.streamClaudeResponse(socket as IAuthenticatedSocket, conversationId!, messages, enhancedPrompt, {
      enableTools: modeConfig.enableTools,
      tools,
      usePromptCache: promptCache?.usePromptCache || false,
      cachedPromptId: promptCache?.cachedPromptId,
      imageBlocks,
      mode,                        // Story 33.2.2: Tool loop gating
      source: 'user_input',        // Story 33.2.2: User-initiated message triggers tool loop
    });

    // Step 8: Post-streaming (tool use, enrichment, title generation)
    if (!result.wasAborted) {
      for (const toolUse of result.toolUseBlocks) {
        const input: ToolUseInput = { toolName: toolUse.name, toolUseId: toolUse.id, input: toolUse.input };
        const ctx: ToolUseContext = { conversationId: conversationId!, userId: socket.userId!, assessmentId: null, mode };
        const res = await this.toolRegistry.dispatch(input, ctx);
        if (res.handled && res.emitEvent) socket.emit(res.emitEvent.event, res.emitEvent.payload);
      }

      if (modeConfig.backgroundEnrich && hasAttachments) {
        this.messageHandler.enrichInBackground(conversationId!, enrichedAttachments!.map(a => a.fileId)).catch(e => console.error('[ChatServer] Enrichment failed:', e));
      }

      this.titleUpdateService.generateTitleIfNeeded(socket as IAuthenticatedSocket, conversationId!, mode, result.fullResponse).catch(e => console.error('[ChatServer] Title generation failed:', e));
    }
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
