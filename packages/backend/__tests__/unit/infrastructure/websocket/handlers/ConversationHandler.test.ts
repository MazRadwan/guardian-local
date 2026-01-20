/**
 * Unit Tests for ConversationHandler
 *
 * Story 28.5.1: Extract handleGetConversations from ChatServer.ts
 * Story 28.5.2: Add handleStartNewConversation and handleDeleteConversation
 * Story 28.5.3: Add handleGetHistory (get_history event)
 * Story 28.5.4: Centralize ownership validation
 *
 * Tests cover:
 * handleGetConversations:
 * 1. Return user conversations with metadata
 * 2. Return multiple conversations with correct titles
 * 3. Return empty list when no conversations
 * 4. Emit error if not authenticated (userId undefined)
 * 5. Handle service error (getUserConversations throws)
 * 6. Handle title service error (getConversationTitle throws)
 * 7. Sanitize error messages for client
 *
 * handleStartNewConversation:
 * 1. Creates conversation in consult mode (always, ignores payload)
 * 2. Emits conversation_created (NOT conversation_started)
 * 3. Returns existing pending conversation within 200ms guard
 * 4. Creates new conversation when pending is older than 200ms
 * 5. Sets socket.conversationId after creation
 * 6. Clears pending map on error
 *
 * handleDeleteConversation:
 * 1. Deletes owned conversation
 * 2. Rejects deletion of conversation owned by other user
 * 3. Emits conversation_deleted even when already deleted (idempotent)
 * 4. Clears socket.conversationId when deleting active conversation
 *
 * handleGetHistory:
 * 1. Emits 'history' event (NOT 'conversation_history')
 * 2. Returns empty messages array when conversation not found (idempotent)
 * 3. Does NOT fallback to socket.conversationId
 * 4. Rejects unauthorized access
 * 5. Shapes attachments correctly (NO storagePath)
 * 6. Supports pagination with limit and offset
 * 7. Emits error if not authenticated
 *
 * validateOwnership:
 * 1. Pass for owned conversation
 * 2. Throw for non-existent conversation
 * 3. Throw for conversation owned by different user
 * 4. Log security warning for unauthorized access
 */

import {
  ConversationHandler,
  type ConversationMetadata,
  type ConversationsListPayload,
  type ConversationCreatedPayload,
  type HistoryPayload,
  type ShapedMessage,
} from '../../../../../src/infrastructure/websocket/handlers/ConversationHandler.js';
import type { IAuthenticatedSocket, ChatContext } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { Conversation } from '../../../../../src/domain/entities/Conversation.js';
import type { Message, MessageAttachment } from '../../../../../src/domain/entities/Message.js';

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
 * Create a mock authenticated socket
 */
const createMockSocket = (userId?: string): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-123',
  userId,
  userEmail: userId ? 'test@example.com' : undefined,
  userRole: userId ? 'analyst' : undefined,
  conversationId: undefined,
  data: {},
  handshake: {
    auth: {},
  },
  emit: jest.fn(),
  join: jest.fn(),
} as unknown as jest.Mocked<IAuthenticatedSocket>);

/**
 * Create a mock conversation
 */
const createMockConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: 'conv-1',
  userId: 'user-123',
  mode: 'consult',
  assessmentId: null,
  status: 'active',
  context: {},
  startedAt: new Date('2025-01-15T10:00:00Z'),
  lastActivityAt: new Date('2025-01-15T11:00:00Z'),
  completedAt: null,
  title: null,
  titleManuallyEdited: false,
  ...overrides,
} as Conversation);

/**
 * Create a mock ChatContext
 */
const createMockChatContext = (): ChatContext => ({
  pendingCreations: new Map(),
  abortedStreams: new Set(),
  rateLimiter: {} as ChatContext['rateLimiter'],
  promptCache: {} as ChatContext['promptCache'],
});

/**
 * Create a mock message
 */
const createMockMessage = (overrides?: Partial<Message>): Message => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user',
  content: { text: 'Hello, world!' },
  createdAt: new Date('2025-01-15T10:00:00Z'),
  attachments: undefined,
  hasComponents: () => false,
  getText: () => 'Hello, world!',
  getComponents: () => [],
  hasAttachments: () => false,
  getAttachments: () => [],
  ...overrides,
} as Message);

