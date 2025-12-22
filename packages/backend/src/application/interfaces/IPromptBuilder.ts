import { SolutionType } from '../../domain/scoring/rubric.js';

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
   * Implementation should use PromptCacheManager.ensureCached('scoring')
   *
   * @returns System prompt with rubric criteria (cacheable)
   */
  buildScoringSystemPrompt(): string;

  /**
   * Build user prompt with vendor responses
   * This is NOT cached (varies per assessment)
   *
   * IMPORTANT: solutionType is REQUIRED - it determines composite score weights.
   *
   * @param params - Vendor info, solution type, and questionnaire responses
   * @returns User prompt with responses and weighting instructions
   */
  buildScoringUserPrompt(params: {
    vendorName: string;
    solutionName: string;
    solutionType: SolutionType; // REQUIRED for correct weighting
    responses: Array<{
      sectionNumber: number;
      questionNumber: number;
      questionText: string;
      responseText: string;
    }>;
  }): string;
}

/**
 * Infrastructure implementation notes:
 *
 * The existing PromptCacheManager API is:
 *   ensureCached(mode: ConversationMode, options?): PromptCacheEntry
 *
 * Where PromptCacheEntry = {
 *   systemPrompt: string;
 *   usePromptCache: boolean;
 *   cachedPromptId?: string;
 *   ...
 * }
 *
 * Implementation:
 *
 * class ScoringPromptBuilder implements IPromptBuilder {
 *   constructor(private cacheManager: PromptCacheManager) {}
 *
 *   buildScoringSystemPrompt(): string {
 *     // Use existing ensureCached API with 'scoring' mode
 *     const entry = this.cacheManager.ensureCached('scoring');
 *     return entry.systemPrompt;
 *   }
 *
 *   // When making Claude API call, check entry.usePromptCache
 *   // and set cache_control accordingly
 * }
 */
