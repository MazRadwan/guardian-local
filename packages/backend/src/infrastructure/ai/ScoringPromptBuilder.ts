/**
 * ScoringPromptBuilder
 *
 * Implements IPromptBuilder port using scoring prompts
 * Part of Epic 15: Questionnaire Scoring & Analysis
 * Epic 37: ISO control injection via ISOControlRetrievalService
 */

import { IPromptBuilder } from '../../application/interfaces/IPromptBuilder.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import type { ISOControlForPrompt } from '../../domain/compliance/types.js';
import type { ISOControlRetrievalService } from '../../application/services/ISOControlRetrievalService.js';
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
} from './prompts/scoringPrompt.js';

/**
 * Infrastructure implementation of IPromptBuilder
 * Delegates to scoringPrompt.ts functions
 * Optionally injects ISO controls when ISOControlRetrievalService is provided
 */
export class ScoringPromptBuilder implements IPromptBuilder {
  private isoService?: ISOControlRetrievalService;

  constructor(isoService?: ISOControlRetrievalService) {
    this.isoService = isoService;
  }

  /** Build the scoring system prompt with rubric and optional ISO catalog */
  buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string {
    return buildScoringSystemPrompt(isoControls);
  }

  /** Build user prompt with vendor responses and optional ISO applicability */
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
  }): string {
    return buildScoringUserPrompt(params);
  }

  /**
   * Fetch the full ISO control catalog for system prompt injection.
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
