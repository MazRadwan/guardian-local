/**
 * Scoring Export Service
 *
 * Orchestrates export of scoring reports - retrieves scoring data
 * and generates exports in PDF and Word formats.
 *
 * Epic 20: Added narrative generation integration with concurrency-safe
 * claim pattern for on-demand narrative generation.
 */

import { IAssessmentRepository } from '../interfaces/IAssessmentRepository';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository';
import { IDimensionScoreRepository } from '../interfaces/IDimensionScoreRepository';
import { IResponseRepository } from '../interfaces/IResponseRepository';
import { IScoringPDFExporter, ScoringExportData } from '../interfaces/IScoringPDFExporter';
import { IScoringWordExporter } from '../interfaces/IScoringWordExporter';
import { IExportNarrativeGenerator } from '../interfaces/IExportNarrativeGenerator';
import { ScoringReportData, DimensionScoreData } from '../../domain/scoring/types';
import { AssessmentResultDTO, DimensionScoreDTO } from '../../domain/scoring/dtos';
import { SolutionType } from '../../domain/scoring/rubric';
import {
  selectTopResponses,
  determineSolutionType,
  buildFallbackNarrative,
  sleep,
} from './ScoringExportHelpers';

/**
 * Default claim time-to-live for narrative generation (5 minutes)
 */
const DEFAULT_CLAIM_TTL_MS = 300000;

/**
 * Maximum time to wait for narrative completion by another process
 */
const WAIT_TIMEOUT_MS = 5000;

/**
 * Polling interval when waiting for narrative completion
 */
const POLL_INTERVAL_MS = 500;

export class ScoringExportService {
  constructor(
    private readonly assessmentRepository: IAssessmentRepository,
    private readonly assessmentResultRepository: IAssessmentResultRepository,
    private readonly dimensionScoreRepository: IDimensionScoreRepository,
    private readonly responseRepository: IResponseRepository,
    private readonly pdfExporter: IScoringPDFExporter,
    private readonly wordExporter: IScoringWordExporter,
    private readonly narrativeGenerator: IExportNarrativeGenerator
  ) {}

  /**
   * Exports scoring report to PDF format
   * @param assessmentId Assessment ID
   * @param batchId Optional batch ID (uses latest if not provided)
   */
  async exportToPDF(assessmentId: string, batchId?: string): Promise<Buffer> {
    const data = await this.getScoringData(assessmentId, batchId);
    return this.pdfExporter.generatePDF(data);
  }

  /**
   * Exports scoring report to Word format
   * @param assessmentId Assessment ID
   * @param batchId Optional batch ID (uses latest if not provided)
   */
  async exportToWord(assessmentId: string, batchId?: string): Promise<Buffer> {
    const data = await this.getScoringData(assessmentId, batchId);
    return this.wordExporter.generateWord(data);
  }

  /**
   * Retrieves scoring data needed for export
   * Validates that assessment exists and has scoring results.
   * Ensures narrative is generated (on-demand if missing).
   */
  private async getScoringData(assessmentId: string, batchId?: string): Promise<ScoringExportData> {
    // Story 20.3.4: Combined lookup fetches assessment + vendor in single query
    const assessmentWithVendor = await this.assessmentRepository.findByIdWithVendor(assessmentId);
    if (!assessmentWithVendor) {
      throw new Error(`Assessment not found: ${assessmentId}`);
    }
    const { assessment, vendor } = assessmentWithVendor;

    // Get scoring result (latest or specific batch)
    const result = batchId
      ? await this.assessmentResultRepository.findByBatchId(assessmentId, batchId)
      : await this.assessmentResultRepository.findLatestByAssessmentId(assessmentId);

    if (!result) {
      throw new Error(
        batchId
          ? `Scoring result not found for batch: ${batchId}`
          : `No scoring results found for assessment: ${assessmentId}`
      );
    }

    // Get dimension scores
    const dimensionScores = await this.dimensionScoreRepository.findByBatchId(
      assessmentId,
      result.batchId
    );

    if (dimensionScores.length === 0) {
      throw new Error(`No dimension scores found for batch: ${result.batchId}`);
    }

    // Convert to domain format for export
    const dimensionScoreData: DimensionScoreData[] = dimensionScores.map((ds) => ({
      dimension: ds.dimension as DimensionScoreData['dimension'],
      score: ds.score,
      riskRating: ds.riskRating,
      findings: ds.findings,
    }));

    // Determine solution type for narrative generation
    const solutionType = determineSolutionType(assessment.solutionType);

    // Ensure narrative is generated (on-demand if missing)
    const narrativeReport = await this.ensureNarrative(
      result,
      dimensionScores,
      dimensionScoreData,
      vendor.name,
      assessment.solutionName || 'Unknown Solution',
      solutionType
    );

    const report: ScoringReportData = {
      assessmentId: result.assessmentId,
      batchId: result.batchId,
      payload: {
        compositeScore: result.compositeScore,
        recommendation: result.recommendation,
        overallRiskRating: result.overallRiskRating,
        executiveSummary: result.executiveSummary || '',
        keyFindings: result.keyFindings || [],
        disqualifyingFactors: result.disqualifyingFactors || [],
        dimensionScores: dimensionScoreData,
      },
      narrativeReport,
      rubricVersion: result.rubricVersion,
      modelId: result.modelId,
      scoringDurationMs: result.scoringDurationMs || 0,
    };

    return {
      report,
      vendorName: vendor.name,
      solutionName: assessment.solutionName || 'N/A',
      assessmentType: assessment.assessmentType || 'N/A',
      generatedAt: new Date(),
    };
  }

