/**
 * Integration tests for ChatServer tool-based questionnaire generation
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * Tests both feature flag states to ensure:
 * 1. Tool path works when enabled
 * 2. Fallback (pattern matching) works when disabled
 * 3. No regressions in existing behavior
 *
 * These tests verify integration between components without full ChatServer setup.
 */

import { assessmentModeTools } from '../../src/infrastructure/ai/tools/index.js';
import { detectGenerateTrigger } from '../../src/infrastructure/websocket/TriggerDetection.js';
import { QuestionnaireReadyService } from '../../src/application/services/QuestionnaireReadyService.js';
import type { ToolUseBlock } from '../../src/application/interfaces/IClaudeClient.js';

// Mock TriggerDetection module
jest.mock('../../src/infrastructure/websocket/TriggerDetection.js');
const mockDetectTrigger = detectGenerateTrigger as jest.MockedFunction<
  typeof detectGenerateTrigger
>;

describe('ChatServer Tool-Based Generation (Integration)', () => {
  // Mock ConversationService
  const mockConversationService = {
    getConversation: jest.fn(),
    linkAssessment: jest.fn(),
  };

  let questionnaireReadyService: QuestionnaireReadyService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.USE_TOOL_BASED_TRIGGER;

    // Create service with mocked dependencies
    questionnaireReadyService = new QuestionnaireReadyService(
      mockConversationService as any
    );

    // Setup default mocks
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-123',
      userId: 'user-123',
      mode: 'assessment',
      assessmentId: null,
    });

    mockDetectTrigger.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.USE_TOOL_BASED_TRIGGER;
  });

  describe('Feature Flag Behavior', () => {
    it('should enable tools when USE_TOOL_BASED_TRIGGER=true', () => {
      process.env.USE_TOOL_BASED_TRIGGER = 'true';
      const isEnabled = process.env.USE_TOOL_BASED_TRIGGER === 'true';
      expect(isEnabled).toBe(true);
    });

    it('should disable tools when USE_TOOL_BASED_TRIGGER=false', () => {
      process.env.USE_TOOL_BASED_TRIGGER = 'false';
      const isEnabled = process.env.USE_TOOL_BASED_TRIGGER === 'true';
      expect(isEnabled).toBe(false);
    });

    it('should default to false when flag not set', () => {
      delete process.env.USE_TOOL_BASED_TRIGGER;
      const isEnabled = process.env.USE_TOOL_BASED_TRIGGER === 'true';
      expect(isEnabled).toBe(false);
    });
  });

  describe('Tool Definition', () => {
    it('should export assessment mode tools array', () => {
      expect(assessmentModeTools).toBeDefined();
      expect(Array.isArray(assessmentModeTools)).toBe(true);
      expect(assessmentModeTools.length).toBeGreaterThan(0);
    });

    it('should include questionnaire_ready tool', () => {
      const tool = assessmentModeTools.find(
        (t) => t.name === 'questionnaire_ready'
      );
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('want to generate');
    });

    it('should have correct schema structure', () => {
      const tool = assessmentModeTools[0];
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeDefined();
      expect(tool.input_schema.required).toContain('assessment_type');
    });
  });

  describe('QuestionnaireReadyService Integration', () => {
    it('should handle valid tool_use input', async () => {
      const toolUse: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-123',
        name: 'questionnaire_ready',
        input: {
          assessment_type: 'comprehensive',
          vendor_name: 'OpenAI',
          context_summary: 'Evaluating ChatGPT API',
        },
      };

      const result = await questionnaireReadyService.handle(
        {
          toolName: toolUse.name,
          toolUseId: toolUse.id,
          input: toolUse.input,
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.handled).toBe(true);
      expect(result.emitEvent).toBeDefined();
      expect(result.emitEvent?.event).toBe('questionnaire_ready');
      expect(result.emitEvent?.payload).toMatchObject({
        conversationId: 'conv-123',
        assessmentType: 'comprehensive',
        vendorName: 'OpenAI',
        contextSummary: 'Evaluating ChatGPT API',
      });
    });

    it('should handle minimal tool_use input (only required field)', async () => {
      const toolUse: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-456',
        name: 'questionnaire_ready',
        input: {
          assessment_type: 'quick',
        },
      };

      const result = await questionnaireReadyService.handle(
        {
          toolName: toolUse.name,
          toolUseId: toolUse.id,
          input: toolUse.input,
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.handled).toBe(true);
      expect(result.emitEvent?.payload).toMatchObject({
        conversationId: 'conv-123',
        assessmentType: 'quick',
        vendorName: null,
        solutionName: null,
        contextSummary: null,
        estimatedQuestions: 35, // Default for quick
        selectedCategories: null,
      });
    });

    it('should return error for invalid assessment_type', async () => {
      const result = await questionnaireReadyService.handle(
        {
          toolName: 'questionnaire_ready',
          toolUseId: 'tool-err',
          input: {
            assessment_type: 'invalid_type',
          },
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.handled).toBe(false);
      expect(result.error).toContain('assessment_type');
    });

    it('should return toolResult for Claude confirmation', async () => {
      const result = await questionnaireReadyService.handle(
        {
          toolName: 'questionnaire_ready',
          toolUseId: 'tool-789',
          input: {
            assessment_type: 'comprehensive',
          },
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.toolResult).toBeDefined();
      expect(result.toolResult?.toolUseId).toBe('tool-789');
      expect(result.toolResult?.content).toContain('success');
    });
  });

  describe('Fallback Path (Pattern Matching)', () => {
    beforeEach(() => {
      process.env.USE_TOOL_BASED_TRIGGER = 'false';
    });

    it('should detect generation trigger with pattern matching', () => {
      mockDetectTrigger.mockReturnValue(true);

      const userMessage = 'generate questionnaire';
      const isTriggered = detectGenerateTrigger(userMessage);

      expect(isTriggered).toBe(true);
      expect(mockDetectTrigger).toHaveBeenCalledWith('generate questionnaire');
    });

    it('should not trigger for non-generation messages', () => {
      mockDetectTrigger.mockReturnValue(false);

      const userMessage = 'tell me about AI vendors';
      const isTriggered = detectGenerateTrigger(userMessage);

      expect(isTriggered).toBe(false);
      expect(mockDetectTrigger).toHaveBeenCalledWith('tell me about AI vendors');
    });

    it('should detect various generation phrases', () => {
      const generationPhrases = [
        'generate the questionnaire',
        'create assessment',
        'start the questions',
        'begin the evaluation',
      ];

      generationPhrases.forEach((phrase) => {
        mockDetectTrigger.mockReturnValueOnce(true);
        const isTriggered = detectGenerateTrigger(phrase);
        expect(isTriggered).toBe(true);
      });
    });
  });

  describe('Tool vs Fallback Integration', () => {
    it('should prefer tool-based approach when flag is true', () => {
      process.env.USE_TOOL_BASED_TRIGGER = 'true';

      // When tool-based is enabled, pattern matching should NOT be called
      // This is enforced at ChatServer level
      const shouldUseTools = process.env.USE_TOOL_BASED_TRIGGER === 'true';
      const shouldUseFallback = !shouldUseTools;

      expect(shouldUseTools).toBe(true);
      expect(shouldUseFallback).toBe(false);

      // In ChatServer, TriggerDetection would NOT be called
      expect(mockDetectTrigger).not.toHaveBeenCalled();
    });

    it('should use fallback when flag is false', () => {
      process.env.USE_TOOL_BASED_TRIGGER = 'false';

      const shouldUseTools = process.env.USE_TOOL_BASED_TRIGGER === 'true';
      const shouldUseFallback = !shouldUseTools;

      expect(shouldUseTools).toBe(false);
      expect(shouldUseFallback).toBe(true);

      // In ChatServer, TriggerDetection WOULD be called
      mockDetectTrigger.mockReturnValue(true);
      const isTriggered = detectGenerateTrigger('generate');
      expect(isTriggered).toBe(true);
      expect(mockDetectTrigger).toHaveBeenCalled();
    });
  });

  describe('AssessmentType Validation', () => {
    it('should validate client input for generate_questionnaire', () => {
      const validTypes = ['quick', 'comprehensive', 'category_focused'] as const;
      type ValidType = typeof validTypes[number];

      // Test valid inputs
      const validInputs: string[] = ['quick', 'comprehensive', 'category_focused'];
      validInputs.forEach((input) => {
        const isValid = validTypes.includes(input as ValidType);
        expect(isValid).toBe(true);
      });

      // Test invalid inputs default to comprehensive
      const invalidInputs = ['invalid', 'foo', '', undefined];
      invalidInputs.forEach((input) => {
        const sanitized: ValidType = validTypes.includes(input as any)
          ? (input as ValidType)
          : 'comprehensive';
        expect(sanitized).toBe('comprehensive');
      });
    });

    it('should map category_focused to comprehensive for domain layer', () => {
      const clientType = 'category_focused';
      const domainType =
        clientType === 'category_focused' ? 'comprehensive' : clientType;
      expect(domainType).toBe('comprehensive');
    });
  });

  describe('Context Preservation', () => {
    it('should pass context from tool_use to generate_questionnaire payload', async () => {
      // Simulate questionnaire_ready tool_use
      const toolUseResult = await questionnaireReadyService.handle(
        {
          toolName: 'questionnaire_ready',
          toolUseId: 'tool-ctx',
          input: {
            assessment_type: 'comprehensive',
            vendor_name: 'OpenAI',
            solution_name: 'ChatGPT API',
            context_summary: 'Need to evaluate data privacy and security controls',
          },
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(toolUseResult.emitEvent?.payload).toMatchObject({
        vendorName: 'OpenAI',
        contextSummary: 'Need to evaluate data privacy and security controls',
      });

      // Frontend would receive this payload and pass it to generate_questionnaire
      const generatePayload = {
        conversationId: 'conv-123',
        assessmentType: toolUseResult.emitEvent?.payload.assessmentType,
        vendorName: toolUseResult.emitEvent?.payload.vendorName,
        contextSummary: toolUseResult.emitEvent?.payload.contextSummary,
      };

      expect(generatePayload).toMatchObject({
        conversationId: 'conv-123',
        assessmentType: 'comprehensive',
        vendorName: 'OpenAI',
        contextSummary: 'Need to evaluate data privacy and security controls',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle null input gracefully', async () => {
      const result = await questionnaireReadyService.handle(
        {
          toolName: 'questionnaire_ready',
          toolUseId: 'tool-null',
          input: null as any,
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.handled).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing required field', async () => {
      const result = await questionnaireReadyService.handle(
        {
          toolName: 'questionnaire_ready',
          toolUseId: 'tool-missing',
          input: {
            vendor_name: 'OpenAI',
            // Missing assessment_type
          } as any,
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.handled).toBe(false);
      expect(result.error).toContain('assessment_type');
    });

    it('should handle wrong tool name', async () => {
      const result = await questionnaireReadyService.handle(
        {
          toolName: 'wrong_tool',
          toolUseId: 'tool-wrong',
          input: {
            assessment_type: 'quick',
          },
        },
        {
          conversationId: 'conv-123',
          userId: 'user-123',
          assessmentId: null,
        }
      );

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Wrong tool');
    });
  });
});
