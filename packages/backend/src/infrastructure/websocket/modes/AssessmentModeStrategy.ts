/**
 * AssessmentModeStrategy - Strategy for assessment mode behavior
 *
 * Assessment mode is used when users are evaluating AI vendor solutions
 * using the Guardian assessment framework. This strategy:
 * - Triggers background enrichment when documents are present
 * - Enhances system prompts with assessment-specific instructions
 *
 * @module infrastructure/websocket/modes/AssessmentModeStrategy
 */

import type {
  IModeStrategy,
  ModeContext,
  PreProcessResult,
  PostProcessResult,
} from './IModeStrategy.js';

/**
 * AssessmentModeStrategy implements IModeStrategy for assessment mode.
 *
 * Assessment mode helps users evaluate AI vendor solutions by:
 * 1. Uploading vendor documentation
 * 2. Identifying key capabilities and risks
 * 3. Generating comprehensive questionnaires
 */
export class AssessmentModeStrategy implements IModeStrategy {
  /**
   * The mode this strategy handles
   */
  readonly mode = 'assessment' as const;

  /**
   * Pre-process before Claude call
   *
   * Assessment mode doesn't require special pre-processing -
   * the main customization happens in system prompt enhancement.
   *
   * @param _context - Context about the current conversation (unused)
   * @returns Empty pre-process result
   */
  async preProcess(_context: ModeContext): Promise<PreProcessResult> {
    return {};
  }

  /**
   * Post-process after Claude response
   *
   * In assessment mode, we trigger background enrichment when documents
   * are present. This allows the system to extract additional context
   * from uploaded vendor documents asynchronously.
   *
   * @param context - Context about the current conversation
   * @param _response - The Claude API response text (unused)
   * @returns Post-processing result with enrichment flag
   */
  async postProcess(
    context: ModeContext,
    _response: string
  ): Promise<PostProcessResult> {
    // Trigger background enrichment if documents are present
    // This extracts vendor information, claims, and compliance mentions
    return {
      enrichInBackground: context.hasDocuments,
    };
  }

  /**
   * Enhance system prompt for assessment mode
   *
   * Adds assessment-specific instructions to guide Claude in helping
   * users evaluate AI vendor solutions using the Guardian framework.
   *
   * @param basePrompt - The base system prompt
   * @param _context - Context about the current conversation (unused)
   * @returns The enhanced system prompt with assessment instructions
   */
  async enhanceSystemPrompt(
    basePrompt: string,
    _context: ModeContext
  ): Promise<string> {
    return `${basePrompt}

## Assessment Mode Instructions
Help the user evaluate AI vendor solutions using the Guardian assessment framework. Guide them through:
1. Uploading vendor documentation
2. Identifying key capabilities and risks
3. Generating comprehensive questionnaires`;
  }
}
