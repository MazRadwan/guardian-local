import { SolutionType } from '../../domain/scoring/rubric.js';
import type { ISOControlForPrompt } from '../../domain/compliance/types.js';
import type { ContentBlockForPrompt } from './ILLMClient.js';

/**
 * Port for prompt building - application layer abstraction
 * Allows prompt construction without infrastructure dependency
 *
 * CACHING NOTE: The system prompt is static (rubric only, no ISO controls)
 * and fully cacheable across all scoring calls (Story 39.3.3).
 * ISO controls are now included in the user prompt via isoCatalog param.
 * Story 39.3.4: User prompt may return multi-block content for per-block caching.
 */
export interface IPromptBuilder {
  /**
   * Build the scoring system prompt with rubric.
   * Returns a static, fully cacheable prompt (no per-assessment variation).
   * ISO controls have been moved to the user prompt (Story 39.3.3).
   *
   * @returns System prompt with rubric criteria
   */
  buildScoringSystemPrompt(): string;

  /**
   * Build user prompt with vendor responses.
   *
   * Returns string when no ISO catalog is provided (backward compatible).
   * Returns ContentBlockForPrompt[] when ISO catalog is provided, enabling
   * per-block cache_control on the ISO catalog block (Story 39.3.4).
   *
   * IMPORTANT: solutionType is REQUIRED - it determines composite score weights.
   *
   * @param params - Vendor info, solution type, questionnaire responses, and optional ISO controls
   * @returns User prompt as string or multi-block array with cache_control
   */
  buildScoringUserPrompt(params: {
    vendorName: string;
    solutionName: string;
    solutionType: SolutionType;
    responses: Array<{
      sectionNumber: number;
      questionNumber: number;
      questionText: string;
      responseText: string;
    }>;
    isoControls?: ISOControlForPrompt[];
    isoCatalog?: ISOControlForPrompt[];
  }): string | ContentBlockForPrompt[];

  /**
   * Optional: Fetch the full ISO control catalog for user prompt injection.
   * Implemented by ScoringPromptBuilder when ISOControlRetrievalService is available.
   * Called by ScoringLLMService through the interface -- no concrete dependency needed.
   */
  fetchISOCatalog?(): Promise<ISOControlForPrompt[]>;

  /**
   * Optional: Fetch applicable ISO controls for specific dimensions.
   * Called by ScoringLLMService through the interface.
   */
  fetchApplicableControls?(dimensions: string[]): Promise<ISOControlForPrompt[]>;
}
