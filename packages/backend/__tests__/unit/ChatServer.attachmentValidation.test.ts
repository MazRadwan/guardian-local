/**
 * Unit tests for ChatServer attachment validation (Story 6.9.7)
 *
 * Tests server-side validation and enrichment of file attachments
 * in the send_message handler and storagePath stripping in responses.
 */

import { ChatServer } from '../../src/infrastructure/websocket/ChatServer.js';

describe('ChatServer Attachment Validation (Story 6.9.7)', () => {
  let mockSocket: any;
  let mockConversationService: any;
  let mockClaudeClient: any;
  let mockAssessmentService: any;
  let mockVendorService: any;
  let mockQuestionnaireReadyService: any;
  let mockQuestionnaireGenerationService: any;
  let mockQuestionService: any;
  let mockFileRepository: any;
  let mockIo: any;
  let mockRateLimiter: any;
  let mockPromptCacheManager: any;
  let mockNamespace: any;

  let chatServer: ChatServer;
  let emittedEvents: { event: string; data: any }[];
  let sendMessageHandler: (payload: any) => Promise<void>;
  let getHistoryHandler: (payload: any) => Promise<void>;

  beforeEach(async () => {
    jest.clearAllMocks();
    emittedEvents = [];

    // Mock socket
    mockSocket = {
      emit: jest.fn((event, data) => emittedEvents.push({ event, data })),
      on: jest.fn(),
      userId: 'user-123',
      id: 'socket-123',
      data: {},
      join: jest.fn(),
      handshake: { auth: {} },
    };

    // Mock ConversationService
    mockConversationService = {
      getConversation: jest.fn().mockResolvedValue({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
      }),
      // Epic 16.6.9: storagePath no longer stored in message attachments
      sendMessage: jest.fn().mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Test message' },
        createdAt: new Date(),
        attachments: [
          {
            fileId: 'file-123',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        ],
      }),
      // Epic 16.6.9: History messages also don't have storagePath in attachments
      getHistory: jest.fn().mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-123',
          role: 'user',
          content: { text: 'Message with attachment' },
          createdAt: new Date(),
          attachments: [
            {
              fileId: 'file-123',
              filename: 'test.pdf',
              mimeType: 'application/pdf',
              size: 1024,
            },
          ],
        },
      ]),
      getMessageCount: jest.fn().mockResolvedValue(1),
      getConversationTitle: jest.fn().mockResolvedValue('Test Conversation'),
    };

    // Mock ClaudeClient
    mockClaudeClient = {
      sendMessage: jest.fn(),
      streamMessage: jest.fn(async function* () {
        yield { content: 'Response', isComplete: false };
        yield { content: '', isComplete: true };
      }),
    };

    // Mock AssessmentService
    mockAssessmentService = {
      createAssessment: jest.fn(),
      getAssessment: jest.fn(),
    };

    // Mock VendorService
    mockVendorService = {
      findOrCreateDefault: jest.fn(),
    };

    // Mock QuestionnaireReadyService
    mockQuestionnaireReadyService = {
      handle: jest.fn(),
    };

    // Mock QuestionnaireGenerationService
    mockQuestionnaireGenerationService = {
      generate: jest.fn(),
    };

    // Mock QuestionService
    mockQuestionService = {
      getQuestionCount: jest.fn(),
      getQuestions: jest.fn(),
    };

    // Mock FileRepository
    mockFileRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUser: jest.fn(),
      // Story 31.2: findByIds is called by waitForFileRecords before findByIdAndConversation
      findByIds: jest.fn().mockResolvedValue([{
        id: 'file-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }]),
      findByIdAndConversation: jest.fn().mockResolvedValue({
        id: 'file-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }),
      findByConversationWithContext: jest.fn().mockResolvedValue([]),
      // Epic 18: Context injection needs excerpt-enabled files
      findByConversationWithExcerpt: jest.fn().mockResolvedValue([]),
      updateIntakeContext: jest.fn().mockResolvedValue(undefined),
    };

    // Mock namespace to capture event handlers
    // Story 28.4.4: ConnectionHandler.handleConnection() is async, so we need to
    // store the connection handler and call it after ChatServer is created
    mockNamespace = {
      use: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    };

    // Mock IO
    mockIo = {
      of: jest.fn().mockReturnValue(mockNamespace),
    };

    // Mock RateLimiter
    mockRateLimiter = {
      isRateLimited: jest.fn().mockReturnValue(false),
      getResetTime: jest.fn().mockReturnValue(60),
    };

    // Mock PromptCacheManager
    mockPromptCacheManager = {
      ensureCached: jest.fn().mockReturnValue({
        systemPrompt: 'Test system prompt',
        usePromptCache: false,
      }),
    };

    // Create ChatServer with mocked dependencies
    chatServer = new ChatServer(
      mockIo,
      mockConversationService,
      mockClaudeClient,
      mockRateLimiter,
      'test-jwt-secret',
      mockPromptCacheManager,
      mockAssessmentService,
      mockVendorService,
      mockQuestionnaireReadyService,
      mockQuestionnaireGenerationService,
      mockQuestionService,
      mockFileRepository
    );

    // Story 28.4.4: Trigger connection and extract handlers AFTER ChatServer is created
    // The connection handler is registered on namespace.on('connection', handler)
    const connectionHandler = mockNamespace.on.mock.calls.find(
      (call: any[]) => call[0] === 'connection'
    )?.[1];
    if (connectionHandler) {
      // Trigger the connection handler (async) and wait for completion
      await connectionHandler(mockSocket);
      // Extract send_message and get_history handlers from socket.on calls
      mockSocket.on.mock.calls.forEach(([eventName, eventHandler]: [string, any]) => {
        if (eventName === 'send_message') {
          sendMessageHandler = eventHandler;
        }
        if (eventName === 'get_history') {
          getHistoryHandler = eventHandler;
        }
      });
    }
  });

  describe('send_message with attachments', () => {
    it('should accept valid attachment from files table', async () => {
      // Setup valid file in repository
      mockFileRepository.findByIdAndConversation.mockResolvedValue({
        id: 'file-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      });

      // Send message with attachment
      await sendMessageHandler({
        conversationId: 'conv-123',
        text: 'Check this file',
        attachments: [{ fileId: 'file-123' }],
      });

      // Verify file was validated
      expect(mockFileRepository.findByIdAndConversation).toHaveBeenCalledWith('file-123', 'conv-123');

      // Verify message was saved with enriched attachment (NO storagePath per Epic 16.6.9)
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Check this file', components: undefined },
        attachments: [
          {
            fileId: 'file-123',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            // storagePath intentionally NOT stored in messages (Epic 16.6.9)
          },
        ],
      });

      // Verify message_sent event was emitted WITHOUT storagePath
      const messageSentEvent = emittedEvents.find((e) => e.event === 'message_sent');
      expect(messageSentEvent).toBeDefined();
      expect(messageSentEvent?.data.attachments).toEqual([
        {
          fileId: 'file-123',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          // storagePath intentionally omitted
        },
      ]);
    });

    it('should reject attachment with non-existent fileId', async () => {
      // Story 31.2: File exists in DB (passes waitForFileRecords) but not in this conversation
      mockFileRepository.findByIds.mockResolvedValue([{
        id: 'invalid-file-id',
        userId: 'user-123',
        conversationId: 'other-conv', // Different conversation
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }]);
      mockFileRepository.findByIdAndConversation.mockResolvedValue(null);

      // Send message with invalid fileId
      await sendMessageHandler({
        conversationId: 'conv-123',
        text: 'Check this file',
        attachments: [{ fileId: 'invalid-file-id' }],
      });

      // Verify error was emitted
      const errorEvent = emittedEvents.find((e) => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.message).toContain('Invalid attachment');

      // Verify message was NOT saved
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject attachment from wrong conversation', async () => {
      // Story 31.2: File exists in DB (passes waitForFileRecords) but not in this conversation
      mockFileRepository.findByIds.mockResolvedValue([{
        id: 'file-from-other-conv',
        userId: 'user-123',
        conversationId: 'other-conv',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }]);
      mockFileRepository.findByIdAndConversation.mockResolvedValue(null);

      // Send message with fileId from wrong conversation
      await sendMessageHandler({
        conversationId: 'conv-123',
        text: 'Check this file',
        attachments: [{ fileId: 'file-from-other-conv' }],
      });

      // Verify error was emitted
      const errorEvent = emittedEvents.find((e) => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.message).toContain('Invalid attachment');

      // Verify message was NOT saved
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject attachment from wrong user', async () => {
      // Story 31.2: Must mock findByIds for waitForFileRecords
      mockFileRepository.findByIds.mockResolvedValue([{
        id: 'file-123',
        userId: 'other-user-456',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }]);
      // Setup file belonging to different user
      mockFileRepository.findByIdAndConversation.mockResolvedValue({
        id: 'file-123',
        userId: 'other-user-456', // Different user
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      });

      // Send message with fileId from wrong user
      await sendMessageHandler({
        conversationId: 'conv-123',
        text: 'Check this file',
        attachments: [{ fileId: 'file-123' }],
      });

      // Verify error was emitted
      const errorEvent = emittedEvents.find((e) => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.message).toContain('not authorized');

      // Verify message was NOT saved
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('should strip storagePath from message_sent broadcast', async () => {
      // Story 31.2: Must mock findByIds for waitForFileRecords
      mockFileRepository.findByIds.mockResolvedValue([{
        id: 'file-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }]);
      // Setup valid file
      mockFileRepository.findByIdAndConversation.mockResolvedValue({
        id: 'file-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      });

      // Send message with attachment
      await sendMessageHandler({
        conversationId: 'conv-123',
        text: 'Check this file',
        attachments: [{ fileId: 'file-123' }],
      });

      // Capture broadcast payload
      const messageSentEvent = emittedEvents.find((e) => e.event === 'message_sent');
      expect(messageSentEvent).toBeDefined();

      // Assert storagePath NOT present in broadcast
      expect(messageSentEvent?.data.attachments[0]).not.toHaveProperty('storagePath');
      expect(messageSentEvent?.data.attachments[0]).toEqual({
        fileId: 'file-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });
    });

    it('should allow message without attachment', async () => {
      // Send message without attachments
      await sendMessageHandler({
        conversationId: 'conv-123',
        text: 'Normal message',
      });

      // Verify message was saved
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Normal message', components: undefined },
        attachments: undefined,
      });

      // Verify no error
      const errorEvent = emittedEvents.find((e) => e.event === 'error');
      expect(errorEvent).toBeUndefined();
    });
  });

  describe('get_history with attachments', () => {
    it('should strip storagePath from history messages', async () => {
      // Setup messages with attachments in history
      mockConversationService.getHistory.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-123',
          role: 'user',
          content: { text: 'Message 1' },
          createdAt: new Date(),
          attachments: [
            {
              fileId: 'file-123',
              filename: 'test.pdf',
              mimeType: 'application/pdf',
              size: 1024,
              storagePath: '/uploads/test.pdf', // Stored in DB
            },
          ],
        },
        {
          id: 'msg-2',
          conversationId: 'conv-123',
          role: 'assistant',
          content: { text: 'Message 2' },
          createdAt: new Date(),
        },
      ]);

      // Request history
      await getHistoryHandler({
        conversationId: 'conv-123',
      });

      // Find history event
      const historyEvent = emittedEvents.find((e) => e.event === 'history');
      expect(historyEvent).toBeDefined();

      // Assert storagePath NOT in any attachment
      const messageWithAttachment = historyEvent?.data.messages.find((m: any) => m.attachments);
      expect(messageWithAttachment).toBeDefined();
      expect(messageWithAttachment?.attachments[0]).not.toHaveProperty('storagePath');
      expect(messageWithAttachment?.attachments[0]).toEqual({
        fileId: 'file-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });
    });
  });
});
