/**
 * DocumentParserService - Scoring document parsing implementation
 *
 * Part of Epic 16: Document Parser Infrastructure
 * Epic 39: Regex extraction routing (Story 39.1.4)
 *
 * Story 39.4.1: IIntakeDocumentParser extracted to IntakeDocumentParser.ts.
 * Story 39.4.2: Shared helpers extracted to DocumentParserHelpers.ts.
 * This service now only implements IScoringDocumentParser.
 */

import type { IClaudeClient } from '../../application/interfaces/IClaudeClient.js';
import type {
  IVisionClient,
  VisionContent,
} from '../../application/interfaces/IVisionClient.js';
import type { IQuestionRepository } from '../../application/interfaces/IQuestionRepository.js';
import {
  IScoringDocumentParser,
  ScoringParseResult,
  ScoringParseOptions,
  ExtractedResponse,
  AssessmentNotFoundError,
  QuestionnaireMismatchError,
} from '../../application/interfaces/IScoringDocumentParser.js';
import {
  DocumentMetadata,
} from '../../application/interfaces/IDocumentParser.js';
import {
  buildScoringExtractionPrompt,
  SCORING_EXTRACTION_SYSTEM_PROMPT,
} from './prompts/scoringExtraction.js';
import {
  applyScoringDefaults,
  isLikelyGuardianDocument,
} from './parsing-helpers.js';
import { ExtractionRoutingService } from '../extraction/ExtractionRoutingService.js';
import {
  extractContent,
  truncateText,
  parseJsonResponse,
  TRUNCATION_NOTICE,
} from './DocumentParserHelpers.js';

/** Environment variable to disable pre-check (for testing or edge cases). */
const ENABLE_GUARDIAN_PRECHECK = process.env.GUARDIAN_PRECHECK !== 'false';

/** Maximum characters per individual response (Story 20.4.2). */
const DEFAULT_MAX_RESPONSE_CHARS = 2000;

/** Notice appended when individual response is truncated. */
const RESPONSE_TRUNCATION_NOTICE = ' [truncated]';

/** Minimum markers needed to pass pre-check */
const MIN_MARKERS_REQUIRED = 2;

