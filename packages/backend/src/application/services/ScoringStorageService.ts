/**
 * ScoringStorageService - Storage-related helpers extracted from ScoringService.
 *
 * Phase 1 of ScoringService split (Epic 37, Sprint 1, Story 1).
 * Handles response storage, score storage, and document type derivation.
 *
 * Zero behavioral change from original ScoringService methods.
 */

import { IResponseRepository } from '../interfaces/IResponseRepository.js';
import { IDimensionScoreRepository } from '../interfaces/IDimensionScoreRepository.js';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository.js';
import { ITransactionRunner } from '../interfaces/ITransactionRunner.js';
import { ILLMClient } from '../interfaces/ILLMClient.js';
import { DocumentType, MIME_TYPE_MAP } from '../interfaces/IDocumentParser.js';
import { ScoringCompletePayload } from '../../domain/scoring/types.js';
import { RUBRIC_VERSION, SolutionType } from '../../domain/scoring/rubric.js';
import { ScoringError } from '../../domain/scoring/errors.js';
import { ScoringParseResult } from '../interfaces/IScoringDocumentParser.js';

export class ScoringStorageService {
  constructor(
    private responseRepo: IResponseRepository,
    private dimensionScoreRepo: IDimensionScoreRepository,
    private assessmentResultRepo: IAssessmentResultRepository,
    private transactionRunner: ITransactionRunner,
    private llmClient: ILLMClient
  ) {}

  /**
   * Store extracted responses to database
   */
  async storeResponses(
    parseResult: ScoringParseResult,
    assessmentId: string,
    batchId: string,
    fileId: string
  ): Promise<void> {
    const responses = parseResult.responses.map(r => ({
      assessmentId,
      batchId,
      fileId,
      sectionNumber: r.sectionNumber,
      questionNumber: r.questionNumber,
      questionText: r.questionText,
      responseText: r.responseText,
      confidence: r.confidence,
      hasVisualContent: r.hasVisualContent || false,
      // Convert null to undefined for DTO compatibility
      visualContentDescription: r.visualContentDescription ?? undefined,
    }));

    await this.responseRepo.createBatch(responses);
  }

  /**
   * Store dimension scores and assessment result atomically.
   * Uses a database transaction to ensure both inserts succeed or both fail.
   * This prevents partial writes (e.g., dimension scores without assessment result).
   */
  async storeScores(
    assessmentId: string,
    batchId: string,
    payload: ScoringCompletePayload,
    narrativeReport: string,
    durationMs: number
  ): Promise<void> {
    // Prepare dimension scores data
    const dimensionScoresData = payload.dimensionScores.map(ds => ({
      assessmentId,
      batchId,
      dimension: ds.dimension,
      score: ds.score,
      riskRating: ds.riskRating,
      findings: ds.findings,
    }));

    // Prepare assessment result data
    const assessmentResultData = {
      assessmentId,
      batchId,
      compositeScore: payload.compositeScore,
      recommendation: payload.recommendation,
      overallRiskRating: payload.overallRiskRating,
      narrativeReport,
      executiveSummary: payload.executiveSummary,
      keyFindings: payload.keyFindings,
      disqualifyingFactors: payload.disqualifyingFactors,
      rubricVersion: RUBRIC_VERSION,
      modelId: this.llmClient.getModelId(),
      rawToolPayload: payload,
      scoringDurationMs: durationMs,
    };

    // Wrap both inserts in a transaction for atomicity
    // If either fails, both are rolled back
    try {
      await this.transactionRunner.run(async (tx) => {
        await this.dimensionScoreRepo.createBatch(dimensionScoresData, tx);
        await this.assessmentResultRepo.create(assessmentResultData, tx);
      });
    } catch (error) {
      // Re-throw with clear transaction context
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new ScoringError(
        'STORAGE_FAILED',
        `Transaction failed while storing scores: ${errorMessage}`
      );
    }
  }

  /**
   * Derive DocumentType from MIME type
   * Uses MIME_TYPE_MAP from IDocumentParser for consistency
   */
  deriveDocumentType(mimeType: string): DocumentType {
    const docType = MIME_TYPE_MAP[mimeType];
    if (!docType) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
    return docType;
  }

  /**
   * Determine solution type from assessment for correct dimension weighting.
   *
   * Maps assessment.solutionType to rubric SolutionType for weight selection.
   * Only accepts exact rubric values - no keyword heuristics to prevent
   * mismatches between scoring weights and export narrative emphasis.
   *
   * @see docs/design/architecture/scoring-solution-type.md for field semantics
   * @see rubric.ts DIMENSION_WEIGHTS for weight definitions
   */
  determineSolutionType(assessment: { solutionType?: string | null }): SolutionType {
    // Valid rubric solution types
    const validTypes: SolutionType[] = ['clinical_ai', 'administrative_ai', 'patient_facing'];

    const solutionType = assessment.solutionType?.toLowerCase();

    if (!solutionType) {
      // Default to clinical_ai for healthcare assessments
      console.log('[ScoringStorageService] No solutionType set on assessment, defaulting to clinical_ai');
      return 'clinical_ai';
    }

    if (validTypes.includes(solutionType as SolutionType)) {
      console.log('[ScoringStorageService] Using solutionType:', solutionType);
      return solutionType as SolutionType;
    }

    // Log warning for invalid values
    console.warn(
      `[ScoringStorageService] Invalid solutionType "${assessment.solutionType}", defaulting to clinical_ai`
    );
    return 'clinical_ai';
  }
}
