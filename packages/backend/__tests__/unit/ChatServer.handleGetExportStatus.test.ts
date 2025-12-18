/**
 * Unit tests for ChatServer.handleGetExportStatus (Story 13.9.1)
 *
 * Tests the export status query handler which returns existing export data
 * if a questionnaire was already generated for a conversation.
 * Used to restore download buttons on session resume.
 */

import { ChatServer } from '../../src/infrastructure/websocket/ChatServer.js';

describe('ChatServer.handleGetExportStatus (Story 13.9.1)', () => {
  // Mock dependencies
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

  let chatServer: ChatServer;
  let emittedEvents: { event: string; data: any }[];

  beforeEach(() => {
    jest.clearAllMocks();
    emittedEvents = [];

    // Mock socket
    mockSocket = {
      emit: jest.fn((event, data) => emittedEvents.push({ event, data })),
      userId: 'test-user-123',
      id: 'socket-123',
    };

    // Mock ConversationService
    mockConversationService = {
      getConversation: jest.fn(),
      sendMessage: jest.fn(),
      linkAssessment: jest.fn(),
      getHistory: jest.fn().mockResolvedValue([]),
      getMessageCount: jest.fn().mockResolvedValue(1),
      getConversationTitle: jest.fn().mockResolvedValue('Test Conversation'),
    };

    // Mock QuestionnaireGenerationService
    mockQuestionnaireGenerationService = {
      generate: jest.fn(),
    };

    // Mock ClaudeClient
    mockClaudeClient = {
      sendMessage: jest.fn(),
      streamMessage: jest.fn(),
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
      findByIdAndConversation: jest.fn(),
      findByConversationWithContext: jest.fn().mockResolvedValue([]),
      updateIntakeContext: jest.fn().mockResolvedValue(undefined),
    };

    // Mock IO
    mockIo = {
      of: jest.fn().mockReturnValue({
        use: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
      }),
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
  });

  describe('Happy Path', () => {
    it('emits export_ready when assessment with questions exists', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: 'assess-456',
      });
      mockAssessmentService.getAssessment.mockResolvedValue({
        id: 'assess-456',
        vendorId: 'vendor-789',
        status: 'questions_generated',
      });
      mockQuestionService.getQuestionCount.mockResolvedValue(40);

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_ready',
        data: expect.objectContaining({
          conversationId: 'conv-123',
          assessmentId: 'assess-456',
          questionCount: 40,
          formats: ['word', 'pdf', 'excel'],
        }),
      });
    });

    it('logs successful export status found', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: 'assess-456',
      });
      mockAssessmentService.getAssessment.mockResolvedValue({ id: 'assess-456' });
      mockQuestionService.getQuestionCount.mockResolvedValue(42);

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('export_status found: assessmentId=assess-456, questions=42')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Not Found Cases', () => {
    it('emits export_status_not_found when conversation has no assessmentId', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: null, // No linked assessment
      });

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_not_found',
        data: { conversationId: 'conv-123' },
      });
    });

    it('emits export_status_not_found when assessment does not exist', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: 'assess-456',
      });
      mockAssessmentService.getAssessment.mockResolvedValue(null);

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_not_found',
        data: { conversationId: 'conv-123' },
      });
    });

    it('emits export_status_not_found when assessment has no questions', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: 'assess-456',
      });
      mockAssessmentService.getAssessment.mockResolvedValue({ id: 'assess-456' });
      mockQuestionService.getQuestionCount.mockResolvedValue(0);

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_not_found',
        data: { conversationId: 'conv-123' },
      });
    });

    it('logs not found with conversationId', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: null,
      });

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('export_status not found: conversationId=conv-123')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Input Validation', () => {
    it('emits export_status_error for empty conversationId', async () => {
      await chatServer.handleGetExportStatus(mockSocket, { conversationId: '' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: '', error: 'Invalid conversation ID' },
      });
      // Should not hit services
      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
    });

    it('emits export_status_error for undefined conversationId', async () => {
      await chatServer.handleGetExportStatus(mockSocket, { conversationId: undefined as any });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: expect.objectContaining({ error: 'Invalid conversation ID' }),
      });
      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
    });

    it('emits export_status_error for whitespace-only conversationId', async () => {
      await chatServer.handleGetExportStatus(mockSocket, { conversationId: '   ' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: expect.objectContaining({ error: 'Invalid conversation ID' }),
      });
      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
    });

    it('logs invalid input', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: '' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('get_export_status invalid input')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Authorization', () => {
    it('emits export_status_error when userId is not set on socket', async () => {
      const unauthenticatedSocket = {
        ...mockSocket,
        userId: undefined,
      };

      await chatServer.handleGetExportStatus(unauthenticatedSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: 'conv-123', error: 'Not authenticated' },
      });
      // Should not hit conversation service
      expect(mockConversationService.getConversation).not.toHaveBeenCalled();
    });

    it('emits export_status_error when conversation not found', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: 'conv-123', error: 'Conversation not found' },
      });
    });

    it('emits export_status_error when user does not own conversation', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'other-user', // Different user
        assessmentId: 'assess-456',
      });

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: 'conv-123', error: 'Unauthorized' },
      });
    });

    it('logs auth errors with reason', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'other-user',
      });

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('export_status auth error')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('reason=Unauthorized')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('emits export_status_error on service exception', async () => {
      mockConversationService.getConversation.mockRejectedValue(new Error('DB error'));

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: 'conv-123', error: 'Internal server error' },
      });
    });

    it('logs exception with error object', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const dbError = new Error('DB connection failed');
      mockConversationService.getConversation.mockRejectedValue(dbError);

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('get_export_status error'),
        dbError
      );
      consoleSpy.mockRestore();
    });

    it('emits export_status_error on assessment service exception', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: 'assess-456',
      });
      mockAssessmentService.getAssessment.mockRejectedValue(new Error('Assessment error'));

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: 'conv-123', error: 'Internal server error' },
      });
    });

    it('emits export_status_error on question service exception', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: 'assess-456',
      });
      mockAssessmentService.getAssessment.mockResolvedValue({ id: 'assess-456' });
      mockQuestionService.getQuestionCount.mockRejectedValue(new Error('Question error'));

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(emittedEvents).toContainEqual({
        event: 'export_status_error',
        data: { conversationId: 'conv-123', error: 'Internal server error' },
      });
    });
  });

  describe('Logging', () => {
    it('logs request received with conversationId and userId', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user-123',
        assessmentId: null,
      });

      await chatServer.handleGetExportStatus(mockSocket, { conversationId: 'conv-123' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('get_export_status request: conversationId=conv-123, userId=test-user-123')
      );
      consoleSpy.mockRestore();
    });
  });
});
