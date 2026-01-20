/**
 * IModeStrategy - Strategy interface for mode-specific behavior
 *
 * Each mode (consult, assessment, scoring) can have different:
 * - System prompt additions
 * - Pre-processing logic (before Claude call)
 * - Post-processing logic (after Claude response)
 *
 * This enables clean separation of mode-specific behavior without
 * polluting the main message handling logic with mode conditionals.
 */

import type { ConversationMode } from '../../../domain/entities/Conversation.js';

/**
 * Context passed to mode strategies for decision-making
 */
export interface ModeContext {
  conversationId: string;
  userId: string;
  fileIds: string[];
  hasDocuments: boolean;
}

/**
 * Result from pre-processing step
 */
export interface PreProcessResult {
  /** Additional text to append to the system prompt */
  systemPromptAddition?: string;
  /** If true, skip the standard Claude API call */
  skipStandardProcessing?: boolean;
  /** Custom response to send instead of calling Claude */
  customResponse?: string;
}

/**
 * Result from post-processing step
 */
export interface PostProcessResult {
  /** If true, trigger automatic scoring after this message */
  triggerScoring?: boolean;
  /** If true, enrich context in the background */
  enrichInBackground?: boolean;
  /** If true, auto-summarize the conversation */
  autoSummarize?: boolean;
}

/**
 * IModeStrategy - Strategy interface for mode-specific behavior
 *
 * Implementations handle mode-specific logic for:
 * - Pre-processing before Claude API calls
 * - Post-processing after Claude responses
 * - System prompt enhancements
 */
export interface IModeStrategy {
  /**
   * The mode this strategy handles
   */
  readonly mode: ConversationMode;

  /**
   * Pre-process before Claude call
   *
   * Called before making the Claude API request. Can modify the system prompt,
   * skip processing entirely, or provide a custom response.
   *
   * @param context - Context about the current conversation
   * @returns Pre-processing result with optional modifications
   */
  preProcess(context: ModeContext): Promise<PreProcessResult>;

  /**
   * Post-process after Claude response
   *
   * Called after receiving the Claude API response. Can trigger additional
   * actions like scoring, background enrichment, or summarization.
   *
   * @param context - Context about the current conversation
   * @param response - The Claude API response text
   * @returns Post-processing result with optional actions to trigger
   */
  postProcess(context: ModeContext, response: string): Promise<PostProcessResult>;

  /**
   * Enhance system prompt for this mode
   *
   * Allows mode-specific additions to the base system prompt.
   * The base prompt is passed in and can be augmented or replaced.
   *
   * @param basePrompt - The base system prompt
   * @param context - Context about the current conversation
   * @returns The enhanced system prompt
   */
  enhanceSystemPrompt(basePrompt: string, context: ModeContext): Promise<string>;
}

/**
 * ModeStrategyFactory - Factory for retrieving mode-specific strategies
 *
 * Allows registration and retrieval of IModeStrategy implementations.
 * Strategies are keyed by their mode (consult, assessment, scoring).
 */
export class ModeStrategyFactory {
  private strategies: Map<ConversationMode, IModeStrategy> = new Map();

  /**
   * Register a strategy for a specific mode
   *
   * @param strategy - The strategy to register (uses strategy.mode as key)
   */
  register(strategy: IModeStrategy): void {
    if (this.strategies.has(strategy.mode)) {
      console.warn(
        `[ModeStrategyFactory] Overwriting strategy for mode: ${strategy.mode}`
      );
    }
    this.strategies.set(strategy.mode, strategy);
    console.log(
      `[ModeStrategyFactory] Registered strategy for mode: ${strategy.mode}`
    );
  }

  /**
   * Get the strategy for a specific mode
   *
   * @param mode - The conversation mode
   * @returns The registered strategy, or undefined if not registered
   */
  getStrategy(mode: ConversationMode): IModeStrategy | undefined {
    return this.strategies.get(mode);
  }

  /**
   * Check if a strategy is registered for a mode
   *
   * @param mode - The conversation mode to check
   * @returns true if a strategy is registered
   */
  hasStrategy(mode: ConversationMode): boolean {
    return this.strategies.has(mode);
  }

  /**
   * Get all registered modes
   *
   * @returns Array of registered mode names
   */
  getRegisteredModes(): ConversationMode[] {
    return Array.from(this.strategies.keys());
  }
}
