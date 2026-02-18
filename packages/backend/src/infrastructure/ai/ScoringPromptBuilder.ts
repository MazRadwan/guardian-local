/**
 * ScoringPromptBuilder
 *
 * Implements IPromptBuilder port using scoring prompts
 * Part of Epic 15: Questionnaire Scoring & Analysis
 * Epic 37: ISO control injection via ISOControlRetrievalService
 * Story 39.3.4: Multi-block user prompt with per-block cache_control
 */

import { IPromptBuilder } from '../../application/interfaces/IPromptBuilder.js';
import type { ContentBlockForPrompt } from '../../application/interfaces/ILLMClient.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import type { ISOControlForPrompt } from '../../domain/compliance/types.js';
import type { ISOControlRetrievalService } from '../../application/services/ISOControlRetrievalService.js';
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  buildScoringUserPromptParts,
} from './prompts/scoringPrompt.js';

/**
 * Infrastructure implementation of IPromptBuilder
 * Delegates to scoringPrompt.ts functions
 * System prompt is static (rubric only); ISO controls go to user prompt (39.3.3)
 * Story 39.3.4: Returns multi-block content when ISO catalog present (per-block caching)
 */
export class ScoringPromptBuilder implements IPromptBuilder {
  private isoService?: ISOControlRetrievalService;

  constructor(isoService?: ISOControlRetrievalService) {
    this.isoService = isoService;
  }

  /** Build the scoring system prompt -- static rubric only, fully cacheable */
  buildScoringSystemPrompt(): string {
    return buildScoringSystemPrompt();
  }

  /**
   * Build user prompt with vendor responses, optional ISO catalog and applicability.
   *
   * Story 39.3.4: When isoCatalog is provided, returns ContentBlockForPrompt[]
   * with cache_control on the ISO catalog block for per-block caching.
   * When no isoCatalog, returns a plain string (backward compatible).
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
  }): string | ContentBlockForPrompt[] {
    // No ISO catalog => plain string (backward compatible)
    if (!params.isoCatalog || params.isoCatalog.length === 0) {
      return buildScoringUserPrompt(params);
    }

    // ISO catalog present => multi-block with cache_control on catalog block
    const { catalogSection, vendorSection } = buildScoringUserPromptParts(params);

    const blocks: ContentBlockForPrompt[] = [
      {
        type: 'text',
        text: catalogSection,
        cacheable: true,
      },
      {
        type: 'text',
        text: vendorSection,
      },
    ];

    return blocks;
  }

  /**
   * Fetch the full ISO control catalog for user prompt injection.
   * Delegates to ISOControlRetrievalService.getFullCatalog().
   * Returns empty array if no ISO service configured.
   */
  async fetchISOCatalog(): Promise<ISOControlForPrompt[]> {
    if (!this.isoService) return [];
    return this.isoService.getFullCatalog();
  }

  /**
   * Fetch applicable ISO controls for specific dimensions.
   * Delegates to ISOControlRetrievalService.getApplicableControls().
   * Returns empty array if no ISO service configured.
   */
  async fetchApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    if (!this.isoService) return [];
    return this.isoService.getApplicableControls(dimensions);
  }
}