/**
 * Create a mock message with attachments
 * Note: In tests, we verify that storagePath is NOT in the shaped output,
 * but the raw attachment from service could theoretically have extra fields
 */
const createMockMessageWithAttachments = (
  attachments: MessageAttachment[],
  overrides?: Partial<Message>
): Message => ({
  ...createMockMessage(overrides),
  attachments,
  hasAttachments: () => attachments.length > 0,
  getAttachments: () => attachments,
} as Message);

describe('ConversationHandler', () => {
  let handler: ConversationHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    handler = new ConversationHandler(mockConversationService);
    mockSocket = createMockSocket('user-123');

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleGetConversations', () => {
    describe('successful retrieval', () => {
      it('should return user conversations with metadata', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          mode: 'consult',
          startedAt: new Date('2025-01-15T10:00:00Z'),
          lastActivityAt: new Date('2025-01-15T11:00:00Z'),
        });

        mockConversationService.getUserConversations.mockResolvedValue([mockConv]);
        mockConversationService.getConversationTitle.mockResolvedValue('Test Chat');

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('conversations_list', {
          conversations: expect.arrayContaining([
            expect.objectContaining({
              id: 'conv-1',
              title: 'Test Chat',
              mode: 'consult',
            }),
          ]),
        });
      });

      it('should return multiple conversations with correct titles', async () => {
        const mockConv1 = createMockConversation({
          id: 'conv-1',
          mode: 'consult',
        });
        const mockConv2 = createMockConversation({
          id: 'conv-2',
          mode: 'assessment',
        });

        mockConversationService.getUserConversations.mockResolvedValue([mockConv1, mockConv2]);
        mockConversationService.getConversationTitle
          .mockResolvedValueOnce('First Chat')
          .mockResolvedValueOnce('Second Assessment');

        await handler.handleGetConversations(mockSocket);

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as ConversationsListPayload;

        expect(emittedPayload.conversations).toHaveLength(2);
        expect(emittedPayload.conversations[0].title).toBe('First Chat');
        expect(emittedPayload.conversations[1].title).toBe('Second Assessment');
      });

      it('should return empty list when no conversations exist', async () => {
        mockConversationService.getUserConversations.mockResolvedValue([]);

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('conversations_list', {
          conversations: [],
        });
      });

      it('should include createdAt and updatedAt timestamps', async () => {
        const startedAt = new Date('2025-01-15T10:00:00Z');
        const lastActivityAt = new Date('2025-01-15T11:30:00Z');

        const mockConv = createMockConversation({
          id: 'conv-1',
          startedAt,
          lastActivityAt,
        });

        mockConversationService.getUserConversations.mockResolvedValue([mockConv]);
        mockConversationService.getConversationTitle.mockResolvedValue('Test Chat');

        await handler.handleGetConversations(mockSocket);

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as ConversationsListPayload;
        const conv = emittedPayload.conversations[0];

        expect(conv.createdAt).toEqual(startedAt);
        expect(conv.updatedAt).toEqual(lastActivityAt);
      });

      it('should call getUserConversations with correct userId', async () => {
        mockConversationService.getUserConversations.mockResolvedValue([]);

        await handler.handleGetConversations(mockSocket);

        expect(mockConversationService.getUserConversations).toHaveBeenCalledWith('user-123');
      });

      it('should call getConversationTitle for each conversation', async () => {
        const mockConv1 = createMockConversation({ id: 'conv-1' });
        const mockConv2 = createMockConversation({ id: 'conv-2' });

        mockConversationService.getUserConversations.mockResolvedValue([mockConv1, mockConv2]);
        mockConversationService.getConversationTitle.mockResolvedValue('Title');

        await handler.handleGetConversations(mockSocket);

        expect(mockConversationService.getConversationTitle).toHaveBeenCalledWith('conv-1');
        expect(mockConversationService.getConversationTitle).toHaveBeenCalledWith('conv-2');
        expect(mockConversationService.getConversationTitle).toHaveBeenCalledTimes(2);
      });

      it('should log fetch information', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        mockConversationService.getUserConversations.mockResolvedValue([]);

        await handler.handleGetConversations(mockSocket);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Fetching conversations for user user-123')
        );
      });
    });

    describe('authentication failure', () => {
      it('should emit error if not authenticated (userId undefined)', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleGetConversations(unauthSocket);

        expect(unauthSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_conversations',
          message: 'User not authenticated',
        });
      });

      it('should not call getUserConversations when not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleGetConversations(unauthSocket);

        expect(mockConversationService.getUserConversations).not.toHaveBeenCalled();
      });

      it('should not emit conversations_list when not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleGetConversations(unauthSocket);

        expect(unauthSocket.emit).not.toHaveBeenCalledWith(
          'conversations_list',
          expect.anything()
        );
      });
    });

    describe('service error handling', () => {
      it('should handle getUserConversations error', async () => {
        mockConversationService.getUserConversations.mockRejectedValue(new Error('Database connection failed'));

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_conversations',
          message: 'Database connection failed',
        });
      });

      it('should handle getConversationTitle error', async () => {
        const mockConv = createMockConversation({ id: 'conv-1' });
        mockConversationService.getUserConversations.mockResolvedValue([mockConv]);
        mockConversationService.getConversationTitle.mockRejectedValue(new Error('Title lookup failed'));

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_conversations',
          message: 'Title lookup failed',
        });
      });

      it('should sanitize SQL error messages', async () => {
        mockConversationService.getUserConversations.mockRejectedValue(
          new Error('SELECT * FROM conversations WHERE user_id = $1')
        );

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_conversations',
          message: 'Failed to fetch conversations', // Sanitized fallback
        });
      });

      it('should sanitize database constraint errors', async () => {
        mockConversationService.getUserConversations.mockRejectedValue(
          new Error('violates foreign key constraint')
        );

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_conversations',
          message: 'Failed to fetch conversations',
        });
      });

      it('should use fallback message for non-Error objects', async () => {
        mockConversationService.getUserConversations.mockRejectedValue('string error');

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_conversations',
          message: 'Failed to fetch conversations',
        });
      });

      it('should log error to console', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        const testError = new Error('Test error');
        mockConversationService.getUserConversations.mockRejectedValue(testError);

        await handler.handleGetConversations(mockSocket);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[ConversationHandler] Error fetching conversations:',
          testError
        );
      });

      it('should not emit conversations_list on error', async () => {
        mockConversationService.getUserConversations.mockRejectedValue(new Error('DB error'));

        await handler.handleGetConversations(mockSocket);

        expect(mockSocket.emit).not.toHaveBeenCalledWith(
          'conversations_list',
          expect.anything()
        );
      });
    });

    describe('edge cases', () => {
      it('should handle conversation with assessment mode', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          mode: 'assessment',
        });

        mockConversationService.getUserConversations.mockResolvedValue([mockConv]);
        mockConversationService.getConversationTitle.mockResolvedValue('Assessment Chat');

        await handler.handleGetConversations(mockSocket);

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as ConversationsListPayload;
        expect(emittedPayload.conversations[0].mode).toBe('assessment');
      });

      it('should handle conversation with scoring mode', async () => {
        const mockConv = createMockConversation({
          id: 'conv-1',
          mode: 'scoring',
        });

        mockConversationService.getUserConversations.mockResolvedValue([mockConv]);
        mockConversationService.getConversationTitle.mockResolvedValue('Scoring Analysis');

        await handler.handleGetConversations(mockSocket);

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as ConversationsListPayload;
        expect(emittedPayload.conversations[0].mode).toBe('scoring');
      });

      it('should handle many conversations efficiently', async () => {
        const conversations = Array.from({ length: 50 }, (_, i) =>
          createMockConversation({ id: `conv-${i}` })
        );

        mockConversationService.getUserConversations.mockResolvedValue(conversations);
        mockConversationService.getConversationTitle.mockResolvedValue('Title');

        await handler.handleGetConversations(mockSocket);

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as ConversationsListPayload;
        expect(emittedPayload.conversations).toHaveLength(50);
      });
    });
  });

  describe('handleStartNewConversation', () => {
    let mockChatContext: ChatContext;

    beforeEach(() => {
      mockChatContext = createMockChatContext();
      // Reset timers for each test
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('successful creation', () => {
      it('should create conversation in consult mode (always, ignores payload mode)', async () => {
        const newConv = createMockConversation({
          id: 'new-conv-1',
          mode: 'consult',
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        // Pass assessment mode in payload - should be ignored
        await handler.handleStartNewConversation(mockSocket, { mode: 'assessment' }, mockChatContext);

        // Should always call with consult mode regardless of payload
        expect(mockConversationService.createConversation).toHaveBeenCalledWith({
          userId: 'user-123',
          mode: 'consult',
        });
      });

      it('should emit conversation_created (NOT conversation_started)', async () => {
        const newConv = createMockConversation({
          id: 'new-conv-1',
          mode: 'consult',
          startedAt: new Date('2025-01-15T10:00:00Z'),
          lastActivityAt: new Date('2025-01-15T10:00:00Z'),
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_created', {
          conversation: expect.objectContaining({
            id: 'new-conv-1',
            title: 'New Chat',
            mode: 'consult',
          }),
        });

        // Should NOT emit conversation_started
        expect(mockSocket.emit).not.toHaveBeenCalledWith('conversation_started', expect.anything());
      });

      it('should set socket.conversationId after creation', async () => {
        const newConv = createMockConversation({
          id: 'new-conv-1',
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        expect(mockSocket.conversationId).toBe('new-conv-1');
      });

      it('should track pending creation in chatContext', async () => {
        const newConv = createMockConversation({
          id: 'new-conv-1',
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        const pending = mockChatContext.pendingCreations.get('user-123');
        expect(pending).toBeDefined();
        expect(pending?.conversationId).toBe('new-conv-1');
      });

      it('should include correct payload structure with timestamps', async () => {
        const startedAt = new Date('2025-01-15T10:00:00Z');
        const lastActivityAt = new Date('2025-01-15T10:00:00Z');

        const newConv = createMockConversation({
          id: 'new-conv-1',
          startedAt,
          lastActivityAt,
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as ConversationCreatedPayload;
        expect(emittedPayload.conversation.createdAt).toEqual(startedAt);
        expect(emittedPayload.conversation.updatedAt).toEqual(lastActivityAt);
      });

      it('should clear pending creation after 200ms', async () => {
        const newConv = createMockConversation({
          id: 'new-conv-1',
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        // Pending should exist immediately after
        expect(mockChatContext.pendingCreations.has('user-123')).toBe(true);

        // Advance timers by 200ms
        jest.advanceTimersByTime(200);

        // Pending should be cleared
        expect(mockChatContext.pendingCreations.has('user-123')).toBe(false);
      });
    });

    describe('idempotency guard', () => {
      it('should return existing pending conversation within 200ms guard', async () => {
        const existingConv = createMockConversation({
          id: 'existing-conv-1',
          mode: 'consult',
        });

        // Set up pending creation within 200ms window
        mockChatContext.pendingCreations.set('user-123', {
          conversationId: 'existing-conv-1',
          timestamp: Date.now() - 100, // 100ms ago
        });

        mockConversationService.getConversation.mockResolvedValue(existingConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        // Should NOT create a new conversation
        expect(mockConversationService.createConversation).not.toHaveBeenCalled();

        // Should emit the existing conversation
        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_created', {
          conversation: expect.objectContaining({
            id: 'existing-conv-1',
          }),
        });
      });

      it('should create new conversation when pending is older than 200ms', async () => {
        const newConv = createMockConversation({
          id: 'new-conv-1',
        });

        // Set up pending creation OLDER than 200ms
        mockChatContext.pendingCreations.set('user-123', {
          conversationId: 'old-conv-1',
          timestamp: Date.now() - 300, // 300ms ago
        });

        mockConversationService.createConversation.mockResolvedValue(newConv);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        // Should create a new conversation
        expect(mockConversationService.createConversation).toHaveBeenCalled();
      });

      it('should not emit if pending conversation no longer exists', async () => {
        // Set up pending creation within 200ms window
        mockChatContext.pendingCreations.set('user-123', {
          conversationId: 'deleted-conv-1',
          timestamp: Date.now() - 100, // 100ms ago
        });

        // Conversation was deleted
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        // Should NOT emit anything (returns early)
        expect(mockSocket.emit).not.toHaveBeenCalled();
        // Should NOT create a new conversation either
        expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      });
    });

    describe('authentication failure', () => {
      it('should emit error if not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleStartNewConversation(unauthSocket, {}, mockChatContext);

        expect(unauthSocket.emit).toHaveBeenCalledWith('error', {
          event: 'start_new_conversation',
          message: 'User not authenticated',
        });
      });

      it('should not create conversation when not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleStartNewConversation(unauthSocket, {}, mockChatContext);

        expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should clear pending map on error', async () => {
        mockConversationService.createConversation.mockRejectedValue(new Error('Database error'));

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        // Pending should be cleared after error
        expect(mockChatContext.pendingCreations.has('user-123')).toBe(false);
      });

      it('should emit error with sanitized message', async () => {
        mockConversationService.createConversation.mockRejectedValue(new Error('Database error'));

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'start_new_conversation',
          message: 'Database error',
        });
      });

      it('should sanitize SQL errors', async () => {
        mockConversationService.createConversation.mockRejectedValue(
          new Error('INSERT INTO conversations VALUES ($1)')
        );

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'start_new_conversation',
          message: 'Failed to create conversation',
        });
      });

      it('should log error to console', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        const testError = new Error('Test error');
        mockConversationService.createConversation.mockRejectedValue(testError);

        await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[ConversationHandler] Error starting new conversation:',
          testError
        );
      });
    });
  });

  describe('handleDeleteConversation', () => {
    describe('successful deletion', () => {
      it('should delete owned conversation', async () => {
        const conversation = createMockConversation({
          id: 'conv-to-delete',
          userId: 'user-123',
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.deleteConversation.mockResolvedValue();

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-to-delete' });

        expect(mockConversationService.deleteConversation).toHaveBeenCalledWith('conv-to-delete');
        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_deleted', {
          conversationId: 'conv-to-delete',
        });
      });

      it('should clear socket.conversationId when deleting active conversation', async () => {
        const conversation = createMockConversation({
          id: 'active-conv',
          userId: 'user-123',
        });

        mockSocket.conversationId = 'active-conv';
        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.deleteConversation.mockResolvedValue();

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'active-conv' });

        expect(mockSocket.conversationId).toBeUndefined();
      });

      it('should not clear socket.conversationId when deleting non-active conversation', async () => {
        const conversation = createMockConversation({
          id: 'other-conv',
          userId: 'user-123',
        });

        mockSocket.conversationId = 'active-conv';
        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.deleteConversation.mockResolvedValue();

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'other-conv' });

        expect(mockSocket.conversationId).toBe('active-conv');
      });
    });

    describe('idempotent deletion', () => {
      it('should emit conversation_deleted even when already deleted', async () => {
        // Conversation no longer exists
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'already-deleted' });

        // Should NOT call deleteConversation
        expect(mockConversationService.deleteConversation).not.toHaveBeenCalled();

        // Should still emit success
        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_deleted', {
          conversationId: 'already-deleted',
        });
      });

      it('should clear socket.conversationId when deleting already-deleted active conversation', async () => {
        mockSocket.conversationId = 'already-deleted';
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'already-deleted' });

        expect(mockSocket.conversationId).toBeUndefined();
      });
    });

    describe('ownership validation', () => {
      it('should reject deletion of conversation owned by other user', async () => {
        const conversation = createMockConversation({
          id: 'other-user-conv',
          userId: 'other-user-456', // Different user
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'other-user-conv' });

        // Should NOT delete
        expect(mockConversationService.deleteConversation).not.toHaveBeenCalled();

        // Should emit "Conversation not found" (hides ownership info)
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'delete_conversation',
          message: 'Conversation not found',
        });
      });

      it('should log security warning for unauthorized access', async () => {
        const consoleSpy = jest.spyOn(console, 'warn');
        const conversation = createMockConversation({
          id: 'other-user-conv',
          userId: 'other-user-456',
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'other-user-conv' });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('SECURITY: User user-123 attempted to delete')
        );
      });
    });

    describe('authentication failure', () => {
      it('should emit error if not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleDeleteConversation(unauthSocket, { conversationId: 'conv-1' });

        expect(unauthSocket.emit).toHaveBeenCalledWith('error', {
          event: 'delete_conversation',
          message: 'User not authenticated',
        });
      });

      it('should not check conversation when not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleDeleteConversation(unauthSocket, { conversationId: 'conv-1' });

        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      });
    });

    describe('validation', () => {
      it('should emit error when conversationId is missing', async () => {
        await handler.handleDeleteConversation(mockSocket, { conversationId: '' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'delete_conversation',
          message: 'conversationId is required',
        });
      });

      it('should not call service when conversationId is missing', async () => {
        await handler.handleDeleteConversation(mockSocket, { conversationId: '' });

        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
        expect(mockConversationService.deleteConversation).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should emit sanitized error on service failure', async () => {
        mockConversationService.getConversation.mockRejectedValue(new Error('Database connection failed'));

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'delete_conversation',
          message: 'Database connection failed',
        });
      });

      it('should sanitize SQL errors', async () => {
        mockConversationService.getConversation.mockRejectedValue(
          new Error('DELETE FROM conversations WHERE id = $1')
        );

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'delete_conversation',
          message: 'Failed to delete conversation',
        });
      });

      it('should log error to console', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        const testError = new Error('Test error');
        mockConversationService.getConversation.mockRejectedValue(testError);

        await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

        expect(consoleSpy).toHaveBeenCalledWith(
          '[ConversationHandler] Error deleting conversation:',
          testError
        );
      });
    });
  });

  describe('handleGetHistory', () => {
    describe('successful retrieval', () => {
      it('should emit history event (NOT conversation_history)', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
        });

        const messages = [
          createMockMessage({
            id: 'msg-1',
            conversationId: 'conv-1',
            role: 'user',
            content: { text: 'Hello' },
          }),
          createMockMessage({
            id: 'msg-2',
            conversationId: 'conv-1',
            role: 'assistant',
            content: { text: 'Hi there!' },
          }),
        ];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        // Should emit 'history' (NOT 'conversation_history')
        expect(mockSocket.emit).toHaveBeenCalledWith('history', expect.any(Object));
        expect(mockSocket.emit).not.toHaveBeenCalledWith('conversation_history', expect.anything());
      });

      it('should return messages with correct shape', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const createdAt = new Date('2025-01-15T10:00:00Z');
        const messages = [
          createMockMessage({
            id: 'msg-1',
            conversationId: 'conv-1',
            role: 'user',
            content: { text: 'Test message' },
            createdAt,
          }),
        ];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;

        expect(emittedPayload.conversationId).toBe('conv-1');
        expect(emittedPayload.messages).toHaveLength(1);
        expect(emittedPayload.messages[0]).toMatchObject({
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: { text: 'Test message' },
          createdAt,
        });
      });

      it('should support pagination with limit and offset', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const messages = [createMockMessage({ id: 'msg-5' })];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, {
          conversationId: 'conv-1',
          limit: 10,
          offset: 20,
        });

        expect(mockConversationService.getHistory).toHaveBeenCalledWith('conv-1', 10, 20);
      });

      it('should use default pagination when not specified', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue([]);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(mockConversationService.getHistory).toHaveBeenCalledWith('conv-1', undefined, undefined);
      });

      it('should log history request and response', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const messages = [createMockMessage(), createMockMessage({ id: 'msg-2' })];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('History requested for conversation conv-1')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Sent 2 messages for conversation conv-1')
        );
      });
    });

    describe('idempotent empty history', () => {
      it('should return empty messages array when conversation not found (NOT error)', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleGetHistory(mockSocket, { conversationId: 'nonexistent-conv' });

        // Should emit history with empty messages (NOT error)
        expect(mockSocket.emit).toHaveBeenCalledWith('history', {
          conversationId: 'nonexistent-conv',
          messages: [],
        });

        // Should NOT emit error
        expect(mockSocket.emit).not.toHaveBeenCalledWith('error', expect.anything());

        // Should NOT call getHistory (conversation doesn't exist)
        expect(mockConversationService.getHistory).not.toHaveBeenCalled();
      });

      it('should log when returning empty history for non-existent conversation', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleGetHistory(mockSocket, { conversationId: 'nonexistent-conv' });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Conversation nonexistent-conv not found - returning empty history')
        );
      });
    });

    describe('conversationId requirement', () => {
      it('should NOT fallback to socket.conversationId when conversationId is missing', async () => {
        mockSocket.conversationId = 'socket-conv-id';

        await handler.handleGetHistory(mockSocket, { conversationId: '' });

        // Should emit error, NOT use socket.conversationId
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'conversationId is required',
        });

        // Should NOT call getConversation with socket's conversationId
        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      });

      it('should emit error when conversationId is undefined', async () => {
        await handler.handleGetHistory(mockSocket, { conversationId: undefined as unknown as string });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'conversationId is required',
        });
      });
    });

    describe('ownership validation', () => {
      it('should reject access to conversation owned by other user', async () => {
        const conversation = createMockConversation({
          id: 'other-user-conv',
          userId: 'other-user-456',
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleGetHistory(mockSocket, { conversationId: 'other-user-conv' });

        // Should emit unauthorized error
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'Unauthorized: You do not have access to this conversation',
        });

        // Should NOT call getHistory
        expect(mockConversationService.getHistory).not.toHaveBeenCalled();
      });

      it('should log security warning for unauthorized access attempt', async () => {
        const consoleSpy = jest.spyOn(console, 'warn');
        const conversation = createMockConversation({
          id: 'other-user-conv',
          userId: 'other-user-456',
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleGetHistory(mockSocket, { conversationId: 'other-user-conv' });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('SECURITY: User user-123 attempted to access')
        );
      });
    });

    describe('attachment shaping', () => {
      it('should shape attachments correctly (NO storagePath)', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const attachments: MessageAttachment[] = [
          {
            fileId: 'file-1',
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        ];
        const messages = [createMockMessageWithAttachments(attachments, { id: 'msg-1' })];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;
        const shapedAttachments = emittedPayload.messages[0].attachments;

        expect(shapedAttachments).toBeDefined();
        expect(shapedAttachments).toHaveLength(1);
        expect(shapedAttachments![0]).toEqual({
          fileId: 'file-1',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024,
        });

        // CRITICAL: Verify storagePath is NOT in the output
        expect(shapedAttachments![0]).not.toHaveProperty('storagePath');
      });

      it('should handle multiple attachments', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const attachments: MessageAttachment[] = [
          { fileId: 'file-1', filename: 'doc1.pdf', mimeType: 'application/pdf', size: 1024 },
          { fileId: 'file-2', filename: 'image.png', mimeType: 'image/png', size: 2048 },
        ];
        const messages = [createMockMessageWithAttachments(attachments)];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;
        expect(emittedPayload.messages[0].attachments).toHaveLength(2);
      });

      it('should not include attachments field for messages without attachments', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const messages = [createMockMessage({ id: 'msg-1', attachments: undefined })];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;

        // Should NOT have attachments property when there are no attachments
        expect(emittedPayload.messages[0]).not.toHaveProperty('attachments');
      });

      it('should not include attachments field for empty attachments array', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const messages = [createMockMessage({ id: 'msg-1', attachments: [] })];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;

        // Should NOT have attachments property when array is empty
        expect(emittedPayload.messages[0]).not.toHaveProperty('attachments');
      });
    });

    describe('authentication failure', () => {
      it('should emit error if not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleGetHistory(unauthSocket, { conversationId: 'conv-1' });

        expect(unauthSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'User not authenticated',
        });
      });

      it('should not call service when not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await handler.handleGetHistory(unauthSocket, { conversationId: 'conv-1' });

        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
        expect(mockConversationService.getHistory).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should emit sanitized error on service failure', async () => {
        mockConversationService.getConversation.mockRejectedValue(new Error('Database connection failed'));

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'Database connection failed',
        });
      });

      it('should sanitize SQL errors', async () => {
        mockConversationService.getConversation.mockRejectedValue(
          new Error('SELECT * FROM messages WHERE conversation_id = $1')
        );

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'Failed to get history',
        });
      });

      it('should handle getHistory service error', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockRejectedValue(new Error('Message query failed'));

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'Message query failed',
        });
      });

      it('should log error to console', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        const testError = new Error('Test error');
        mockConversationService.getConversation.mockRejectedValue(testError);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(consoleSpy).toHaveBeenCalledWith(
          '[ConversationHandler] Error getting history:',
          testError
        );
      });

      it('should use fallback message for non-Error objects', async () => {
        mockConversationService.getConversation.mockRejectedValue('string error');

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'get_history',
          message: 'Failed to get history',
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty history for existing conversation', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue([]);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('history', {
          conversationId: 'conv-1',
          messages: [],
        });
      });

      it('should handle messages with components', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const messages = [
          createMockMessage({
            id: 'msg-1',
            content: {
              text: 'Select an option:',
              components: [
                { type: 'button', data: { label: 'Option 1' } },
              ],
            },
          }),
        ];

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;
        expect(emittedPayload.messages[0].content.components).toBeDefined();
        expect(emittedPayload.messages[0].content.components).toHaveLength(1);
      });

      it('should handle many messages efficiently', async () => {
        const conversation = createMockConversation({ id: 'conv-1', userId: 'user-123' });
        const messages = Array.from({ length: 100 }, (_, i) =>
          createMockMessage({ id: `msg-${i}` })
        );

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.getHistory.mockResolvedValue(messages);

        await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

        const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1] as HistoryPayload;
        expect(emittedPayload.messages).toHaveLength(100);
      });
    });
  });

  describe('validateOwnership', () => {
    describe('successful validation', () => {
      it('should pass for owned conversation', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-123',
        } as unknown as ReturnType<typeof createMockConversation>);

        await expect(handler.validateOwnership('conv-1', 'user-123')).resolves.toBeUndefined();
      });

      it('should call getConversation with correct conversationId', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-123',
        } as unknown as ReturnType<typeof createMockConversation>);

        await handler.validateOwnership('conv-1', 'user-123');

        expect(mockConversationService.getConversation).toHaveBeenCalledWith('conv-1');
        expect(mockConversationService.getConversation).toHaveBeenCalledTimes(1);
      });
    });

    describe('conversation not found', () => {
      it('should throw for non-existent conversation', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        await expect(handler.validateOwnership('invalid-conv', 'user-123'))
          .rejects.toThrow('not found');
      });

      it('should include conversation ID in error message', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        await expect(handler.validateOwnership('conv-xyz', 'user-123'))
          .rejects.toThrow('Conversation conv-xyz not found');
      });
    });

    describe('unauthorized access', () => {
      it('should throw for conversation owned by different user', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'other-user-456',
        } as unknown as ReturnType<typeof createMockConversation>);

        await expect(handler.validateOwnership('conv-1', 'user-123'))
          .rejects.toThrow('Unauthorized');
      });

      it('should throw with access denied message', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'other-user-456',
        } as unknown as ReturnType<typeof createMockConversation>);

        await expect(handler.validateOwnership('conv-1', 'user-123'))
          .rejects.toThrow('Unauthorized: You do not have access to this conversation');
      });

      it('should log security warning for unauthorized access attempt', async () => {
        const consoleSpy = jest.spyOn(console, 'warn');
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'other-user-456',
        } as unknown as ReturnType<typeof createMockConversation>);

        await expect(handler.validateOwnership('conv-1', 'user-123')).rejects.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('User user-123 attempted to access conversation conv-1 owned by other-user-456')
        );
      });
    });

    describe('edge cases', () => {
      it('should handle conversation with matching userId exactly', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-with-special-chars-123!@#',
        } as unknown as ReturnType<typeof createMockConversation>);

        await expect(
          handler.validateOwnership('conv-1', 'user-with-special-chars-123!@#')
        ).resolves.toBeUndefined();
      });

      it('should reject when userIds differ only by case', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'User-123', // Capital U
        } as unknown as ReturnType<typeof createMockConversation>);

        // userId comparison should be case-sensitive
        await expect(handler.validateOwnership('conv-1', 'user-123'))
          .rejects.toThrow('Unauthorized');
      });

      it('should reject when userIds differ by whitespace', async () => {
        mockConversationService.getConversation.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-123 ', // Trailing space
        } as unknown as ReturnType<typeof createMockConversation>);

        await expect(handler.validateOwnership('conv-1', 'user-123'))
          .rejects.toThrow('Unauthorized');
      });
    });
  });
});
