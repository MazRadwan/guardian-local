import { randomUUID } from 'crypto';
import { IScoringService, ScoringInput, ScoringOutput, ScoringRehydrationResult } from '../interfaces/IScoringService.js';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository.js';
import { IAssessmentRepository } from '../interfaces/IAssessmentRepository.js';
import { IScoringDocumentParser, ScoringParseOptions } from '../interfaces/IScoringDocumentParser.js';
import { DocumentMetadata } from '../interfaces/IDocumentParser.js';
import { IFileRepository } from '../interfaces/IFileRepository.js';
import { IFileStorage } from '../interfaces/IFileStorage.js';
import { ScoringPayloadValidator } from '../../domain/scoring/ScoringPayloadValidator.js';
import { ScoringReportData, ScoringProgressEvent } from '../../domain/scoring/types.js';
import { RUBRIC_VERSION } from '../../domain/scoring/rubric.js';
import { ScoringError, ScoringErrorCode, UnauthorizedError } from '../../domain/scoring/errors.js';
import { ScoringStorageService } from './ScoringStorageService.js';
import { ScoringLLMService } from './ScoringLLMService.js';
import { ScoringQueryService } from './ScoringQueryService.js';

// Re-export for backward compatibility
export { ScoringError, UnauthorizedError };
export type { ScoringErrorCode };

