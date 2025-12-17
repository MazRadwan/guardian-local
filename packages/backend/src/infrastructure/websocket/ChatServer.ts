import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationService } from '../../application/services/ConversationService.js';
import { AssessmentService } from '../../application/services/AssessmentService.js';
import { VendorService } from '../../application/services/VendorService.js';
import { QuestionnaireGenerationService } from '../../application/services/QuestionnaireGenerationService.js';
import { QuestionService } from '../../application/services/QuestionService.js';
import type { IClaudeClient, ClaudeMessage, ToolUseBlock } from '../../application/interfaces/IClaudeClient.js';
import { PromptCacheManager } from '../ai/PromptCacheManager.js';
import { RateLimiter } from './RateLimiter.js';
import jwt from 'jsonwebtoken';
import { QuestionnaireReadyService } from '../../application/services/QuestionnaireReadyService.js';
import { assessmentModeTools } from '../ai/tools/index.js';
import type { GenerationPhasePayload, GenerationPhaseId } from '@guardian/shared';
import type { IntakeDocumentContext } from '../../domain/entities/Conversation.js';
import type { MessageAttachment } from '../../domain/entities/Message.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  conversationId?: string; // Auto-created conversation ID for this socket session
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

interface SendMessagePayload {
  conversationId?: string; // Optional - can use socket.conversationId
  text?: string; // Message text (preferred)
  content?: string; // Backward compatibility with frontend
  components?: Array<{
    type: 'button' | 'link' | 'code' | 'form';
    data: unknown;
  }>;
  // Epic 16.6.8: File attachments for file-with-message sends
  attachments?: MessageAttachment[];
}

interface GetHistoryPayload {
  conversationId: string;
  limit?: number;
  offset?: number;
}

interface GenerateQuestionnairePayload {
  conversationId: string;
  assessmentType?: string;
  vendorName?: string;
  solutionName?: string;
  contextSummary?: string;
  selectedCategories?: string[];
}

export class ChatServer {
  private io: SocketIOServer;
  private conversationService: ConversationService;
  private claudeClient: IClaudeClient;
  private rateLimiter: RateLimiter;
  private jwtSecret: string;
  private promptCacheManager: PromptCacheManager;
  private pendingConversationCreations: Map<string, { conversationId: string; timestamp: number }>;
  private abortedStreams: Set<string> = new Set();

  constructor(
    io: SocketIOServer,
    conversationService: ConversationService,
    claudeClient: IClaudeClient,
    rateLimiter: RateLimiter,
    jwtSecret: string,
    promptCacheManager: PromptCacheManager,
    private readonly assessmentService: AssessmentService,
    private readonly vendorService: VendorService,
    private readonly questionnaireReadyService: QuestionnaireReadyService,
    private readonly questionnaireGenerationService: QuestionnaireGenerationService,
    private readonly questionService: QuestionService
  ) {
    this.io = io;
    this.conversationService = conversationService;
    this.claudeClient = claudeClient;
    this.rateLimiter = rateLimiter;
    this.jwtSecret = jwtSecret;
    this.promptCacheManager = promptCacheManager;
    this.pendingConversationCreations = new Map();
    this.setupNamespace();

    // Clean up stale pending creations every 5 seconds
    // .unref() allows Node.js to exit even if interval is running (for tests)
    setInterval(() => {
      const now = Date.now();
      for (const [userId, { timestamp }] of this.pendingConversationCreations.entries()) {
        if (now - timestamp > 1000) { // 1 second timeout (generous cleanup window)
          this.pendingConversationCreations.delete(userId);
        }
      }
    }, 5000).unref();
  }

