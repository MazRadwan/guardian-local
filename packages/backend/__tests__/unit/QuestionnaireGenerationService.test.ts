import { QuestionnaireGenerationService } from '../../src/application/services/QuestionnaireGenerationService.js';
import { QuestionnaireSchema } from '../../src/domain/types/QuestionnaireSchema.js';
import { fixtureQuestionnaireSchema } from '../fixtures/questionnaireSchema.js';
import { QUESTIONNAIRE_OUTPUT_TOOL_NAME } from '../../src/infrastructure/ai/tools/questionnaireOutputTool.js';

/**
 * Helper to create a tool_use response (Story 5.3.1)
 */
function createToolUseResponse(schema: QuestionnaireSchema) {
  return {
    content: '',
    stop_reason: 'tool_use',
    model: 'claude-sonnet-4-5-20250929',
    toolUse: [
      {
        type: 'tool_use' as const,
        id: 'tool_1',
        name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
        input: schema,
      },
    ],
  };
}

// Mock dependencies
const mockClaudeClient = {
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
};

const mockQuestionRepository = {
  bulkCreate: jest.fn(),
  findByAssessmentId: jest.fn(),
  findById: jest.fn(),
  deleteByAssessmentId: jest.fn(),
  replaceAllForAssessment: jest.fn(),
};

const mockAssessmentService = {
  createAssessment: jest.fn(),
  getAssessment: jest.fn(),
};

const mockVendorService = {
  findOrCreateDefault: jest.fn(),
};

const mockConversationService = {
  getConversation: jest.fn(),
  linkAssessment: jest.fn(),
};

/**
 * Create a valid schema fixture
 */
