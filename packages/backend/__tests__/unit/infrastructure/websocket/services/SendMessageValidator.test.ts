/**
 * Unit Tests for SendMessageValidator
 *
 * Story 36.1.3: Moved from MessageHandler.test.ts
 *
 * Tests cover:
 * validateSendMessage:
 * 1. Accept valid request with text
 * 2. Accept content field for backward compatibility
 * 3. Prefer text over content when both provided
 * 4. Reject unauthenticated user
 * 5. Reject rate limited user with reset time
 * 6. Reject missing conversation ID (NO fallback to socket.conversationId)
 * 7. Accept file-only message (no text)
 * 8. Reject empty message without attachments
 * 9. Validate attachment via findByIdAndConversation
 * 10. Reject attachment owned by different user
 * 11. Reject invalid payload (non-object)
 * 12. Validate conversation ownership (not found)
 * 13. Validate conversation ownership (wrong user)
 *
 * waitForFileRecords (Epic 31):
 * 9 tests for file record waiting with retry logic
 *
 * file_processing_error integration (Epic 31.2):
 * Tests for file_processing_error event handling
 */

import { SendMessageValidator } from '../../../../../src/infrastructure/websocket/services/SendMessageValidator.js';
import type {
  SendMessagePayload,
  SendMessageValidationResult,
} from '../../../../../src/infrastructure/websocket/types/SendMessage.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { IFileRepository, FileRecord } from '../../../../../src/application/interfaces/IFileRepository.js';
import type { RateLimiter } from '../../../../../src/infrastructure/websocket/RateLimiter.js';
import type { Conversation } from '../../../../../src/domain/entities/Conversation.js';
import type { MessageAttachment } from '../../../../../src/domain/entities/Message.js';

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
 * Create a mock IFileRepository
 */
const createMockFileRepository = (): jest.Mocked<IFileRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIds: jest.fn(),
  findByIdAndUser: jest.fn(),
  findByIdAndConversation: jest.fn(),
  updateIntakeContext: jest.fn(),
  findByConversationWithContext: jest.fn(),
  updateTextExcerpt: jest.fn(),
  updateExcerptAndClassification: jest.fn(),
  updateParseStatus: jest.fn(),
  tryStartParsing: jest.fn(),
  findByConversationWithExcerpt: jest.fn(),
  deleteByConversationId: jest.fn(),
} as unknown as jest.Mocked<IFileRepository>);

/**
 * Create a mock RateLimiter
 */
const createMockRateLimiter = (): jest.Mocked<RateLimiter> => ({
  isRateLimited: jest.fn(),
  getRemaining: jest.fn(),
  getResetTime: jest.fn(),
  reset: jest.fn(),
} as unknown as jest.Mocked<RateLimiter>);

/**
 * Create a mock authenticated socket
 */
const createMockSocket = (userId?: string, conversationId?: string): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-123',
  userId,
  userEmail: userId ? 'test@example.com' : undefined,
  userRole: userId ? 'analyst' : undefined,
  conversationId,
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
 * Create a mock file record
 */
const createMockFileRecord = (overrides?: Partial<FileRecord>): FileRecord => ({
  id: 'file-1',
  userId: 'user-123',
  conversationId: 'conv-1',
  filename: 'test.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  storagePath: '/uploads/test.pdf',
  createdAt: new Date('2025-01-15T10:00:00Z'),
  textExcerpt: null,
  parseStatus: 'pending',
  detectedDocType: null,
  detectedVendorName: null,
  ...overrides,
});

