/**
 * Unit Tests for ConnectionHandler
 *
 * Story 28.4.1: Extract auth middleware from ChatServer.ts
 * Story 28.4.2: Extract handleConnection with room join and resume logic
 * Story 28.4.3: Extract handleDisconnect with logging
 * Epic 30: Vision cache cleanup on disconnect
 *
 * Tests cover:
 * createAuthMiddleware:
 * 1. Valid token authentication (sets userId, userEmail, userRole)
 * 2. Missing token rejection ("Authentication token required")
 * 3. Invalid token rejection ("Invalid authentication token")
 * 4. Expired token rejection ("Invalid authentication token")
 * 5. Malformed token rejection ("Invalid authentication token")
 * 6. Wrong secret token rejection ("Invalid authentication token")
 *
 * handleConnection:
 * 1. Room join (user:{userId})
 * 2. connection_ready payload with ALL required fields (new connection)
 * 3. connection_ready payload with ALL required fields (resumed)
 * 4. Resume valid conversation
 * 5. Not resume conversation owned by different user
 * 6. NOT auto-create when resume fails
 * 7. Leave socket.conversationId unset when no valid resume
 *
 * handleDisconnect:
 * 1. Log disconnect with socket id and reason
 * 2. Log disconnect with user id
 * 3. Handle various disconnect reasons
 * 4. Clear Vision cache on disconnect (Epic 30)
 */

import jwt from 'jsonwebtoken';
import {
  ConnectionHandler,
  type ConnectionReadyPayload,
} from '../../../../../src/infrastructure/websocket/handlers/ConnectionHandler.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { Conversation } from '../../../../../src/domain/entities/Conversation.js';
import type { IVisionContentBuilder } from '../../../../../src/application/interfaces/IVisionContentBuilder.js';

/**
 * Create a mock ConversationService
 */
const createMockConversationService = (): jest.Mocked<ConversationService> => ({
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  getUserConversations: jest.fn(),
  switchMode: jest.fn(),
  linkAssessment: jest.fn(),
  sendMessage: jest.fn(),
  getHistory: jest.fn(),
  completeConversation: jest.fn(),
  deleteConversation: jest.fn(),
  updateContext: jest.fn(),
  getConversationTitle: jest.fn(),
  getFirstUserMessage: jest.fn(),
  getFirstAssistantMessage: jest.fn(),
  getMessageCount: jest.fn(),
  updateTitle: jest.fn(),
  updateTitleIfNotManuallyEdited: jest.fn(),
} as unknown as jest.Mocked<ConversationService>);

/**
 * Create a mock VisionContentBuilder for cache cleanup tests
 */
const createMockVisionContentBuilder = (): jest.Mocked<IVisionContentBuilder> => ({
  buildImageContent: jest.fn().mockResolvedValue(null),
  isImageFile: jest.fn().mockReturnValue(false),
  normalizeMediaType: jest.fn().mockImplementation((t) => t),
  clearConversationCache: jest.fn(),
});

