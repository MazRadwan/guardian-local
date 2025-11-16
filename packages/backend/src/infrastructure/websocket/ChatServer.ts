import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationService } from '../../application/services/ConversationService.js';
import type { IClaudeClient, ClaudeMessage } from '../../application/interfaces/IClaudeClient.js';
import { getSystemPrompt } from '../ai/prompts.js';
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

  constructor(
    io: SocketIOServer,
    conversationService: ConversationService,
    claudeClient: IClaudeClient,
    rateLimiter: RateLimiter,
    jwtSecret: string
  ) {
    this.io = io;
    this.conversationService = conversationService;
    this.claudeClient = claudeClient;
    this.rateLimiter = rateLimiter;
    this.jwtSecret = jwtSecret;
    this.setupNamespace();
  }

  /**
   * Build conversation context for Claude API
   * Loads recent message history and selects appropriate system prompt
   */
  private async buildConversationContext(
    conversationId: string
  ): Promise<{ messages: ClaudeMessage[]; systemPrompt: string; mode: 'consult' | 'assessment' }> {
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

    // Get system prompt based on conversation mode
    const systemPrompt = getSystemPrompt(conversation.mode);

    return { messages, systemPrompt, mode: conversation.mode };
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
      let conversation;
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
            // Invalid or not owned - create new
            console.log(`[ChatServer] Cannot resume conversation ${resumeConversationId} - creating new`);
            conversation = await this.conversationService.createConversation({
              userId: socket.userId!,
              mode: 'consult',
            });
          }
        } catch (error) {
          // Resume failed - create new
          console.error('[ChatServer] Error resuming conversation:', error);
          conversation = await this.conversationService.createConversation({
            userId: socket.userId!,
            mode: 'consult',
          });
        }
      } else {
        // No saved conversation - create new
        conversation = await this.conversationService.createConversation({
          userId: socket.userId!,
          mode: 'consult',
        });
        console.log(`[ChatServer] Created new conversation ${conversation.id} for user ${socket.userId}`);

        // Emit conversation_created event for new conversations
        socket.emit('conversation_created', {
          conversation: {
            id: conversation.id,
            title: `Conversation ${conversation.id.slice(0, 8)}`,
            createdAt: conversation.startedAt,
            updatedAt: conversation.lastActivityAt,
            mode: conversation.mode,
          },
        });
      }

      // Store conversationId in socket for this session
      socket.conversationId = conversation.id;

      // Send welcome message with conversationId
      socket.emit('connected', {
        message: resumed ? 'Reconnected to existing conversation' : 'Connected to Guardian chat server',
        userId: socket.userId,
        conversationId: conversation.id,
        resumed,
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

          // Save user message
          const message = await this.conversationService.sendMessage({
            conversationId,
            role: 'user',
            content: {
              text: messageText,
              components: payload.components,
            },
          });

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
          const { messages, systemPrompt } = await this.buildConversationContext(conversationId);

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
            for await (const chunk of this.claudeClient.streamMessage(
              messages,
              systemPrompt
            )) {
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

          // Validate ownership BEFORE returning history
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

          console.log(`[ChatServer] Starting new conversation for user ${socket.userId}`);

          // Create new conversation
          const newConversation = await this.conversationService.createConversation({
            userId: socket.userId,
            mode: payload.mode || 'consult',
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
        } catch (error) {
          console.error('[ChatServer] Error starting new conversation:', error);
          socket.emit('error', {
            event: 'start_new_conversation',
            message: error instanceof Error ? error.message : 'Failed to create conversation',
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