describe('SendMessageValidator', () => {
  let validator: SendMessageValidator;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockFileRepository = createMockFileRepository();
    mockRateLimiter = createMockRateLimiter();
    validator = new SendMessageValidator(mockConversationService, mockFileRepository, mockRateLimiter);
    mockSocket = createMockSocket('user-123');

    // Default: not rate limited
    mockRateLimiter.isRateLimited.mockReturnValue(false);

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateSendMessage', () => {
    describe('successful validation', () => {
      it('should accept valid request with text', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(result.valid).toBe(true);
        expect(result.messageText).toBe('Hello');
        expect(result.conversationId).toBe('conv-1');
        expect(result.error).toBeUndefined();
      });

      it('should accept content field for backward compatibility', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          content: 'Hello from content',
        });

        expect(result.valid).toBe(true);
        expect(result.messageText).toBe('Hello from content');
      });

      it('should prefer text over content when both provided', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'From text',
          content: 'From content',
        });

        expect(result.valid).toBe(true);
        expect(result.messageText).toBe('From text');
      });

      it('should accept message with both text and attachments', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Must mock findByIds for waitForFileRecords
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({ id: 'file-1', userId: 'user-123' })
        ]);
        mockFileRepository.findByIdAndConversation.mockResolvedValue(
          createMockFileRecord({ id: 'file-1', userId: 'user-123' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'Check this file',
          attachments: [{ fileId: 'file-1' }],
        });

        expect(result.valid).toBe(true);
        expect(result.messageText).toBe('Check this file');
        expect(result.enrichedAttachments).toHaveLength(1);
      });
    });

    describe('authentication validation', () => {
      it('should reject unauthenticated user', async () => {
        const unauthSocket = createMockSocket(undefined);

        const result = await validator.validateSendMessage(unauthSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('not authenticated');
        expect(result.error?.event).toBe('send_message');
      });

      it('should not call service methods when not authenticated', async () => {
        const unauthSocket = createMockSocket(undefined);

        await validator.validateSendMessage(unauthSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
        expect(mockRateLimiter.isRateLimited).not.toHaveBeenCalled();
      });
    });

    describe('rate limiting', () => {
      it('should reject rate limited user with reset time', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        mockRateLimiter.isRateLimited.mockReturnValue(true);
        mockRateLimiter.getResetTime.mockReturnValue(30);

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('30 seconds');
        expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
      });

      it('should call getResetTime when rate limited', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        mockRateLimiter.isRateLimited.mockReturnValue(true);
        mockRateLimiter.getResetTime.mockReturnValue(45);

        await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(mockRateLimiter.getResetTime).toHaveBeenCalledWith('user-123');
      });

      it('should check rate limit with correct userId', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(mockRateLimiter.isRateLimited).toHaveBeenCalledWith('user-123');
      });
    });

    describe('conversation ID validation', () => {
      it('should reject missing conversation ID (NO fallback)', async () => {
        // Set socket.conversationId to verify it's NOT used as fallback
        mockSocket.conversationId = 'fallback-conv';

        const result = await validator.validateSendMessage(mockSocket, {
          text: 'Hello',
        } as SendMessagePayload);

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('Conversation ID required');
      });

      it('should NOT use socket.conversationId as fallback', async () => {
        mockSocket.conversationId = 'socket-conv-id';

        const result = await validator.validateSendMessage(mockSocket, {
          text: 'Hello',
          // Intentionally omit conversationId
        } as SendMessagePayload);

        expect(result.valid).toBe(false);
        expect(mockConversationService.getConversation).not.toHaveBeenCalledWith('socket-conv-id');
      });

      it('should reject empty conversation ID string', async () => {
        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: '',
          text: 'Hello',
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('Conversation ID required');
      });
    });

    describe('message content validation', () => {
      it('should accept file-only message (no text)', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Must mock findByIds for waitForFileRecords
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({
            id: 'file-1',
            userId: 'user-123',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          })
        ]);
        mockFileRepository.findByIdAndConversation.mockResolvedValue(
          createMockFileRecord({
            id: 'file-1',
            userId: 'user-123',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }],
        });

        expect(result.valid).toBe(true);
        expect(result.messageText).toBeUndefined();
        expect(result.enrichedAttachments).toHaveLength(1);
      });

      it('should reject empty message without attachments', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: '   ', // Whitespace only
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('text or attachments required');
      });

      it('should reject message with no text and empty attachments', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [],
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('text or attachments required');
      });

      it('should reject undefined text with no attachments', async () => {
        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('text or attachments required');
      });
    });

    describe('payload validation', () => {
      it('should reject null payload', async () => {
        const result = await validator.validateSendMessage(
          mockSocket,
          null as unknown as SendMessagePayload
        );

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('Invalid message payload');
      });

      it('should reject undefined payload', async () => {
        const result = await validator.validateSendMessage(
          mockSocket,
          undefined as unknown as SendMessagePayload
        );

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('Invalid message payload');
      });

      it('should reject non-object payload', async () => {
        const result = await validator.validateSendMessage(
          mockSocket,
          'invalid string' as unknown as SendMessagePayload
        );

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('Invalid message payload');
      });
    });

    describe('conversation ownership validation', () => {
      it('should reject when conversation not found', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'nonexistent-conv',
          text: 'Hello',
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('not found');
      });

      it('should reject when conversation owned by different user', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'other-user-456' })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          text: 'Hello',
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('do not have access');
      });

      it('should call getConversation with correct conversationId', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );

        await validator.validateSendMessage(mockSocket, {
          conversationId: 'my-conv-123',
          text: 'Hello',
        });

        expect(mockConversationService.getConversation).toHaveBeenCalledWith('my-conv-123');
      });
    });

    describe('attachment validation', () => {
      it('should validate attachment via findByIdAndConversation', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: File exists in DB (passes waitForFileRecords) but not in this conversation
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({ id: 'wrong-file', userId: 'user-123', conversationId: 'other-conv' })
        ]);
        mockFileRepository.findByIdAndConversation.mockResolvedValue(null); // Not in this conversation

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'wrong-file' }],
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('not found or not authorized');
        expect(mockFileRepository.findByIdAndConversation).toHaveBeenCalledWith('wrong-file', 'conv-1');
      });

      it('should reject attachment owned by different user', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Must mock findByIds for waitForFileRecords
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({
            id: 'file-1',
            userId: 'other-user',
            filename: 'test.pdf',
          })
        ]);
        mockFileRepository.findByIdAndConversation.mockResolvedValue(
          createMockFileRecord({
            id: 'file-1',
            userId: 'other-user', // Different user
            filename: 'test.pdf',
          })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }],
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('not authorized');
      });

      it('should enrich attachments with server-side metadata', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Must mock findByIds for waitForFileRecords
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({
            id: 'file-1',
            userId: 'user-123',
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          })
        ]);
        mockFileRepository.findByIdAndConversation.mockResolvedValue(
          createMockFileRecord({
            id: 'file-1',
            userId: 'user-123',
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }],
        });

        expect(result.valid).toBe(true);
        expect(result.enrichedAttachments).toEqual([
          {
            fileId: 'file-1',
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          },
        ]);
      });

      it('should validate multiple attachments', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Must mock findByIds for waitForFileRecords
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({ id: 'file-1', filename: 'doc1.pdf', userId: 'user-123' }),
          createMockFileRecord({ id: 'file-2', filename: 'doc2.pdf', userId: 'user-123' }),
        ]);
        mockFileRepository.findByIdAndConversation
          .mockResolvedValueOnce(
            createMockFileRecord({ id: 'file-1', filename: 'doc1.pdf', userId: 'user-123' })
          )
          .mockResolvedValueOnce(
            createMockFileRecord({ id: 'file-2', filename: 'doc2.pdf', userId: 'user-123' })
          );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }, { fileId: 'file-2' }],
        });

        expect(result.valid).toBe(true);
        expect(result.enrichedAttachments).toHaveLength(2);
      });

      it('should fail on first invalid attachment in multiple', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Files exist in DB (pass waitForFileRecords) but one is not in this conversation
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({ id: 'bad-file', filename: 'doc1.pdf', userId: 'user-123', conversationId: 'other-conv' }),
          createMockFileRecord({ id: 'file-2', filename: 'doc2.pdf', userId: 'user-123' }),
        ]);
        mockFileRepository.findByIdAndConversation
          .mockResolvedValueOnce(null) // First file not found in this conversation
          .mockResolvedValueOnce(
            createMockFileRecord({ id: 'file-2', filename: 'doc2.pdf', userId: 'user-123' })
          );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'bad-file' }, { fileId: 'file-2' }],
        });

        expect(result.valid).toBe(false);
        expect(result.error?.message).toContain('bad-file');
        // Should only have called for the first file
        expect(mockFileRepository.findByIdAndConversation).toHaveBeenCalledTimes(1);
      });

      it('should not include storagePath in enriched attachments', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        // Story 31.2: Must mock findByIds for waitForFileRecords
        mockFileRepository.findByIds.mockResolvedValue([
          createMockFileRecord({
            id: 'file-1',
            userId: 'user-123',
            storagePath: '/uploads/secret/file.pdf',
          })
        ]);
        mockFileRepository.findByIdAndConversation.mockResolvedValue(
          createMockFileRecord({
            id: 'file-1',
            userId: 'user-123',
            storagePath: '/uploads/secret/file.pdf', // Should not be in output
          })
        );

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }],
        });

        expect(result.valid).toBe(true);
        expect(result.enrichedAttachments![0]).not.toHaveProperty('storagePath');
      });
    });

    describe('validation order', () => {
      it('should check payload before authentication', async () => {
        const unauthSocket = createMockSocket(undefined);

        const result = await validator.validateSendMessage(
          unauthSocket,
          null as unknown as SendMessagePayload
        );

        // Payload validation should happen first
        expect(result.error?.message).toContain('Invalid message payload');
      });

      it('should check authentication before conversation ID', async () => {
        const unauthSocket = createMockSocket(undefined);

        const result = await validator.validateSendMessage(unauthSocket, {
          text: 'Hello',
        } as SendMessagePayload);

        expect(result.error?.message).toContain('not authenticated');
      });

      it('should check conversation ID before content', async () => {
        const result = await validator.validateSendMessage(mockSocket, {
          // No conversationId
        } as SendMessagePayload);

        expect(result.error?.message).toContain('Conversation ID required');
      });

      it('should check content before ownership', async () => {
        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          // No text or attachments
        });

        expect(result.error?.message).toContain('text or attachments required');
        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      });

      it('should check ownership before rate limit', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'nonexistent',
          text: 'Hello',
        });

        expect(result.error?.message).toContain('not found');
        expect(mockRateLimiter.isRateLimited).not.toHaveBeenCalled();
      });

      it('should check rate limit before attachments', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ userId: 'user-123' })
        );
        mockRateLimiter.isRateLimited.mockReturnValue(true);
        mockRateLimiter.getResetTime.mockReturnValue(30);

        const result = await validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }],
        });

        expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
        // Story 31.2: Both findByIds (waitForFileRecords) and findByIdAndConversation should not be called
        expect(mockFileRepository.findByIds).not.toHaveBeenCalled();
        expect(mockFileRepository.findByIdAndConversation).not.toHaveBeenCalled();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle conversation service error gracefully', async () => {
      mockConversationService.getConversation.mockRejectedValue(new Error('Database error'));

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        text: 'Hello',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.message).toBe('Database error');
    });

    it('should handle file repository error gracefully', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ userId: 'user-123' })
      );
      // Story 31.2: Files pass waitForFileRecords but findByIdAndConversation throws
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-1', userId: 'user-123' })
      ]);
      mockFileRepository.findByIdAndConversation.mockRejectedValue(new Error('File lookup failed'));

      // The error propagates through the validation chain
      await expect(
        validator.validateSendMessage(mockSocket, {
          conversationId: 'conv-1',
          attachments: [{ fileId: 'file-1' }],
        })
      ).rejects.toThrow('File lookup failed');
    });

    it('should handle non-Error rejection from conversation service', async () => {
      mockConversationService.getConversation.mockRejectedValue('string error');

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        text: 'Hello',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.message).toBe('Unauthorized access');
    });

    it('should handle text that is only spaces', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ userId: 'user-123' })
      );

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        text: '     ',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('text or attachments required');
    });

    it('should handle text that is only newlines', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ userId: 'user-123' })
      );

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        text: '\n\n\n',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('text or attachments required');
    });

    it('should accept text that has content after trimming whitespace', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ userId: 'user-123' })
      );

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        text: '   Hello   ',
      });

      expect(result.valid).toBe(true);
      expect(result.messageText).toBe('   Hello   '); // Preserves original
    });

    it('should handle very long text', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ userId: 'user-123' })
      );

      const longText = 'a'.repeat(10000);
      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        text: longText,
      });

      expect(result.valid).toBe(true);
      expect(result.messageText).toBe(longText);
    });
  });

  /**
   * Story 31.2.1: waitForFileRecords tests
   *
   * Tests file record waiting with retry logic for race condition handling.
   * Handles case where user sends message before file_attached completes.
   */
  describe('waitForFileRecords (Epic 31)', () => {
    it('should return immediately when all files exist', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-1' }),
        createMockFileRecord({ id: 'file-2' }),
      ]);

      const result = await validator.waitForFileRecords(['file-1', 'file-2']);

      expect(result.found).toEqual(['file-1', 'file-2']);
      expect(result.missing).toEqual([]);
      expect(mockFileRepository.findByIds).toHaveBeenCalledTimes(1);
    });

    it('should return empty arrays for empty fileIds input', async () => {
      const result = await validator.waitForFileRecords([]);

      expect(result.found).toEqual([]);
      expect(result.missing).toEqual([]);
      expect(mockFileRepository.findByIds).not.toHaveBeenCalled();
    });

    it('should retry until files are found', async () => {
      // First call: no files found
      // Second call: file-1 found
      // Third call: file-2 found
      mockFileRepository.findByIds
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createMockFileRecord({ id: 'file-1' })])
        .mockResolvedValueOnce([
          createMockFileRecord({ id: 'file-1' }),
          createMockFileRecord({ id: 'file-2' }),
        ]);

      const result = await validator.waitForFileRecords(['file-1', 'file-2'], 2000, 10);

      expect(result.found).toContain('file-1');
      expect(result.found).toContain('file-2');
      expect(result.missing).toEqual([]);
      expect(mockFileRepository.findByIds.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should return missing files after timeout', async () => {
      // Always return empty - files never found
      mockFileRepository.findByIds.mockResolvedValue([]);

      const startTime = Date.now();
      const result = await validator.waitForFileRecords(['file-1', 'file-2'], 200, 50);
      const elapsed = Date.now() - startTime;

      expect(result.found).toEqual([]);
      expect(result.missing).toEqual(['file-1', 'file-2']);
      // Should have waited approximately the timeout duration
      expect(elapsed).toBeGreaterThanOrEqual(150);
      expect(elapsed).toBeLessThan(500);
    });

    it('should handle partial file existence', async () => {
      // file-1 exists, file-2 never exists
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-1' }),
      ]);

      const result = await validator.waitForFileRecords(['file-1', 'file-2'], 200, 50);

      expect(result.found).toEqual(['file-1']);
      expect(result.missing).toEqual(['file-2']);
    });

    it('should use default timeout and interval when not provided', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-1' }),
      ]);

      const result = await validator.waitForFileRecords(['file-1']);

      expect(result.found).toEqual(['file-1']);
      expect(result.missing).toEqual([]);
    });

    it('should log progress during retry', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockFileRepository.findByIds
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createMockFileRecord({ id: 'file-1' })]);

      await validator.waitForFileRecords(['file-1'], 2000, 10);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SendMessageValidator] Waiting for file records')
      );
    });

    it('should log warning when files missing after timeout', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn');
      mockFileRepository.findByIds.mockResolvedValue([]);

      await validator.waitForFileRecords(['file-missing'], 50, 10);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Files still missing after')
      );
    });

    it('should handle single file that becomes available', async () => {
      mockFileRepository.findByIds
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createMockFileRecord({ id: 'single-file' })]);

      const result = await validator.waitForFileRecords(['single-file'], 2000, 10);

      expect(result.found).toEqual(['single-file']);
      expect(result.missing).toEqual([]);
    });

    it('should preserve found files across retries', async () => {
      // First: file-1 found
      // Second: file-1 still there, file-2 now found
      mockFileRepository.findByIds
        .mockResolvedValueOnce([createMockFileRecord({ id: 'file-1' })])
        .mockResolvedValueOnce([
          createMockFileRecord({ id: 'file-1' }),
          createMockFileRecord({ id: 'file-2' }),
        ]);

      const result = await validator.waitForFileRecords(['file-1', 'file-2'], 2000, 10);

      expect(result.found).toEqual(['file-1', 'file-2']);
      expect(result.missing).toEqual([]);
    });
  });

  /**
   * Story 31.2: file_processing_error integration tests
   *
   * Tests that validateSendMessage correctly returns file_processing_error
   * when file records are missing after the retry period.
   */
  describe('file_processing_error integration (Epic 31.2)', () => {
    beforeEach(() => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ userId: 'user-123' })
      );
    });

    it('should return emitFileProcessingError when files not found after retry', async () => {
      // Setup: mock findByIds to always return empty (files never exist)
      mockFileRepository.findByIds.mockResolvedValue([]);

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [{ fileId: 'non-existent-file' }],
      });

      expect(result.valid).toBe(false);
      expect(result.emitFileProcessingError).toBe(true);
      expect(result.missingFileIds).toEqual(['non-existent-file']);
      expect(result.conversationId).toBe('conv-1');
      expect(result.error?.event).toBe('file_processing_error');
      expect(result.error?.message).toContain('still processing');
    });

    it('should return multiple missing file IDs', async () => {
      mockFileRepository.findByIds.mockResolvedValue([]);

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [
          { fileId: 'missing-file-1' },
          { fileId: 'missing-file-2' },
          { fileId: 'missing-file-3' },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.emitFileProcessingError).toBe(true);
      expect(result.missingFileIds).toHaveLength(3);
      expect(result.missingFileIds).toContain('missing-file-1');
      expect(result.missingFileIds).toContain('missing-file-2');
      expect(result.missingFileIds).toContain('missing-file-3');
    });

    it('should proceed with message when files found after retry', async () => {
      // First call: no files found
      // Second call: file found
      mockFileRepository.findByIds
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createMockFileRecord({ id: 'file-123', conversationId: 'conv-1', userId: 'user-123' })]);

      mockFileRepository.findByIdAndConversation.mockResolvedValue(
        createMockFileRecord({ id: 'file-123', conversationId: 'conv-1', userId: 'user-123' })
      );

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [{ fileId: 'file-123' }],
      });

      expect(result.valid).toBe(true);
      expect(result.emitFileProcessingError).toBeUndefined();
      expect(result.missingFileIds).toBeUndefined();
      expect(result.enrichedAttachments).toHaveLength(1);
    });

    it('should return regular error when file exists but not in conversation', async () => {
      // File exists in DB (findByIds returns it)
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-wrong-conv', conversationId: 'other-conv', userId: 'user-123' }),
      ]);

      // But findByIdAndConversation returns null (file not in this conversation)
      mockFileRepository.findByIdAndConversation.mockResolvedValue(null);

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [{ fileId: 'file-wrong-conv' }],
      });

      expect(result.valid).toBe(false);
      expect(result.emitFileProcessingError).toBeFalsy();
      expect(result.error?.event).toBe('send_message');
      expect(result.error?.message).toContain('not found or not authorized');
    });

    it('should return regular error when file exists but owned by different user', async () => {
      // File exists in DB
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-other-user', conversationId: 'conv-1', userId: 'other-user' }),
      ]);

      // findByIdAndConversation returns it (file is in conversation)
      mockFileRepository.findByIdAndConversation.mockResolvedValue(
        createMockFileRecord({ id: 'file-other-user', conversationId: 'conv-1', userId: 'other-user' })
      );

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [{ fileId: 'file-other-user' }],
      });

      expect(result.valid).toBe(false);
      expect(result.emitFileProcessingError).toBeFalsy();
      expect(result.error?.event).toBe('send_message');
      expect(result.error?.message).toContain('not authorized');
    });

    it('should return emitFileProcessingError when some files missing', async () => {
      // Only file-1 exists, file-2 does not
      mockFileRepository.findByIds.mockResolvedValue([
        createMockFileRecord({ id: 'file-1', conversationId: 'conv-1', userId: 'user-123' }),
      ]);

      const result = await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [
          { fileId: 'file-1' },
          { fileId: 'missing-file' },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.emitFileProcessingError).toBe(true);
      expect(result.missingFileIds).toEqual(['missing-file']);
    });

    it('should not call findByIdAndConversation when files are missing', async () => {
      mockFileRepository.findByIds.mockResolvedValue([]);

      await validator.validateSendMessage(mockSocket, {
        conversationId: 'conv-1',
        attachments: [{ fileId: 'non-existent' }],
      });

      // findByIdAndConversation should not be called because waitForFileRecords returned missing
      expect(mockFileRepository.findByIdAndConversation).not.toHaveBeenCalled();
    });
  });
});
