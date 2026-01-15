import { randomUUID } from 'crypto';
import { IScoringService, ScoringInput, ScoringOutput } from '../interfaces/IScoringService.js';
import { IResponseRepository } from '../interfaces/IResponseRepository.js';
import { IDimensionScoreRepository } from '../interfaces/IDimensionScoreRepository.js';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository.js';
import { IAssessmentRepository } from '../interfaces/IAssessmentRepository.js';
import { IScoringDocumentParser, ScoringParseResult, ScoringParseOptions } from '../interfaces/IScoringDocumentParser.js';
import { DocumentMetadata, DocumentType, MIME_TYPE_MAP } from '../interfaces/IDocumentParser.js';
import { IFileRepository } from '../interfaces/IFileRepository.js';
import { IFileStorage } from '../interfaces/IFileStorage.js';
import { ILLMClient } from '../interfaces/ILLMClient.js';
import { IPromptBuilder } from '../interfaces/IPromptBuilder.js';
import { ITransactionRunner } from '../interfaces/ITransactionRunner.js';
import { ScoringPayloadValidator } from '../../domain/scoring/ScoringPayloadValidator.js';
import { ScoringReportData, ScoringProgressEvent, ScoringCompletePayload } from '../../domain/scoring/types.js';
import { RUBRIC_VERSION, SolutionType } from '../../domain/scoring/rubric.js';
import { scoringCompleteTool } from '../../domain/scoring/tools/scoringComplete.js';
import { ScoringError, ScoringErrorCode, UnauthorizedError } from '../../domain/scoring/errors.js';

// Re-export for backward compatibility
export { ScoringError, UnauthorizedError };
export type { ScoringErrorCode };

/**
 * ScoringService orchestrates the scoring workflow:
 * 1. Fetch uploaded file (with authorization)
 * 2. Parse document to extract responses
 * 3. Send to Claude with scoring prompt
 * 4. Validate and store results
 */
export class ScoringService implements IScoringService {
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private responseRepo: IResponseRepository,
    private dimensionScoreRepo: IDimensionScoreRepository,
    private assessmentResultRepo: IAssessmentResultRepository,
    private assessmentRepo: IAssessmentRepository,
    private fileRepo: IFileRepository,
    private fileStorage: IFileStorage,
    private documentParser: IScoringDocumentParser,
    private llmClient: ILLMClient,
    private promptBuilder: IPromptBuilder,
    private validator: ScoringPayloadValidator,
    private transactionRunner: ITransactionRunner
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
        documentType: this.deriveDocumentType(fileRecord.mimeType),
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

      // 5. Store responses
      onProgress({ status: 'parsing', message: 'Storing extracted responses...' });
      await this.storeResponses(parseResult, assessmentId, batchId, fileId);

      // 6. Determine solution type for correct weighting
      // Note: vendor already fetched via findByIdWithVendor (Story 20.3.4)
      const solutionType = this.determineSolutionType(assessment);

      // 8. Score with Claude
      onProgress({ status: 'scoring', message: 'Analyzing responses against rubric...' });
      const { narrativeReport, payload } = await this.scoreWithClaude(
        parseResult,
        vendor.name,
        assessment.solutionName || 'Unknown Solution',
        solutionType,
        abortController.signal,
        (message) => onProgress({ status: 'scoring', message })
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

      // 10. Store scores
      onProgress({ status: 'validating', message: 'Storing assessment results...' });
      await this.storeScores(
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
        modelId: this.llmClient.getModelId(),
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
   * Store extracted responses to database
   */
  private async storeResponses(
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
   * Derive DocumentType from MIME type
   * Uses MIME_TYPE_MAP from IDocumentParser for consistency
   */
  private deriveDocumentType(mimeType: string): DocumentType {
    const docType = MIME_TYPE_MAP[mimeType];
    if (!docType) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
    return docType;
  }

  /**
   * Determine solution type from assessment for correct dimension weighting
   * Uses assessment.solutionType which maps directly to rubric SolutionType
   */
  private determineSolutionType(assessment: { solutionType?: string | null }): SolutionType {
    // Valid rubric solution types
    const validTypes: SolutionType[] = ['clinical_ai', 'administrative_ai', 'patient_facing'];

    const solutionType = assessment.solutionType?.toLowerCase();

    if (!solutionType) {
      // Default to clinical_ai for healthcare assessments
      return 'clinical_ai';
    }

    if (validTypes.includes(solutionType as SolutionType)) {
      return solutionType as SolutionType;
    }

    // Log warning for invalid values
    console.warn(
      `[ScoringService] Invalid solutionType "${assessment.solutionType}", defaulting to clinical_ai`
    );
    return 'clinical_ai';
  }

  /**
   * Send responses to Claude for scoring
   *
   * NOTE: Uses ports (ILLMClient, IPromptBuilder) - no infrastructure imports
   */
  private async scoreWithClaude(
    parseResult: ScoringParseResult,
    vendorName: string,
    solutionName: string,
    solutionType: SolutionType,
    abortSignal: AbortSignal,
    onMessage: (message: string) => void
  ): Promise<{ narrativeReport: string; payload: unknown }> {
    // Build prompts using port (not infrastructure import)
    const systemPrompt = this.promptBuilder.buildScoringSystemPrompt();
    const userPrompt = this.promptBuilder.buildScoringUserPrompt({
      vendorName,
      solutionName,
      solutionType, // CRITICAL: Determines composite score weights
      responses: parseResult.responses.map(r => ({
        sectionNumber: r.sectionNumber,
        questionNumber: r.questionNumber,
        questionText: r.questionText,
        responseText: r.responseText,
      })),
    });

    // Call LLM via port (not ClaudeClient directly)
    let narrativeReport = '';
    let toolPayload: unknown = null;

    await this.llmClient.streamWithTool({
      systemPrompt,
      userPrompt,
      tools: [scoringCompleteTool],
      // CRITICAL: Force Claude to use the scoring_complete tool
      // Without this, Claude may write narrative but skip calling the tool
      tool_choice: { type: 'any' },
      // Enable prompt caching for the large scoring rubric system prompt
      // Reduces input token costs by 30-50% for repeated scoring requests
      usePromptCache: true,
      // Scoring tool payload needs ~1200 tokens. 2500 provides ~2x safety margin.
      // Reduced from default 8192 to optimize response time and costs.
      maxTokens: 2500,
      abortSignal,
      onTextDelta: (delta) => {
        narrativeReport += delta;
        // Emit progress updates periodically
        if (narrativeReport.length % 500 === 0) {
          onMessage('Generating risk assessment...');
        }
      },
      onToolUse: (toolName, input) => {
        if (toolName === 'scoring_complete') {
          toolPayload = input;
        }
      },
    });

    // P2 Fix: Check if abort caused the missing tool payload
    // When user aborts mid-stream, streamWithTool exits early before tool fires
    if (!toolPayload) {
      if (abortSignal.aborted) {
        throw new Error('Scoring aborted');
      }
      throw new Error('Claude did not call scoring_complete tool');
    }

    return { narrativeReport, payload: toolPayload };
  }

  /**
   * Store dimension scores and assessment result atomically.
   * Uses a database transaction to ensure both inserts succeed or both fail.
   * This prevents partial writes (e.g., dimension scores without assessment result).
   */
  private async storeScores(
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
}
