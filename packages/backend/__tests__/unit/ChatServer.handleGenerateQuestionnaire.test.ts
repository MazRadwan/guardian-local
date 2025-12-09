/**
 * Unit tests for ChatServer.handleGenerateQuestionnaire
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 * Story 5.4: ChatServer Refactor
 *
 * Tests the refactored generate_questionnaire handler which delegates
 * to QuestionnaireGenerationService for hybrid JSON/markdown generation.
 */

import { ChatServer } from '../../src/infrastructure/websocket/ChatServer.js';
import type { QuestionnaireSchema } from '../../src/domain/types/QuestionnaireSchema.js';
import { QUESTIONNAIRE_OUTPUT_TOOL_NAME } from '../../src/infrastructure/ai/tools/questionnaireOutputTool.js';

// Inline definition to avoid @guardian/shared ESM import issues in Jest
const GENERATION_PHASES = ['context', 'generating', 'validating', 'saving'] as const;

// Create fixture for QuestionnaireSchema
function fixtureQuestionnaireSchema(
  overrides: Partial<QuestionnaireSchema['metadata']> = {}
): QuestionnaireSchema {
  return {
    version: '1.0',
    metadata: {
      assessmentType: 'comprehensive',
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      generatedAt: new Date().toISOString(),
      questionCount: 90,
      ...overrides,
    },
    sections: [
      {
        id: 'privacy_risk',
        title: 'Privacy Risk Assessment',
        riskDimension: 'privacy_risk',
        description: 'Evaluate data privacy practices',
        questions: [
          {
            id: 'privacy_1',
            text: 'How does the solution handle PHI data?',
            category: 'Data Handling',
            riskDimension: 'privacy_risk',
            questionType: 'text',
            required: true,
          },
        ],
      },
    ],
  };
}