export class DocumentParserService implements IScoringDocumentParser {
  private readonly routingService: ExtractionRoutingService;

  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly visionClient: IVisionClient,
    private readonly questionRepo: IQuestionRepository,
  ) {
    this.routingService = new ExtractionRoutingService(questionRepo);
  }

  // =========================================================================
  // IScoringDocumentParser Implementation
  // =========================================================================

  async parseForResponses(
    file: Buffer,
    metadata: DocumentMetadata,
    options?: ScoringParseOptions
  ): Promise<ScoringParseResult> {
    const startTime = Date.now();

    try {
      if (options?.abortSignal?.aborted) {
        return this.createFailedScoringResult(metadata, startTime, 'Parse aborted');
      }

      const { text: rawDocumentText, visionContent } = await extractContent(
        file, metadata.documentType, metadata.mimeType, this.visionClient
      );

      if (options?.abortSignal?.aborted) {
        return this.createFailedScoringResult(metadata, startTime, 'Parse aborted');
      }

      // Guardian pre-check: routing signal (text-based docs only)
      const isGuardian = this.checkGuardianSignature(rawDocumentText, metadata);
      if (!isGuardian) {
        return this.createFailedScoringResult(
          metadata, startTime,
          'Document does not appear to be a Guardian questionnaire. Please upload an exported questionnaire PDF or Word document.'
        );
      }

      // Story 39.1.4: Try regex extraction first (Guardian docs only)
      const regexResult = await this.routingService.tryRegexExtraction(
        rawDocumentText, file, metadata, startTime, options?.expectedAssessmentId,
      );

      if (regexResult.result) {
        // Story 39.2.4: Emit per-section progress for regex path
        const sections = [...new Set(regexResult.result.responses.map(r => r.sectionNumber))].sort((a, b) => a - b);
        for (const [i] of sections.entries()) {
          options?.onProgress?.({
            status: 'parsing',
            message: `Matching responses... section ${i + 1} of ${sections.length}`,
            progress: 15 + Math.round(((i + 1) / sections.length) * 35),
          });
        }
        // Apply per-response truncation to regex results too
        const maxResponseChars = options?.maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS;
        regexResult.result.responses = this.truncateResponses(
          regexResult.result.responses, maxResponseChars,
        );
        return regexResult.result;
      }

      // Fall through to Claude extraction
      // Story 39.2.4: Single progress message for opaque Claude extraction
      options?.onProgress?.({ status: 'parsing', message: 'Processing document with AI...', progress: 15 });
      console.log('[DocumentParserService] Extraction method: claude');
      return await this.parseWithClaude(
        rawDocumentText, visionContent, file, metadata, options, startTime,
      );
    } catch (error) {
      if (options?.abortSignal?.aborted) {
        return this.createFailedScoringResult(metadata, startTime, 'Parse aborted');
      }
      console.error('[DocumentParserService] Scoring parsing error:', error);
      if (error instanceof AssessmentNotFoundError || error instanceof QuestionnaireMismatchError) {
        throw error;
      }
      return this.createFailedScoringResult(
        metadata, startTime,
        error instanceof Error ? error.message : 'Unknown parsing error'
      );
    }
  }

  // =========================================================================
  // Private: Guardian Pre-Check
  // =========================================================================

  private checkGuardianSignature(rawText: string, metadata: DocumentMetadata): boolean {
    if (!ENABLE_GUARDIAN_PRECHECK || metadata.documentType === 'image') {
      return true;
    }

    const preCheck = isLikelyGuardianDocument(rawText);

    if (!preCheck.likely) {
      console.log(
        '[DocumentParserService] Pre-check failed, markers found:',
        preCheck.foundMarkers.length, '(need at least', MIN_MARKERS_REQUIRED, ')'
      );
      return false;
    }

    console.log('[DocumentParserService] Pre-check passed, markers found:', preCheck.foundMarkers.length);
    return true;
  }

  // =========================================================================
  // Private: Claude Extraction Path
  // =========================================================================

  private async parseWithClaude(
    rawDocumentText: string,
    visionContent: VisionContent[] | null,
    _buffer: Buffer,
    metadata: DocumentMetadata,
    options: ScoringParseOptions | undefined,
    startTime: number,
  ): Promise<ScoringParseResult> {
    const maxChars = options?.maxExtractedTextChars ?? 100000;
    const documentText = truncateText(rawDocumentText, maxChars, TRUNCATION_NOTICE);

    const prompt = buildScoringExtractionPrompt({
      expectedAssessmentId: options?.expectedAssessmentId,
      filename: metadata.filename,
    });

    let responseContent: string;

    if (visionContent && visionContent.length > 0) {
      const visionResponse = await this.visionClient.analyzeImages({
        images: visionContent,
        prompt: `${prompt}\n\nAnalyze the questionnaire shown in the image(s).`,
        systemPrompt: SCORING_EXTRACTION_SYSTEM_PROMPT,
        maxTokens: 16384,
        abortSignal: options?.abortSignal,
      });
      responseContent = visionResponse.content;
    } else {
      const response = await this.claudeClient.sendMessage(
        [{ role: 'user', content: `${prompt}\n\nDOCUMENT CONTENT:\n${documentText}` }],
        { systemPrompt: SCORING_EXTRACTION_SYSTEM_PROMPT, maxTokens: 16384, abortSignal: options?.abortSignal, usePromptCache: true }
      );
      responseContent = response.content;
    }

    const rawJson = parseJsonResponse(responseContent, '[DocumentParserService]');
    if (!rawJson) {
      return this.createFailedScoringResult(metadata, startTime, 'Failed to parse extraction response');
    }
    const extracted = applyScoringDefaults(rawJson);

    if (!extracted.assessmentId) {
      throw new AssessmentNotFoundError(
        'Assessment ID not found in document header. Please ensure this is a Guardian-exported questionnaire.',
        metadata
      );
    }

    if (options?.expectedAssessmentId && extracted.assessmentId !== options.expectedAssessmentId) {
      throw new QuestionnaireMismatchError(
        `Document assessment ID "${extracted.assessmentId}" does not match expected "${options.expectedAssessmentId}". Please ensure you uploaded the correct questionnaire.`,
        options.expectedAssessmentId,
        extracted.assessmentId
      );
    }

    const maxResponseChars = options?.maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS;
    extracted.responses = this.truncateResponses(extracted.responses, maxResponseChars);

    let responses = extracted.responses;
    if (options?.minConfidence && !options.includeLowConfidence) {
      responses = responses.filter(
        (r) => r.confidence >= (options.minConfidence ?? 0.7)
      );
    }

    const claudeParseTime = Date.now() - startTime;
    console.log(`[DocumentParserService] Parse time: ${claudeParseTime}ms (claude)`);

    return {
      success: true,
      confidence: extracted.overallConfidence,
      metadata,
      parseTimeMs: claudeParseTime,
      assessmentId: extracted.assessmentId,
      vendorName: extracted.vendorName,
      solutionName: extracted.solutionName,
      responses,
      expectedQuestionCount: extracted.expectedQuestionCount,
      parsedQuestionCount: responses.length,
      unparsedQuestions: extracted.unparsedQuestions,
      isComplete: extracted.isComplete,
    };
  }

  // =========================================================================
  // Private: Response Truncation
  // =========================================================================

  private truncateResponses(
    responses: ExtractedResponse[],
    maxChars: number = DEFAULT_MAX_RESPONSE_CHARS
  ): ExtractedResponse[] {
    let truncatedCount = 0;

    const result = responses.map((response) => {
      if (response.responseText.length <= maxChars) return response;
      truncatedCount++;
      const minMeaningfulContent = 10;
      if (maxChars < RESPONSE_TRUNCATION_NOTICE.length + minMeaningfulContent) {
        return { ...response, responseText: response.responseText.slice(0, maxChars) };
      }
      const truncateAt = maxChars - RESPONSE_TRUNCATION_NOTICE.length;
      return { ...response, responseText: response.responseText.slice(0, truncateAt) + RESPONSE_TRUNCATION_NOTICE };
    });

    if (truncatedCount > 0) {
      console.log(`[DocumentParserService] Truncated ${truncatedCount} responses to ${maxChars} chars`);
    }
    return result;
  }

  // =========================================================================
  // Result Builder
  // =========================================================================

  private createFailedScoringResult(
    metadata: DocumentMetadata, startTime: number, error: string
  ): ScoringParseResult {
    return {
      success: false, error, confidence: 0, metadata,
      parseTimeMs: Date.now() - startTime,
      assessmentId: null, vendorName: null, solutionName: null,
      responses: [], expectedQuestionCount: null, parsedQuestionCount: 0,
      unparsedQuestions: [], isComplete: false,
    };
  }
}
