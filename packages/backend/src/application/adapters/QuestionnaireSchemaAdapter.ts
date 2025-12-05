/**
 * QuestionnaireSchemaAdapter - Maps QuestionnaireSchema to Question entities
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 *
 * The Question entity uses:
 * - sectionNumber: 1-10 (for 10 risk dimensions)
 * - questionType: 'text' | 'enum' | 'boolean'
 *
 * The QuestionnaireSchema uses:
 * - riskDimension: string identifier
 * - questionType: 'text' | 'yes_no' | 'scale' | 'multiple_choice'
 *
 * This adapter bridges the gap without modifying the Question entity.
 */

import type {
  QuestionnaireSchema,
  QuestionnaireQuestion,
  RiskDimension,
  QuestionType as SchemaQuestionType,
} from '../../domain/types/QuestionnaireSchema.js';
import { Question, QuestionType, QuestionMetadata } from '../../domain/entities/Question.js';

/**
 * Maps risk dimension to section number (1-10)
 */
const DIMENSION_TO_SECTION: Record<RiskDimension, number> = {
  clinical_risk: 1,
  privacy_risk: 2,
  security_risk: 3,
  technical_credibility: 4,
  vendor_capability: 5,
  ai_transparency: 6,
  ethical_considerations: 7,
  regulatory_compliance: 8,
  operational_excellence: 9,
  sustainability: 10,
};

/**
 * Maps section number back to risk dimension
 */
const SECTION_TO_DIMENSION: Record<number, RiskDimension> = {
  1: 'clinical_risk',
  2: 'privacy_risk',
  3: 'security_risk',
  4: 'technical_credibility',
  5: 'vendor_capability',
  6: 'ai_transparency',
  7: 'ethical_considerations',
  8: 'regulatory_compliance',
  9: 'operational_excellence',
  10: 'sustainability',
};

/**
 * Maps schema question type to entity question type
 */
function mapQuestionType(schemaType: SchemaQuestionType): QuestionType {
  switch (schemaType) {
    case 'text':
      return 'text';
    case 'yes_no':
      return 'boolean';
    case 'scale':
    case 'multiple_choice':
      return 'enum';
    default:
      return 'text';
  }
}

/**
 * Builds metadata for enum/multiple_choice questions
 */
function buildMetadata(
  question: QuestionnaireQuestion,
  entityType: QuestionType
): QuestionMetadata | undefined {
  const metadata: QuestionMetadata = {
    required: question.required,
    helpText: question.guidance,
  };

  if (entityType === 'enum' && question.options) {
    metadata.enumOptions = question.options;
  } else if (entityType === 'enum' && question.questionType === 'scale') {
    // Default scale options
    metadata.enumOptions = ['1', '2', '3', '4', '5'];
  }

  return metadata;
}

/**
 * Convert a QuestionnaireSchema to an array of Question entities
 */
export function schemaToQuestions(
  schema: QuestionnaireSchema,
  assessmentId: string
): Question[] {
  const questions: Question[] = [];

  for (const section of schema.sections) {
    const sectionNumber = DIMENSION_TO_SECTION[section.riskDimension];

    for (let i = 0; i < section.questions.length; i++) {
      const q = section.questions[i];
      const entityType = mapQuestionType(q.questionType);

      questions.push(
        Question.create({
          assessmentId,
          sectionName: section.title,
          sectionNumber,
          questionNumber: i + 1,
          questionText: q.text,
          questionType: entityType,
          questionMetadata: buildMetadata(q, entityType),
        })
      );
    }
  }

  return questions;
}

/**
 * Get section number from risk dimension
 */
export function getSectionNumber(dimension: RiskDimension): number {
  return DIMENSION_TO_SECTION[dimension];
}

/**
 * Get risk dimension from section number
 */
export function getRiskDimension(sectionNumber: number): RiskDimension | undefined {
  return SECTION_TO_DIMENSION[sectionNumber];
}
