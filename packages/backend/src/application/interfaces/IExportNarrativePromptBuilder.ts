/**
 * Port for Export Narrative Prompt Builder
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.1: Export Narrative Prompt Builder
 *
 * This is a PORT (interface in application layer).
 * Implementation lives in infrastructure layer.
 */

import { SolutionType } from '../../domain/scoring/rubric.js';
import { RiskRating, Recommendation, DimensionScoreData } from '../../domain/scoring/types.js';

/**
 * Parameters for building the export narrative user prompt
 */
export interface NarrativePromptParams {
  /** Vendor company name */
  vendorName: string;
  /** Solution/product name */
  solutionName: string;
  /** Type of AI solution (determines weighting) */
  solutionType: SolutionType;
  /** Composite risk score (0-100) */
  compositeScore: number;
  /** Overall risk rating */
  overallRiskRating: RiskRating;
  /** Final recommendation */
  recommendation: Recommendation;
  /** Per-dimension scores with findings */
  dimensionScores: DimensionScoreData[];
  /** Key findings from scoring */
  keyFindings: string[];
  /** Executive summary from scoring */
  executiveSummary: string;
  /** Top vendor responses for evidence citations */
  topResponses: Array<{
    sectionNumber: number;
    questionNumber: number;
    questionText: string;
    responseText: string;
  }>;
}

/**
 * Port for building export narrative prompts
 *
 * The export narrative prompt generates detailed markdown analysis
 * at export time, suitable for PDF/Word reports.
 *
 * IMPLEMENTATION NOTES:
 * - System prompt is static (cacheable with prompt caching)
 * - User prompt varies per assessment
 * - Token budget: ~4,000-6,000 input, ~2,000-3,000 output
 */
export interface IExportNarrativePromptBuilder {
  /**
   * Build the narrative generation system prompt
   *
   * This prompt instructs Claude to generate detailed markdown analysis.
   * It includes rubric context for interpretation and output format requirements.
   *
   * @returns Static system prompt (cacheable)
   */
  buildNarrativeSystemPrompt(): string;

  /**
   * Build the narrative generation user prompt
   *
   * Contains scoring results and selected vendor responses for
   * evidence-based narrative generation.
   *
   * @param params - Assessment scoring data and top responses
   * @returns User prompt with scores and evidence
   */
  buildNarrativeUserPrompt(params: NarrativePromptParams): string;
}
