/**
 * QuestionParser Unit Tests
 */

import {
  QuestionParser,
  QuestionParseError,
} from '../../src/infrastructure/ai/parsers/QuestionParser';

describe('QuestionParser', () => {
  describe('parse', () => {
    it('should parse valid JSON response', () => {
      const jsonResponse = JSON.stringify({
        questions: Array.from({ length: 85 }, (_, i) => ({
          sectionName: 'Company Overview',
          sectionNumber: 1,
          questionNumber: i + 1,
          questionText: `Question ${i + 1}?`,
          questionType: 'text',
        })),
      });

      const questions = QuestionParser.parse(jsonResponse);

      expect(questions).toHaveLength(85);
      expect(questions[0].sectionName).toBe('Company Overview');
      expect(questions[0].questionType).toBe('text');
    });

    it('should parse JSON in markdown code block', () => {
      const jsonResponse = `\`\`\`json
{
  "questions": ${JSON.stringify(
    Array.from({ length: 85 }, (_, i) => ({
      sectionName: 'Company Overview',
      sectionNumber: 1,
      questionNumber: i + 1,
      questionText: `Question ${i + 1}?`,
      questionType: 'text',
    }))
  )}
}
\`\`\``;

      const questions = QuestionParser.parse(jsonResponse);

      expect(questions).toHaveLength(85);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = 'not valid json';

      expect(() => QuestionParser.parse(invalidJson)).toThrow(
        QuestionParseError
      );
      expect(() => QuestionParser.parse(invalidJson)).toThrow('Invalid JSON');
    });

    it('should throw error for too few questions', () => {
      const jsonResponse = JSON.stringify({
        questions: Array.from({ length: 50 }, (_, i) => ({
          sectionName: 'Company Overview',
          sectionNumber: 1,
          questionNumber: i + 1,
          questionText: `Question ${i + 1}?`,
          questionType: 'text',
        })),
      });

      expect(() => QuestionParser.parse(jsonResponse)).toThrow(
        QuestionParseError
      );
    });

    it('should throw error for too many questions', () => {
      const jsonResponse = JSON.stringify({
        questions: Array.from({ length: 150 }, (_, i) => ({
          sectionName: 'Company Overview',
          sectionNumber: 1,
          questionNumber: i + 1,
          questionText: `Question ${i + 1}?`,
          questionType: 'text',
        })),
      });

      expect(() => QuestionParser.parse(jsonResponse)).toThrow(
        QuestionParseError
      );
    });

    it('should throw error for duplicate positions', () => {
      const jsonResponse = JSON.stringify({
        questions: [
          ...Array.from({ length: 84 }, (_, i) => ({
            sectionName: 'Company Overview',
            sectionNumber: 1,
            questionNumber: i + 1,
            questionText: `Question ${i + 1}?`,
            questionType: 'text',
          })),
          // Duplicate position
          {
            sectionName: 'Company Overview',
            sectionNumber: 1,
            questionNumber: 1,
            questionText: 'Duplicate question?',
            questionType: 'text',
          },
        ],
      });

      expect(() => QuestionParser.parse(jsonResponse)).toThrow(
        QuestionParseError
      );
      expect(() => QuestionParser.parse(jsonResponse)).toThrow(
        'Duplicate question position'
      );
    });

    it('should throw error for missing required fields', () => {
      const jsonResponse = JSON.stringify({
        questions: [
          ...Array.from({ length: 84 }, (_, i) => ({
            sectionName: 'Company Overview',
            sectionNumber: 1,
            questionNumber: i + 1,
            questionText: `Question ${i + 1}?`,
            questionType: 'text',
          })),
          // Missing sectionName
          {
            sectionNumber: 2,
            questionNumber: 1,
            questionText: 'Missing section?',
            questionType: 'text',
          },
        ],
      });

      expect(() => QuestionParser.parse(jsonResponse)).toThrow(
        QuestionParseError
      );
    });
  });

  describe('validateEnumQuestions', () => {
    it('should pass for valid enum questions', () => {
      const questions = [
        {
          sectionName: 'Privacy',
          sectionNumber: 4,
          questionNumber: 1,
          questionText: 'What is your compliance status?',
          questionType: 'enum' as const,
          questionMetadata: {
            enumOptions: ['Compliant', 'In Progress', 'Not Compliant'],
          },
        },
      ];

      expect(() => QuestionParser.validateEnumQuestions(questions)).not.toThrow();
    });

    it('should throw error for enum without options', () => {
      const questions = [
        {
          sectionName: 'Privacy',
          sectionNumber: 4,
          questionNumber: 1,
          questionText: 'What is your compliance status?',
          questionType: 'enum' as const,
        },
      ];

      expect(() => QuestionParser.validateEnumQuestions(questions)).toThrow(
        QuestionParseError
      );
    });
  });
});
