/**
 * ScoringPromptBuilder
 *
 * Implements IPromptBuilder port using scoring prompts
 * Part of Epic 15: Questionnaire Scoring & Analysis
 */

import { IPromptBuilder } from '../../application/interfaces/IPromptBuilder.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
} from './prompts/scoringPrompt.js';

/**
 * Infrastructure implementation of IPromptBuilder
 * Delegates to scoringPrompt.ts functions
 */
export class ScoringPromptBuilder implements IPromptBuilder {
  /**
   * Build the scoring system prompt with rubric
   * Uses buildScoringSystemPrompt from scoringPrompt.ts
   */
  buildScoringSystemPrompt(): string {
    return buildScoringSystemPrompt();
  }

  /**
   * Build user prompt with vendor responses
   * Uses buildScoringUserPrompt from scoringPrompt.ts
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
  }): string {
    return buildScoringUserPrompt(params);
  }
}
