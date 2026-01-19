/**
 * Unit tests for QuestionnaireReadyService
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 */

import {
  QuestionnaireReadyService,
  QuestionnaireReadyInput,
  QuestionnaireReadyPayload,
} from '../../src/application/services/QuestionnaireReadyService.js';
import { ToolUseInput, ToolUseContext } from '../../src/application/interfaces/IToolUseHandler.js';

// Mock services
const mockConversationService = {
  getConversation: jest.fn(),
  linkAssessment: jest.fn(),
};

describe('QuestionnaireReadyService', () => {
  let service: QuestionnaireReadyService;

  const baseContext: ToolUseContext = {
    conversationId: 'conv-123',
    userId: 'user-456',
    assessmentId: null,
    mode: 'assessment',
  };

  const baseInput: ToolUseInput = {
    toolName: 'questionnaire_ready',
    toolUseId: 'tool-use-789',
    input: {
      assessment_type: 'comprehensive',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConversationService.getConversation.mockResolvedValue({
      conversationId: 'conv-123',
      assessmentId: null,
    });

    service = new QuestionnaireReadyService(
      mockConversationService as any
    );
  });

  describe('toolName', () => {
    it('should have correct tool name', () => {
      expect(service.toolName).toBe('questionnaire_ready');
    });
  });

  describe('handle - valid inputs', () => {
    it('should handle valid quick assessment type', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'quick' },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      expect(result.emitEvent).toBeDefined();
      expect(result.emitEvent?.event).toBe('questionnaire_ready');

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.assessmentType).toBe('quick');
      expect(payload.estimatedQuestions).toBe(35); // Default for quick
    });

    it('should handle valid comprehensive assessment type', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'comprehensive' },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.assessmentType).toBe('comprehensive');
      expect(payload.estimatedQuestions).toBe(90); // Default for comprehensive
    });

    it('should handle valid category_focused assessment type', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'category_focused',
          selected_categories: ['Security', 'Privacy'],
        },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.assessmentType).toBe('category_focused');
      expect(payload.selectedCategories).toEqual(['Security', 'Privacy']);
    });

    it('should include all optional fields when provided', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'comprehensive',
          vendor_name: 'Acme AI',
          solution_name: 'AI Assistant Pro',
          context_summary: 'Healthcare AI solution for diagnostics',
          estimated_questions: 100,
        },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBe('Acme AI');
      expect(payload.solutionName).toBe('AI Assistant Pro');
      expect(payload.contextSummary).toBe('Healthcare AI solution for diagnostics');
      expect(payload.estimatedQuestions).toBe(100);
    });

    it('should set null for missing optional fields', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'quick' },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull();
      expect(payload.solutionName).toBeNull();
      expect(payload.contextSummary).toBeNull();
      expect(payload.selectedCategories).toBeNull();
    });
  });

  describe('handle - validation errors', () => {
    it('should reject wrong tool name', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        toolName: 'wrong_tool',
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Wrong tool');
    });

    it('should reject null input', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: null as any,
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Invalid tool input');
    });

    it('should reject undefined input', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: undefined as any,
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Invalid tool input');
    });

    it('should reject missing assessment_type', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {}, // Missing assessment_type
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Missing required field: assessment_type');
      expect(result.toolResult).toBeDefined();
    });

    it('should reject invalid assessment_type', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'invalid_type' },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Invalid assessment_type');
    });
  });

  describe('handle - tool result', () => {
    it('should return tool result on success', async () => {
      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult).toBeDefined();
      expect(result.toolResult?.toolUseId).toBe('tool-use-789');

      const content = JSON.parse(result.toolResult?.content || '{}');
      expect(content.success).toBe(true);
      expect(content.assessment_type).toBe('comprehensive');
    });

    it('should return tool result with error on validation failure', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {},
      };

      const result = await service.handle(input, baseContext);

      expect(result.toolResult).toBeDefined();
      const content = JSON.parse(result.toolResult?.content || '{}');
      expect(content.error).toBeDefined();
      expect(content.valid_types).toBeDefined();
    });
  });

  describe('handle - conversation context', () => {
    it('should include conversationId in payload', async () => {
      const result = await service.handle(baseInput, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.conversationId).toBe('conv-123');
    });

    it('should handle conversation service errors gracefully', async () => {
      mockConversationService.getConversation.mockRejectedValue(
        new Error('DB error')
      );

      const result = await service.handle(baseInput, baseContext);

      // Should still succeed - conversation fetch is optional
      expect(result.handled).toBe(true);
    });
  });

  describe('estimated questions', () => {
    it('should use provided estimate when available', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          estimated_questions: 42,
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(42);
    });

    it('should use default estimate for quick (35)', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'quick' },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(35);
    });

    it('should use default estimate for comprehensive (90)', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'comprehensive' },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(90);
    });

    it('should use default estimate for category_focused (50)', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { assessment_type: 'category_focused' },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(50);
    });
  });

  describe('input sanitization', () => {
    it('should convert non-string vendor_name to null', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 12345, // number instead of string
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull();
    });

    it('should convert whitespace-only strings to null', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: '   ',
          solution_name: '\t\n',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull();
      expect(payload.solutionName).toBeNull();
    });

    it('should trim valid strings', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: '  Acme Corp  ',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBe('Acme Corp');
    });

    it('should convert non-array selected_categories to null', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'category_focused',
          selected_categories: 'Security', // string instead of array
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.selectedCategories).toBeNull();
    });

    it('should filter non-strings from selected_categories array', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'category_focused',
          selected_categories: ['Security', 123, 'Privacy', null, 'Data'],
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.selectedCategories).toEqual(['Security', 'Privacy', 'Data']);
    });

    it('should return null for empty array after filtering', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'category_focused',
          selected_categories: [123, null, undefined],
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.selectedCategories).toBeNull();
    });

    it('should use default for negative estimated_questions', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          estimated_questions: -10,
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(35); // Default for quick
    });

    it('should use default for zero estimated_questions', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'comprehensive',
          estimated_questions: 0,
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(90); // Default for comprehensive
    });

    it('should use default for non-number estimated_questions', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          estimated_questions: 'fifty', // string instead of number
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.estimatedQuestions).toBe(35); // Default for quick
    });
  });

  /**
   * Story 26.2 fix: Vendor name validation tests
   * These tests verify that invalid vendor names are rejected
   */
  describe('vendor name validation (Story 26.2 fix)', () => {
    it('should reject numeric-only vendor_name like "1"', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: '1', // Invalid: numeric-only
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull(); // Should be rejected
    });

    it('should reject numeric-only solution_name', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          solution_name: '123',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.solutionName).toBeNull();
    });

    it('should reject single character vendor_name', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 'A',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull();
    });

    it('should reject option token vendor_name like "option1"', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 'option1',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull();
    });

    it('should reject option token with underscore like "choice_a"', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 'choice_a',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBeNull();
    });

    it('should accept valid vendor names with numbers', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 'Company123',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBe('Company123'); // Valid: not numeric-only
    });

    it('should accept valid vendor names', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 'Acme Healthcare AI',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBe('Acme Healthcare AI');
    });

    it('should accept minimum valid vendor name (2 chars)', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          assessment_type: 'quick',
          vendor_name: 'AB',
        },
      };

      const result = await service.handle(input, baseContext);

      const payload = result.emitEvent?.payload as unknown as QuestionnaireReadyPayload;
      expect(payload.vendorName).toBe('AB');
    });
  });
});