function createValidSchema(): QuestionnaireSchema {
  return {
    version: '1.0',
    metadata: {
      assessmentId: 'test-assessment-id',
      assessmentType: 'comprehensive',
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      generatedAt: new Date().toISOString(),
      questionCount: 90,
    },
    sections: [
      {
        id: 'privacy_risk',
        title: 'Privacy Risk',
        riskDimension: 'privacy_risk',
        description: 'Assess privacy practices.',
        questions: [
          {
            id: 'privacy_1',
            text: 'How do you handle PHI?',
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

describe('QuestionnaireGenerationService', () => {
  let service: QuestionnaireGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new QuestionnaireGenerationService(
      mockClaudeClient as any,
      mockQuestionRepository as any,
      mockAssessmentService as any,
      mockVendorService as any,
      mockConversationService as any
    );

    // Default mock responses
    mockConversationService.getConversation.mockResolvedValue({ assessmentId: null });
    mockVendorService.findOrCreateDefault.mockResolvedValue({ id: 'vendor-1', name: 'Default Vendor' });
    mockAssessmentService.createAssessment.mockResolvedValue({ assessmentId: 'assessment-123' });
    mockQuestionRepository.replaceAllForAssessment.mockResolvedValue([]);
    mockConversationService.linkAssessment.mockResolvedValue(undefined);
  });

  describe('generate', () => {
    it('returns schema, assessmentId, and markdown from tool_use response', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      // Note: questionCount is corrected to actual count (1) from Claude's claimed count (90)
      expect(result.schema.version).toBe(schema.version);
      expect(result.schema.metadata.assessmentType).toBe(schema.metadata.assessmentType);
      expect(result.schema.metadata.vendorName).toBe(schema.metadata.vendorName);
      expect(result.schema.metadata.questionCount).toBe(1); // Corrected to actual count
      expect(result.schema.sections).toEqual(schema.sections);
      expect(result.assessmentId).toBe('assessment-123');
      expect(result.markdown).toContain('# Test Vendor Assessment Questionnaire');
    });

    it('extracts schema from toolUse response (Story 5.3.1)', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.schema.version).toBe('1.0');
    });

    it('passes tools and tool_choice to Claude client', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      // Verify tools and tool_choice were passed
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: QUESTIONNAIRE_OUTPUT_TOOL_NAME }),
          ]),
          tool_choice: { type: 'tool', name: QUESTIONNAIRE_OUTPUT_TOOL_NAME },
        })
      );
    });

    it('throws when toolUse is undefined (Story 5.3.1)', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: 'Here is your questionnaire...',
        toolUse: undefined,
      });

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('did not return tool_use');
    });

    it('throws when toolUse is empty array (Story 5.3.1)', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: 'Here is your questionnaire...',
        toolUse: [],
      });

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('did not return tool_use');
    });

    it('throws when wrong tool is called (Story 5.3.1)', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'wrong_tool',
            input: {},
          },
        ],
      });

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('unexpected tool');
    });

    it('throws on invalid schema structure', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
            input: { invalid: 'schema' },
          },
        ],
      });

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('invalid questionnaire schema');
    });

    it('reuses existing assessment if conversation has one', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));
      mockConversationService.getConversation.mockResolvedValue({
        assessmentId: 'existing-assessment',
      });

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.assessmentId).toBe('existing-assessment');
      expect(mockAssessmentService.createAssessment).not.toHaveBeenCalled();
    });

    it('creates new assessment when conversation has none', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));
      mockConversationService.getConversation.mockResolvedValue({
        assessmentId: null,
      });

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.assessmentId).toBe('assessment-123');
      expect(mockAssessmentService.createAssessment).toHaveBeenCalledWith({
        vendorName: 'Test Vendor',
        assessmentType: 'comprehensive',
        solutionName: 'Test Solution',
        createdBy: 'user-1',
      });
    });

    it('persists questions via replaceAllForAssessment for idempotent re-generation', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      // Uses replaceAllForAssessment (not bulkCreate) for idempotent re-generation
      expect(mockQuestionRepository.replaceAllForAssessment).toHaveBeenCalledWith(
        'assessment-123',
        expect.arrayContaining([
          expect.objectContaining({
            questionText: 'How do you handle PHI?',
            sectionNumber: 2, // privacy_risk maps to section 2
          }),
        ])
      );
    });

    it('links assessment to conversation', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(mockConversationService.linkAssessment).toHaveBeenCalledWith('conv-1', 'assessment-123');
    });

    it('does not re-link if conversation already has assessment', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));
      mockConversationService.getConversation.mockResolvedValue({
        assessmentId: 'existing-assessment',
      });

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(mockConversationService.linkAssessment).not.toHaveBeenCalled();
    });

    it('uses vendor name from context when provided (prompt and assessment)', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
        vendorName: 'Context Vendor',
        solutionName: 'Context Solution',
      });

      // Verify prompt uses context values
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Context Vendor'),
          }),
        ]),
        expect.any(Object)
      );

      // Verify assessment uses context values (priority: context > schema > default)
      expect(mockAssessmentService.createAssessment).toHaveBeenCalledWith({
        vendorName: 'Context Vendor', // Context takes priority over schema's 'Test Vendor'
        assessmentType: 'comprehensive',
        solutionName: 'Context Solution', // Context takes priority over schema's 'Test Solution'
        createdBy: 'user-1',
      });
    });

    it('prioritizes context.vendorName over schema.metadata.vendorName (Finding 2)', async () => {
      const schema = createValidSchema();
      schema.metadata.vendorName = 'Claude Suggested Vendor';
      schema.metadata.solutionName = 'Claude Suggested Solution';
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
        vendorName: 'User Provided Vendor',
        solutionName: 'User Provided Solution',
      });

      // Context values MUST take priority over schema metadata values
      expect(mockAssessmentService.createAssessment).toHaveBeenCalledWith({
        vendorName: 'User Provided Vendor',
        assessmentType: 'comprehensive',
        solutionName: 'User Provided Solution',
        createdBy: 'user-1',
      });
    });

    it('handles quick assessment type', async () => {
      const schema = fixtureQuestionnaireSchema({ assessmentType: 'quick' });
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'quick',
      });

      expect(result.schema.metadata.assessmentType).toBe('quick');
    });

    it('handles category_focused assessment type', async () => {
      const schema = fixtureQuestionnaireSchema({ assessmentType: 'category_focused' });
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'category_focused',
        selectedCategories: ['privacy_risk'],
      });

      expect(result.schema.metadata.assessmentType).toBe('category_focused');
    });

    it('passes context summary to prompt builder', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
        contextSummary: 'Focus on HIPAA compliance',
      });

      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('HIPAA'),
          }),
        ]),
        expect.any(Object)
      );
    });
  });

  describe('tool_use edge cases (Story 5.3.1)', () => {
    it('handles schema with nested JSON in guidance', async () => {
      const schema = createValidSchema();
      schema.sections[0].questions[0].guidance = 'Look for {"key": "value"} patterns';
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.schema.sections[0].questions[0].guidance).toContain('{');
    });

    it('handles multiple tool use blocks (picks correct tool)', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          { type: 'tool_use', id: 'tool_0', name: 'other_tool', input: {} },
          { type: 'tool_use', id: 'tool_1', name: QUESTIONNAIRE_OUTPUT_TOOL_NAME, input: schema },
        ],
      });

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.schema.version).toBe('1.0');
    });
  });

  describe('assessment creation', () => {
    it('uses default vendor name if schema lacks one', async () => {
      const schema = createValidSchema();
      schema.metadata.vendorName = null;
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(mockAssessmentService.createAssessment).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorName: 'Default Vendor', // Falls back to vendor service result
        })
      );
    });

    it('uses default solution name if schema lacks one', async () => {
      const schema = createValidSchema();
      schema.metadata.solutionName = null;
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(mockAssessmentService.createAssessment).toHaveBeenCalledWith(
        expect.objectContaining({
          solutionName: 'Assessment from Chat',
        })
      );
    });
  });

  describe('question persistence', () => {
    it('converts multiple question types correctly', async () => {
      const schema: QuestionnaireSchema = {
        version: '1.0',
        metadata: {
          assessmentId: 'test-assessment-id',
          assessmentType: 'comprehensive',
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
          generatedAt: new Date().toISOString(),
          questionCount: 4,
        },
        sections: [
          {
            id: 'privacy_risk',
            title: 'Privacy Risk',
            riskDimension: 'privacy_risk',
            description: 'Privacy risk assessment section',
            questions: [
              {
                id: 'q1',
                text: 'Text question',
                category: 'Test',
                riskDimension: 'privacy_risk',
                questionType: 'text',
                required: true,
              },
              {
                id: 'q2',
                text: 'Yes/No question',
                category: 'Test',
                riskDimension: 'privacy_risk',
                questionType: 'yes_no',
                required: true,
              },
              {
                id: 'q3',
                text: 'Scale question',
                category: 'Test',
                riskDimension: 'privacy_risk',
                questionType: 'scale',
                required: true,
              },
              {
                id: 'q4',
                text: 'Multiple choice',
                category: 'Test',
                riskDimension: 'privacy_risk',
                questionType: 'multiple_choice',
                required: true,
                options: ['Option A', 'Option B'],
              },
            ],
          },
        ],
      };

      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(mockQuestionRepository.replaceAllForAssessment).toHaveBeenCalledWith(
        'assessment-123',
        expect.arrayContaining([
          expect.objectContaining({ questionText: 'Text question', questionType: 'text' }),
          expect.objectContaining({ questionText: 'Yes/No question', questionType: 'boolean' }),
          expect.objectContaining({ questionText: 'Scale question', questionType: 'enum' }),
          expect.objectContaining({ questionText: 'Multiple choice', questionType: 'enum' }),
        ])
      );
    });

    it('assigns correct section numbers for different dimensions', async () => {
      const schema: QuestionnaireSchema = {
        version: '1.0',
        metadata: {
          assessmentId: 'test-assessment-id',
          assessmentType: 'comprehensive',
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
          generatedAt: new Date().toISOString(),
          questionCount: 2,
        },
        sections: [
          {
            id: 'clinical_risk',
            title: 'Clinical Risk',
            riskDimension: 'clinical_risk',
            description: 'Clinical risk section',
            questions: [
              {
                id: 'q1',
                text: 'Clinical question',
                category: 'Test',
                riskDimension: 'clinical_risk',
                questionType: 'text',
                required: true,
              },
            ],
          },
          {
            id: 'security_risk',
            title: 'Security Risk',
            riskDimension: 'security_risk',
            description: 'Security risk section',
            questions: [
              {
                id: 'q2',
                text: 'Security question',
                category: 'Test',
                riskDimension: 'security_risk',
                questionType: 'text',
                required: true,
              },
            ],
          },
        ],
      };

      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(mockQuestionRepository.replaceAllForAssessment).toHaveBeenCalledWith(
        'assessment-123',
        expect.arrayContaining([
          expect.objectContaining({ questionText: 'Clinical question', sectionNumber: 1 }),
          expect.objectContaining({ questionText: 'Security question', sectionNumber: 3 }),
        ])
      );
    });
  });

  describe('re-generation scenario', () => {
    it('replaces questions when regenerating for existing assessment', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));
      // Simulate existing assessment linked to conversation
      mockConversationService.getConversation.mockResolvedValue({
        assessmentId: 'existing-assessment-456',
      });

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      // Should reuse existing assessment
      expect(result.assessmentId).toBe('existing-assessment-456');

      // Should NOT create new assessment
      expect(mockAssessmentService.createAssessment).not.toHaveBeenCalled();

      // Should replace questions atomically (not append)
      expect(mockQuestionRepository.replaceAllForAssessment).toHaveBeenCalledWith(
        'existing-assessment-456',
        expect.any(Array)
      );
    });

    it('corrects schema.metadata.questionCount to actual count (Finding 3)', async () => {
      // Schema claims 90 questions but actually has only 1
      const schema = createValidSchema();
      schema.metadata.questionCount = 90; // Wrong count from Claude
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      // Schema should be corrected to actual count (1 question in fixture)
      expect(result.schema.metadata.questionCount).toBe(1);
    });
  });

  describe('markdown rendering', () => {
    it('includes vendor name in header', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.markdown).toContain('# Test Vendor Assessment Questionnaire');
    });

    it('includes assessment type', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.markdown).toContain('Comprehensive Assessment');
    });

    it('includes question count', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));

      const result = await service.generate({
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentType: 'comprehensive',
      });

      expect(result.markdown).toContain('**Questions:** 1'); // 1 actual question in fixture
    });
  });

  describe('error handling', () => {
    it('propagates Claude client errors', async () => {
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('API Error'));

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('API Error');
    });

    it('propagates repository errors', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));
      mockQuestionRepository.replaceAllForAssessment.mockRejectedValue(new Error('Database Error'));

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('Database Error');
    });

    it('propagates assessment service errors', async () => {
      const schema = createValidSchema();
      mockClaudeClient.sendMessage.mockResolvedValue(createToolUseResponse(schema));
      mockAssessmentService.createAssessment.mockRejectedValue(new Error('Assessment Error'));

      await expect(
        service.generate({
          conversationId: 'conv-1',
          userId: 'user-1',
          assessmentType: 'comprehensive',
        })
      ).rejects.toThrow('Assessment Error');
    });
  });
});
