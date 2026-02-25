import { randomUUID } from 'crypto';
import { IScoringService, ScoringInput, ScoringOutput, ScoringRehydrationResult } from '../interfaces/IScoringService.js';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository.js';
import { IAssessmentRepository } from '../interfaces/IAssessmentRepository.js';
import { IScoringDocumentParser, ScoringParseOptions } from '../interfaces/IScoringDocumentParser.js';
import { DocumentMetadata } from '../interfaces/IDocumentParser.js';
import { IFileRepository } from '../interfaces/IFileRepository.js';
import { IFileStorage } from '../interfaces/IFileStorage.js';
import { ScoringPayloadValidator } from '../../domain/scoring/ScoringPayloadValidator.js';
import { reconcilePayload } from '../../domain/scoring/ScoringPayloadReconciler.js';
import { ScoringReportData, ScoringProgressEvent } from '../../domain/scoring/types.js';
import { RUBRIC_VERSION } from '../../domain/scoring/rubric.js';
import { ScoringError, ScoringErrorCode, UnauthorizedError } from '../../domain/scoring/errors.js';
import { ScoringStorageService } from './ScoringStorageService.js';
import { ScoringLLMService } from './ScoringLLMService.js';
import { ScoringQueryService } from './ScoringQueryService.js';
import { ScoringRetryService } from './ScoringRetryService.js';
import type { ISOControlForPrompt } from '../../domain/compliance/types.js';

// Re-export for backward compatibility
export { ScoringError, UnauthorizedError };
export type { ScoringErrorCode };

