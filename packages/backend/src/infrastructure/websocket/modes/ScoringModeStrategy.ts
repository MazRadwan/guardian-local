/**
 * ScoringModeStrategy - Strategy for scoring mode behavior
 *
 * IMPORTANT: In the current ChatServer implementation, scoring mode with attachments
 * bypasses Claude entirely and triggers `triggerScoringOnSend()` directly. This means:
 * - The ScoringModeStrategy's `postProcess` will NOT be called when attachments are present
 * - This strategy only applies to scoring mode WITHOUT attachments (follow-up questions)
 * - The actual scoring is triggered synchronously in the send_message handler, not via strategy
 *
 * This strategy handles follow-up scoring questions (text-only, no new attachments).
 */

import type {
  IModeStrategy,
  ModeContext,
  PreProcessResult,
  PostProcessResult,
} from './IModeStrategy.js';
import type { ConversationMode } from '../../../domain/entities/Conversation.js';

export class ScoringModeStrategy implements IModeStrategy {
  readonly mode: ConversationMode = 'scoring';

  /**
   * Pre-process for scoring mode.
   *
   * Note: Messages WITH attachments bypass Claude entirely (trigger-on-send pattern).
   * This strategy only handles follow-up questions (text-only).
   *
   * @param _context - Context about the current conversation (unused for scoring pre-process)
   * @returns Empty pre-process result (no modifications needed)
   */
  async preProcess(_context: ModeContext): Promise<PreProcessResult> {
    // No pre-processing needed - scoring with attachments is handled directly
    // by the ChatServer's triggerScoringOnSend() method
    return {};
  }

  /**
   * Post-process for scoring mode follow-up questions.
   *
   * Note: This is NOT called for initial scoring (attachments trigger scoring directly).
   * For follow-up questions about existing scoring results, we don't re-trigger scoring.
   *
   * @param _context - Context about the current conversation (unused)
   * @param _response - The Claude API response text (unused)
   * @returns Post-process result indicating no scoring should be triggered
   */
  async postProcess(
    _context: ModeContext,
    _response: string
  ): Promise<PostProcessResult> {
    // For follow-up questions, we don't re-trigger scoring
    // The original scoring results are already in conversation history
    return {
      triggerScoring: false,
    };
  }

  /**
   * Enhance system prompt for scoring mode.
   *
   * Adds context about scoring mode to help Claude understand that the user
   * may be asking follow-up questions about a previous scoring analysis.
   *
   * @param basePrompt - The base system prompt
   * @param _context - Context about the current conversation (unused)
   * @returns The enhanced system prompt with scoring mode context
   */
  async enhanceSystemPrompt(
    basePrompt: string,
    _context: ModeContext
  ): Promise<string> {
    return `${basePrompt}

## Scoring Mode Context
You are in scoring mode. The user may ask follow-up questions about:
- A previous scoring analysis
- Specific dimension scores
- Risk recommendations
- Vendor evaluation details

Refer to the conversation history for the original scoring results.
When discussing scores, explain the rationale and provide actionable recommendations.`;
  }
}
