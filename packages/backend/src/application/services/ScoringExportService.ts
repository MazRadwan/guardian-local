/**
 * Scoring Export Service
 *
 * Orchestrates export of scoring reports - retrieves scoring data
 * and generates exports in PDF and Word formats
 */

import { IAssessmentRepository } from '../interfaces/IAssessmentRepository';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository';
import { IDimensionScoreRepository } from '../interfaces/IDimensionScoreRepository';
import { IScoringPDFExporter, ScoringExportData } from '../interfaces/IScoringPDFExporter';
import { IScoringWordExporter } from '../interfaces/IScoringWordExporter';
import { ScoringReportData, DimensionScoreData } from '../../domain/scoring/types';

export class ScoringExportService {
  constructor(
    private readonly assessmentRepository: IAssessmentRepository,
    private readonly assessmentResultRepository: IAssessmentResultRepository,
    private readonly dimensionScoreRepository: IDimensionScoreRepository,
    private readonly pdfExporter: IScoringPDFExporter,
    private readonly wordExporter: IScoringWordExporter
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
   * Validates that assessment exists and has scoring results
   */
  private async getScoringData(assessmentId: string, batchId?: string): Promise<ScoringExportData> {
    // Get assessment
    const assessment = await this.assessmentRepository.findById(assessmentId);
    if (!assessment) {
      throw new Error(`Assessment not found: ${assessmentId}`);
    }

    // Get vendor info
    const vendor = await this.assessmentRepository.getVendor(assessmentId);

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
      narrativeReport: result.narrativeReport || '',
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
}
