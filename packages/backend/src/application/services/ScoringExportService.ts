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
import { AssessmentResultDTO, ResponseDTO, DimensionScoreDTO } from '../../domain/scoring/dtos';
import { SolutionType } from '../../domain/scoring/rubric';

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
    const solutionType = this.determineSolutionType(assessment.solutionType);

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
      return this.buildFallbackNarrative(result);
    }

    // 3. We have the claim - generate narrative
    try {
      // Get responses for evidence
      const responses = await this.responseRepository.findByBatchId(
        result.assessmentId,
        result.batchId
      );
      const topResponses = this.selectTopResponses(responses, dimensionScoreData);

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
      return this.buildFallbackNarrative(result);
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
      await this.sleep(POLL_INTERVAL_MS);

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

  /**
   * Build fallback narrative when LLM generation fails.
   * Uses executiveSummary + keyFindings with warning.
   */
  private buildFallbackNarrative(result: AssessmentResultDTO): string {
    const findings = (result.keyFindings || []).map((f) => `- ${f}`).join('\n');

    return `## Executive Summary

${result.executiveSummary || 'No executive summary available.'}

## Key Findings

${findings || 'No key findings available.'}

---
*Note: Detailed analysis was not available for this export. Please contact support if this issue persists.*
`;
  }

  /**
   * Select top vendor responses for narrative evidence.
   *
   * Implements tiered fallback strategy:
   * 1. Use findings.evidenceRefs if available
   * 2. Fall back to section-to-dimension mapping
   * 3. Fall back to even distribution across sections
   *
   * @param responses All responses for the batch
   * @param dimensionScores Dimension scores with potential evidence refs
   * @returns Selected responses (max 30, truncated to 500 chars each)
   */
  private selectTopResponses(
    responses: ResponseDTO[],
    dimensionScores: DimensionScoreData[]
  ): ResponseDTO[] {
    const selected: ResponseDTO[] = [];
    const usedIds = new Set<string>();

    // Strategy 1: Try to use findings references if available
    for (const ds of dimensionScores) {
      if (ds.findings?.evidenceRefs && Array.isArray(ds.findings.evidenceRefs)) {
        for (const ref of ds.findings.evidenceRefs.slice(0, 2)) {
          const match = responses.find(
            (r) =>
              r.questionNumber === ref.questionNumber &&
              r.sectionNumber === ref.sectionNumber &&
              !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
          );
          if (match) {
            selected.push(match);
            usedIds.add(`${match.sectionNumber}-${match.questionNumber}`);
          }
        }
      }
    }

    // Strategy 2: Fallback - select by dimension/section mapping
    if (selected.length < 20) {
      const sectionToDimension = this.getSectionDimensionMapping();

      for (const ds of dimensionScores) {
        const relevantSections = sectionToDimension[ds.dimension] || [];
        for (const section of relevantSections) {
          const sectionResponses = responses.filter(
            (r) =>
              r.sectionNumber === section &&
              !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
          );
          // Take up to 2 per section
          for (const r of sectionResponses.slice(0, 2)) {
            if (selected.length >= 30) break;
            selected.push(r);
            usedIds.add(`${r.sectionNumber}-${r.questionNumber}`);
          }
        }
        if (selected.length >= 30) break;
      }
    }

    // Strategy 3: Ultimate fallback - distribute evenly across all sections
    if (selected.length < 10) {
      const remaining = responses.filter(
        (r) => !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
      );
      const perSection = Math.ceil(20 / 10); // ~2 per section
      const bySectionMap = new Map<number, ResponseDTO[]>();

      for (const r of remaining) {
        if (!bySectionMap.has(r.sectionNumber)) {
          bySectionMap.set(r.sectionNumber, []);
        }
        bySectionMap.get(r.sectionNumber)!.push(r);
      }

      for (const [, sectionResps] of bySectionMap) {
        for (const r of sectionResps.slice(0, perSection)) {
          if (selected.length >= 30) break;
          selected.push(r);
        }
        if (selected.length >= 30) break;
      }
    }

    // Truncate each response for token budgeting
    return selected.map((r) => ({
      ...r,
      responseText: r.responseText.slice(0, 500) + (r.responseText.length > 500 ? '...' : ''),
    }));
  }

  /**
   * Maps dimensions to questionnaire sections.
   * Based on Guardian questionnaire structure.
   */
  private getSectionDimensionMapping(): Record<string, number[]> {
    return {
      clinical_risk: [1, 2],
      privacy_risk: [3],
      security_risk: [4],
      technical_credibility: [5, 6],
      operational_excellence: [7],
      vendor_capability: [8],
      ai_transparency: [5],
      ethical_considerations: [9],
      regulatory_compliance: [3, 10],
      sustainability: [8],
    };
  }

  /**
   * Determine solution type from assessment solutionType string.
   * Aligns with ScoringService.determineSolutionType() for consistent weighting.
   *
   * GPT Review Fix: Use same logic as ScoringService to ensure narrative
   * weighting aligns with actual scoring weights.
   */
  private determineSolutionType(solutionType: string | null): SolutionType {
    // P2 Fix: Use same strict logic as ScoringService to ensure narrative
    // weighting aligns with actual scoring weights.
    // Removed keyword heuristics that could cause mismatches.
    const validTypes: SolutionType[] = ['clinical_ai', 'administrative_ai', 'patient_facing'];

    if (!solutionType) {
      // Default to clinical_ai for healthcare assessments (aligned with ScoringService)
      return 'clinical_ai';
    }

    const lower = solutionType.toLowerCase();

    // Only accept exact rubric types - no keyword heuristics
    // This ensures export narrative uses same weighting as scoring
    if (validTypes.includes(lower as SolutionType)) {
      return lower as SolutionType;
    }

    // Log warning for invalid values (aligned with ScoringService)
    console.warn(
      `[ScoringExportService] Invalid solutionType "${solutionType}", defaulting to clinical_ai`
    );
    return 'clinical_ai';
  }

  /**
   * Sleep utility for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
