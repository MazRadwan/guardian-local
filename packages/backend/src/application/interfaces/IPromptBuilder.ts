import { SolutionType } from '../../domain/scoring/rubric.js';
import type { ISOControlForPrompt } from '../../domain/compliance/types.js';

/**
 * Port for prompt building - application layer abstraction
 * Allows prompt construction without infrastructure dependency
 *
 * CACHING NOTE: The infrastructure implementation (ScoringPromptBuilder)
 * should use PromptCacheManager.ensureCached() for the system prompt.
 * The rubric text is static per version and benefits from prompt caching.
 *
 * Implementation should:
 * - Call PromptCacheManager.ensureCached('scoring') to get cached entry
 * - Use entry.systemPrompt for the prompt text
 * - Set cache_control: { type: 'ephemeral' } if entry.usePromptCache is true
 */
export interface IPromptBuilder {
  /**
   * Build the scoring system prompt with rubric
   * Accepts optional ISO catalog controls for inclusion in static prompt.
   *
   * @param isoControls - Full ISO control catalog (cacheable, same across assessments)
   * @returns System prompt with rubric criteria
   */
  buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string;

  /**
   * Build user prompt with vendor responses
   * This is NOT cached (varies per assessment)
   *
   * IMPORTANT: solutionType is REQUIRED - it determines composite score weights.
   *
   * @param params - Vendor info, solution type, questionnaire responses, and optional ISO controls
   * @returns User prompt with responses and weighting instructions
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
  }): string;

  /**
   * Optional: Fetch the full ISO control catalog for system prompt injection.
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
