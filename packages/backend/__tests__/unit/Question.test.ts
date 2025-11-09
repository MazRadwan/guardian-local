/**
 * Question Entity Unit Tests
 */

import { Question, QuestionType } from '../../src/domain/entities/Question';

describe('Question Entity', () => {
  describe('create', () => {
    it('should create a valid question', () => {
      const question = Question.create({
        assessmentId: 'test-assessment-id',
        sectionName: 'Privacy Compliance',
        sectionNumber: 4,
        questionNumber: 1,
        questionText: 'Does your solution comply with PIPEDA?',
        questionType: 'boolean',
      });

      expect(question.assessmentId).toBe('test-assessment-id');
      expect(question.sectionName).toBe('Privacy Compliance');
      expect(question.sectionNumber).toBe(4);
      expect(question.questionNumber).toBe(1);
      expect(question.questionText).toBe(
        'Does your solution comply with PIPEDA?'
      );
      expect(question.questionType).toBe('boolean');
    });

    it('should throw error if assessment ID is empty', () => {
      expect(() =>
        Question.create({
          assessmentId: '',
          sectionName: 'Privacy Compliance',
          sectionNumber: 4,
          questionNumber: 1,
          questionText: 'Does your solution comply with PIPEDA?',
          questionType: 'boolean',
        })
      ).toThrow('Assessment ID is required');
    });

    it('should throw error if section name is empty', () => {
      expect(() =>
        Question.create({
          assessmentId: 'test-id',
          sectionName: '',
          sectionNumber: 4,
          questionNumber: 1,
          questionText: 'Does your solution comply with PIPEDA?',
          questionType: 'boolean',
        })
      ).toThrow('Section name is required');
    });

    it('should throw error if section number is invalid', () => {
      expect(() =>
        Question.create({
          assessmentId: 'test-id',
          sectionName: 'Privacy',
          sectionNumber: 0,
          questionNumber: 1,
          questionText: 'Does your solution comply with PIPEDA?',
          questionType: 'boolean',
        })
      ).toThrow('Section number must be between 1 and 11');

      expect(() =>
        Question.create({
          assessmentId: 'test-id',
          sectionName: 'Privacy',
          sectionNumber: 12,
          questionNumber: 1,
          questionText: 'Does your solution comply with PIPEDA?',
          questionType: 'boolean',
        })
      ).toThrow('Section number must be between 1 and 11');
    });

    it('should throw error if question number is invalid', () => {
      expect(() =>
        Question.create({
          assessmentId: 'test-id',
          sectionName: 'Privacy',
          sectionNumber: 4,
          questionNumber: 0,
          questionText: 'Does your solution comply with PIPEDA?',
          questionType: 'boolean',
        })
      ).toThrow('Question number must be positive');
    });

    it('should throw error if question text is too short', () => {
      expect(() =>
        Question.create({
          assessmentId: 'test-id',
          sectionName: 'Privacy',
          sectionNumber: 4,
          questionNumber: 1,
          questionText: 'Short',
          questionType: 'boolean',
        })
      ).toThrow('Question text must be at least 10 characters');
    });

    it('should throw error if enum question lacks enumOptions', () => {
      expect(() =>
        Question.create({
          assessmentId: 'test-id',
          sectionName: 'Privacy',
          sectionNumber: 4,
          questionNumber: 1,
          questionText: 'What is your compliance status?',
          questionType: 'enum',
        })
      ).toThrow('Enum questions must have enumOptions in metadata');
    });

    it('should create enum question with enumOptions', () => {
      const question = Question.create({
        assessmentId: 'test-id',
        sectionName: 'Privacy',
        sectionNumber: 4,
        questionNumber: 1,
        questionText: 'What is your compliance status?',
        questionType: 'enum',
        questionMetadata: {
          enumOptions: ['Compliant', 'In Progress', 'Not Compliant'],
        },
      });

      expect(question.questionType).toBe('enum');
      expect(question.questionMetadata?.enumOptions).toEqual([
        'Compliant',
        'In Progress',
        'Not Compliant',
      ]);
    });
  });

  describe('toPersistence', () => {
    it('should convert to database format', () => {
      const question = Question.create({
        assessmentId: 'test-id',
        sectionName: 'Privacy',
        sectionNumber: 4,
        questionNumber: 1,
        questionText: 'Does your solution comply with PIPEDA?',
        questionType: 'boolean',
        questionMetadata: {
          required: true,
          helpText: 'PIPEDA compliance is mandatory',
        },
      });

      const persistence = question.toPersistence();

      expect(persistence.assessmentId).toBe('test-id');
      expect(persistence.sectionName).toBe('Privacy');
      expect(persistence.sectionNumber).toBe(4);
      expect(persistence.questionNumber).toBe(1);
      expect(persistence.questionText).toBe(
        'Does your solution comply with PIPEDA?'
      );
      expect(persistence.questionType).toBe('boolean');
      expect(persistence.questionMetadata).toEqual({
        required: true,
        helpText: 'PIPEDA compliance is mandatory',
      });
    });
  });

  describe('fromPersistence', () => {
    it('should create Question from database data', () => {
      const question = Question.fromPersistence({
        id: 'question-id',
        assessmentId: 'test-id',
        sectionName: 'Privacy',
        sectionNumber: 4,
        questionNumber: 1,
        questionText: 'Does your solution comply with PIPEDA?',
        questionType: 'boolean',
        questionMetadata: {
          required: true,
        },
        createdAt: new Date(),
      });

      expect(question.id).toBe('question-id');
      expect(question.assessmentId).toBe('test-id');
      expect(question.sectionName).toBe('Privacy');
      expect(question.sectionNumber).toBe(4);
      expect(question.questionNumber).toBe(1);
    });
  });
});
