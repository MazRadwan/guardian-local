// NOTE: 498 LOC — exceeds 300 LOC limit. Sprint 4 (39.4.1, 39.4.2) will extract
// IntakeDocumentParser and DocumentParserHelpers to bring this under 300.

/**
 * DocumentParserService - Main document parsing implementation
 *
 * Part of Epic 16: Document Parser Infrastructure
 * Epic 39: Regex extraction routing (Story 39.1.4)
 *
 * This service implements both intake and scoring parsing interfaces,
 * sharing the underlying Vision integration while maintaining clean
 * separation at the interface level.
 */

import type { IClaudeClient } from '../../application/interfaces/IClaudeClient.js';
import type {
  IVisionClient,
  VisionContent,
} from '../../application/interfaces/IVisionClient.js';
import type { IQuestionRepository } from '../../application/interfaces/IQuestionRepository.js';
import {
  IIntakeDocumentParser,
  IntakeContext,
  IntakeParseResult,
  IntakeParseOptions,
} from '../../application/interfaces/IIntakeDocumentParser.js';
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
  DocumentType,
  DocumentParseError,
} from '../../application/interfaces/IDocumentParser.js';
import {
  buildIntakeExtractionPrompt,
  INTAKE_EXTRACTION_SYSTEM_PROMPT,
} from './prompts/intakeExtraction.js';
import {
  buildScoringExtractionPrompt,
  SCORING_EXTRACTION_SYSTEM_PROMPT,
} from './prompts/scoringExtraction.js';
import {
  applyIntakeDefaults,
  applyScoringDefaults,
  isObject,
  isLikelyGuardianDocument,
} from './parsing-helpers.js';
import { ExtractionRoutingService } from '../extraction/ExtractionRoutingService.js';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Default maximum characters to send to Claude (prevents context overflow) */
const DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 100000;

/** Truncation notice appended when text is truncated */
const TRUNCATION_NOTICE = '\n\n[NOTE: Document text was truncated due to length. Full document contains additional content.]';

/** Environment variable to disable pre-check (for testing or edge cases). */
const ENABLE_GUARDIAN_PRECHECK = process.env.GUARDIAN_PRECHECK !== 'false';

/** Maximum characters per individual response (Story 20.4.2). */
const DEFAULT_MAX_RESPONSE_CHARS = 2000;

/** Notice appended when individual response is truncated. */
const RESPONSE_TRUNCATION_NOTICE = ' [truncated]';

/** Minimum markers needed to pass pre-check */
const MIN_MARKERS_REQUIRED = 2;

