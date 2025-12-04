/**
 * QuestionnaireSchemaAdapter Unit Tests
 *
 * Tests the adapter that maps QuestionnaireSchema (Claude JSON) to Question entities.
 */

import {
  schemaToQuestions,
  getSectionNumber,
  getRiskDimension,
} from '../../src/application/adapters/QuestionnaireSchemaAdapter.js';
import { fixtureQuestionnaireSchema } from '../fixtures/questionnaireSchema.js';
import type { QuestionnaireSchema } from '../../src/domain/types/QuestionnaireSchema.js';

describe('QuestionnaireSchemaAdapter', () => {
  describe('schemaToQuestions', () => {
    it('maps all questions from schema to entities', () => {
      const schema = fixtureQuestionnaireSchema({ assessmentType: 'comprehensive' });
      const questions = schemaToQuestions(schema, 'assessment-123');

      const schemaQuestionCount = schema.sections.reduce(
        (sum, s) => sum + s.questions.length,
        0
      );
      expect(questions).toHaveLength(schemaQuestionCount);
    });

    it('assigns correct assessmentId to all questions', () => {
      const schema = fixtureQuestionnaireSchema();
      const questions = schemaToQuestions(schema, 'my-assessment-id');

      for (const question of questions) {
        expect(question.assessmentId).toBe('my-assessment-id');
      }
    });

    it('maps section title to sectionName', () => {
      const schema = fixtureQuestionnaireSchema();
      const questions = schemaToQuestions(schema, 'assessment-123');

      // First question should be from Privacy Risk section
      expect(questions[0].sectionName).toBe('Privacy Risk');
      // Second question should be from Security Risk section
      expect(questions[1].sectionName).toBe('Security Risk');
    });

    it('assigns sequential question numbers within each section', () => {
      const schema: QuestionnaireSchema = {
        ...fixtureQuestionnaireSchema(),
        sections: [
          {
            id: 'clinical_risk',
            title: 'Clinical Risk',
            riskDimension: 'clinical_risk',
            description: 'Test',
            questions: [
              {
                id: 'clinical_1',
                text: 'First clinical question?',
                category: 'Safety',
                riskDimension: 'clinical_risk',
                questionType: 'text',
                required: true,
              },
              {
                id: 'clinical_2',
                text: 'Second clinical question?',
                category: 'Safety',
                riskDimension: 'clinical_risk',
                questionType: 'text',
                required: true,
              },
              {
                id: 'clinical_3',
                text: 'Third clinical question?',
                category: 'Safety',
                riskDimension: 'clinical_risk',
                questionType: 'text',
                required: true,
              },
            ],
          },
        ],
      };

      const questions = schemaToQuestions(schema, 'assessment-123');

      expect(questions[0].questionNumber).toBe(1);
      expect(questions[1].questionNumber).toBe(2);
      expect(questions[2].questionNumber).toBe(3);
    });

    it('converts yes_no to boolean type', () => {
      const schema: QuestionnaireSchema = {
        ...fixtureQuestionnaireSchema(),
        sections: [
          {
            id: 'privacy_risk',
            title: 'Privacy Risk',
            riskDimension: 'privacy_risk',
            description: 'Test',
            questions: [
              {
                id: 'privacy_1',
                text: 'Is PHI encrypted at rest?',
                category: 'Encryption',
                riskDimension: 'privacy_risk',
                questionType: 'yes_no',
                required: true,
              },
            ],
          },
        ],
      };

      const questions = schemaToQuestions(schema, 'assessment-123');
      expect(questions[0].questionType).toBe('boolean');
    });

    it('converts multiple_choice to enum with options', () => {
      const schema: QuestionnaireSchema = {
        ...fixtureQuestionnaireSchema(),
        sections: [
          {
            id: 'security_risk',
            title: 'Security Risk',
            riskDimension: 'security_risk',
            description: 'Test',
            questions: [
              {
                id: 'security_1',
                text: 'What encryption standard?',
                category: 'Encryption',
                riskDimension: 'security_risk',
                questionType: 'multiple_choice',
                required: true,
                options: ['AES-128', 'AES-256', 'None'],
              },
            ],
          },
        ],
      };

      const questions = schemaToQuestions(schema, 'assessment-123');
      expect(questions[0].questionType).toBe('enum');
      expect(questions[0].questionMetadata?.enumOptions).toEqual([
        'AES-128',
        'AES-256',
        'None',
      ]);
    });

    it('adds default scale options for scale type', () => {
      const schema: QuestionnaireSchema = {
        ...fixtureQuestionnaireSchema(),
        sections: [
          {
            id: 'vendor_capability',
            title: 'Vendor Capability',
            riskDimension: 'vendor_capability',
            description: 'Test',
            questions: [
              {
                id: 'vendor_1',
                text: 'Rate vendor support quality',
                category: 'Support',
                riskDimension: 'vendor_capability',
                questionType: 'scale',
                required: true,
              },
            ],
          },
        ],
      };

      const questions = schemaToQuestions(schema, 'assessment-123');
      expect(questions[0].questionType).toBe('enum');
      expect(questions[0].questionMetadata?.enumOptions).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ]);
    });

    it('preserves text question type', () => {
      const schema = fixtureQuestionnaireSchema();
      const questions = schemaToQuestions(schema, 'assessment-123');

      // Default fixture has text questions
      expect(questions[0].questionType).toBe('text');
    });

    it('includes guidance as helpText in metadata', () => {
      const schema: QuestionnaireSchema = {
        ...fixtureQuestionnaireSchema(),
        sections: [
          {
            id: 'privacy_risk',
            title: 'Privacy Risk',
            riskDimension: 'privacy_risk',
            description: 'Test',
            questions: [
              {
                id: 'privacy_1',
                text: 'How is patient data protected?',
                category: 'Data Protection',
                riskDimension: 'privacy_risk',
                questionType: 'text',
                required: true,
                guidance: 'Consider encryption, access controls, and audit logs',
              },
            ],
          },
        ],
      };

      const questions = schemaToQuestions(schema, 'assessment-123');
      expect(questions[0].questionMetadata?.helpText).toBe(
        'Consider encryption, access controls, and audit logs'
      );
    });

    it('preserves required flag in metadata', () => {
      const schema: QuestionnaireSchema = {
        ...fixtureQuestionnaireSchema(),
        sections: [
          {
            id: 'privacy_risk',
            title: 'Privacy Risk',
            riskDimension: 'privacy_risk',
            description: 'Test',
            questions: [
              {
                id: 'privacy_1',
                text: 'Optional question here?',
                category: 'Data',
                riskDimension: 'privacy_risk',
                questionType: 'text',
                required: false,
              },
            ],
          },
        ],
      };

      const questions = schemaToQuestions(schema, 'assessment-123');
      expect(questions[0].questionMetadata?.required).toBe(false);
    });
  });

  describe('getSectionNumber', () => {
    it('maps clinical_risk to section 1', () => {
      expect(getSectionNumber('clinical_risk')).toBe(1);
    });

    it('maps privacy_risk to section 2', () => {
      expect(getSectionNumber('privacy_risk')).toBe(2);
    });

    it('maps security_risk to section 3', () => {
      expect(getSectionNumber('security_risk')).toBe(3);
    });

    it('maps technical_credibility to section 4', () => {
      expect(getSectionNumber('technical_credibility')).toBe(4);
    });

    it('maps vendor_capability to section 5', () => {
      expect(getSectionNumber('vendor_capability')).toBe(5);
    });

    it('maps ai_transparency to section 6', () => {
      expect(getSectionNumber('ai_transparency')).toBe(6);
    });

    it('maps ethical_considerations to section 7', () => {
      expect(getSectionNumber('ethical_considerations')).toBe(7);
    });

    it('maps regulatory_compliance to section 8', () => {
      expect(getSectionNumber('regulatory_compliance')).toBe(8);
    });

    it('maps operational_excellence to section 9', () => {
      expect(getSectionNumber('operational_excellence')).toBe(9);
    });

    it('maps sustainability to section 10', () => {
      expect(getSectionNumber('sustainability')).toBe(10);
    });
  });

  describe('getRiskDimension', () => {
    it('maps section 1 to clinical_risk', () => {
      expect(getRiskDimension(1)).toBe('clinical_risk');
    });

    it('maps section 2 to privacy_risk', () => {
      expect(getRiskDimension(2)).toBe('privacy_risk');
    });

    it('maps section 10 to sustainability', () => {
      expect(getRiskDimension(10)).toBe('sustainability');
    });

    it('returns undefined for section 0', () => {
      expect(getRiskDimension(0)).toBeUndefined();
    });

    it('returns undefined for section 11', () => {
      expect(getRiskDimension(11)).toBeUndefined();
    });

    it('returns undefined for negative section', () => {
      expect(getRiskDimension(-1)).toBeUndefined();
    });
  });
});
