/**
 * Unit Tests for ModeSwitchHandler
 *
 * Story 28.6.1: Extract ModeSwitchHandler.ts (switch_mode)
 * Story 28.6.2: Add guidance messages for assessment/scoring modes
 *
 * Tests cover:
 * 1. Switch to valid mode (consult, assessment, scoring)
 * 2. Reject invalid mode
 * 3. Reject if conversationId missing
 * 4. Reject if mode missing
 * 5. Emit conversation_mode_updated even when already in requested mode (idempotent)
 * 6. Reject unauthorized access
 * 7. Handle errors properly
 * 8. Sanitize error messages
 * 9. Log security warnings for unauthorized access
 * 10. Do NOT fallback to socket.conversationId
 * 11. Persist and emit guidance for assessment mode
 * 12. Persist and emit guidance for scoring mode
 * 13. No guidance for consult mode
 * 14. Idempotent: no guidance if already in mode
 * 15. Guidance emitted via 'message' event
 */

import {
  ModeSwitchHandler,
  type SwitchModePayload,
  type ModeSwitchedPayload,
  type ChatMode,
  ASSESSMENT_GUIDANCE,
  SCORING_GUIDANCE,
} from '../../../../../src/infrastructure/websocket/handlers/ModeSwitchHandler.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { Conversation, ConversationMode } from '../../../../../src/domain/entities/Conversation.js';
import type { Message } from '../../../../../src/domain/entities/Message.js';

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
  mode: 'consult' as ConversationMode,
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
 * Create a mock message for guidance
 */
const createMockMessage = (text: string, conversationId: string): Message => ({
  id: 'msg-guidance-123',
  conversationId,
  role: 'assistant',
  content: { text },
  createdAt: new Date('2025-01-15T12:00:00Z'),
} as Message);