export class DocumentParserService
  implements IIntakeDocumentParser, IScoringDocumentParser
{
  private readonly routingService: ExtractionRoutingService;

  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly visionClient: IVisionClient,
    private readonly questionRepo: IQuestionRepository,
  ) {
    this.routingService = new ExtractionRoutingService(questionRepo);
  }

  // =========================================================================
  // IIntakeDocumentParser Implementation
  // =========================================================================

  async parseForContext(
    file: Buffer,
    metadata: DocumentMetadata,
    options?: IntakeParseOptions
  ): Promise<IntakeParseResult> {
    const startTime = Date.now();

    try {
      const { text: rawDocumentText, visionContent } = await this.extractContent(
        file, metadata.documentType, metadata.mimeType
      );

      const maxChars = options?.maxExtractedTextChars ?? DEFAULT_MAX_EXTRACTED_TEXT_CHARS;
      const documentText = this.truncateText(rawDocumentText, maxChars);

      const prompt = buildIntakeExtractionPrompt({
        focusCategories: options?.focusCategories,
        filename: metadata.filename,
      });

      let responseContent: string;

      if (visionContent && visionContent.length > 0) {
        const visionResponse = await this.visionClient.analyzeImages({
          images: visionContent,
          prompt: `${prompt}\n\nAnalyze the document shown in the image(s).`,
          systemPrompt: INTAKE_EXTRACTION_SYSTEM_PROMPT,
          maxTokens: 4096,
        });
        responseContent = visionResponse.content;
      } else {
        const response = await this.claudeClient.sendMessage(
          [{ role: 'user', content: `${prompt}\n\nDOCUMENT CONTENT:\n${documentText}` }],
          { systemPrompt: INTAKE_EXTRACTION_SYSTEM_PROMPT, maxTokens: 4096, usePromptCache: true }
        );
        responseContent = response.content;
      }

      const rawJson = this.parseJsonResponse(responseContent);
      if (!rawJson) {
        return this.createFailedIntakeResult(metadata, startTime, 'Failed to parse extraction response');
      }
      const extracted = applyIntakeDefaults(rawJson);

      return {
        success: true,
        confidence: extracted.confidence,
        metadata,
        parseTimeMs: Date.now() - startTime,
        context: {
          ...extracted,
          rawTextExcerpt: documentText.slice(0, 2000),
          sourceFilePath: metadata.storagePath,
        },
        suggestedQuestions: extracted.suggestedQuestions ?? [],
        coveredCategories: extracted.coveredCategories ?? [],
        gapCategories: extracted.gapCategories ?? [],
      };
    } catch (error) {
      console.error('[DocumentParserService] Intake parsing error:', error);
      return this.createFailedIntakeResult(
        metadata, startTime,
        error instanceof Error ? error.message : 'Unknown parsing error'
      );
    }
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

      const { text: rawDocumentText, visionContent } = await this.extractContent(
        file, metadata.documentType, metadata.mimeType
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

  /**
   * Check Guardian signature. Returns true if Guardian doc or if pre-check
   * is disabled/bypassed (images). Returns false if non-Guardian text doc.
   */
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
    const maxChars = options?.maxExtractedTextChars ?? DEFAULT_MAX_EXTRACTED_TEXT_CHARS;
    const documentText = this.truncateText(rawDocumentText, maxChars);

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

    const rawJson = this.parseJsonResponse(responseContent);
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
  // Private: Content Extraction
  // =========================================================================

  private async extractContent(
    buffer: Buffer,
    documentType: DocumentType,
    mimeType: string
  ): Promise<{ text: string; visionContent: VisionContent[] | null }> {
    switch (documentType) {
      case 'pdf':
        return { text: await this.extractPdfText(buffer), visionContent: null };
      case 'docx':
        return { text: await this.extractDocxText(buffer), visionContent: null };
      case 'image':
        const visionContent = await this.visionClient.prepareDocument(buffer, mimeType);
        return { text: '', visionContent };
      default:
        throw new DocumentParseError(`Unsupported document type: ${documentType}`);
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // =========================================================================
  // Private: JSON Parsing
  // =========================================================================

  private parseJsonResponse(content: string): Record<string, unknown> | null {
    try {
      let jsonStr = content.trim();

      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '');
          jsonStr = jsonStr.replace(/\s*```\s*$/, '');
        }
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
        }
      }

      try {
        const parsed = JSON.parse(jsonStr.trim());
        if (isObject(parsed)) return parsed;
      } catch {
        // Fall through to repair
      }

      const repairedJson = this.attemptJsonRepair(jsonStr.trim());
      const parsed = JSON.parse(repairedJson);
      if (!isObject(parsed)) {
        console.error('[DocumentParserService] Parsed JSON is not an object');
        return null;
      }
      return parsed;
    } catch (error) {
      console.error('[DocumentParserService] JSON parse error:', error);
      return null;
    }
  }

  private attemptJsonRepair(jsonStr: string): string {
    let repaired = jsonStr;
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    repaired = repaired.replace(/}(\s*){/g, '},$1{');
    repaired = repaired.replace(/"(\s*){/g, '",$1{');

    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';

    return repaired;
  }

  // =========================================================================
  // Private: Text Truncation
  // =========================================================================

  private truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const minMeaningfulContent = 100;
    if (maxChars < TRUNCATION_NOTICE.length + minMeaningfulContent) {
      return text.slice(0, maxChars);
    }
    return text.slice(0, maxChars - TRUNCATION_NOTICE.length) + TRUNCATION_NOTICE;
  }

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
  // Result Builders
  // =========================================================================

  private createFailedIntakeResult(
    metadata: DocumentMetadata, startTime: number, error: string
  ): IntakeParseResult {
    return {
      success: false, error, confidence: 0, metadata,
      parseTimeMs: Date.now() - startTime,
      context: null, suggestedQuestions: [], coveredCategories: [], gapCategories: [],
    };
  }

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
