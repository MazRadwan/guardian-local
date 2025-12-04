/**
 * QuestionnaireSchema Unit Tests
 *
 * Tests schema validation and constants for questionnaire generation.
 */

import {
  validateQuestionnaireSchema,
  ALL_RISK_DIMENSIONS,
  RISK_DIMENSION_LABELS,
  QUESTION_COUNT_RANGES,
} from '../../src/domain/types/QuestionnaireSchema.js';
import { fixtureQuestionnaireSchema } from '../fixtures/questionnaireSchema.js';

describe('validateQuestionnaireSchema', () => {
  it('validates a correct schema', () => {
    const schema = fixtureQuestionnaireSchema();
    expect(validateQuestionnaireSchema(schema)).toBe(true);
  });

  it('rejects null', () => {
    expect(validateQuestionnaireSchema(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateQuestionnaireSchema(undefined)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateQuestionnaireSchema('string')).toBe(false);
    expect(validateQuestionnaireSchema(123)).toBe(false);
    expect(validateQuestionnaireSchema([])).toBe(false);
  });

  it('rejects wrong version', () => {
    const schema = { ...fixtureQuestionnaireSchema(), version: '2.0' };
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects missing version', () => {
    const schema = fixtureQuestionnaireSchema();
    delete (schema as any).version;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects missing metadata', () => {
    const schema = fixtureQuestionnaireSchema();
    delete (schema as any).metadata;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects invalid assessment type', () => {
    const schema = fixtureQuestionnaireSchema();
    schema.metadata.assessmentType = 'invalid' as any;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('accepts all valid assessment types', () => {
    for (const type of ['quick', 'comprehensive', 'category_focused'] as const) {
      const schema = fixtureQuestionnaireSchema({ assessmentType: type });
      expect(validateQuestionnaireSchema(schema)).toBe(true);
    }
  });

  it('rejects empty sections', () => {
    const schema = { ...fixtureQuestionnaireSchema(), sections: [] };
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects missing sections', () => {
    const schema = fixtureQuestionnaireSchema();
    delete (schema as any).sections;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects sections that is not an array', () => {
    const schema = { ...fixtureQuestionnaireSchema(), sections: 'not an array' };
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects invalid risk dimension in section', () => {
    const schema = fixtureQuestionnaireSchema();
    schema.sections[0].riskDimension = 'invalid_dimension' as any;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects section without id', () => {
    const schema = fixtureQuestionnaireSchema();
    delete (schema.sections[0] as any).id;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects section without title', () => {
    const schema = fixtureQuestionnaireSchema();
    delete (schema.sections[0] as any).title;
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  it('rejects section without questions array', () => {
    const schema = fixtureQuestionnaireSchema();
    (schema.sections[0] as any).questions = 'not an array';
    expect(validateQuestionnaireSchema(schema)).toBe(false);
  });

  describe('question-level validation', () => {
    it('rejects question without id', () => {
      const schema = fixtureQuestionnaireSchema();
      delete (schema.sections[0].questions[0] as any).id;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question with non-string id', () => {
      const schema = fixtureQuestionnaireSchema();
      (schema.sections[0].questions[0] as any).id = 123;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question without text', () => {
      const schema = fixtureQuestionnaireSchema();
      delete (schema.sections[0].questions[0] as any).text;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question with text shorter than 5 characters', () => {
      const schema = fixtureQuestionnaireSchema();
      schema.sections[0].questions[0].text = 'Nope';
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question without category', () => {
      const schema = fixtureQuestionnaireSchema();
      delete (schema.sections[0].questions[0] as any).category;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question with invalid risk dimension', () => {
      const schema = fixtureQuestionnaireSchema();
      schema.sections[0].questions[0].riskDimension = 'invalid_dimension' as any;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question with invalid question type', () => {
      const schema = fixtureQuestionnaireSchema();
      (schema.sections[0].questions[0] as any).questionType = 'invalid_type';
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('accepts all valid question types', () => {
      for (const type of ['text', 'yes_no', 'scale', 'multiple_choice'] as const) {
        const schema = fixtureQuestionnaireSchema();
        schema.sections[0].questions[0].questionType = type;
        if (type === 'multiple_choice') {
          schema.sections[0].questions[0].options = ['A', 'B'];
        }
        expect(validateQuestionnaireSchema(schema)).toBe(true);
      }
    });

    it('rejects question without required field', () => {
      const schema = fixtureQuestionnaireSchema();
      delete (schema.sections[0].questions[0] as any).required;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects question with non-boolean required field', () => {
      const schema = fixtureQuestionnaireSchema();
      (schema.sections[0].questions[0] as any).required = 'true';
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects multiple_choice without options', () => {
      const schema = fixtureQuestionnaireSchema();
      schema.sections[0].questions[0].questionType = 'multiple_choice';
      delete schema.sections[0].questions[0].options;
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('rejects multiple_choice with less than 2 options', () => {
      const schema = fixtureQuestionnaireSchema();
      schema.sections[0].questions[0].questionType = 'multiple_choice';
      schema.sections[0].questions[0].options = ['Only one'];
      expect(validateQuestionnaireSchema(schema)).toBe(false);
    });

    it('accepts multiple_choice with valid options', () => {
      const schema = fixtureQuestionnaireSchema();
      schema.sections[0].questions[0].questionType = 'multiple_choice';
      schema.sections[0].questions[0].options = ['Option A', 'Option B', 'Option C'];
      expect(validateQuestionnaireSchema(schema)).toBe(true);
    });
  });
});

describe('Constants', () => {
  describe('ALL_RISK_DIMENSIONS', () => {
    it('has exactly 10 risk dimensions', () => {
      expect(ALL_RISK_DIMENSIONS).toHaveLength(10);
    });

    it('contains expected dimensions', () => {
      expect(ALL_RISK_DIMENSIONS).toContain('clinical_risk');
      expect(ALL_RISK_DIMENSIONS).toContain('privacy_risk');
      expect(ALL_RISK_DIMENSIONS).toContain('security_risk');
      expect(ALL_RISK_DIMENSIONS).toContain('technical_credibility');
      expect(ALL_RISK_DIMENSIONS).toContain('vendor_capability');
      expect(ALL_RISK_DIMENSIONS).toContain('ai_transparency');
      expect(ALL_RISK_DIMENSIONS).toContain('ethical_considerations');
      expect(ALL_RISK_DIMENSIONS).toContain('regulatory_compliance');
      expect(ALL_RISK_DIMENSIONS).toContain('operational_excellence');
      expect(ALL_RISK_DIMENSIONS).toContain('sustainability');
    });
  });

  describe('RISK_DIMENSION_LABELS', () => {
    it('has labels for all dimensions', () => {
      for (const dim of ALL_RISK_DIMENSIONS) {
        expect(RISK_DIMENSION_LABELS[dim]).toBeDefined();
        expect(typeof RISK_DIMENSION_LABELS[dim]).toBe('string');
      }
    });

    it('has human-readable labels', () => {
      expect(RISK_DIMENSION_LABELS.clinical_risk).toBe('Clinical Risk');
      expect(RISK_DIMENSION_LABELS.privacy_risk).toBe('Privacy Risk');
      expect(RISK_DIMENSION_LABELS.sustainability).toBe('Sustainability');
    });
  });

  describe('QUESTION_COUNT_RANGES', () => {
    it('has ranges for quick assessment', () => {
      expect(QUESTION_COUNT_RANGES.quick).toEqual({ min: 30, max: 40 });
    });

    it('has ranges for comprehensive assessment', () => {
      expect(QUESTION_COUNT_RANGES.comprehensive).toEqual({ min: 85, max: 95 });
    });

    it('has ranges for category_focused assessment', () => {
      expect(QUESTION_COUNT_RANGES.category_focused).toEqual({ min: 50, max: 70 });
    });
  });
});
