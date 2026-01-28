/**
 * Unit Tests for QuestionnaireHandler
 *
 * Story 28.8.1: Extract handleGenerateQuestionnaire from ChatServer.ts
 * Story 28.8.2: Extract handleGetExportStatus for session resume
 *
 * Tests cover:
 * handleGenerateQuestionnaire:
 * 1. Validate ownership before generation
 * 2. Persist user action message before generation
 * 3. Emit assistant_stream_start and generation_phase events
 * 4. Emit export_ready with assessmentId and questionCount
 * 5. Update title with validated vendor name
 * 6. Skip title upgrade for invalid vendor names (numeric-only)
 * 7. Persist assistant response after streaming
 * 8. Handle errors with sanitized messages
 *
 * handleGetExportStatus (Story 28.8.2):
 * 1. Emit export_ready when assessment exists with questions
 * 2. Emit export_status_not_found when no assessmentId
 * 3. Emit export_status_not_found when no questions
 * 4. Emit export_status_error for invalid conversationId
 * 5. Emit export_status_error when not authenticated
 * 6. Emit export_status_error when conversation not found
 * 7. Emit export_status_error when unauthorized
 * 8. Emit export_status_error on internal error
 *
 * validateConversationOwnership:
 * 1. Pass for owned conversation
 * 2. Throw for non-existent conversation
 * 3. Throw for conversation owned by different user
 *
 * isValidVendorName:
 * 1. Accept valid vendor names
 * 2. Reject numeric-only strings
 * 3. Reject single character strings
 * 4. Reject assessment option tokens
 * 5. Reject null/undefined/empty
 *
 * emitGenerationPhase:
 * 1. Emit correct payload structure
 * 2. Include timestamp in payload
 */

import {
  QuestionnaireHandler,
  type GenerateQuestionnairePayload,
  type ExportReadyPayload,
  type GetExportStatusPayload,
} from '../../../../../src/infrastructure/websocket/handlers/QuestionnaireHandler.js';
import type { IAuthenticatedSocket, ChatContext } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { QuestionnaireGenerationService } from '../../../../../src/application/services/QuestionnaireGenerationService.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { AssessmentService } from '../../../../../src/application/services/AssessmentService.js';
import type { QuestionService } from '../../../../../src/application/services/QuestionService.js';
import type { StreamingHandler } from '../../../../../src/infrastructure/websocket/StreamingHandler.js';
import type { Conversation } from '../../../../../src/domain/entities/Conversation.js';
import type { Assessment } from '../../../../../src/domain/entities/Assessment.js';
import type { GenerationResult } from '../../../../../src/application/interfaces/IQuestionnaireGenerationService.js';

/**
 * Create a mock QuestionnaireGenerationService
 */
const createMockQuestionnaireGenerationService = (): jest.Mocked<QuestionnaireGenerationService> => ({
  generate: jest.fn(),
} as unknown as jest.Mocked<QuestionnaireGenerationService>);

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
 * Create a mock StreamingHandler
 */
const createMockStreamingHandler = (): jest.Mocked<StreamingHandler> => ({
  streamToSocket: jest.fn(),
  chunkMarkdown: jest.fn(),
  sleep: jest.fn(),
} as unknown as jest.Mocked<StreamingHandler>);

/**
 * Create a mock AssessmentService
 */
const createMockAssessmentService = (): jest.Mocked<AssessmentService> => ({
  createAssessment: jest.fn(),
  getAssessment: jest.fn(),
  getVendorHistory: jest.fn(),
  getVendor: jest.fn(),
  getVendorByName: jest.fn(),
  listVendors: jest.fn(),
  listAssessments: jest.fn(),
  getUserAssessments: jest.fn(),
  updateAssessmentStatus: jest.fn(),
  deleteAssessment: jest.fn(),
  createVendor: jest.fn(),
  hasExportedAssessments: jest.fn(),
} as unknown as jest.Mocked<AssessmentService>);

/**
 * Create a mock QuestionService
 */
const createMockQuestionService = (): jest.Mocked<QuestionService> => ({
  generateQuestions: jest.fn(),
  getQuestions: jest.fn(),
  getQuestionCount: jest.fn(),
} as unknown as jest.Mocked<QuestionService>);

/**
 * Create a mock Assessment
 */
