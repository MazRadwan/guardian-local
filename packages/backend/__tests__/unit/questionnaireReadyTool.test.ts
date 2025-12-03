/**
 * Unit tests for questionnaireReadyTool
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * Tests validate the tool schema structure to prevent regressions
 * when the tool definition is modified.
 */

import {
  questionnaireReadyTool,
  assessmentModeTools,
} from '../../src/infrastructure/ai/tools/questionnaireReadyTool.js';

describe('questionnaireReadyTool', () => {
  describe('tool metadata', () => {
    it('should have correct tool name', () => {
      expect(questionnaireReadyTool.name).toBe('questionnaire_ready');
    });

    it('should have a description', () => {
      expect(questionnaireReadyTool.description).toBeDefined();
      expect(questionnaireReadyTool.description.length).toBeGreaterThan(50);
    });

    it('should include guidance on when to call', () => {
      expect(questionnaireReadyTool.description).toContain('should call this tool when');
    });

    it('should include guidance on when NOT to call', () => {
      expect(questionnaireReadyTool.description).toContain('Do NOT call this tool when');
    });
  });

  describe('input_schema structure', () => {
    const schema = questionnaireReadyTool.input_schema;

    it('should be an object type', () => {
      expect(schema.type).toBe('object');
    });

    it('should prevent additional properties', () => {
      expect(schema.additionalProperties).toBe(false);
    });

    it('should require assessment_type', () => {
      expect(schema.required).toContain('assessment_type');
    });

    it('should only require assessment_type', () => {
      expect(schema.required).toHaveLength(1);
    });
  });

  describe('assessment_type property', () => {
    const props = questionnaireReadyTool.input_schema.properties as Record<string, any>;

    it('should be a string type', () => {
      expect(props.assessment_type.type).toBe('string');
    });

    it('should have enum with valid types', () => {
      expect(props.assessment_type.enum).toEqual([
        'quick',
        'comprehensive',
        'category_focused',
      ]);
    });

    it('should have a description', () => {
      expect(props.assessment_type.description).toBeDefined();
    });
  });

  describe('optional string properties', () => {
    const props = questionnaireReadyTool.input_schema.properties as Record<string, any>;

    it('should have vendor_name as string', () => {
      expect(props.vendor_name.type).toBe('string');
    });

    it('should have solution_name as string', () => {
      expect(props.solution_name.type).toBe('string');
    });

    it('should have context_summary as string', () => {
      expect(props.context_summary.type).toBe('string');
    });
  });

  describe('estimated_questions property', () => {
    const props = questionnaireReadyTool.input_schema.properties as Record<string, any>;

    it('should be an integer type', () => {
      expect(props.estimated_questions.type).toBe('integer');
    });

    it('should have minimum constraint of 1', () => {
      expect(props.estimated_questions.minimum).toBe(1);
    });

    it('should have maximum constraint of 200', () => {
      expect(props.estimated_questions.maximum).toBe(200);
    });
  });

  describe('selected_categories property', () => {
    const props = questionnaireReadyTool.input_schema.properties as Record<string, any>;

    it('should be an array type', () => {
      expect(props.selected_categories.type).toBe('array');
    });

    it('should have string items', () => {
      expect(props.selected_categories.items.type).toBe('string');
    });
  });
});

describe('assessmentModeTools', () => {
  it('should be an array', () => {
    expect(Array.isArray(assessmentModeTools)).toBe(true);
  });

  it('should contain questionnaireReadyTool', () => {
    expect(assessmentModeTools).toContain(questionnaireReadyTool);
  });

  it('should have exactly 1 tool (currently)', () => {
    expect(assessmentModeTools).toHaveLength(1);
  });
});
