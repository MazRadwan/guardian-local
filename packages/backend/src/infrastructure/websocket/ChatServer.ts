import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationService } from '../../application/services/ConversationService.js';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

interface SendMessagePayload {
  conversationId: string;
  text: string;
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
  private jwtSecret: string;

  constructor(io: SocketIOServer, conversationService: ConversationService, jwtSecret: string) {
    this.io = io;
    this.conversationService = conversationService;
    this.jwtSecret = jwtSecret;
    this.setupNamespace();
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

      // Auto-create conversation for this session
      const conversation = await this.conversationService.createConversation({
        userId: socket.userId!,
        mode: 'consult',
      });

      // Store conversationId in socket for this session
      (socket as any).conversationId = conversation.id;

      // Send welcome message with conversationId
      socket.emit('connected', {
        message: 'Connected to Guardian chat server',
        userId: socket.userId,
        conversationId: conversation.id,
      });

      // Handle send_message event
      socket.on('send_message', async (payload: any) => {
        try {
          // Use conversationId from socket (auto-created on connection) or from payload
          const conversationId = (socket as any).conversationId || payload.conversationId;
          const messageText = payload.text || payload.content; // Support both formats

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

          // Emit confirmation
          socket.emit('message_sent', {
            messageId: message.id,
            conversationId: message.conversationId,
            timestamp: message.createdAt,
          });

          // Emit message back to client (for display)
          socket.emit('message', {
            id: message.id,
            conversationId: message.conversationId,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          });

          // TODO: In full implementation, call Claude here to generate response
          // For now, send a simple acknowledgment so user sees chat working
          const response = await this.conversationService.sendMessage({
            conversationId,
            role: 'assistant',
            content: {
              text: `I received your message: "${messageText}". (Note: Full Guardian AI responses will be implemented in Phase 2. For now, this is just infrastructure testing.)`,
            },
          });

          socket.emit('message', {
            id: response.id,
            conversationId: response.conversationId,
            role: response.role,
            content: response.content,
            createdAt: response.createdAt,
          });
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
