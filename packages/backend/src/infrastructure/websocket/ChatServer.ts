import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationService } from '../../application/services/ConversationService.js';
import { AssessmentService } from '../../application/services/AssessmentService.js';
import type { IClaudeClient, ClaudeMessage } from '../../application/interfaces/IClaudeClient.js';
import { PromptCacheManager } from '../ai/PromptCacheManager.js';
import { RateLimiter } from './RateLimiter.js';
import jwt from 'jsonwebtoken';

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
}

interface GetHistoryPayload {
  conversationId: string;
  limit?: number;
  offset?: number;
}

export class ChatServer {
  private io: SocketIOServer;
  private conversationService: ConversationService;
  private claudeClient: IClaudeClient;
  private rateLimiter: RateLimiter;
  private jwtSecret: string;
  private promptCacheManager: PromptCacheManager;
  private pendingConversationCreations: Map<string, { conversationId: string; timestamp: number }>;

  private readonly GENERATE_TRIGGERS = [
    'generate questionnaire',
    'generate the questionnaire',
    'create questionnaire',
    'generate it',
    'go ahead',
    'yes generate',
  ];

  constructor(
    io: SocketIOServer,
    conversationService: ConversationService,
    claudeClient: IClaudeClient,
    rateLimiter: RateLimiter,
    jwtSecret: string,
    promptCacheManager: PromptCacheManager,
    private readonly assessmentService: AssessmentService
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
    setInterval(() => {
      const now = Date.now();
      for (const [userId, { timestamp }] of this.pendingConversationCreations.entries()) {
        if (now - timestamp > 1000) { // 1 second timeout (generous cleanup window)
          this.pendingConversationCreations.delete(userId);
        }
      }
    }, 5000);
  }

  /**
   * Detect if user message contains a questionnaire generation trigger
   */
  private detectGenerateTrigger(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    return this.GENERATE_TRIGGERS.some(trigger => normalized.includes(trigger));
  }

  /**
   * Build conversation context for Claude API
   * Loads recent message history and selects appropriate system prompt
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

    // Get system prompt (and cache metadata) based on conversation mode
    const promptCache = this.promptCacheManager.ensureCached(conversation.mode);

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

          // Validate conversationId is provided
          if (!conversationId) {
            socket.emit('error', {
              event: 'send_message',
              message: 'Conversation ID required',
            });
            return;
          }

          // Validate message text
          if (!messageText || typeof messageText !== 'string' || messageText.trim().length === 0) {
            socket.emit('error', {
              event: 'send_message',
              message: 'Message text required',
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

          // Detect if this is a questionnaire generation request
          const isGenerateRequest = this.detectGenerateTrigger(messageText);

          // Save user message
          const message = await this.conversationService.sendMessage({
            conversationId,
            role: 'user',
            content: {
              text: messageText,
              components: payload.components,
            },
          });

          // Create assessment if trigger detected and in assessment mode without existing link
          let assessmentId: string | null = null;

          if (isGenerateRequest) {
            const conversation = await this.conversationService.getConversation(conversationId);

            if (conversation && conversation.mode === 'assessment' && !conversation.assessmentId) {
              try {
                // Create default vendor
                const vendor = await this.assessmentService.findOrCreateDefaultVendor(socket.userId!);

                // Create assessment in draft status
                const assessmentResponse = await this.assessmentService.createAssessment({
                  vendorName: vendor.name,
                  assessmentType: 'comprehensive',
                  solutionName: 'Assessment from Chat',
                  createdBy: socket.userId!,
                });

                assessmentId = assessmentResponse.assessmentId;

                // Link assessment to conversation
                await this.conversationService.linkAssessment(conversationId, assessmentId);

                console.log(`[ChatServer] Created assessment ${assessmentId} for conversation ${conversationId}`);
              } catch (error) {
                console.error('[ChatServer] Failed to create assessment:', error);
                // Continue without assessment - extraction will be skipped
              }
            } else if (conversation?.assessmentId) {
              assessmentId = conversation.assessmentId;
            }
          }

          // Emit confirmation only (frontend already added user message to UI)
          socket.emit('message_sent', {
            messageId: message.id,
            conversationId: message.conversationId,
            timestamp: message.createdAt,
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
          const { messages, systemPrompt, promptCache } = await this.buildConversationContext(conversationId);

          // Stream Claude response
          let fullResponse = '';

          try {
            // Reset abort flag before starting stream
            socket.data.abortRequested = false;

            // Emit stream start event (no partial message in DB yet)
            socket.emit('assistant_stream_start', {
              conversationId,
            });

            // Stream response chunks from Claude
            // Use messages directly - current message already in history
            const claudeOptions = promptCache?.usePromptCache
              ? { systemPrompt, cachedPromptId: promptCache.cachedPromptId, usePromptCache: true }
              : { systemPrompt };

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
            }

            // Save message to database (even if aborted, save partial response)
            if (fullResponse.length > 0) {
              const completeMessage = await this.conversationService.sendMessage({
                conversationId,
                role: 'assistant',
                content: { text: fullResponse },
              });

              // Emit stream complete with final message (only if not aborted)
              if (!socket.data.abortRequested) {
                socket.emit('assistant_done', {
                  messageId: completeMessage.id,
                  conversationId,
                  fullText: fullResponse,
                });
              } else {
                console.log(`[ChatServer] Stream aborted - partial response saved (${fullResponse.length} chars)`);
              }
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
   ↳ Full coverage across all 11 risk dimensions

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

        // Mark socket as aborted - the streaming loop will check this flag
        socket.data.abortRequested = true;

        // Emit acknowledgment - frontend will call finishStreaming()
        socket.emit('stream_aborted', { conversationId: socket.conversationId });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`[ChatServer] Client disconnected: ${socket.id} (Reason: ${reason})`);
      });
    });

    console.log('[ChatServer] WebSocket /chat namespace configured');
  }

  /**
   * Emit a message to a specific conversation
   * Used for streaming assistant responses
   */
  emitToConversation(conversationId: string, event: string, data: unknown): void {
    this.io.of('/chat').emit(event, { conversationId, ...data });
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