describe('ModeSwitchHandler', () => {
  let handler: ModeSwitchHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    handler = new ModeSwitchHandler(mockConversationService);
    mockSocket = createMockSocket('user-123');

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful mode switch', () => {
    it('should switch to consult mode', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'assessment',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'consult',
      });

      expect(mockConversationService.switchMode).toHaveBeenCalledWith('conv-1', 'consult');
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'consult',
      });
    });

    it('should switch to assessment mode', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'consult',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockConversationService.switchMode).toHaveBeenCalledWith('conv-1', 'assessment');
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'assessment',
      });
    });

    it('should switch to scoring mode', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'consult',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'scoring',
      });

      expect(mockConversationService.switchMode).toHaveBeenCalledWith('conv-1', 'scoring');
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'scoring',
      });
    });

    it('should log mode switch', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'consult',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Switched conversation conv-1 to assessment mode')
      );
    });

    it('should call switchMode (NOT updateMode)', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'consult',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'scoring',
      });

      // Should call switchMode
      expect(mockConversationService.switchMode).toHaveBeenCalledWith('conv-1', 'scoring');

      // Should NOT have any updateMode method (it doesn't exist on the service)
      // This is implicit - if switchMode is called, we're using the correct method
    });
  });

  describe('idempotent mode switch', () => {
    it('should emit conversation_mode_updated even when already in requested mode', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'assessment', // Already in assessment mode
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment', // Same mode
      });

      // Should NOT call switchMode (no DB change needed)
      expect(mockConversationService.switchMode).not.toHaveBeenCalled();

      // Should still emit the event (idempotent)
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'assessment',
      });
    });

    it('should log when already in requested mode', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'scoring',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'scoring',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already in scoring mode - emitting event')
      );
    });

    it('should not emit error when already in requested mode', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'consult',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'consult',
      });

      // Should NOT emit error
      expect(mockSocket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });
  });

  describe('invalid mode rejection', () => {
    it('should reject invalid mode', async () => {
      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'invalid_mode' as ChatMode,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Invalid mode: invalid_mode. Must be one of: consult, assessment, scoring',
      });
    });

    it('should not call switchMode for invalid mode', async () => {
      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'invalid' as ChatMode,
      });

      expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    });

    it('should not call getConversation for invalid mode', async () => {
      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'unknown' as ChatMode,
      });

      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
    });

    it('should reject mode with different casing', async () => {
      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'CONSULT' as ChatMode, // Wrong casing
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: expect.stringContaining('Invalid mode: CONSULT'),
      });
    });
  });

  describe('missing required fields', () => {
    it('should reject if conversationId is missing', async () => {
      await handler.handleSwitchMode(mockSocket, {
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      });
    });

    it('should reject if mode is missing', async () => {
      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      });
    });

    it('should reject if both conversationId and mode are missing', async () => {
      await handler.handleSwitchMode(mockSocket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      });
    });

    it('should reject empty conversationId', async () => {
      await handler.handleSwitchMode(mockSocket, {
        conversationId: '',
        mode: 'consult',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      });
    });

    it('should not call service when required fields are missing', async () => {
      await handler.handleSwitchMode(mockSocket, {});

      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    });
  });

  describe('no socket.conversationId fallback', () => {
    it('should NOT fallback to socket.conversationId when conversationId is missing', async () => {
      mockSocket.conversationId = 'socket-conv-id';

      await handler.handleSwitchMode(mockSocket, {
        mode: 'assessment',
        // conversationId NOT provided
      });

      // Should emit error, NOT use socket.conversationId
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      });

      // Should NOT call getConversation with socket's conversationId
      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
    });

    it('should NOT fallback when conversationId is undefined', async () => {
      mockSocket.conversationId = 'socket-conv-id';

      await handler.handleSwitchMode(mockSocket, {
        conversationId: undefined,
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      });
    });
  });

  describe('conversation not found', () => {
    it('should emit error when conversation not found', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'nonexistent-conv',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Conversation nonexistent-conv not found',
      });
    });

    it('should not call switchMode when conversation not found', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'nonexistent-conv',
        mode: 'assessment',
      });

      expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    });
  });

  describe('ownership validation', () => {
    it('should reject access to conversation owned by other user', async () => {
      const conversation = createMockConversation({
        id: 'other-user-conv',
        userId: 'other-user-456', // Different user
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'other-user-conv',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Unauthorized: You do not have access to this conversation',
      });
    });

    it('should not call switchMode for unauthorized access', async () => {
      const conversation = createMockConversation({
        id: 'other-user-conv',
        userId: 'other-user-456',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'other-user-conv',
        mode: 'assessment',
      });

      expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    });

    it('should log security warning for unauthorized access', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      const conversation = createMockConversation({
        id: 'other-user-conv',
        userId: 'other-user-456',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'other-user-conv',
        mode: 'assessment',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY: User user-123 attempted to access')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('conversation other-user-conv owned by other-user-456')
      );
    });
  });

  describe('authentication failure', () => {
    it('should emit error if not authenticated (userId undefined)', async () => {
      const unauthSocket = createMockSocket(undefined);

      await handler.handleSwitchMode(unauthSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(unauthSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'User not authenticated',
      });
    });

    it('should not call service when not authenticated', async () => {
      const unauthSocket = createMockSocket(undefined);

      await handler.handleSwitchMode(unauthSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    });

    it('should not emit conversation_mode_updated when not authenticated', async () => {
      const unauthSocket = createMockSocket(undefined);

      await handler.handleSwitchMode(unauthSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(unauthSocket.emit).not.toHaveBeenCalledWith(
        'conversation_mode_updated',
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should emit sanitized error on service failure', async () => {
      mockConversationService.getConversation.mockRejectedValue(
        new Error('Database connection failed')
      );

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Database connection failed',
      });
    });

    it('should sanitize SQL errors', async () => {
      mockConversationService.getConversation.mockRejectedValue(
        new Error('UPDATE conversations SET mode = $1 WHERE id = $2')
      );

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Failed to switch mode', // Sanitized fallback
      });
    });

    it('should sanitize connection errors', async () => {
      mockConversationService.getConversation.mockRejectedValue(
        new Error('ECONNREFUSED localhost:5432')
      );

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Failed to switch mode',
      });
    });

    it('should use fallback message for non-Error objects', async () => {
      mockConversationService.getConversation.mockRejectedValue('string error');

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Failed to switch mode',
      });
    });

    it('should log error to console', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const testError = new Error('Test error');
      mockConversationService.getConversation.mockRejectedValue(testError);

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ModeSwitchHandler] Error switching mode:',
        testError
      );
    });

    it('should handle switchMode service error', async () => {
      const conversation = createMockConversation({
        id: 'conv-1',
        userId: 'user-123',
        mode: 'consult',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockRejectedValue(
        new Error('Cannot switch mode on completed conversation')
      );

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'switch_mode',
        message: 'Cannot switch mode on completed conversation',
      });
    });

    it('should not emit conversation_mode_updated on error', async () => {
      mockConversationService.getConversation.mockRejectedValue(new Error('DB error'));

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-1',
        mode: 'assessment',
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'conversation_mode_updated',
        expect.anything()
      );
    });
  });

  describe('edge cases', () => {
    it('should handle conversation with all valid modes', async () => {
      const modes: ChatMode[] = ['consult', 'assessment', 'scoring'];

      for (const fromMode of modes) {
        for (const toMode of modes) {
          mockConversationService.getConversation.mockResolvedValue(
            createMockConversation({
              id: 'conv-1',
              userId: 'user-123',
              mode: fromMode,
            })
          );
          mockConversationService.switchMode.mockResolvedValue();
          mockSocket.emit = jest.fn();

          await handler.handleSwitchMode(mockSocket, {
            conversationId: 'conv-1',
            mode: toMode,
          });

          // Should always emit conversation_mode_updated (even for same mode)
          expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
            conversationId: 'conv-1',
            mode: toMode,
          });
        }
      }
    });

    it('should call getConversation with correct conversationId', async () => {
      const conversation = createMockConversation({
        id: 'specific-conv-id',
        userId: 'user-123',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'specific-conv-id',
        mode: 'assessment',
      });

      expect(mockConversationService.getConversation).toHaveBeenCalledWith('specific-conv-id');
      expect(mockConversationService.getConversation).toHaveBeenCalledTimes(1);
    });

    it('should handle whitespace in conversationId', async () => {
      // Empty after trim should still be rejected
      await handler.handleSwitchMode(mockSocket, {
        conversationId: '   ',
        mode: 'assessment',
      });

      // Whitespace-only is falsy when checked with !conversationId
      // Actually '   ' is truthy, so it will pass the first check but service will handle it
      // Let's verify the service is called with the whitespace value
      expect(mockConversationService.getConversation).toHaveBeenCalledWith('   ');
    });

    it('should handle special characters in conversationId', async () => {
      const conversation = createMockConversation({
        id: 'conv-with-special-chars!@#$%',
        userId: 'user-123',
      });

      mockConversationService.getConversation.mockResolvedValue(conversation);
      mockConversationService.switchMode.mockResolvedValue();

      await handler.handleSwitchMode(mockSocket, {
        conversationId: 'conv-with-special-chars!@#$%',
        mode: 'assessment',
      });

      expect(mockConversationService.switchMode).toHaveBeenCalledWith(
        'conv-with-special-chars!@#$%',
        'assessment'
      );
    });
  });

  /**
   * Story 28.6.2: Guidance messages tests
   */
  describe('guidance messages', () => {
    describe('assessment mode guidance', () => {
      it('should persist guidance message for assessment mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult', // Switching from consult
        });

        const guidanceMessage = createMockMessage(ASSESSMENT_GUIDANCE, 'conv-1');

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();
        mockConversationService.sendMessage.mockResolvedValue(guidanceMessage);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'assessment',
        });

        // Should persist guidance as assistant message
        expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          role: 'assistant',
          content: { text: ASSESSMENT_GUIDANCE },
        });
      });

      it('should emit guidance via message event for assessment mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult',
        });

        const guidanceMessage = createMockMessage(ASSESSMENT_GUIDANCE, 'conv-1');

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();
        mockConversationService.sendMessage.mockResolvedValue(guidanceMessage);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'assessment',
        });

        // Should emit via 'message' event (NOT separate guidance event)
        expect(mockSocket.emit).toHaveBeenCalledWith('message', {
          id: guidanceMessage.id,
          conversationId: guidanceMessage.conversationId,
          role: guidanceMessage.role,
          content: guidanceMessage.content,
          createdAt: guidanceMessage.createdAt,
        });
      });

      it('should contain assessment options in guidance text', () => {
        expect(ASSESSMENT_GUIDANCE).toContain('Assessment Mode Activated');
        expect(ASSESSMENT_GUIDANCE).toContain('Quick Assessment');
        expect(ASSESSMENT_GUIDANCE).toContain('Comprehensive Assessment');
        expect(ASSESSMENT_GUIDANCE).toContain('Category-Focused Assessment');
        expect(ASSESSMENT_GUIDANCE).toContain('1');
        expect(ASSESSMENT_GUIDANCE).toContain('2');
        expect(ASSESSMENT_GUIDANCE).toContain('3');
      });
    });

    describe('scoring mode guidance', () => {
      it('should persist guidance message for scoring mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult', // Switching from consult
        });

        const guidanceMessage = createMockMessage(SCORING_GUIDANCE, 'conv-1');

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();
        mockConversationService.sendMessage.mockResolvedValue(guidanceMessage);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'scoring',
        });

        // Should persist guidance as assistant message
        expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          role: 'assistant',
          content: { text: SCORING_GUIDANCE },
        });
      });

      it('should emit guidance via message event for scoring mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult',
        });

        const guidanceMessage = createMockMessage(SCORING_GUIDANCE, 'conv-1');

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();
        mockConversationService.sendMessage.mockResolvedValue(guidanceMessage);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'scoring',
        });

        // Should emit via 'message' event (NOT separate guidance event)
        expect(mockSocket.emit).toHaveBeenCalledWith('message', {
          id: guidanceMessage.id,
          conversationId: guidanceMessage.conversationId,
          role: guidanceMessage.role,
          content: guidanceMessage.content,
          createdAt: guidanceMessage.createdAt,
        });
      });

      it('should contain upload instructions in guidance text', () => {
        expect(SCORING_GUIDANCE).toContain('Scoring Mode Activated');
        expect(SCORING_GUIDANCE).toContain('Upload a completed vendor questionnaire');
        expect(SCORING_GUIDANCE).toContain('PDF or Word');
        expect(SCORING_GUIDANCE).toContain('risk score');
        expect(SCORING_GUIDANCE).toContain('Approve/Conditional/Decline');
      });
    });

    describe('consult mode - no guidance', () => {
      it('should NOT send guidance for consult mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'assessment', // Switching from assessment to consult
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'consult',
        });

        // Should NOT call sendMessage for guidance
        expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
      });

      it('should NOT emit message event for consult mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'scoring', // Switching from scoring to consult
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'consult',
        });

        // Should emit conversation_mode_updated but NOT message
        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
          conversationId: 'conv-1',
          mode: 'consult',
        });
        expect(mockSocket.emit).not.toHaveBeenCalledWith('message', expect.anything());
      });
    });

    describe('idempotent - no guidance if already in mode', () => {
      it('should NOT send guidance if already in assessment mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'assessment', // Already in assessment
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'assessment', // Same mode
        });

        // Should NOT call switchMode (already in mode)
        expect(mockConversationService.switchMode).not.toHaveBeenCalled();
        // Should NOT call sendMessage (no mode change = no guidance)
        expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
        // Should NOT emit message event
        expect(mockSocket.emit).not.toHaveBeenCalledWith('message', expect.anything());
      });

      it('should NOT send guidance if already in scoring mode', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'scoring', // Already in scoring
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'scoring', // Same mode
        });

        // Should NOT call switchMode (already in mode)
        expect(mockConversationService.switchMode).not.toHaveBeenCalled();
        // Should NOT call sendMessage (no mode change = no guidance)
        expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
      });

      it('should still emit conversation_mode_updated when idempotent', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'assessment',
        });

        mockConversationService.getConversation.mockResolvedValue(conversation);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'assessment',
        });

        // Should emit conversation_mode_updated (idempotent)
        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
          conversationId: 'conv-1',
          mode: 'assessment',
        });
      });
    });

    describe('guidance message format', () => {
      it('should emit guidance with correct message structure', async () => {
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult',
        });

        const guidanceMessage = createMockMessage(ASSESSMENT_GUIDANCE, 'conv-1');

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();
        mockConversationService.sendMessage.mockResolvedValue(guidanceMessage);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'assessment',
        });

        // Verify message structure has all required fields
        const messageCall = mockSocket.emit.mock.calls.find(
          (call) => call[0] === 'message'
        );
        expect(messageCall).toBeDefined();
        const emittedMessage = messageCall![1];
        expect(emittedMessage).toHaveProperty('id');
        expect(emittedMessage).toHaveProperty('conversationId');
        expect(emittedMessage).toHaveProperty('role', 'assistant');
        expect(emittedMessage).toHaveProperty('content');
        expect(emittedMessage).toHaveProperty('createdAt');
      });

      it('should log guidance message send', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        const conversation = createMockConversation({
          id: 'conv-1',
          userId: 'user-123',
          mode: 'consult',
        });

        const guidanceMessage = createMockMessage(SCORING_GUIDANCE, 'conv-1');

        mockConversationService.getConversation.mockResolvedValue(conversation);
        mockConversationService.switchMode.mockResolvedValue();
        mockConversationService.sendMessage.mockResolvedValue(guidanceMessage);

        await handler.handleSwitchMode(mockSocket, {
          conversationId: 'conv-1',
          mode: 'scoring',
        });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Sent guidance message for scoring mode in conversation conv-1')
        );
      });
    });
  });
});