/**
 * ScoringService orchestrates the scoring workflow:
 * 1. Fetch uploaded file (with authorization)
 * 2. Parse document to extract responses
 * 3. Send to Claude with scoring prompt (via ScoringLLMService)
 * 4. Validate and store results (via ScoringStorageService)
 *
 * Epic 37 Sprint 1: Delegates to ScoringStorageService, ScoringLLMService,
 * and ScoringQueryService for separation of concerns.
 */
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
    private queryService: ScoringQueryService
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
      // 1. AUTHORIZATION: Verify user owns the file
      // Epic 18: Move file retrieval before assessment check since assessmentId may come from file
      onProgress({ status: 'parsing', message: 'Retrieving uploaded document...' });
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
      // Epic 18: Parse first to extract assessmentId from document when not provided in input
      onProgress({ status: 'parsing', message: 'Extracting responses from document...' });

      // Build full DocumentMetadata as required by IScoringDocumentParser
      const documentMetadata: DocumentMetadata = {
        filename: fileRecord.filename,
        mimeType: fileRecord.mimeType,
        sizeBytes: fileRecord.size,
        documentType: this.storageService.deriveDocumentType(fileRecord.mimeType),
        storagePath: fileRecord.storagePath,
        uploadedAt: fileRecord.createdAt,
        uploadedBy: userId,
      };

      // Epic 18: Only set expectedAssessmentId if provided in input
      // Story 20.3.3: Pass abort signal to parser
      const parseOptions: ScoringParseOptions = {
        expectedAssessmentId: inputAssessmentId, // May be undefined - that's OK
        minConfidence: 0.7,
        abortSignal: abortController.signal,
      };
      const parseResult = await this.documentParser.parseForResponses(
        fileBuffer,
        documentMetadata,
        parseOptions
      );

      // Story 20.3.3: Check if parsing was aborted
      if (!parseResult.success && parseResult.error === 'Parse aborted') {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      // Epic 18: Determine assessmentId - use from document if not provided in input
      const assessmentId = inputAssessmentId || parseResult.assessmentId;

      if (!assessmentId) {
        throw new ScoringError(
          'PARSE_FAILED',
          'No assessment ID found. Please ensure this is a Guardian-exported questionnaire with an embedded Assessment ID.'
        );
      }

      // Validate assessment ID match if both provided
      if (inputAssessmentId && parseResult.assessmentId && parseResult.assessmentId !== inputAssessmentId) {
        throw new ScoringError(
          'PARSE_FAILED',
          `Assessment ID mismatch: document contains ${parseResult.assessmentId}, expected ${inputAssessmentId}`
        );
      }

      if (parseResult.responses.length === 0) {
        throw new ScoringError('PARSE_FAILED', 'No responses found in document');
      }

      // 4. VALIDATION GATE: Check parse confidence >= 0.7
      // Epic 15 Story 5a.4: Quality - reject low-confidence parses
      const minConfidence = 0.7;
      if (parseResult.confidence < minConfidence) {
        throw new ScoringError(
          'PARSE_CONFIDENCE_TOO_LOW',
          `Parse confidence ${parseResult.confidence.toFixed(2)} is below minimum ${minConfidence}`
        );
      }

      // 5. AUTHORIZATION: Verify assessment exists and user owns it
      // Epic 18: Moved after parsing since assessmentId may come from document
      // Story 20.3.4: Combined lookup fetches assessment + vendor in single query
      const assessmentWithVendor = await this.assessmentRepo.findByIdWithVendor(assessmentId);
      if (!assessmentWithVendor) {
        throw new ScoringError('ASSESSMENT_NOT_FOUND', `Assessment not found: ${assessmentId}`);
      }
      const { assessment, vendor } = assessmentWithVendor;
      // Assessment entity uses 'createdBy' for the owner
      if (assessment.createdBy !== userId) {
        throw new ScoringError('UNAUTHORIZED_ASSESSMENT', `User ${userId} does not own assessment ${assessmentId}`);
      }

      // 6. VALIDATION GATE: Check assessment status >= 'exported'
      // Epic 15 Story 5a.4: Security - prevent scoring non-exported assessments
      // Only 'exported' and 'scored' are valid - cannot score before export
      const validStatuses = ['exported', 'scored'];
      if (!validStatuses.includes(assessment.status)) {
        throw new ScoringError(
          'ASSESSMENT_NOT_EXPORTED',
          `Assessment must be exported before scoring (current status: ${assessment.status})`
        );
      }

      // 7. VALIDATION GATE: Rate limit (5 per day per assessment)
      // Epic 15 Story 5a.4: Cost - prevent abuse
      const todayCount = await this.assessmentResultRepo.countTodayForAssessment(assessmentId);
      if (todayCount >= 5) {
        throw new ScoringError(
          'RATE_LIMITED',
          'Maximum 5 scoring attempts per day exceeded for this assessment'
        );
      }

      // 6. VALIDATION GATE: File hash de-duplication (1 hour window)
      // Epic 15 Story 5a.4: Cost - prevent duplicate scoring of same file
      // Note: fileHash would need to be computed from fileBuffer
      // For MVP, we'll skip this check (would require crypto.createHash)
      // TODO: Implement file hash de-duplication when needed

      if (abortController.signal.aborted) {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      // 5. Store responses (delegated to ScoringStorageService)
      onProgress({ status: 'parsing', message: 'Storing extracted responses...' });
      await this.storageService.storeResponses(parseResult, assessmentId, batchId, fileId);

      // 6. Determine solution type for correct weighting (delegated to ScoringStorageService)
      // Note: vendor already fetched via findByIdWithVendor (Story 20.3.4)
      const solutionType = this.storageService.determineSolutionType(assessment);

      // 8. Fetch ISO controls via ScoringLLMService (Epic 37: ISO enrichment)
      // Graceful degradation: ISO enrichment is optional — fallback to empty arrays on failure
      onProgress({ status: 'scoring', message: 'Analyzing scoring...' });
      let catalogControls: import('../../domain/compliance/types.js').ISOControlForPrompt[] = [];
      try {
        catalogControls = await this.llmService.fetchISOCatalog();
      } catch {
        // ISO enrichment failure is non-critical — baseline scoring still runs
      }

      // 9. Score with Claude (delegated to ScoringLLMService)
      // Note: applicableControls = catalogControls when all dimensions apply (avoids duplicate fetch/tokens)
      const { narrativeReport, payload } = await this.llmService.scoreWithClaude(
        parseResult,
        vendor.name,
        assessment.solutionName || 'Unknown Solution',
        solutionType,
        abortController.signal,
        (message) => onProgress({ status: 'scoring', message }),
        { catalogControls, applicableControls: catalogControls }
      );

      if (abortController.signal.aborted) {
        return { success: false, batchId, error: 'Scoring aborted' };
      }

      // 9. Validate payload
      onProgress({ status: 'validating', message: 'Validating scoring results...' });
      const validationResult = this.validator.validate(payload);

      if (!validationResult.valid) {
        console.error('Scoring payload validation failed:', validationResult.errors);
        throw new Error(`Invalid scoring payload: ${validationResult.errors.join(', ')}`);
      }

      // Log sub-score warnings (soft validation — does not reject payload)
      if (validationResult.warnings.length > 0) {
        console.warn(
          `[ScoringService] Sub-score validation warnings for assessment ${assessmentId}:`,
          validationResult.warnings
        );
      }

      // 10. Store scores (delegated to ScoringStorageService)
      onProgress({ status: 'validating', message: 'Storing assessment results...' });
      await this.storageService.storeScores(
        assessmentId,
        batchId,
        validationResult.sanitized!,
        narrativeReport,
        Date.now() - startTime
      );

      // 11. Update assessment status
      await this.assessmentRepo.updateStatus(assessmentId, 'scored');

      // 12. Build report data
      const report: ScoringReportData = {
        assessmentId,
        batchId,
        payload: validationResult.sanitized!,
        narrativeReport,
        rubricVersion: RUBRIC_VERSION,
        modelId: this.llmService.getModelId(),
        scoringDurationMs: Date.now() - startTime,
      };

      onProgress({ status: 'complete', message: 'Scoring complete!' });

      return { success: true, batchId, report };
    } catch (error) {
      // Epic 15 Story 5a.4: Propagate structured error codes
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

  /**
   * Epic 22.1.1: Get scoring result for a conversation.
   * Delegates to ScoringQueryService.
   */
  async getResultForConversation(
    conversationId: string,
    userId: string
  ): Promise<ScoringRehydrationResult | null> {
    return this.queryService.getResultForConversation(conversationId, userId);
  }
}
