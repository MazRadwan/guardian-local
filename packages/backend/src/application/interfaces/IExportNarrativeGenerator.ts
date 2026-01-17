/**
 * Port for Export Narrative Generator
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.2: Export Service Narrative Generation Integration
 *
 * Application layer port for generating narrative reports.
 * Implementation lives in infrastructure layer.
 */

import { SolutionType } from '../../domain/scoring/rubric.js';
import { AssessmentResultDTO, ResponseDTO } from '../../domain/scoring/dtos.js';
import { DimensionScoreData } from '../../domain/scoring/types.js';

/**
 * Parameters for narrative generation
 */
export interface NarrativeGenerationParams {
  /** Vendor company name */
  vendorName: string;
  /** Solution/product name */
  solutionName: string;
  /** Type of AI solution (determines weighting) */
  solutionType: SolutionType;
  /** Assessment result with scoring data */
  result: AssessmentResultDTO;
  /** Per-dimension scores with findings */
  dimensionScores: DimensionScoreData[];
  /** Selected vendor responses for evidence */
  responses: ResponseDTO[];
}

/**
 * Port for generating export narratives
 *
 * This port abstracts the LLM call for narrative generation.
 * The infrastructure implementation uses IExportNarrativePromptBuilder
 * and ILLMClient to generate the narrative.
 *
 * Clean Architecture: Application layer depends on this interface,
 * not on infrastructure (ClaudeClient, etc).
 */
export interface IExportNarrativeGenerator {
  /**
   * Generate a detailed markdown narrative for export
   *
   * @param params - Assessment data and evidence responses
   * @returns Generated markdown narrative
   * @throws Error if LLM call fails
   */
  generateNarrative(params: NarrativeGenerationParams): Promise<string>;
}
