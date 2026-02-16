/**
 * Export Narrative Prompt - Barrel Re-export
 *
 * Original file split into:
 * - exportNarrativeSystemPrompt.ts (system prompt, cacheable)
 * - exportNarrativeUserPrompt.ts (user prompt with scoring data)
 *
 * This file preserves backward compatibility for existing imports.
 */
export { buildExportNarrativeSystemPrompt } from './exportNarrativeSystemPrompt.js';
export {
  buildExportNarrativeUserPrompt,
  truncateText,
  MAX_RESPONSE_LENGTH,
  MAX_TOP_RESPONSES,
} from './exportNarrativeUserPrompt.js';