  /**
   * Build conversation context for Claude API
   * Loads recent message history and selects appropriate system prompt
   *
   * Epic 16.6.1: Injects stored intake context as synthetic assistant message
   * This ensures Claude sees uploaded document context without a visible chat message
   */
  private async buildConversationContext(
    conversationId: string
  ): Promise<{
    messages: ClaudeMessage[];
    systemPrompt: string;
    mode: 'consult' | 'assessment';
    promptCache: { usePromptCache: boolean; cachedPromptId?: string };
  }> {
    // Get conversation to determine mode
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Load last 10 messages for context
    const history = await this.conversationService.getHistory(conversationId, 10);

    // Format messages for Claude API (only user/assistant, skip system messages)
    const messages: ClaudeMessage[] = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content.text || '',
      }));

    // Epic 16.6.1: Inject stored intake context as synthetic assistant message
    // This preserves base system prompt for caching while giving Claude document knowledge
    // The synthetic message is prepended so Claude "remembers" analyzing the document
    if (conversation.context?.intakeContext) {
      const contextMessage = this.formatIntakeContextForClaude(
        conversation.context.intakeContext,
        conversation.context.intakeGapCategories
      );
      // Prepend as first assistant message (Claude sees it, user doesn't)
      messages.unshift({
        role: 'assistant',
        content: contextMessage,
      });
    }

    // Get system prompt (and cache metadata) based on conversation mode
    // Always include tool instructions (tool-based trigger is now the only path)
    const promptCache = this.promptCacheManager.ensureCached(conversation.mode, {
      includeToolInstructions: true,
    });

    return {
      messages,
      systemPrompt: promptCache.systemPrompt,
      mode: conversation.mode,
      promptCache: {
        usePromptCache: promptCache.usePromptCache,
        cachedPromptId: promptCache.cachedPromptId,
      },
    };
  }

  /**
   * Format stored intake context as synthetic assistant message for Claude
   *
   * Epic 16.6.1: This is NOT displayed to users - it's injected into Claude's message history
   * so Claude "remembers" having analyzed the uploaded document.
   */
  private formatIntakeContextForClaude(
    ctx: IntakeDocumentContext,
    gapCategories?: string[]
  ): string {
    const parts: string[] = [
      'I have analyzed the uploaded document and extracted the following context:',
    ];

    if (ctx.vendorName) parts.push(`- Vendor: ${ctx.vendorName}`);
    if (ctx.solutionName) parts.push(`- Solution: ${ctx.solutionName}`);
    if (ctx.solutionType) parts.push(`- Type: ${ctx.solutionType}`);
    if (ctx.industry) parts.push(`- Industry: ${ctx.industry}`);
    if (ctx.features?.length) parts.push(`- Key Features: ${ctx.features.slice(0, 5).join(', ')}`);
    if (ctx.claims?.length) parts.push(`- Claims: ${ctx.claims.slice(0, 3).join(', ')}`);
    if (ctx.complianceMentions?.length) parts.push(`- Compliance Mentions: ${ctx.complianceMentions.join(', ')}`);
    if (gapCategories?.length) parts.push(`- Areas Needing Clarification: ${gapCategories.join(', ')}`);

    parts.push('', 'I will use this context to assist with the assessment.');
    return parts.join('\n');
  }

  /**
   * Validate that a conversation belongs to the requesting user
   * @throws Error if conversation not found or doesn't belong to user
   */
  private async validateConversationOwnership(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      console.warn(`[ChatServer] SECURITY: User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`);
      throw new Error('Unauthorized: You do not have access to this conversation');
    }
  }

  private setupNamespace(): void {
    const chatNamespace = this.io.of('/chat');

    // Authentication middleware
    chatNamespace.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;
        next();
      } catch (error) {
        console.error('[ChatServer] Authentication failed:', error);
        next(new Error('Invalid authentication token'));
      }
    });

    // Connection handler
    chatNamespace.on('connection', async (socket: AuthenticatedSocket) => {
      console.log(`[ChatServer] Client connected: ${socket.id} (User: ${socket.userId})`);

      // Join user-specific room for receiving document upload progress events
      // This room is used by DocumentUploadController to emit upload_progress,
      // intake_context_ready, and scoring_parse_ready events
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
        console.log(`[ChatServer] Socket ${socket.id} joined room user:${socket.userId}`);
      }

      // Check if client wants to resume an existing conversation
      const resumeConversationId = socket.handshake.auth.conversationId;
      let conversation = null;
      let resumed = false;

      if (resumeConversationId) {
        try {
          // Try to resume existing conversation
          const existing = await this.conversationService.getConversation(resumeConversationId);

          // Validate ownership - only allow resuming own conversations
          if (existing && existing.userId === socket.userId) {
            conversation = existing;
            resumed = true;
            console.log(`[ChatServer] Resumed conversation ${resumeConversationId} for user ${socket.userId}`);
          } else {
            // Invalid or not owned - do NOT auto-create
            console.log(`[ChatServer] Cannot resume conversation ${resumeConversationId} - user must create new conversation explicitly`);
          }
        } catch (error) {
          // Resume failed - do NOT auto-create
          console.error('[ChatServer] Error resuming conversation:', error);
          console.log('[ChatServer] User must create new conversation explicitly');
        }
      } else {
        // No saved conversation - do NOT auto-create
        // Frontend will request new conversation via start_new_conversation event
        console.log(`[ChatServer] No saved conversation - awaiting explicit new conversation request from user ${socket.userId}`);
      }

      // Store conversationId in socket for this session (may be null)
      socket.conversationId = conversation?.id;

      // Send connection confirmation with conversationId (may be undefined)
      socket.emit('connection_ready', {
        message: resumed ? 'Reconnected to existing conversation' : 'Connected to Guardian chat server',
        userId: socket.userId,
        conversationId: conversation?.id,
        resumed,
        hasActiveConversation: conversation !== null,
        assessmentId: conversation?.assessmentId || null,
      });

      // Handle send_message event
      socket.on('send_message', async (payload: SendMessagePayload) => {
        try {
          // Validate payload
          if (!payload || typeof payload !== 'object') {
            socket.emit('error', {
              event: 'send_message',
              message: 'Invalid message payload',
            });
            return;
          }

          // CRITICAL: conversationId MUST be provided by client
          const conversationId = payload.conversationId;
          const messageText = payload.text || payload.content; // Support both formats
          const attachments = payload.attachments; // Epic 16.6.8

          // Validate conversationId is provided
          if (!conversationId) {
            socket.emit('error', {
              event: 'send_message',
              message: 'Conversation ID required',
            });
            return;
          }

          // Epic 16.6.8: Allow file-only messages (no text, but has attachments)
          const hasAttachments = attachments && attachments.length > 0;
          const hasText = messageText && typeof messageText === 'string' && messageText.trim().length > 0;

          // Validate: must have text OR attachments (or both)
          if (!hasText && !hasAttachments) {
            socket.emit('error', {
              event: 'send_message',
              message: 'Message text or attachments required',
            });
            return;
          }

          // Validate conversation ownership
          if (!socket.userId) {
            socket.emit('error', {
              event: 'send_message',
              message: 'User not authenticated',
            });
            return;
          }

          try {
            await this.validateConversationOwnership(conversationId, socket.userId);
          } catch (error) {
            socket.emit('error', {
              event: 'send_message',
              message: error instanceof Error ? error.message : 'Unauthorized access',
            });
            return;
          }

          // Check rate limit
          if (socket.userId && this.rateLimiter.isRateLimited(socket.userId)) {
            const resetTime = this.rateLimiter.getResetTime(socket.userId);
            socket.emit('error', {
              event: 'send_message',
              message: `Rate limit exceeded. Please wait ${resetTime} seconds before sending more messages.`,
              code: 'RATE_LIMIT_EXCEEDED',
            });
            return;
          }

          console.log(
            `[ChatServer] Message received from ${socket.userId} for conversation ${conversationId}`
          );

          // Save user message (Epic 16.6.8: include attachments)
          const message = await this.conversationService.sendMessage({
            conversationId,
            role: 'user',
            content: {
              text: messageText || '', // Allow empty text for file-only messages
              components: payload.components,
            },
            attachments: hasAttachments ? attachments : undefined,
          });

          // Emit confirmation with attachments (Epic 16.6.8)
          socket.emit('message_sent', {
            messageId: message.id,
            conversationId: message.conversationId,
            timestamp: message.createdAt,
            attachments: message.attachments, // Include for frontend rendering
          });

          // Check if this is the first user message and emit title update
          const messageCount = await this.conversationService.getMessageCount(conversationId);
          if (messageCount === 1) {
            // This is the first user message - generate and emit title
            const title = await this.conversationService.getConversationTitle(conversationId);
            socket.emit('conversation_title_updated', {
              conversationId,
              title,
            });
          }

          // Get conversation context and generate Claude response
          // Note: buildConversationContext loads history which already includes
          // the message we just saved above, so no need to add it again
          const { messages, systemPrompt, promptCache, mode } = await this.buildConversationContext(conversationId);

          // Stream Claude response
          let fullResponse = '';

          try {
            // Reset abort flag before starting stream
            socket.data.abortRequested = false;

            // Emit stream start event (no partial message in DB yet)
            socket.emit('assistant_stream_start', {
              conversationId,
            });

            // Determine if we should pass tools (always in assessment mode)
            const shouldUseTool = mode === 'assessment';

            // Build Claude options with optional tools
            const claudeOptions = {
              systemPrompt,
              usePromptCache: promptCache?.usePromptCache || false,
              ...(promptCache?.cachedPromptId && { cachedPromptId: promptCache.cachedPromptId }),
              // Conditionally add tools
              ...(shouldUseTool && { tools: assessmentModeTools }),
            };

            // Track tool use during streaming
            let toolUseBlocks: ToolUseBlock[] = [];

            // Stream response chunks from Claude
            // Use messages directly - current message already in history
            for await (const chunk of this.claudeClient.streamMessage(messages, claudeOptions)) {
              // Check if stream was aborted by user
              if (socket.data.abortRequested) {
                console.log(`[ChatServer] Stream aborted by user, breaking loop`);
                break;
              }

              if (!chunk.isComplete && chunk.content) {
                fullResponse += chunk.content;

                // Emit each chunk to client
                socket.emit('assistant_token', {
                  conversationId,
                  token: chunk.content,
                });
              }

              // Capture tool use from final chunk
              if (chunk.isComplete && chunk.toolUse) {
                toolUseBlocks = chunk.toolUse;
              }
            }

            // Save message to database (even if aborted, save partial response)
            let savedMessageId: string | null = null;

            if (fullResponse.length > 0) {
              const completeMessage = await this.conversationService.sendMessage({
                conversationId,
                role: 'assistant',
                content: { text: fullResponse },
              });
              savedMessageId = completeMessage.id;
            }

            // Handle completion (only if not aborted)
            if (!socket.data.abortRequested) {
              // Emit assistant_done even for tool-only responses (no text)
              // This stops the "thinking" spinner in the UI
              socket.emit('assistant_done', {
                messageId: savedMessageId,
                conversationId,
                fullText: fullResponse,
                assessmentId: null,
              });

              // Handle tool use if present (works even when fullResponse is empty)
              if (toolUseBlocks.length > 0) {
                console.log(`[ChatServer] Processing ${toolUseBlocks.length} tool use block(s)`);
                await this.handleToolUse(socket, toolUseBlocks, {
                  conversationId,
                  userId: socket.userId!,
                  assessmentId: null,
                  mode: mode,
                });
              }
            } else {
              console.log(`[ChatServer] Stream aborted - partial response saved (${fullResponse.length} chars)`);
            }
          } catch (claudeError) {
            console.error('[ChatServer] Claude API error:', claudeError);

            // Send user-friendly error message
            const errorMessage = await this.conversationService.sendMessage({
              conversationId,
              role: 'system',
              content: {
                text: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
              },
            });

            socket.emit('message', {
              id: errorMessage.id,
              conversationId: errorMessage.conversationId,
              role: errorMessage.role,
              content: errorMessage.content,
              createdAt: errorMessage.createdAt,
            });
          }
        } catch (error) {
          console.error('[ChatServer] Error sending message:', error);
          socket.emit('error', {
            event: 'send_message',
            message: error instanceof Error ? error.message : 'Failed to send message',
          });
        }
      });

      // Handle get_history event
      socket.on('get_history', async (payload: GetHistoryPayload) => {
        try {
          console.log(
            `[ChatServer] History requested for conversation ${payload.conversationId}`
          );

          // Validate conversation ownership
          if (!socket.userId) {
            socket.emit('error', {
              event: 'get_history',
              message: 'User not authenticated',
            });
            return;
          }

          // CRITICAL FIX: Check if conversation exists first (idempotent history)
          const conversation = await this.conversationService.getConversation(payload.conversationId);

          if (!conversation) {
            // IDEMPOTENT: Conversation doesn't exist (likely deleted) - return empty history
            console.log(`[ChatServer] Conversation ${payload.conversationId} not found - returning empty history`);
            socket.emit('history', {
              conversationId: payload.conversationId,
              messages: [],
            });
            return;
          }

          // Only validate ownership if conversation exists
          await this.validateConversationOwnership(payload.conversationId, socket.userId);

          const messages = await this.conversationService.getHistory(
            payload.conversationId,
            payload.limit,
            payload.offset
          );

          socket.emit('history', {
            conversationId: payload.conversationId,
            messages: messages.map((msg) => ({
              id: msg.id,
              conversationId: msg.conversationId,
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
              // Epic 16.6.8: Include attachments for file display in chat history
              ...(msg.attachments && msg.attachments.length > 0 && { attachments: msg.attachments }),
            })),
          });
        } catch (error) {
          console.error('[ChatServer] Error getting history:', error);
          socket.emit('error', {
            event: 'get_history',
            message: error instanceof Error ? error.message : 'Failed to get history',
          });
        }
      });

      // Handle get_conversations event
      socket.on('get_conversations', async () => {
        try {
          if (!socket.userId) {
            socket.emit('error', {
              event: 'get_conversations',
              message: 'User not authenticated',
            });
            return;
          }

          console.log(`[ChatServer] Fetching conversations for user ${socket.userId}`);

          const conversations = await this.conversationService.getUserConversations(socket.userId);

          console.log(`[ChatServer] Found ${conversations.length} conversations for user ${socket.userId}`);

          // Generate titles for each conversation
          const conversationsWithMetadata = await Promise.all(
            conversations.map(async (conv) => {
              const title = await this.conversationService.getConversationTitle(conv.id);

              return {
                id: conv.id,
                title,
                createdAt: conv.startedAt,
                updatedAt: conv.lastActivityAt,
                mode: conv.mode,
              };
            })
          );

          socket.emit('conversations_list', {
            conversations: conversationsWithMetadata,
          });

          console.log(`[ChatServer] Emitted conversations_list with ${conversations.length} conversations`);
        } catch (error) {
          console.error('[ChatServer] Error fetching conversations:', error);
          socket.emit('error', {
            event: 'get_conversations',
            message: error instanceof Error ? error.message : 'Failed to fetch conversations',
          });
        }
      });

      // Start a new conversation
      socket.on('start_new_conversation', async (payload: { mode?: 'consult' | 'assessment' }) => {
        try {
          if (!socket.userId) {
            socket.emit('error', {
              event: 'start_new_conversation',
              message: 'User not authenticated',
            });
            return;
          }

          // Check for pending conversation creation (idempotency guard - 200ms prevents accidental double-clicks)
          const pending = this.pendingConversationCreations.get(socket.userId);
          if (pending && Date.now() - pending.timestamp < 200) {
            console.log(`[ChatServer] Conversation creation already in progress for user ${socket.userId}, returning pending conversation`);

            // Return the pending conversation info (it should have been emitted already)
            const existingConv = await this.conversationService.getConversation(pending.conversationId);
            if (existingConv) {
              socket.emit('conversation_created', {
                conversation: {
                  id: existingConv.id,
                  title: `New Chat`,
                  createdAt: existingConv.startedAt,
                  updatedAt: existingConv.lastActivityAt,
                  mode: existingConv.mode,
                },
              });
            }
            return;
          }

          console.log(`[ChatServer] Starting new conversation for user ${socket.userId}`);

          // Create new conversation (always default to consult to avoid carrying over prior mode)
          const newConversation = await this.conversationService.createConversation({
            userId: socket.userId,
            mode: 'consult',
          });

          // Track this creation to prevent duplicates
          this.pendingConversationCreations.set(socket.userId, {
            conversationId: newConversation.id,
            timestamp: Date.now(),
          });

          // CRITICAL: Update socket's current conversation ID
          socket.conversationId = newConversation.id;

          // Emit conversation_created event
          socket.emit('conversation_created', {
            conversation: {
              id: newConversation.id,
              title: `New Chat`,
              createdAt: newConversation.startedAt,
              updatedAt: newConversation.lastActivityAt,
              mode: newConversation.mode,
            },
          });

          console.log(`[ChatServer] New conversation ${newConversation.id} created and set as active`);

          // Clear pending after a short delay (allows accidental double-clicks to use cached value)
          setTimeout(() => {
            this.pendingConversationCreations.delete(socket.userId!);
          }, 200); // 200ms - only prevents true accidents, allows intentional rapid clicks
        } catch (error) {
          console.error('[ChatServer] Error starting new conversation:', error);

          // Clear pending on error
          if (socket.userId) {
            this.pendingConversationCreations.delete(socket.userId);
          }

          socket.emit('error', {
            event: 'start_new_conversation',
            message: error instanceof Error ? error.message : 'Failed to create conversation',
          });
        }
      });

      // Delete conversation
      socket.on('delete_conversation', async (payload: { conversationId: string }) => {
        if (!socket.userId) {
          socket.emit('error', { event: 'delete_conversation', message: 'User not authenticated' });
          return;
        }

        const { conversationId } = payload;

        if (!conversationId) {
          socket.emit('error', { event: 'delete_conversation', message: 'conversationId is required' });
          return;
        }

        try {
          console.log(`[ChatServer] Deleting conversation ${conversationId} for user ${socket.userId}`);

          // CRITICAL FIX: Check if conversation exists first (idempotent DELETE)
          const conversation = await this.conversationService.getConversation(conversationId);

          if (!conversation) {
            // IDEMPOTENT: Already deleted - return success
            console.log(`[ChatServer] Conversation ${conversationId} already deleted - returning success`);
            socket.emit('conversation_deleted', { conversationId });

            // If this was the active conversation, clear it
            if (socket.conversationId === conversationId) {
              socket.conversationId = undefined;
            }
            return;
          }

          // Only validate ownership if conversation exists
          await this.validateConversationOwnership(conversationId, socket.userId);

          // Delete from database
          await this.conversationService.deleteConversation(conversationId);

          console.log(`[ChatServer] Successfully deleted conversation ${conversationId}`);

          // Emit confirmation to client
          socket.emit('conversation_deleted', { conversationId });

          // If this was the active conversation, clear it
          if (socket.conversationId === conversationId) {
            socket.conversationId = undefined;
          }
        } catch (error) {
          console.error('[ChatServer] Error deleting conversation:', error);
          socket.emit('error', {
            event: 'delete_conversation',
            message: error instanceof Error ? error.message : 'Failed to delete conversation',
          });
        }
      });

      // Switch conversation mode (consult ⟺ assessment)
      socket.on('switch_mode', async (payload: { conversationId?: string; mode?: 'consult' | 'assessment' }) => {
        try {
          if (!socket.userId) {
            socket.emit('error', {
              event: 'switch_mode',
              message: 'User not authenticated',
            });
            return;
          }

          const { conversationId, mode } = payload;

          if (!conversationId || !mode) {
            socket.emit('error', {
              event: 'switch_mode',
              message: 'conversationId and mode are required',
            });
            return;
          }

          await this.validateConversationOwnership(conversationId, socket.userId);

          const conversation = await this.conversationService.getConversation(conversationId);
          if (!conversation) {
            socket.emit('error', {
              event: 'switch_mode',
              message: `Conversation ${conversationId} not found`,
            });
            return;
          }

          // Idempotent: already in requested mode
          if (conversation.mode === mode) {
            socket.emit('conversation_mode_updated', {
              conversationId,
              mode,
            });
            return;
          }

          await this.conversationService.switchMode(conversationId, mode);

          socket.emit('conversation_mode_updated', {
            conversationId,
            mode,
          });

          // Provide guidance when entering assessment mode (initial 1-3 only; categories flow later)
          if (mode === 'assessment') {
            const guidanceText = `
🔍 **Assessment Mode Activated**

Please select your assessment approach (reply with 1, 2, or 3):

1️⃣ **Quick Assessment** (30-40 questions)  
   ↳ Fast red-flag screening, ~15 minutes

2️⃣ **Comprehensive Assessment** (85-95 questions)
   ↳ Full coverage across all 10 risk dimensions

3️⃣ **Category-Focused Assessment**  
   ↳ Tailored to your AI solution type

Reply with: **1**, **2**, or **3**
`.trim();

            const guidanceMessage = await this.conversationService.sendMessage({
              conversationId,
              role: 'assistant',
              content: { text: guidanceText },
            });

            socket.emit('message', {
              id: guidanceMessage.id,
              conversationId: guidanceMessage.conversationId,
              role: guidanceMessage.role,
              content: guidanceMessage.content,
              createdAt: guidanceMessage.createdAt,
            });
          }
        } catch (error) {
          console.error('[ChatServer] Error switching mode:', error);
          socket.emit('error', {
            event: 'switch_mode',
            message: error instanceof Error ? error.message : 'Failed to switch mode',
          });
        }
      });

      // Abort streaming
      socket.on('abort_stream', () => {
        console.log(`[ChatServer] Stream abort requested by user ${socket.userId}`);

        // Mark for Claude streaming (original path)
        socket.data.abortRequested = true;

        // Mark for simulated streaming (Epic 12.5 path)
        if (socket.conversationId) {
          this.abortedStreams.add(socket.conversationId);
        }

        // Emit acknowledgment - frontend will call finishStreaming()
        socket.emit('stream_aborted', { conversationId: socket.conversationId });
      });

      /**
       * Handle user clicking "Generate Questionnaire" button
       *
       * Epic 12.5: Delegates to handleGenerateQuestionnaire public method
       * which uses QuestionnaireGenerationService for hybrid JSON/markdown generation.
       */
      socket.on('generate_questionnaire', async (payload: GenerateQuestionnairePayload) => {
        const userId = socket.userId;
        if (!userId) {
          console.error('[ChatServer] generate_questionnaire called without authenticated user');
          socket.emit('error', { event: 'generate_questionnaire', message: 'Not authenticated' });
          return;
        }
        await this.handleGenerateQuestionnaire(socket, payload, userId);
      });

      // Handle get_export_status (Story 13.9.1)
      socket.on('get_export_status', async (data: { conversationId: string }) => {
        await this.handleGetExportStatus(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`[ChatServer] Client disconnected: ${socket.id} (Reason: ${reason})`);
      });
    });

    console.log('[ChatServer] WebSocket /chat namespace configured');
  }

  /**
   * Handle tool_use blocks from Claude's response
   */
  private async handleToolUse(
    socket: AuthenticatedSocket,
    toolUseBlocks: ToolUseBlock[],
    context: {
      conversationId: string;
      userId: string;
      assessmentId: string | null;
      mode?: 'consult' | 'assessment';
    }
  ): Promise<void> {
    for (const toolUse of toolUseBlocks) {
      console.log(`[ChatServer] Handling tool_use: ${toolUse.name}`);

      // Currently only handle questionnaire_ready
      if (toolUse.name === 'questionnaire_ready') {
        try {
          const result = await this.questionnaireReadyService.handle(
            {
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              input: toolUse.input,
            },
            context
          );

          if (result.handled && result.emitEvent) {
            // Emit event to frontend
            socket.emit(result.emitEvent.event, result.emitEvent.payload);
            console.log(
              `[ChatServer] Emitted ${result.emitEvent.event} for conversation:`,
              context.conversationId
            );
          } else if (!result.handled) {
            console.warn(
              `[ChatServer] Tool handling failed:`,
              result.error
            );
          }
        } catch (error) {
          console.error('[ChatServer] Error handling tool_use:', error);
        }
      } else {
        console.warn(`[ChatServer] Unknown tool: ${toolUse.name}`);
      }
    }
  }

  /**
   * Emit a generation phase event to the client (Story 13.5.2)
   *
   * @param socket - The client socket to emit to
   * @param conversationId - The conversation being processed
   * @param phase - The phase index (0-3)
   * @param phaseId - The phase identifier ('context' | 'generating' | 'validating' | 'saving')
   */
  private emitGenerationPhase(
    socket: AuthenticatedSocket,
    conversationId: string,
    phase: number,
    phaseId: GenerationPhaseId
  ): void {
    const payload: GenerationPhasePayload = {
      conversationId,
      phase,
      phaseId,
      timestamp: Date.now(),
    };
    socket.emit('generation_phase', payload);
    console.log(`[ChatServer] Emitted generation_phase: phase=${phase}, phaseId=${phaseId}`);
  }

  /**
   * Handle user clicking "Generate Questionnaire" button
   *
   * Epic 12.5: Hybrid flow - delegates to QuestionnaireGenerationService
   * which makes a single Claude call and returns JSON + pre-rendered markdown.
   *
   * Extracted as public method for testability.
   */
  public async handleGenerateQuestionnaire(
    socket: AuthenticatedSocket,
    payload: GenerateQuestionnairePayload,
    userId: string
  ): Promise<void> {
    const {
      conversationId,
      assessmentType: rawAssessmentType = 'comprehensive',
      vendorName,
      solutionName,
      contextSummary,
      selectedCategories,
    } = payload;

    // Validate assessment type
    type ValidType = 'quick' | 'comprehensive' | 'category_focused';
    const validTypes: ValidType[] = ['quick', 'comprehensive', 'category_focused'];
    const assessmentType: ValidType = validTypes.includes(rawAssessmentType as ValidType)
      ? (rawAssessmentType as ValidType)
      : 'comprehensive';

    console.log(`[ChatServer] Received generate_questionnaire from user ${userId} for conversation ${conversationId}`);

    try {
      // Validate ownership
      await this.validateConversationOwnership(conversationId, userId);

      // Save user action as message
      await this.conversationService.sendMessage({
        conversationId,
        role: 'user',
        content: { text: '[System: User clicked Generate Questionnaire button]' },
      });

      // Emit stream start for UX consistency (even though we're not streaming from Claude)
      socket.emit('assistant_stream_start', { conversationId });

      // Phase 0: Context ready (validation passed, about to call Claude)
      this.emitGenerationPhase(socket, conversationId, 0, 'context');

      // Delegate to service (single Claude call, returns schema + markdown)
      // NOTE: Service creates assessment - handler does NOT create assessments
      const result = await this.questionnaireGenerationService.generate({
        conversationId,
        userId,
        assessmentType,
        vendorName,
        solutionName,
        contextSummary,
        selectedCategories,
      });

      // Phase 1: Claude call complete
      this.emitGenerationPhase(socket, conversationId, 1, 'generating');

      // Phase 2: Validation complete (validation happens inside generate())
      this.emitGenerationPhase(socket, conversationId, 2, 'validating');

      // Stream pre-rendered markdown to chat (simulated streaming for UX)
      await this.streamMarkdownToSocket(socket, result.markdown, conversationId);

      // Save assistant response
      await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: result.markdown },
      });

      // Phase 3: Persistence complete
      this.emitGenerationPhase(socket, conversationId, 3, 'saving');

      // Emit export ready (no extraction needed - we have the assessmentId from service)
      // This signals phase 4 (complete) to the frontend
      socket.emit('export_ready', {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
        formats: ['pdf', 'word', 'excel'],
      });

      console.log(`[ChatServer] Questionnaire generation complete:`, {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
      });

    } catch (error) {
      console.error('[ChatServer] Error in generate_questionnaire:', error);
      socket.emit('error', {
        event: 'generate_questionnaire',
        message: error instanceof Error ? error.message : 'Failed to generate questionnaire',
      });
    }
  }

  /**
   * Handle export status query (Story 13.9.1)
   * Returns existing export if questionnaire was already generated for conversation.
   * Used to restore download buttons on session resume.
   */
  public async handleGetExportStatus(
    socket: AuthenticatedSocket,
    data: { conversationId: string }
  ): Promise<void> {
    const { conversationId } = data;
    const userId = socket.userId;

    // Early validation: conversationId must be a non-empty string
    if (!conversationId || typeof conversationId !== 'string' || conversationId.trim() === '') {
      console.log(`[ChatServer] get_export_status invalid input: conversationId=${conversationId}`);
      socket.emit('export_status_error', {
        conversationId: conversationId ?? '',
        error: 'Invalid conversation ID',
      });
      return;
    }

    // Early validation: userId must be present (auth middleware should set this)
    if (!userId) {
      console.log(`[ChatServer] get_export_status auth error: conversationId=${conversationId}, reason=Not authenticated`);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Not authenticated',
      });
      return;
    }

    console.log(`[ChatServer] get_export_status request: conversationId=${conversationId}, userId=${userId}`);

    try {
      // 1. Get conversation and verify ownership
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        console.log(`[ChatServer] export_status auth error: conversationId=${conversationId}, reason=Conversation not found`);
        socket.emit('export_status_error', {
          conversationId,
          error: 'Conversation not found',
        });
        return;
      }

      if (conversation.userId !== userId) {
        console.log(`[ChatServer] export_status auth error: conversationId=${conversationId}, reason=Unauthorized`);
        socket.emit('export_status_error', {
          conversationId,
          error: 'Unauthorized',
        });
        return;
      }

      // 2. Check if conversation has a linked assessment
      if (!conversation.assessmentId) {
        console.log(`[ChatServer] export_status not found: conversationId=${conversationId}`);
        socket.emit('export_status_not_found', { conversationId });
        return;
      }

      // 3. Verify assessment exists
      const assessment = await this.assessmentService.getAssessment(conversation.assessmentId);
      if (!assessment) {
        console.log(`[ChatServer] export_status not found: conversationId=${conversationId}`);
        socket.emit('export_status_not_found', { conversationId });
        return;
      }

      // 4. Count questions for this assessment
      const questionCount = await this.questionService.getQuestionCount(assessment.id);

      if (questionCount === 0) {
        console.log(`[ChatServer] export_status not found: conversationId=${conversationId}`);
        socket.emit('export_status_not_found', { conversationId });
        return;
      }

      // 5. Emit export_ready payload (reuses existing frontend handler)
      socket.emit('export_ready', {
        conversationId,
        assessmentId: assessment.id,
        questionCount,
        formats: ['word', 'pdf', 'excel'],
      });

      console.log(`[ChatServer] export_status found: assessmentId=${assessment.id}, questions=${questionCount}`);

    } catch (error) {
      console.error(`[ChatServer] get_export_status error:`, error);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Split markdown into chunks for simulated streaming
   *
   * Tries to break at word boundaries for natural reading.
   */
  private chunkMarkdown(markdown: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let remaining = markdown;

    while (remaining.length > 0) {
      // Try to break at word boundary
      let end = Math.min(chunkSize, remaining.length);
      if (end < remaining.length) {
        const lastSpace = remaining.lastIndexOf(' ', end);
        if (lastSpace > chunkSize * 0.5) {
          end = lastSpace + 1;
        }
      }
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }

    return chunks;
  }

  /**
   * Stream markdown to socket with simulated typing effect
   *
   * Chunks the markdown and emits with small delays for familiar UX.
   * This replaces Claude streaming with deterministic content.
   *
   * Supports abort handling for user cancellation.
   */
  private async streamMarkdownToSocket(
    socket: AuthenticatedSocket,
    markdown: string,
    conversationId: string
  ): Promise<void> {
    const chunks = this.chunkMarkdown(markdown, 80); // ~80 chars per chunk

    for (const chunk of chunks) {
      // Check abort flag between chunks
      if (this.abortedStreams.has(conversationId)) {
        this.abortedStreams.delete(conversationId);
        socket.emit('assistant_aborted', { conversationId });
        console.log(`[ChatServer] Stream aborted for conversation ${conversationId}`);
        return;
      }

      socket.emit('assistant_token', {
        conversationId,
        token: chunk,
      });

      // Small delay for natural streaming feel (20ms per chunk)
      await this.sleep(20);
    }

    socket.emit('assistant_done', {
      conversationId,
      content: markdown,
    });
  }

  /**
   * Simple sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Emit a message to a specific conversation
   * Used for streaming assistant responses
   */
  emitToConversation(conversationId: string, event: string, data: unknown): void {
    this.io.of('/chat').emit(event, { conversationId, ...(data as object) });
  }

  /**
   * Stream a message chunk to a conversation
   */
  streamMessage(conversationId: string, chunk: string): void {
    this.io.of('/chat').emit('message:stream', {
      conversationId,
      chunk,
    });
  }
}
