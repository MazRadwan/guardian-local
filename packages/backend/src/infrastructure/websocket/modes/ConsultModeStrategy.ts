/**
 * ConsultModeStrategy - Strategy for consult mode behavior
 *
 * Consult mode is the default conversational mode where users can ask
 * general questions about AI governance, vendor assessment, and get
 * help understanding the Guardian assessment process.
 *
 * Key behavior:
 * - Auto-summarize documents when present (postProcess)
 * - No special pre-processing or system prompt modifications
 */

import type {
  IModeStrategy,
  ModeContext,
  PreProcessResult,
  PostProcessResult,
} from './IModeStrategy.js';

export class ConsultModeStrategy implements IModeStrategy {
  readonly mode = 'consult' as const;

  /**
   * Pre-process before Claude call
   *
   * Consult mode has no special pre-processing requirements.
   * Returns an empty result to proceed with standard processing.
   *
   * @param _context - Context about the current conversation (unused)
   * @returns Empty pre-processing result
   */
  async preProcess(_context: ModeContext): Promise<PreProcessResult> {
    // No special pre-processing for consult mode
    return {};
  }

  /**
   * Post-process after Claude response
   *
   * Triggers auto-summarize when documents are present in the conversation.
   * This helps users understand uploaded vendor documents in consult mode.
   *
   * @param context - Context about the current conversation
   * @param _response - The Claude API response text (unused)
   * @returns Post-processing result with autoSummarize flag
   */
  async postProcess(
    context: ModeContext,
    _response: string
  ): Promise<PostProcessResult> {
    // Trigger auto-summarize if documents are present
    return {
      autoSummarize: context.hasDocuments,
    };
  }

  /**
   * Enhance system prompt for consult mode
   *
   * Consult mode uses the base system prompt without modifications.
   *
   * @param basePrompt - The base system prompt
   * @param _context - Context about the current conversation (unused)
   * @returns The unchanged base system prompt
   */
  async enhanceSystemPrompt(
    basePrompt: string,
    _context: ModeContext
  ): Promise<string> {
    // No additions for consult mode
    return basePrompt;
  }
}