describe('ConnectionHandler', () => {
  const TEST_SECRET = 'test-jwt-secret-key-for-testing';
  const WRONG_SECRET = 'wrong-secret-key';

  let handler: ConnectionHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockSocket: IAuthenticatedSocket;
  let nextFn: jest.Mock<void, [Error?]>;

  /**
   * Create a mock socket with handshake auth (for auth middleware tests)
   */
  const createMockSocket = (token?: string): IAuthenticatedSocket => ({
    id: 'socket-123',
    userId: undefined,
    userEmail: undefined,
    userRole: undefined,
    conversationId: undefined,
    data: {},
    handshake: {
      auth: {
        token,
      },
    },
    emit: jest.fn(),
    join: jest.fn(),
  });

  /**
   * Create a mock authenticated socket (for handleConnection tests)
   * Simulates socket after auth middleware has run
   */
  const createAuthenticatedMockSocket = (
    userId: string,
    resumeConvId?: string
  ): jest.Mocked<IAuthenticatedSocket> =>
    ({
      id: 'socket-123',
      userId,
      userEmail: 'test@example.com',
      userRole: 'analyst',
      conversationId: undefined as string | undefined,
      data: {},
      handshake: {
        auth: {
          conversationId: resumeConvId,
        },
      },
      emit: jest.fn(),
      join: jest.fn(),
    }) as unknown as jest.Mocked<IAuthenticatedSocket>;

  /**
   * Create a valid JWT token
   */
  const createValidToken = (
    payload: { userId: string; email?: string; role?: string },
    options?: jwt.SignOptions
  ): string => {
    return jwt.sign(payload, TEST_SECRET, options);
  };

  /**
   * Create a mock conversation for resume tests
   */
  const createMockConversation = (overrides?: Partial<Conversation>): Conversation =>
    ({
      id: 'conv-1',
      userId: 'user-123',
      mode: 'consult',
      assessmentId: null,
      status: 'active',
      context: {},
      startedAt: new Date(),
      lastActivityAt: new Date(),
      completedAt: null,
      title: null,
      titleManuallyEdited: false,
      ...overrides,
    }) as Conversation;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    handler = new ConnectionHandler(mockConversationService, TEST_SECRET);
    nextFn = jest.fn();
    // Suppress console.error and console.log during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createAuthMiddleware', () => {
    describe('valid token authentication', () => {
      it('should authenticate socket with valid token containing all fields', () => {
        const token = createValidToken({
          userId: 'user-123',
          email: 'test@example.com',
          role: 'analyst',
        });
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        // Verify socket augmented with user info
        expect(mockSocket.userId).toBe('user-123');
        expect(mockSocket.userEmail).toBe('test@example.com');
        expect(mockSocket.userRole).toBe('analyst');

        // Verify next called without error
        expect(nextFn).toHaveBeenCalledTimes(1);
        expect(nextFn).toHaveBeenCalledWith();
      });

      it('should authenticate socket with valid token containing only userId', () => {
        const token = createValidToken({ userId: 'user-456' });
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        // Verify userId set, optional fields undefined
        expect(mockSocket.userId).toBe('user-456');
        expect(mockSocket.userEmail).toBeUndefined();
        expect(mockSocket.userRole).toBeUndefined();

        // Verify next called without error
        expect(nextFn).toHaveBeenCalledWith();
      });

      it('should authenticate socket with valid token containing email but no role', () => {
        const token = createValidToken({
          userId: 'user-789',
          email: 'admin@example.com',
        });
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(mockSocket.userId).toBe('user-789');
        expect(mockSocket.userEmail).toBe('admin@example.com');
        expect(mockSocket.userRole).toBeUndefined();
        expect(nextFn).toHaveBeenCalledWith();
      });
    });

    describe('missing token rejection', () => {
      it('should reject connection when token is missing', () => {
        mockSocket = createMockSocket(undefined);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        // Verify next called with error
        expect(nextFn).toHaveBeenCalledTimes(1);
        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));

        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Authentication token required');

        // Verify socket not augmented
        expect(mockSocket.userId).toBeUndefined();
      });

      it('should reject connection when token is empty string', () => {
        mockSocket = createMockSocket('');

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        // Empty string is falsy, so should be treated as missing
        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Authentication token required');
      });

      it('should reject connection when handshake.auth is missing token property', () => {
        mockSocket = {
          id: 'socket-123',
          data: {},
          handshake: {
            auth: {},
          },
          emit: jest.fn(),
          join: jest.fn(),
        } as unknown as IAuthenticatedSocket;

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Authentication token required');
      });
    });

    describe('invalid token rejection', () => {
      it('should reject connection with completely invalid token', () => {
        mockSocket = createMockSocket('not-a-valid-jwt-token');

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');

        // Verify socket not augmented
        expect(mockSocket.userId).toBeUndefined();
      });

      it('should reject connection with token signed with wrong secret', () => {
        const token = jwt.sign(
          { userId: 'user-123', email: 'test@example.com' },
          WRONG_SECRET
        );
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');
      });

      it('should log authentication failure to console', () => {
        mockSocket = createMockSocket('invalid-token');

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(console.error).toHaveBeenCalledWith(
          '[ConnectionHandler] Authentication failed:',
          expect.any(Error)
        );
      });
    });

    describe('expired token rejection', () => {
      it('should reject connection with expired token', () => {
        // Create token that expired 1 hour ago
        const token = createValidToken(
          { userId: 'user-123', email: 'test@example.com' },
          { expiresIn: '-1h' }
        );
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');

        // Verify socket not augmented
        expect(mockSocket.userId).toBeUndefined();
      });

      it('should reject connection with token that expired 1 second ago', () => {
        // Create token with very short expiry
        const token = createValidToken(
          { userId: 'user-123' },
          { expiresIn: '-1s' }
        );
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');
      });
    });

    describe('malformed token rejection', () => {
      it('should reject connection with malformed JWT structure', () => {
        // JWT should have 3 parts separated by dots
        mockSocket = createMockSocket('part1.part2');

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');
      });

      it('should reject connection with JWT containing invalid base64', () => {
        mockSocket = createMockSocket('invalid!!!.base64!!!.data!!!');

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');
      });

      it('should reject connection with JWT containing invalid JSON payload', () => {
        // Create a token with valid structure but invalid JSON in payload
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from('not-valid-json').toString('base64url');
        const signature = 'fake-signature';
        const malformedToken = `${header}.${payload}.${signature}`;

        mockSocket = createMockSocket(malformedToken);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');
      });

      it('should reject connection with empty JWT parts', () => {
        mockSocket = createMockSocket('...');

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Invalid authentication token');
      });
    });

    describe('edge cases', () => {
      it('should handle socket with null handshake gracefully', () => {
        mockSocket = {
          id: 'socket-123',
          data: {},
          handshake: null as unknown as { auth: { token?: string } },
          emit: jest.fn(),
          join: jest.fn(),
        } as unknown as IAuthenticatedSocket;

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Authentication token required');
      });

      it('should handle socket with undefined handshake.auth gracefully', () => {
        mockSocket = {
          id: 'socket-123',
          data: {},
          handshake: { auth: undefined as unknown as { token?: string } },
          emit: jest.fn(),
          join: jest.fn(),
        } as unknown as IAuthenticatedSocket;

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
        const error = nextFn.mock.calls[0][0] as Error;
        expect(error.message).toBe('Authentication token required');
      });

      it('should accept valid token with future expiry', () => {
        const token = createValidToken(
          { userId: 'user-123', email: 'test@example.com', role: 'admin' },
          { expiresIn: '24h' }
        );
        mockSocket = createMockSocket(token);

        const middleware = handler.createAuthMiddleware();
        middleware(mockSocket, nextFn);

        expect(mockSocket.userId).toBe('user-123');
        expect(nextFn).toHaveBeenCalledWith();
      });

      it('should create independent middleware instances', () => {
        const mockService1 = createMockConversationService();
        const mockService2 = createMockConversationService();
        const handler1 = new ConnectionHandler(mockService1, TEST_SECRET);
        const handler2 = new ConnectionHandler(mockService2, WRONG_SECRET);

        const token = createValidToken({ userId: 'user-123' });

        // Token valid with handler1
        const socket1 = createMockSocket(token);
        const next1 = jest.fn();
        handler1.createAuthMiddleware()(socket1, next1);
        expect(socket1.userId).toBe('user-123');
        expect(next1).toHaveBeenCalledWith();

        // Same token invalid with handler2 (different secret)
        const socket2 = createMockSocket(token);
        const next2 = jest.fn();
        handler2.createAuthMiddleware()(socket2, next2);
        expect(socket2.userId).toBeUndefined();
        expect(next2).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  /**
   * Story 28.4.2: handleConnection tests
   */
  describe('handleConnection', () => {
    describe('room join', () => {
      it('should join user room', async () => {
        const socket = createAuthenticatedMockSocket('user-123');
        await handler.handleConnection(socket);

        expect(socket.join).toHaveBeenCalledWith('user:user-123');
      });

      it('should not join room if userId is missing', async () => {
        const socket = createAuthenticatedMockSocket('user-123');
        socket.userId = undefined;

        await handler.handleConnection(socket);

        expect(socket.join).not.toHaveBeenCalled();
      });
    });

    describe('connection_ready payload (new connection)', () => {
      it('should emit connection_ready with ALL required payload fields', async () => {
        const socket = createAuthenticatedMockSocket('user-123');
        await handler.handleConnection(socket);

        expect(socket.emit).toHaveBeenCalledWith('connection_ready', {
          message: 'Connected to Guardian chat server',
          userId: 'user-123',
          conversationId: undefined,
          resumed: false,
          hasActiveConversation: false,
          assessmentId: null,
        });
      });
    });

    describe('connection_ready payload (resumed)', () => {
      it('should emit connection_ready with ALL required payload fields when resumed', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'assessment',
          assessmentId: 'assess-1',
        });
        mockConversationService.getConversation.mockResolvedValue(mockConv);

        const socket = createAuthenticatedMockSocket('user-123', 'conv-1');
        await handler.handleConnection(socket);

        expect(socket.emit).toHaveBeenCalledWith('connection_ready', {
          message: 'Reconnected to existing conversation',
          userId: 'user-123',
          conversationId: 'conv-1',
          resumed: true,
          hasActiveConversation: true,
          assessmentId: 'assess-1',
        });
      });

      it('should include null assessmentId when conversation has no assessment', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult',
          assessmentId: null,
        });
        mockConversationService.getConversation.mockResolvedValue(mockConv);

        const socket = createAuthenticatedMockSocket('user-123', 'conv-1');
        await handler.handleConnection(socket);

        const emittedPayload = (socket.emit as jest.Mock).mock.calls[0][1] as ConnectionReadyPayload;
        expect(emittedPayload.assessmentId).toBeNull();
      });
    });

    describe('resume valid conversation', () => {
      it('should resume valid conversation', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult',
        });
        mockConversationService.getConversation.mockResolvedValue(mockConv);

        const socket = createAuthenticatedMockSocket('user-123', 'conv-1');
        const result = await handler.handleConnection(socket);

        expect(result.resumed).toBe(true);
        expect(result.conversation).toBe(mockConv);
        expect(socket.conversationId).toBe('conv-1');
      });

      it('should call getConversation with the resume conversationId', async () => {
        const socket = createAuthenticatedMockSocket('user-123', 'conv-abc');
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleConnection(socket);

        expect(mockConversationService.getConversation).toHaveBeenCalledWith('conv-abc');
      });
    });

    describe('not resume conversation owned by different user', () => {
      it('should not resume conversation owned by different user', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          userId: 'other-user', // Different user
        });
        mockConversationService.getConversation.mockResolvedValue(mockConv);

        const socket = createAuthenticatedMockSocket('user-123', 'conv-1');
        const result = await handler.handleConnection(socket);

        expect(result.resumed).toBe(false);
        expect(result.conversation).toBeNull();
      });
    });

    describe('resume failure behavior', () => {
      it('should NOT auto-create conversation when resume fails (conversation not found)', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        const socket = createAuthenticatedMockSocket('user-123', 'invalid-conv-id');
        const result = await handler.handleConnection(socket);

        expect(result.resumed).toBe(false);
        expect(result.conversation).toBeNull();
        // Verify createConversation was NOT called
        expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      });

      it('should NOT auto-create conversation when resume throws error', async () => {
        mockConversationService.getConversation.mockRejectedValue(new Error('DB error'));

        const socket = createAuthenticatedMockSocket('user-123', 'conv-1');
        const result = await handler.handleConnection(socket);

        expect(result.resumed).toBe(false);
        expect(result.conversation).toBeNull();
        expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      });

      it('should leave socket.conversationId unset when no valid resume', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        const socket = createAuthenticatedMockSocket('user-123', 'invalid-conv-id');
        await handler.handleConnection(socket);

        expect(socket.conversationId).toBeUndefined();
      });

      it('should leave socket.conversationId unset when resume throws', async () => {
        mockConversationService.getConversation.mockRejectedValue(new Error('DB error'));

        const socket = createAuthenticatedMockSocket('user-123', 'conv-1');
        await handler.handleConnection(socket);

        expect(socket.conversationId).toBeUndefined();
      });
    });

    describe('no resume request', () => {
      it('should not attempt to resume when no conversationId in handshake', async () => {
        const socket = createAuthenticatedMockSocket('user-123');
        // No conversationId in handshake

        await handler.handleConnection(socket);

        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      });

      it('should emit connection_ready for new connection without resume', async () => {
        const socket = createAuthenticatedMockSocket('user-123');

        const result = await handler.handleConnection(socket);

        expect(result.resumed).toBe(false);
        expect(result.conversation).toBeNull();
        expect(socket.emit).toHaveBeenCalledWith(
          'connection_ready',
          expect.objectContaining({
            resumed: false,
            hasActiveConversation: false,
          })
        );
      });
    });
  });

  /**
   * Story 28.4.3: handleDisconnect tests
   */
  describe('handleDisconnect', () => {
    it('should log disconnect with socket id and reason', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const socket = createAuthenticatedMockSocket('user-123');

      handler.handleDisconnect(socket, 'transport close');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('disconnected')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('transport close')
      );
    });

    it('should log disconnect with user id', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const socket = createAuthenticatedMockSocket('user-456');

      handler.handleDisconnect(socket, 'client namespace disconnect');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('user-456')
      );
    });

    it('should log disconnect with socket id', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const socket = createAuthenticatedMockSocket('user-123');

      handler.handleDisconnect(socket, 'ping timeout');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('socket-123')
      );
    });

    it('should handle various disconnect reasons', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const socket = createAuthenticatedMockSocket('user-123');

      // Test different Socket.IO disconnect reasons
      const reasons = [
        'transport close',
        'transport error',
        'client namespace disconnect',
        'server namespace disconnect',
        'ping timeout',
      ];

      reasons.forEach((reason) => {
        consoleSpy.mockClear();
        handler.handleDisconnect(socket, reason);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining(reason)
        );
      });
    });

    it('should handle disconnect when userId is undefined', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const socket = createAuthenticatedMockSocket('user-123');
      socket.userId = undefined;

      // Should not throw
      expect(() => {
        handler.handleDisconnect(socket, 'transport close');
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('disconnected')
      );
    });

    /**
     * Epic 30: Vision cache cleanup tests
     */
    describe('Vision cache cleanup', () => {
      it('should clear vision cache on disconnect when socket has conversationId', () => {
        const mockVisionBuilder = createMockVisionContentBuilder();
        const handlerWithVision = new ConnectionHandler(
          mockConversationService,
          TEST_SECRET,
          mockVisionBuilder
        );

        const socket = createAuthenticatedMockSocket('user-123');
        socket.conversationId = 'conv-123';

        handlerWithVision.handleDisconnect(socket, 'transport close');

        expect(mockVisionBuilder.clearConversationCache).toHaveBeenCalledWith('conv-123');
        expect(mockVisionBuilder.clearConversationCache).toHaveBeenCalledTimes(1);
      });

      it('should NOT clear vision cache when socket has no conversationId', () => {
        const mockVisionBuilder = createMockVisionContentBuilder();
        const handlerWithVision = new ConnectionHandler(
          mockConversationService,
          TEST_SECRET,
          mockVisionBuilder
        );

        const socket = createAuthenticatedMockSocket('user-123');
        // No conversationId set (socket.conversationId is undefined)

        handlerWithVision.handleDisconnect(socket, 'transport close');

        expect(mockVisionBuilder.clearConversationCache).not.toHaveBeenCalled();
      });

      it('should NOT throw when visionContentBuilder is not provided', () => {
        // Handler without visionContentBuilder (default case)
        const handlerWithoutVision = new ConnectionHandler(
          mockConversationService,
          TEST_SECRET
          // No visionContentBuilder provided
        );

        const socket = createAuthenticatedMockSocket('user-123');
        socket.conversationId = 'conv-123';

        // Should not throw even with conversationId
        expect(() => {
          handlerWithoutVision.handleDisconnect(socket, 'transport close');
        }).not.toThrow();
      });

      it('should log cache clear message on disconnect with conversation', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        const mockVisionBuilder = createMockVisionContentBuilder();
        const handlerWithVision = new ConnectionHandler(
          mockConversationService,
          TEST_SECRET,
          mockVisionBuilder
        );

        const socket = createAuthenticatedMockSocket('user-123');
        socket.conversationId = 'conv-abc';

        handlerWithVision.handleDisconnect(socket, 'client namespace disconnect');

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Cleared vision cache')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('conv-abc')
        );
      });
    });
  });
});