const createMockAssessment = (overrides?: Partial<Assessment>): Assessment => ({
  id: 'assess-123',
  vendorId: 'vendor-1',
  assessmentType: 'comprehensive',
  solutionName: 'Test Solution',
  solutionType: 'diagnostic',
  status: 'questions_generated',
  assessmentMetadata: {},
  createdBy: 'user-123',
  createdAt: new Date('2025-01-15T10:00:00Z'),
  updatedAt: new Date('2025-01-15T11:00:00Z'),
  ...overrides,
} as Assessment);

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
  mode: 'assessment',
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
 * Create a mock generation result
 */
const createMockGenerationResult = (overrides?: Partial<GenerationResult>): GenerationResult => ({
  schema: {
    version: '1.0',
    metadata: {
      assessmentId: 'assess-123',
      assessmentType: 'comprehensive',
      vendorName: 'Acme Health AI',
      solutionName: 'Diagnostic Assistant',
      generatedAt: '2025-01-15T10:00:00Z',
      questionCount: 42,
    },
    sections: [],
  },
  assessmentId: 'assess-123',
  markdown: '# Questionnaire\n\n## Section 1\n\n1. Question 1\n2. Question 2',
  ...overrides,
});

describe('QuestionnaireHandler', () => {
  let handler: QuestionnaireHandler;
  let handlerWithServices: QuestionnaireHandler;
  let mockQuestionnaireGenerationService: jest.Mocked<QuestionnaireGenerationService>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockStreamingHandler: jest.Mocked<StreamingHandler>;
  let mockAssessmentService: jest.Mocked<AssessmentService>;
  let mockQuestionService: jest.Mocked<QuestionService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;
  let mockChatContext: ChatContext;

  beforeEach(() => {
    mockQuestionnaireGenerationService = createMockQuestionnaireGenerationService();
    mockConversationService = createMockConversationService();
    mockStreamingHandler = createMockStreamingHandler();
    mockAssessmentService = createMockAssessmentService();
    mockQuestionService = createMockQuestionService();

    // Handler without optional services (for existing tests)
    handler = new QuestionnaireHandler(
      mockQuestionnaireGenerationService,
      mockConversationService,
      mockStreamingHandler
    );

    // Handler with all services (for get_export_status tests)
    handlerWithServices = new QuestionnaireHandler(
      mockQuestionnaireGenerationService,
      mockConversationService,
      mockStreamingHandler,
      mockAssessmentService,
      mockQuestionService
    );

    mockSocket = createMockSocket('user-123');
    mockChatContext = createMockChatContext();

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleGenerateQuestionnaire', () => {
    const defaultPayload: GenerateQuestionnairePayload = {
      conversationId: 'conv-1',
      assessmentType: 'comprehensive',
      vendorName: 'Acme Health AI',
      solutionName: 'Diagnostic Assistant',
    };

    beforeEach(() => {
      // Default setup for successful generation
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ id: 'conv-1', userId: 'user-123' })
      );
      mockConversationService.sendMessage.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: { text: 'test' },
        createdAt: new Date(),
      } as any);
      mockQuestionnaireGenerationService.generate.mockResolvedValue(createMockGenerationResult());
      mockStreamingHandler.streamToSocket.mockResolvedValue();
      mockConversationService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);
    });

    describe('ownership validation', () => {
      it('should validate ownership before generation', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockConversationService.getConversation).toHaveBeenCalledWith('conv-1');
      });

      it('should reject generation for non-existent conversation', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'generate_questionnaire',
          message: expect.stringContaining('not found'),
        });
        expect(mockQuestionnaireGenerationService.generate).not.toHaveBeenCalled();
      });

      it('should reject generation for conversation owned by other user', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({ id: 'conv-1', userId: 'other-user-456' })
        );

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'generate_questionnaire',
          message: expect.stringContaining('Unauthorized'),
        });
        expect(mockQuestionnaireGenerationService.generate).not.toHaveBeenCalled();
      });
    });

    describe('user action message persistence', () => {
      it('should persist user action message before generation', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          role: 'user',
          content: { text: '[System: User clicked Generate Questionnaire button]' },
        });

        // Verify order: sendMessage called before generate
        const sendMessageCall = mockConversationService.sendMessage.mock.invocationCallOrder[0];
        const generateCall = mockQuestionnaireGenerationService.generate.mock.invocationCallOrder[0];
        expect(sendMessageCall).toBeLessThan(generateCall);
      });
    });

    describe('event emissions', () => {
      it('should emit assistant_stream_start before generation', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', {
          conversationId: 'conv-1',
        });
      });

      it('should emit generation_phase events in correct order', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        const emitCalls = (mockSocket.emit as jest.Mock).mock.calls;
        const phaseCalls = emitCalls.filter((call: unknown[]) => call[0] === 'generation_phase');

        expect(phaseCalls).toHaveLength(4);
        expect(phaseCalls[0][1].phaseId).toBe('context');
        expect(phaseCalls[0][1].phase).toBe(0);
        expect(phaseCalls[1][1].phaseId).toBe('generating');
        expect(phaseCalls[1][1].phase).toBe(1);
        expect(phaseCalls[2][1].phaseId).toBe('validating');
        expect(phaseCalls[2][1].phase).toBe(2);
        expect(phaseCalls[3][1].phaseId).toBe('saving');
        expect(phaseCalls[3][1].phase).toBe(3);
      });

      it('should emit export_ready with assessmentId and questionCount', async () => {
        const result = createMockGenerationResult({
          assessmentId: 'assess-456',
          schema: {
            version: '1.0',
            metadata: {
              assessmentId: 'assess-456',
              assessmentType: 'comprehensive',
              vendorName: 'Test Vendor',
              solutionName: 'Test Solution',
              generatedAt: '2025-01-15T10:00:00Z',
              questionCount: 35,
            },
            sections: [],
          },
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('export_ready', {
          conversationId: 'conv-1',
          assessmentId: 'assess-456',
          questionCount: 35,
          formats: ['pdf', 'word', 'excel'],
        });
      });
    });

    describe('title update', () => {
      it('should update title with validated vendor name', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockConversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
          'conv-1',
          'Assessment: Acme Health AI'
        );
      });

      it('should emit conversation_title_updated when title is updated', async () => {
        mockConversationService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
          conversationId: 'conv-1',
          title: 'Assessment: Acme Health AI',
        });
      });

      it('should NOT emit conversation_title_updated when title was not updated', async () => {
        mockConversationService.updateTitleIfNotManuallyEdited.mockResolvedValue(false);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).not.toHaveBeenCalledWith(
          'conversation_title_updated',
          expect.anything()
        );
      });

      it('should skip title upgrade for invalid vendor names (numeric-only)', async () => {
        const result = createMockGenerationResult({
          schema: {
            version: '1.0',
            metadata: {
              assessmentId: 'assess-123',
              assessmentType: 'comprehensive',
              vendorName: '123', // Invalid - numeric only
              solutionName: null,
              generatedAt: '2025-01-15T10:00:00Z',
              questionCount: 42,
            },
            sections: [],
          },
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockConversationService.updateTitleIfNotManuallyEdited).not.toHaveBeenCalled();
      });

      it('should skip title upgrade for single character vendor names', async () => {
        const result = createMockGenerationResult({
          schema: {
            version: '1.0',
            metadata: {
              assessmentId: 'assess-123',
              assessmentType: 'comprehensive',
              vendorName: 'A', // Invalid - single char
              solutionName: null,
              generatedAt: '2025-01-15T10:00:00Z',
              questionCount: 42,
            },
            sections: [],
          },
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockConversationService.updateTitleIfNotManuallyEdited).not.toHaveBeenCalled();
      });

      it('should truncate long titles to 50 characters', async () => {
        const result = createMockGenerationResult({
          schema: {
            version: '1.0',
            metadata: {
              assessmentId: 'assess-123',
              assessmentType: 'comprehensive',
              vendorName: 'This Is A Very Long Vendor Name That Exceeds The Maximum Allowed Length',
              solutionName: null,
              generatedAt: '2025-01-15T10:00:00Z',
              questionCount: 42,
            },
            sections: [],
          },
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        const titleArg = (mockConversationService.updateTitleIfNotManuallyEdited as jest.Mock)
          .mock.calls[0][1];
        expect(titleArg.length).toBeLessThanOrEqual(50);
        expect(titleArg.endsWith('...')).toBe(true);
      });

      it('should use solution name if vendor name is invalid', async () => {
        const result = createMockGenerationResult({
          schema: {
            version: '1.0',
            metadata: {
              assessmentId: 'assess-123',
              assessmentType: 'comprehensive',
              vendorName: '1', // Invalid
              solutionName: 'Valid Solution Name',
              generatedAt: '2025-01-15T10:00:00Z',
              questionCount: 42,
            },
            sections: [],
          },
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockConversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
          'conv-1',
          'Assessment: Valid Solution Name'
        );
      });
    });

    describe('assistant response persistence', () => {
      it('should persist assistant response after streaming', async () => {
        const result = createMockGenerationResult({
          markdown: '# Test Questionnaire\n\n1. Question one',
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        // Should save assistant message with markdown content
        expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          role: 'assistant',
          content: {
            text: '# Test Questionnaire\n\n1. Question one',
            components: [
              {
                type: 'download',
                data: {
                  assessmentId: result.assessmentId,
                  questionCount: result.schema.metadata.questionCount,
                  formats: ['pdf', 'word', 'excel'],
                },
              },
            ],
          },
        });
      });

      it('should stream markdown via StreamingHandler', async () => {
        const result = createMockGenerationResult({
          markdown: '# Test Markdown',
        });
        mockQuestionnaireGenerationService.generate.mockResolvedValue(result);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockStreamingHandler.streamToSocket).toHaveBeenCalledWith(
          mockSocket,
          '# Test Markdown',
          'conv-1',
          expect.any(Function),
          expect.any(Function)
        );
      });
    });

    describe('assessment type validation', () => {
      it('should default to comprehensive for invalid assessment type', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          { ...defaultPayload, assessmentType: 'invalid_type' },
          'user-123',
          mockChatContext
        );

        expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            assessmentType: 'comprehensive',
          }),
          expect.any(Object) // Progress emitter
        );
      });

      it('should accept quick assessment type', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          { ...defaultPayload, assessmentType: 'quick' },
          'user-123',
          mockChatContext
        );

        expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            assessmentType: 'quick',
          }),
          expect.any(Object) // Progress emitter
        );
      });

      it('should accept category_focused assessment type', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          { ...defaultPayload, assessmentType: 'category_focused' },
          'user-123',
          mockChatContext
        );

        expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith(
          expect.objectContaining({
            assessmentType: 'category_focused',
          }),
          expect.any(Object) // Progress emitter
        );
      });
    });

    describe('error handling', () => {
      it('should emit error with sanitized message on failure', async () => {
        mockQuestionnaireGenerationService.generate.mockRejectedValue(
          new Error('Claude API error')
        );

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'generate_questionnaire',
          message: 'Claude API error',
        });
      });

      it('should sanitize SQL errors', async () => {
        mockQuestionnaireGenerationService.generate.mockRejectedValue(
          new Error('SELECT * FROM assessments WHERE id = $1')
        );

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'generate_questionnaire',
          message: 'Failed to generate questionnaire',
        });
      });

      it('should log error to console', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        const testError = new Error('Test error');
        mockQuestionnaireGenerationService.generate.mockRejectedValue(testError);

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          '[QuestionnaireHandler] Error in generate_questionnaire:',
          testError
        );
      });
    });

    describe('abort handling', () => {
      it('should check abort status during streaming', async () => {
        mockChatContext.abortedStreams.add('conv-1');

        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        // StreamingHandler should receive abort check function
        const isAbortedFn = (mockStreamingHandler.streamToSocket as jest.Mock).mock.calls[0][3];
        expect(isAbortedFn()).toBe(true);
      });

      it('should emit assistant_aborted when stream is aborted', async () => {
        await handler.handleGenerateQuestionnaire(
          mockSocket,
          defaultPayload,
          'user-123',
          mockChatContext
        );

        // Get the onAborted callback passed to streamToSocket
        const onAbortedFn = (mockStreamingHandler.streamToSocket as jest.Mock).mock.calls[0][4];

        // Simulate abort
        mockChatContext.abortedStreams.add('conv-1');
        onAbortedFn();

        expect(mockSocket.emit).toHaveBeenCalledWith('assistant_aborted', {
          conversationId: 'conv-1',
        });
        expect(mockChatContext.abortedStreams.has('conv-1')).toBe(false);
      });
    });
  });

  describe('validateConversationOwnership', () => {
    it('should pass for owned conversation', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ id: 'conv-1', userId: 'user-123' })
      );

      await expect(
        handler.validateConversationOwnership('conv-1', 'user-123')
      ).resolves.toBeUndefined();
    });

    it('should throw for non-existent conversation', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await expect(
        handler.validateConversationOwnership('conv-1', 'user-123')
      ).rejects.toThrow('Conversation conv-1 not found');
    });

    it('should throw for conversation owned by different user', async () => {
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ id: 'conv-1', userId: 'other-user-456' })
      );

      await expect(
        handler.validateConversationOwnership('conv-1', 'user-123')
      ).rejects.toThrow('Unauthorized');
    });

    it('should log security warning for unauthorized access', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      mockConversationService.getConversation.mockResolvedValue(
        createMockConversation({ id: 'conv-1', userId: 'other-user-456' })
      );

      await expect(
        handler.validateConversationOwnership('conv-1', 'user-123')
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY: User user-123 attempted to access conversation conv-1')
      );
    });
  });

  // NOTE: isValidVendorName tests removed - function moved to utils/sanitize.ts
  // Tests are in __tests__/unit/utils/sanitize.test.ts (Story 28.11.4 review fix)

  describe('emitGenerationPhase', () => {
    it('should emit correct payload structure', () => {
      handler.emitGenerationPhase(mockSocket, 'conv-1', 1, 'generating');

      expect(mockSocket.emit).toHaveBeenCalledWith('generation_phase', {
        conversationId: 'conv-1',
        phase: 1,
        phaseId: 'generating',
        timestamp: expect.any(Number),
      });
    });

    it('should include timestamp in payload', () => {
      const beforeTime = Date.now();
      handler.emitGenerationPhase(mockSocket, 'conv-1', 0, 'context');
      const afterTime = Date.now();

      const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls[0][1];
      expect(emittedPayload.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(emittedPayload.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should emit all phase types correctly', () => {
      handler.emitGenerationPhase(mockSocket, 'conv-1', 0, 'context');
      handler.emitGenerationPhase(mockSocket, 'conv-1', 1, 'generating');
      handler.emitGenerationPhase(mockSocket, 'conv-1', 2, 'validating');
      handler.emitGenerationPhase(mockSocket, 'conv-1', 3, 'saving');

      const emitCalls = (mockSocket.emit as jest.Mock).mock.calls;
      expect(emitCalls[0][1].phaseId).toBe('context');
      expect(emitCalls[1][1].phaseId).toBe('generating');
      expect(emitCalls[2][1].phaseId).toBe('validating');
      expect(emitCalls[3][1].phaseId).toBe('saving');
    });

    it('should log phase emission', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      handler.emitGenerationPhase(mockSocket, 'conv-1', 2, 'validating');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Emitted generation_phase: phase=2, phaseId=validating')
      );
    });
  });

  /**
   * Story 28.8.2: handleGetExportStatus tests
   */
  describe('handleGetExportStatus', () => {
    const defaultPayload: GetExportStatusPayload = {
      conversationId: 'conv-1',
    };

    describe('successful export status retrieval', () => {
      it('should emit export_ready when assessment exists with questions', async () => {
        // Setup: conversation with linked assessment
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );
        mockAssessmentService.getAssessment.mockResolvedValue(
          createMockAssessment({ id: 'assess-123' })
        );
        mockQuestionService.getQuestionCount.mockResolvedValue(42);

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_ready', {
          conversationId: 'conv-1',
          assessmentId: 'assess-123',
          questionCount: 42,
          formats: ['word', 'pdf', 'excel'],
          resumed: true,
        });
      });

      it('should log successful export status', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );
        mockAssessmentService.getAssessment.mockResolvedValue(
          createMockAssessment({ id: 'assess-123' })
        );
        mockQuestionService.getQuestionCount.mockResolvedValue(35);

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[QuestionnaireHandler] Export status ready:',
          expect.objectContaining({
            conversationId: 'conv-1',
            assessmentId: 'assess-123',
            questionCount: 35,
          })
        );
      });
    });

    describe('export_status_not_found scenarios', () => {
      it('should emit export_status_not_found when no assessmentId linked', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: null, // No assessment linked
          })
        );

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_not_found', {
          conversationId: 'conv-1',
        });
        expect(mockAssessmentService.getAssessment).not.toHaveBeenCalled();
      });

      it('should emit export_status_not_found when assessment not found', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );
        mockAssessmentService.getAssessment.mockResolvedValue(null);

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_not_found', {
          conversationId: 'conv-1',
        });
        expect(mockQuestionService.getQuestionCount).not.toHaveBeenCalled();
      });

      it('should emit export_status_not_found when question count is zero', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );
        mockAssessmentService.getAssessment.mockResolvedValue(
          createMockAssessment({ id: 'assess-123' })
        );
        mockQuestionService.getQuestionCount.mockResolvedValue(0);

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_not_found', {
          conversationId: 'conv-1',
        });
      });
    });

    describe('export_status_error validation scenarios', () => {
      it('should emit export_status_error for empty conversationId', async () => {
        await handlerWithServices.handleGetExportStatus(mockSocket, {
          conversationId: '',
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: '',
          error: 'Invalid conversation ID',
        });
        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      });

      it('should emit export_status_error for whitespace-only conversationId', async () => {
        await handlerWithServices.handleGetExportStatus(mockSocket, {
          conversationId: '   ',
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: '   ',
          error: 'Invalid conversation ID',
        });
      });

      it('should emit export_status_error for null conversationId', async () => {
        await handlerWithServices.handleGetExportStatus(mockSocket, {
          conversationId: null as unknown as string,
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: '',
          error: 'Invalid conversation ID',
        });
      });

      it('should emit export_status_error for undefined conversationId', async () => {
        await handlerWithServices.handleGetExportStatus(mockSocket, {
          conversationId: undefined as unknown as string,
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: '',
          error: 'Invalid conversation ID',
        });
      });

      it('should emit export_status_error when not authenticated', async () => {
        const unauthenticatedSocket = createMockSocket(); // No userId

        await handlerWithServices.handleGetExportStatus(
          unauthenticatedSocket,
          defaultPayload
        );

        expect(unauthenticatedSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Not authenticated',
        });
        expect(mockConversationService.getConversation).not.toHaveBeenCalled();
      });

      it('should emit export_status_error when conversation not found', async () => {
        mockConversationService.getConversation.mockResolvedValue(null);

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Conversation not found',
        });
      });

      it('should emit export_status_error when unauthorized (different user)', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'other-user-456', // Different user
          })
        );

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Unauthorized',
        });
      });

      it('should log security warning for unauthorized access', async () => {
        const consoleSpy = jest.spyOn(console, 'warn');
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'other-user-456',
          })
        );

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('SECURITY: User user-123 attempted to access export status for conversation conv-1')
        );
      });
    });

    describe('internal error handling', () => {
      it('should emit export_status_error on service exception', async () => {
        mockConversationService.getConversation.mockRejectedValue(
          new Error('Database connection failed')
        );

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Internal server error',
        });
      });

      it('should log error to console on exception', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        const testError = new Error('Database error');
        mockConversationService.getConversation.mockRejectedValue(testError);

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[QuestionnaireHandler] Error in get_export_status:',
          testError
        );
      });

      it('should emit export_status_error when services not available', async () => {
        // Use handler without optional services
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );

        await handler.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Internal server error',
        });
      });

      it('should log error when services not available', async () => {
        const consoleSpy = jest.spyOn(console, 'error');
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );

        await handler.handleGetExportStatus(mockSocket, defaultPayload);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[QuestionnaireHandler] AssessmentService or QuestionService not available for export status check'
        );
      });

      it('should emit export_status_error when assessment service throws', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );
        mockAssessmentService.getAssessment.mockRejectedValue(
          new Error('Assessment service error')
        );

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Internal server error',
        });
      });

      it('should emit export_status_error when question service throws', async () => {
        mockConversationService.getConversation.mockResolvedValue(
          createMockConversation({
            id: 'conv-1',
            userId: 'user-123',
            assessmentId: 'assess-123',
          })
        );
        mockAssessmentService.getAssessment.mockResolvedValue(
          createMockAssessment({ id: 'assess-123' })
        );
        mockQuestionService.getQuestionCount.mockRejectedValue(
          new Error('Question service error')
        );

        await handlerWithServices.handleGetExportStatus(mockSocket, defaultPayload);

        expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
          conversationId: 'conv-1',
          error: 'Internal server error',
        });
      });
    });
  });
});
