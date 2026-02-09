/**
 * ModeRouter - Pure function module for mode-specific configuration
 *
 * Extracted from MessageHandler (Story 28.9.4).
 * Returns config flags that ChatServer uses to gate pipeline branches.
 *
 * CRITICAL BEHAVIORS:
 * 1. Consult + assessment: enableTools=true (different tool arrays selected by ChatServer)
 * 2. Scoring: bypassClaude=true — triggers triggerScoringOnSend instead of Claude streaming
 * 3. Assessment: backgroundEnrich=true — enriches uploaded files after Claude response
 */

export interface ModeConfig {
  /** The conversation mode */
  mode: 'consult' | 'assessment' | 'scoring';
  /** Whether to enable Claude tools */
  enableTools: boolean;
  /** Whether to do background file enrichment (assessment mode) */
  backgroundEnrich: boolean;
  /** Whether to bypass Claude entirely and trigger scoring directly (scoring mode) */
  bypassClaude: boolean;
}

/**
 * Get mode-specific configuration for message processing.
 *
 * @param mode - The conversation mode
 * @returns Mode-specific configuration flags
 */
export function getModeConfig(mode: string): ModeConfig {
  switch (mode) {
    case 'assessment':
      return {
        mode: 'assessment',
        enableTools: true,
        backgroundEnrich: true,
        bypassClaude: false,
      };

    case 'scoring':
      return {
        mode: 'scoring',
        enableTools: false,
        backgroundEnrich: false,
        bypassClaude: true,
      };

    case 'consult':
    default:
      return {
        mode: 'consult',
        enableTools: true,
        backgroundEnrich: false,
        bypassClaude: false,
      };
  }
}