  /**
   * Ensure narrative report is available for export.
   *
   * Implements concurrency-safe generation:
   * 1. If narrative is already complete, return cached
   * 2. Try to claim generation (atomic)
   * 3. If claim fails, wait briefly for other process to complete
   * 4. Generate and persist if we have the claim
   * 5. Return fallback if generation fails
   */
  private async ensureNarrative(
    result: AssessmentResultDTO,
    dimensionScores: DimensionScoreDTO[],
    dimensionScoreData: DimensionScoreData[],
    vendorName: string,
    solutionName: string,
    solutionType: SolutionType
  ): Promise<string> {
    // 1. Check if narrative already complete
    // GPT Review Fix: Also treat existing narrativeReport as complete when status is null
    // This handles pre-existing scored assessments that have narrativeReport but no status
    if (result.narrativeReport && (result.narrativeStatus === 'complete' || result.narrativeStatus === null || result.narrativeStatus === undefined)) {
      return result.narrativeReport;
    }

    // 2. Try to claim the generation (atomic UPDATE)
    const claimed = await this.assessmentResultRepository.claimNarrativeGeneration(
      result.assessmentId,
      result.batchId,
      DEFAULT_CLAIM_TTL_MS
    );

    if (!claimed) {
      // Another request is generating - wait briefly or return fallback
      const refreshed = await this.waitForNarrative(
        result.assessmentId,
        result.batchId,
        WAIT_TIMEOUT_MS
      );
      if (refreshed?.narrativeReport) {
        return refreshed.narrativeReport;
      }
      return buildFallbackNarrative(result);
    }

    // 3. We have the claim - generate narrative
    try {
      // Get responses for evidence
      const responses = await this.responseRepository.findByBatchId(
        result.assessmentId,
        result.batchId
      );
      const topResponses = selectTopResponses(responses, dimensionScoreData);

      const narrative = await this.narrativeGenerator.generateNarrative({
        vendorName,
        solutionName,
        solutionType,
        result,
        dimensionScores: dimensionScoreData,
        responses: topResponses,
      });

      // 4. Finalize - update status to 'complete' with narrative
      await this.assessmentResultRepository.finalizeNarrativeGeneration(
        result.assessmentId,
        result.batchId,
        narrative,
        DEFAULT_CLAIM_TTL_MS
      );

      return narrative;
    } catch (error) {
      console.error('[ScoringExportService] Narrative generation failed:', error);
      // Mark as failed so next attempt can retry
      await this.assessmentResultRepository.failNarrativeGeneration(
        result.assessmentId,
        result.batchId,
        error instanceof Error ? error.message : 'Unknown error',
        DEFAULT_CLAIM_TTL_MS
      );
      return buildFallbackNarrative(result);
    }
  }

  /**
   * Wait for another process to complete narrative generation.
   * Polls until complete or timeout.
   */
  private async waitForNarrative(
    assessmentId: string,
    batchId: string,
    timeoutMs: number
  ): Promise<AssessmentResultDTO | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Wait before checking
      await sleep(POLL_INTERVAL_MS);

      // Check status
      const result = await this.assessmentResultRepository.findByBatchId(assessmentId, batchId);
      if (result?.narrativeStatus === 'complete' && result.narrativeReport) {
        return result;
      }

      // If status changed to failed, stop waiting
      if (result?.narrativeStatus === 'failed') {
        return null;
      }
    }

    return null;
  }
}
