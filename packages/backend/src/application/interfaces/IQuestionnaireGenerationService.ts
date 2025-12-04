/**
 * IQuestionnaireGenerationService - Interface for questionnaire generation
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 */

import { QuestionnaireSchema } from '../../domain/types/QuestionnaireSchema.js';

/**
 * Context for questionnaire generation
 */
export interface GenerationContext {
  /** Conversation this generation belongs to */
  conversationId: string;

  /** User requesting generation */
  userId: string;

  /** Type of assessment to generate */
  assessmentType: 'quick' | 'comprehensive' | 'category_focused';

  /** Vendor name (from conversation context) */
  vendorName?: string;

  /** Solution/product name */
  solutionName?: string;

  /** Summary of conversation context */
  contextSummary?: string;

  /** Focus categories for category_focused assessments */
  selectedCategories?: string[];
}

/**
 * Result of questionnaire generation
 */
export interface GenerationResult {
  /** The canonical questionnaire schema */
  schema: QuestionnaireSchema;

  /** Assessment ID (created or existing) */
  assessmentId: string;

  /** Pre-rendered markdown for chat display */
  markdown: string;
}

/**
 * Interface for questionnaire generation service
 */
export interface IQuestionnaireGenerationService {
  /**
   * Generate a questionnaire
   *
   * Makes a single Claude call, parses the JSON response,
   * persists to database, and returns schema + markdown.
   *
   * @param context - Generation context from conversation
   * @returns Schema, assessment ID, and pre-rendered markdown
   * @throws Error if Claude returns invalid JSON or generation fails
   */
  generate(context: GenerationContext): Promise<GenerationResult>;
}