describe('ChatServer.handleGenerateQuestionnaire', () => {
  // Mock dependencies
  let mockSocket: any;
  let mockConversationService: any;
  let mockClaudeClient: any;
  let mockAssessmentService: any;
  let mockVendorService: any;
  let mockQuestionnaireReadyService: any;
  let mockQuestionnaireGenerationService: any;
  let mockQuestionService: any;
  let mockIo: any;
  let mockRateLimiter: any;
  let mockPromptCacheManager: any;

  let chatServer: ChatServer;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      emit: jest.fn(),
      userId: 'test-user',
      id: 'socket-123',
    };

    // Mock ConversationService
    mockConversationService = {
      getConversation: jest.fn().mockResolvedValue({
        id: 'conv-123',
        userId: 'test-user',
        mode: 'assessment',
        assessmentId: null,
      }),
      sendMessage: jest.fn().mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'assistant',
        content: { text: 'Test' },
        createdAt: new Date(),
      }),
      linkAssessment: jest.fn(),
      getHistory: jest.fn().mockResolvedValue([]),
      getMessageCount: jest.fn().mockResolvedValue(1),
      getConversationTitle: jest.fn().mockResolvedValue('Test Conversation'),
    };

    // Mock QuestionnaireGenerationService
    mockQuestionnaireGenerationService = {
      generate: jest.fn().mockResolvedValue({
        schema: fixtureQuestionnaireSchema(),
        assessmentId: 'assessment-123',
        markdown: '# Test Questionnaire\n\n1. Question one?\n2. Question two?',
      }),
    };

    // Mock ClaudeClient
    mockClaudeClient = {
      sendMessage: jest.fn(),
      streamMessage: jest.fn(),
    };

    // Mock AssessmentService
    mockAssessmentService = {
      createAssessment: jest.fn().mockResolvedValue({ assessmentId: 'assessment-123' }),
      getAssessment: jest.fn(),
    };

    // Mock VendorService
    mockVendorService = {
      findOrCreateDefault: jest.fn().mockResolvedValue({ id: 'vendor-123', name: 'Default Vendor' }),
    };

    // Mock QuestionnaireReadyService
    mockQuestionnaireReadyService = {
      handle: jest.fn(),
    };

    // Mock QuestionService
    mockQuestionService = {
      getQuestionCount: jest.fn().mockResolvedValue(90),
      getQuestions: jest.fn().mockResolvedValue([]),
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
      mockQuestionService
    );
  });

  describe('Happy Path', () => {
    it('emits assistant_stream_start before streaming', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', {
        conversationId: 'conv-123',
      });
    });

    it('calls QuestionnaireGenerationService.generate with correct params', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        {
          conversationId: 'conv-123',
          assessmentType: 'comprehensive',
          vendorName: 'OpenAI',
          solutionName: 'ChatGPT',
          contextSummary: 'AI chatbot evaluation',
        },
        'test-user'
      );

      expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        userId: 'test-user',
        assessmentType: 'comprehensive',
        vendorName: 'OpenAI',
        solutionName: 'ChatGPT',
        contextSummary: 'AI chatbot evaluation',
        selectedCategories: undefined,
      });
    });

    it('emits assistant_token for each chunk', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      // Should have multiple assistant_token calls (streamed markdown)
      const tokenCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'assistant_token'
      );
      expect(tokenCalls.length).toBeGreaterThan(0);
    });

    it('emits assistant_done with full markdown', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', {
        conversationId: 'conv-123',
        content: expect.stringContaining('# Test Questionnaire'),
      });
    });

    it('emits export_ready with assessmentId from service', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('export_ready', {
        conversationId: 'conv-123',
        assessmentId: 'assessment-123',
        questionCount: 90,
        formats: ['pdf', 'word', 'excel'],
      });
    });

    it('saves user action as message', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'user',
        content: { text: '[System: User clicked Generate Questionnaire button]' },
      });
    });

    it('saves assistant response as message', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'assistant',
        content: { text: expect.stringContaining('# Test Questionnaire') },
      });
    });
  });

  describe('Assessment Type Validation', () => {
    it('accepts valid assessment types', async () => {
      const validTypes = ['quick', 'comprehensive', 'category_focused'];

      for (const type of validTypes) {
        mockQuestionnaireGenerationService.generate.mockClear();

        await chatServer.handleGenerateQuestionnaire(
          mockSocket,
          { conversationId: 'conv-123', assessmentType: type },
          'test-user'
        );

        expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith(
          expect.objectContaining({ assessmentType: type })
        );
      }
    });

    it('defaults invalid assessment type to comprehensive', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'invalid_type' },
        'test-user'
      );

      expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith(
        expect.objectContaining({ assessmentType: 'comprehensive' })
      );
    });

    it('defaults missing assessment type to comprehensive', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith(
        expect.objectContaining({ assessmentType: 'comprehensive' })
      );
    });
  });

  describe('Error Handling', () => {
    it('emits error when conversation ownership validation fails', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'different-user', // Different user
        mode: 'assessment',
      });

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'generate_questionnaire',
        message: expect.stringContaining('Unauthorized'),
      });
    });

    it('emits error when service throws', async () => {
      mockQuestionnaireGenerationService.generate.mockRejectedValue(
        new Error('Service failure')
      );

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'generate_questionnaire',
        message: 'Service failure',
      });
    });

    it('emits error when conversation not found', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'generate_questionnaire',
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('Abort Handling', () => {
    it('respects abort flag by stopping chunk emission', async () => {
      // Access private abortedStreams Set
      (chatServer as any).abortedStreams.add('conv-123');

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      // Should emit assistant_aborted
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_aborted', {
        conversationId: 'conv-123',
      });

      // Should NOT emit assistant_done
      const doneCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'assistant_done'
      );
      expect(doneCalls.length).toBe(0);
    });

    it('clears abort flag after handling', async () => {
      (chatServer as any).abortedStreams.add('conv-123');

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      // Abort flag should be cleared
      expect((chatServer as any).abortedStreams.has('conv-123')).toBe(false);
    });
  });

  describe('Event Sequence', () => {
    it('emits events in correct order', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      const emitCalls = mockSocket.emit.mock.calls.map((call: any[]) => call[0]);

      // Find indices
      const streamStartIdx = emitCalls.indexOf('assistant_stream_start');
      const firstTokenIdx = emitCalls.indexOf('assistant_token');
      const doneIdx = emitCalls.indexOf('assistant_done');
      const exportReadyIdx = emitCalls.indexOf('export_ready');

      // Verify order: stream_start -> tokens -> done -> export_ready
      expect(streamStartIdx).toBeLessThan(firstTokenIdx);
      expect(firstTokenIdx).toBeLessThan(doneIdx);
      expect(doneIdx).toBeLessThan(exportReadyIdx);
    });
  });

  describe('No Assessment Creation in Handler', () => {
    it('does NOT create assessment directly (service handles it)', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123' },
        'test-user'
      );

      // Handler should NOT call assessmentService.createAssessment
      expect(mockAssessmentService.createAssessment).not.toHaveBeenCalled();

      // Handler should NOT call vendorService.findOrCreateDefault
      expect(mockVendorService.findOrCreateDefault).not.toHaveBeenCalled();

      // Service should be called (it handles assessment creation internally)
      expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalled();
    });
  });

  describe('Context Passing', () => {
    it('passes all context fields to service', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        {
          conversationId: 'conv-123',
          assessmentType: 'category_focused',
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
          contextSummary: 'Evaluating AI diagnostics',
          selectedCategories: ['privacy_risk', 'security_risk'],
        },
        'test-user'
      );

      expect(mockQuestionnaireGenerationService.generate).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        userId: 'test-user',
        assessmentType: 'category_focused',
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        contextSummary: 'Evaluating AI diagnostics',
        selectedCategories: ['privacy_risk', 'security_risk'],
      });
    });
  });

  describe('Phase Events (Story 13.5.5)', () => {
    it('emits generation_phase events in order (0, 1, 2, 3)', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      const phaseEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'generation_phase'
      );

      expect(phaseEvents).toHaveLength(4);
      expect(phaseEvents[0][1].phase).toBe(0);
      expect(phaseEvents[0][1].phaseId).toBe('context');
      expect(phaseEvents[1][1].phase).toBe(1);
      expect(phaseEvents[1][1].phaseId).toBe('generating');
      expect(phaseEvents[2][1].phase).toBe(2);
      expect(phaseEvents[2][1].phaseId).toBe('validating');
      expect(phaseEvents[3][1].phase).toBe(3);
      expect(phaseEvents[3][1].phaseId).toBe('saving');
    });

    it('emits export_ready after all phase events', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      const eventNames = mockSocket.emit.mock.calls.map((call: any[]) => call[0]);
      const exportReadyIndex = eventNames.lastIndexOf('export_ready');
      const lastPhaseIndex = eventNames.lastIndexOf('generation_phase');

      expect(exportReadyIndex).toBeGreaterThan(lastPhaseIndex);
    });

    it('includes conversationId in all phase events', async () => {
      const conversationId = 'conv-123';

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId, assessmentType: 'comprehensive' },
        'test-user'
      );

      const phaseEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'generation_phase'
      );
      phaseEvents.forEach((call: any[]) => {
        expect(call[1].conversationId).toBe(conversationId);
      });
    });

    it('includes timestamp in all phase events', async () => {
      const before = Date.now();

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      const after = Date.now();
      const phaseEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'generation_phase'
      );

      phaseEvents.forEach((call: any[]) => {
        expect(call[1].timestamp).toBeGreaterThanOrEqual(before);
        expect(call[1].timestamp).toBeLessThanOrEqual(after);
      });
    });

    it('phaseId matches GENERATION_PHASES constant', async () => {
      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      const phaseEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'generation_phase'
      );

      phaseEvents.forEach((call: any[], idx: number) => {
        expect(call[1].phaseId).toBe(GENERATION_PHASES[idx]);
      });
    });
  });

  describe('Phase Events Error Handling (Story 13.5.5)', () => {
    it('emits only phase 0 when Claude call fails', async () => {
      mockQuestionnaireGenerationService.generate.mockRejectedValue(
        new Error('Claude API error')
      );

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      const phaseEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'generation_phase'
      );

      // Phase 0 emitted before Claude call, then error
      expect(phaseEvents.length).toBeLessThanOrEqual(1);
      if (phaseEvents.length === 1) {
        expect(phaseEvents[0][1].phase).toBe(0);
      }
    });

    it('emits error event on generation failure', async () => {
      mockQuestionnaireGenerationService.generate.mockRejectedValue(
        new Error('Generation failed')
      );

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      // ChatServer emits 'error' event on failure (not extraction_failed)
      const errorEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'error'
      );
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
      expect(errorEvents[0][1].event).toBe('generate_questionnaire');
    });

    it('does not emit export_ready on error', async () => {
      mockQuestionnaireGenerationService.generate.mockRejectedValue(
        new Error('Generation failed')
      );

      await chatServer.handleGenerateQuestionnaire(
        mockSocket,
        { conversationId: 'conv-123', assessmentType: 'comprehensive' },
        'test-user'
      );

      const exportEvents = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'export_ready'
      );
      expect(exportEvents).toHaveLength(0);
    });
  });
});
