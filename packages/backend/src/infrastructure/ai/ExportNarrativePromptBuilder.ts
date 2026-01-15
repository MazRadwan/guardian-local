/**
 * ExportNarrativePromptBuilder
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.1: Export Narrative Prompt Builder
 *
 * Implements IExportNarrativePromptBuilder port using export narrative prompts.
 * Generates detailed markdown narrative for PDF/Word export.
 */

import {
  IExportNarrativePromptBuilder,
  NarrativePromptParams,
} from '../../application/interfaces/IExportNarrativePromptBuilder.js';
import {
  buildExportNarrativeSystemPrompt,
  buildExportNarrativeUserPrompt,
} from './prompts/exportNarrativePrompt.js';

/**
 * Infrastructure implementation of IExportNarrativePromptBuilder
 *
 * Delegates to exportNarrativePrompt.ts functions for prompt generation.
 * This class provides the port implementation for dependency injection.
 */
export class ExportNarrativePromptBuilder implements IExportNarrativePromptBuilder {
  /**
   * Build the narrative generation system prompt
   *
   * Uses buildExportNarrativeSystemPrompt from exportNarrativePrompt.ts.
   * This prompt is static and suitable for prompt caching.
   *
   * @returns System prompt with narrative generation instructions
   */
  buildNarrativeSystemPrompt(): string {
    return buildExportNarrativeSystemPrompt();
  }

  /**
   * Build the narrative generation user prompt
   *
   * Uses buildExportNarrativeUserPrompt from exportNarrativePrompt.ts.
   * Contains scoring results and selected vendor responses.
   *
   * @param params - Assessment scoring data and top responses
   * @returns User prompt with scores and evidence
   */
  buildNarrativeUserPrompt(params: NarrativePromptParams): string {
    return buildExportNarrativeUserPrompt(params);
  }
}