/** Orchestrates scoring: file auth, parse, LLM scoring, validation (with retry), storage. */
export class ScoringService implements IScoringService {
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private assessmentResultRepo: IAssessmentResultRepository,
    private assessmentRepo: IAssessmentRepository,
    private fileRepo: IFileRepository,
    private fileStorage: IFileStorage,
    private documentParser: IScoringDocumentParser,
    private validator: ScoringPayloadValidator,
    private storageService: ScoringStorageService,
    private llmService: ScoringLLMService,
    private queryService: ScoringQueryService,
    private retryService: ScoringRetryService
  ) {}

  async score(
    input: ScoringInput,
    onProgress: (event: ScoringProgressEvent) => void
  ): Promise<ScoringOutput> {
    const { assessmentId: inputAssessmentId, conversationId, fileId, userId } = input;
    const batchId = randomUUID();
    const startTime = Date.now();

    // Setup abort controller
    const abortController = new AbortController();
    this.abortControllers.set(conversationId, abortController);

    try {
      // 1. Verify user owns the file
      onProgress({ status: 'parsing', message: 'Processing uploaded document...', progress: 5 });
      const fileRecord = await this.fileRepo.findByIdAndUser(fileId, userId);
      if (!fileRecord) {
        throw new ScoringError('UNAUTHORIZED_ASSESSMENT', `User ${userId} does not own file ${fileId}`);
      }

      if (abortController.signal.aborted) {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      // 2. Retrieve file buffer from storage
      const fileBuffer = await this.fileStorage.retrieve(fileRecord.storagePath);

      // 3. Parse document to extract assessmentId and responses
      onProgress({ status: 'parsing', message: 'Extracting text from document...', progress: 10 });
      const documentMetadata: DocumentMetadata = {
        filename: fileRecord.filename,
        mimeType: fileRecord.mimeType,
        sizeBytes: fileRecord.size,
        documentType: this.storageService.deriveDocumentType(fileRecord.mimeType),
        storagePath: fileRecord.storagePath,
        uploadedAt: fileRecord.createdAt,
        uploadedBy: userId,
      };

      const parseOptions: ScoringParseOptions = {
        expectedAssessmentId: inputAssessmentId,
        minConfidence: 0.7,
        abortSignal: abortController.signal,
        onProgress,
      };
      onProgress({ status: 'parsing', message: 'Analyzing document format...', progress: 15 });
      const parseResult = await this.documentParser.parseForResponses(
        fileBuffer,
        documentMetadata,
        parseOptions
      );

      if (!parseResult.success && parseResult.error === 'Parse aborted') {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      const assessmentId = inputAssessmentId || parseResult.assessmentId;

      if (!assessmentId) {
        throw new ScoringError(
          'PARSE_FAILED',
          'No assessment ID found. Please ensure this is a Guardian-exported questionnaire with an embedded Assessment ID.'
        );
      }

      if (inputAssessmentId && parseResult.assessmentId && parseResult.assessmentId !== inputAssessmentId) {
        throw new ScoringError(
          'PARSE_FAILED',
          `Assessment ID mismatch: document contains ${parseResult.assessmentId}, expected ${inputAssessmentId}`
        );
      }

      // Diagnostic: log parseResult summary to trace extraction failures
      console.log('[ScoringService] parseResult:', {
        success: parseResult.success,
        error: parseResult.error,
        assessmentId: parseResult.assessmentId,
        vendorName: parseResult.vendorName,
        confidence: parseResult.confidence,
        responsesCount: parseResult.responses.length,
        parsedQuestionCount: parseResult.parsedQuestionCount,
        expectedQuestionCount: parseResult.expectedQuestionCount,
        isComplete: parseResult.isComplete,
      });

      if (parseResult.responses.length === 0) {
        throw new ScoringError('PARSE_FAILED', 'No responses found in document');
      }

      // 4. Reject low-confidence parses
      const minConfidence = 0.7;
      if (parseResult.confidence < minConfidence) {
        throw new ScoringError(
          'PARSE_CONFIDENCE_TOO_LOW',
          `Parse confidence ${parseResult.confidence.toFixed(2)} is below minimum ${minConfidence}`
        );
      }

      // 5. Verify assessment exists and user owns it
      const assessmentWithVendor = await this.assessmentRepo.findByIdWithVendor(assessmentId);
      if (!assessmentWithVendor) {
        throw new ScoringError('ASSESSMENT_NOT_FOUND', `Assessment not found: ${assessmentId}`);
      }
      const { assessment, vendor } = assessmentWithVendor;
      if (assessment.createdBy !== userId) {
        throw new ScoringError('UNAUTHORIZED_ASSESSMENT', `User ${userId} does not own assessment ${assessmentId}`);
      }

      // 6. Check assessment status >= 'exported'
      const validStatuses = ['exported', 'scored'];
      if (!validStatuses.includes(assessment.status)) {
        throw new ScoringError(
          'ASSESSMENT_NOT_EXPORTED',
          `Assessment must be exported before scoring (current status: ${assessment.status})`
        );
      }

      // 7. Rate limit (5 per day per assessment)
      const todayCount = await this.assessmentResultRepo.countTodayForAssessment(assessmentId);
      if (todayCount >= 5) {
        throw new ScoringError(
          'RATE_LIMITED',
          'Maximum 5 scoring attempts per day exceeded for this assessment'
        );
      }

      // TODO: File hash de-duplication (1 hour window) - skipped for MVP
      if (abortController.signal.aborted) {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      // 8. Store responses
      onProgress({ status: 'parsing', message: `Found ${parseResult.parsedQuestionCount} of ${parseResult.expectedQuestionCount ?? '?'} responses`, progress: 50 });
      await this.storageService.storeResponses(parseResult, assessmentId, batchId, fileId);

      // 9. Determine solution type for composite score weighting
      const solutionType = this.storageService.determineSolutionType(assessment);

      // 10. Fetch ISO controls (graceful degradation on failure)
      onProgress({ status: 'scoring', message: 'Loading compliance controls...', progress: 55 });
      let catalogControls: ISOControlForPrompt[] = [];
      try {
        catalogControls = await this.llmService.fetchISOCatalog();
      } catch (err) {
        console.warn('[ScoringService] ISO catalog fetch failed, proceeding without:', err);
      }
      onProgress({ status: 'scoring', message: 'Analyzing vendor responses against risk rubric...', progress: 60 });

      // 11. Score with Claude
      const { narrativeReport, payload } = await this.llmService.scoreWithClaude(
        parseResult,
        vendor.name,
        assessment.solutionName || 'Unknown Solution',
        solutionType,
        abortController.signal,
        (message) => onProgress({ status: 'scoring', message, progress: 65 }),
        { catalogControls, applicableControls: [] }
      );

      if (abortController.signal.aborted) {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      // 12. Normalize, reconcile math, then validate payload (with structural retry)
      onProgress({ status: 'validating', message: 'Validating scoring results...', progress: 90 });
      const normalizedPayload = this.validator.normalizePayload(payload);
      const { payload: reconciledPayload, corrections } = reconcilePayload(normalizedPayload, solutionType);
      if (corrections.length > 0) {
        console.info(`[ScoringService] Reconciler applied ${corrections.length} math correction(s)`);
      }
      let validationResult = this.validator.validate(reconciledPayload, solutionType);
      let finalNarrative = narrativeReport;

      if (!validationResult.valid) {
        console.error('Scoring payload validation failed:', validationResult.errors);
        throw new ScoringError('SCORING_FAILED', `Invalid scoring payload: ${validationResult.errors.join(', ')}`);
      }

      // Retry once on structural violations (sub-score values, sum mismatch, composite arithmetic)
      if (validationResult.structuralViolations.length > 0) {
        const isoOptions = { catalogControls, applicableControls: [] as ISOControlForPrompt[] };
        const retryResult = await this.retryService.retryWithCorrection(
          validationResult.structuralViolations,
          {
            parseResult, vendorName: vendor.name,
            solutionName: assessment.solutionName || 'Unknown Solution',
            solutionType, abortSignal: abortController.signal,
            onMessage: (msg) => onProgress({ status: 'validating', message: msg, progress: 92 }),
            isoOptions,
          }
        );
        validationResult = retryResult.validationResult;
        finalNarrative = retryResult.llmResult.narrativeReport;
      }

      // Log sub-score warnings (soft validation -- does not reject payload)
      if (validationResult.warnings.length > 0) {
        console.warn(
          `[ScoringService] Sub-score validation warnings for assessment ${assessmentId}:`,
          validationResult.warnings
        );
      }

      // 13. Store scores
      onProgress({ status: 'validating', message: 'Storing assessment results...', progress: 95 });
      await this.storageService.storeScores(
        assessmentId, batchId, validationResult.sanitized!,
        finalNarrative, Date.now() - startTime
      );

      // 14. Update assessment status
      await this.assessmentRepo.updateStatus(assessmentId, 'scored');

      // 15. Build report data
      const report: ScoringReportData = {
        assessmentId, batchId,
        payload: validationResult.sanitized!,
        narrativeReport: finalNarrative,
        rubricVersion: RUBRIC_VERSION,
        modelId: this.llmService.getModelId(),
        scoringDurationMs: Date.now() - startTime,
      };

      const compositeScore = validationResult.sanitized!.compositeScore;
      onProgress({ status: 'complete', message: `Risk assessment complete -- score: ${compositeScore}/100`, progress: 100 });

      return { success: true, batchId, report };
    } catch (error) {
      if (error instanceof ScoringError) {
        onProgress({ status: 'error', message: error.message, error: error.message });
        return { success: false, batchId, error: error.message, code: error.code };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress({ status: 'error', message: 'Scoring failed', error: errorMessage });
      return { success: false, batchId, error: errorMessage, code: 'SCORING_FAILED' };
    } finally {
      this.abortControllers.delete(conversationId);
    }
  }

  abort(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(conversationId);
    }
  }

  /** Get scoring result for a conversation. */
  async getResultForConversation(
    conversationId: string,
    userId: string
  ): Promise<ScoringRehydrationResult | null> {
    return this.queryService.getResultForConversation(conversationId, userId);
  }
}
