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
      console.log('[Connect] namespace:', socket.nsp.name, 'auth:', JSON.stringify(socket.handshake.auth));

      // Check if client wants to resume an existing conversation
      const resumeConversationId = socket.handshake.auth.conversationId;
      console.log('[Connect] resumeConversationId from handshake:', resumeConversationId);
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

          // Use conversationId from socket (auto-created on connection) or from payload
          const conversationId = socket.conversationId || payload.conversationId;
          const messageText = payload.text || payload.content; // Support both formats

          // Validate conversationId
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

          // Get conversation context and generate Claude response
          console.log('[ChatServer] Building conversation context...');
          const { messages, systemPrompt } = await this.buildConversationContext(conversationId);
          console.log('[ChatServer] Context built, starting Claude streaming...');

          // Add current user message to context
          const contextWithCurrentMessage: ClaudeMessage[] = [
            ...messages,
            { role: 'user', content: messageText },
          ];

          // Stream Claude response
          let fullResponse = '';

          try {
            // Emit stream start event (no partial message in DB yet)
            socket.emit('assistant_stream_start', {
              conversationId,
            });

            // Stream response chunks from Claude
            console.log('[ChatServer] Calling Claude API for streaming...');
            for await (const chunk of this.claudeClient.streamMessage(
              contextWithCurrentMessage,
              systemPrompt
            )) {
              if (!chunk.isComplete && chunk.content) {
                fullResponse += chunk.content;
                console.log('[ChatServer] Streaming chunk:', chunk.content.substring(0, 20) + '...');

                // Emit each chunk to client
                socket.emit('assistant_token', {
                  conversationId,
                  token: chunk.content,
                });
              }
            }
            console.log('[ChatServer] Streaming complete. Full response length:', fullResponse.length);

            // Save complete message to database
            const completeMessage = await this.conversationService.sendMessage({
              conversationId,
              role: 'assistant',
              content: { text: fullResponse },
            });

            // Emit stream complete with final message
            socket.emit('assistant_done', {
              messageId: completeMessage.id,
              conversationId,
              fullText: fullResponse,
            });
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
