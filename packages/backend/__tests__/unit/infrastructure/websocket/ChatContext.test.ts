import {
  isAuthenticatedSocket,
  IAuthenticatedSocket,
  createChatContext,
} from '../../../../src/infrastructure/websocket/ChatContext.js';
import type { RateLimiter } from '../../../../src/infrastructure/websocket/RateLimiter.js';
import type { PromptCacheManager } from '../../../../src/infrastructure/ai/PromptCacheManager.js';

describe('ChatContext', () => {
  describe('isAuthenticatedSocket', () => {
    it('should return true for authenticated socket with userId', () => {
      const socket = {
        id: 'socket-1',
        userId: 'user-1',
        emit: jest.fn(),
        join: jest.fn(),
        data: {},
        handshake: { auth: { token: 'jwt-token' } },
      };
      expect(isAuthenticatedSocket(socket)).toBe(true);
    });

    it('should return false for socket without userId (pre-auth)', () => {
      const socket = {
        id: 'socket-1',
        userId: undefined,
        emit: jest.fn(),
        handshake: { auth: { token: 'jwt-token' } },
      };
      expect(isAuthenticatedSocket(socket)).toBe(false);
    });

    it('should return false for socket with null userId', () => {
      const socket = {
        id: 'socket-1',
        userId: null,
        emit: jest.fn(),
        handshake: { auth: { token: 'jwt-token' } },
      };
      expect(isAuthenticatedSocket(socket)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isAuthenticatedSocket(null)).toBe(false);
      expect(isAuthenticatedSocket(undefined)).toBe(false);
      expect(isAuthenticatedSocket('string')).toBe(false);
      expect(isAuthenticatedSocket(123)).toBe(false);
    });

    it('should return false for object missing id', () => {
      const socket = {
        userId: 'user-1',
        emit: jest.fn(),
      };
      expect(isAuthenticatedSocket(socket)).toBe(false);
    });

    it('should return false for object missing emit function', () => {
      const socket = {
        id: 'socket-1',
        userId: 'user-1',
      };
      expect(isAuthenticatedSocket(socket)).toBe(false);
    });

    it('should return false for object with non-function emit', () => {
      const socket = {
        id: 'socket-1',
        userId: 'user-1',
        emit: 'not-a-function',
      };
      expect(isAuthenticatedSocket(socket)).toBe(false);
    });
  });

  describe('ISocketHandshakeAuth', () => {
    it('should provide type-safe access to auth token', () => {
      const socket: IAuthenticatedSocket = {
        id: 'socket-1',
        emit: jest.fn(),
        join: jest.fn(),
        data: {},
        handshake: { auth: { token: 'jwt-token', conversationId: 'conv-1' } },
      };
      expect(socket.handshake.auth.token).toBe('jwt-token');
      expect(socket.handshake.auth.conversationId).toBe('conv-1');
    });

    it('should allow empty auth object', () => {
      const socket: IAuthenticatedSocket = {
        id: 'socket-1',
        emit: jest.fn(),
        join: jest.fn(),
        data: {},
        handshake: { auth: {} },
      };
      expect(socket.handshake.auth.token).toBeUndefined();
      expect(socket.handshake.auth.conversationId).toBeUndefined();
    });
  });

  describe('IAuthenticatedSocket', () => {
    it('should allow setting userId after creation (auth middleware pattern)', () => {
      const socket: IAuthenticatedSocket = {
        id: 'socket-1',
        emit: jest.fn(),
        join: jest.fn(),
        data: {},
        handshake: { auth: { token: 'jwt-token' } },
      };

      // Before auth
      expect(socket.userId).toBeUndefined();

      // Auth middleware sets userId
      socket.userId = 'user-123';
      socket.userEmail = 'user@example.com';
      socket.userRole = 'admin';

      // After auth
      expect(socket.userId).toBe('user-123');
      expect(socket.userEmail).toBe('user@example.com');
      expect(socket.userRole).toBe('admin');
    });

    it('should allow setting conversationId (mutable)', () => {
      const socket: IAuthenticatedSocket = {
        id: 'socket-1',
        userId: 'user-1',
        emit: jest.fn(),
        join: jest.fn(),
        data: {},
        handshake: { auth: {} },
      };

      socket.conversationId = 'conv-1';
      expect(socket.conversationId).toBe('conv-1');

      // Switch conversation
      socket.conversationId = 'conv-2';
      expect(socket.conversationId).toBe('conv-2');
    });

    it('should support data record for custom properties', () => {
      const socket: IAuthenticatedSocket = {
        id: 'socket-1',
        emit: jest.fn(),
        join: jest.fn(),
        data: {},
        handshake: { auth: {} },
      };

      socket.data['customKey'] = { some: 'value' };
      expect(socket.data['customKey']).toEqual({ some: 'value' });
    });
  });

  describe('createChatContext', () => {
    it('should create context with initialized collections', () => {
      const mockRateLimiter = {} as RateLimiter;
      const mockPromptCache = {} as PromptCacheManager;

      const context = createChatContext(mockRateLimiter, mockPromptCache);

      expect(context.pendingCreations).toBeInstanceOf(Map);
      expect(context.abortedStreams).toBeInstanceOf(Set);
      expect(context.rateLimiter).toBe(mockRateLimiter);
      expect(context.promptCache).toBe(mockPromptCache);
    });

    it('should create independent contexts', () => {
      const mockRateLimiter1 = { id: 1 } as unknown as RateLimiter;
      const mockRateLimiter2 = { id: 2 } as unknown as RateLimiter;
      const mockPromptCache = {} as PromptCacheManager;

      const context1 = createChatContext(mockRateLimiter1, mockPromptCache);
      const context2 = createChatContext(mockRateLimiter2, mockPromptCache);

      // Modify context1
      context1.pendingCreations.set('key', { conversationId: 'conv-1', timestamp: Date.now() });

      // context2 should be independent
      expect(context2.pendingCreations.size).toBe(0);
      expect(context1.rateLimiter).not.toBe(context2.rateLimiter);
    });
  });
});
