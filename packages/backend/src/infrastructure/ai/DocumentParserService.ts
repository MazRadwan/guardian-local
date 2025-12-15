/**
 * DocumentParserService - Main document parsing implementation
 *
 * Part of Epic 16: Document Parser Infrastructure
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
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// pdf-parse default export workaround for ESM
// Type the function signature explicitly for the callable
type PdfParser = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
const pdf = ((pdfParse as { default?: unknown }).default ?? pdfParse) as PdfParser;

/** Default maximum characters to send to Claude (prevents context overflow) */
const DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 100000;

/** Truncation notice appended when text is truncated */
const TRUNCATION_NOTICE = '\n\n[NOTE: Document text was truncated due to length. Full document contains additional content.]';

// =============================================================================
// Types and Validation Helpers for AI JSON
// =============================================================================

/**
 * Shape of Claude's intake extraction response
 */
interface IntakeExtractionResponse {
  vendorName: string | null;
  solutionName: string | null;
  solutionType: string | null;
  industry: string | null;
  features: string[];
  claims: string[];
  integrations: string[];
  complianceMentions: string[];
  architectureNotes: string[];
  securityMentions: string[];
  confidence: number;
  suggestedQuestions: string[];
  coveredCategories: string[];
  gapCategories: string[];
}

/**
 * Shape of Claude's scoring extraction response
 */
interface ScoringExtractionResponse {
  assessmentId: string | null;
  vendorName: string | null;
  solutionName: string | null;
  responses: Array<{
    sectionNumber: number;
    sectionTitle: string | null;
    questionNumber: number;
    questionText: string;
    responseText: string;
    confidence: number;
    hasVisualContent: boolean;
    visualContentDescription: string | null;
  }>;
  expectedQuestionCount: number | null;
  parsedQuestionCount: number;
  unparsedQuestions: string[];
  isComplete: boolean;
  overallConfidence: number;
}

/**
 * Filter array to only include strings (hygiene for AI responses)
 */
function filterStrings(arr: unknown[]): string[] {
  return arr.filter((x): x is string => typeof x === 'string');
}

/**
 * Apply safe defaults to intake extraction response
 * Ensures arrays are always arrays of strings, numbers have defaults
 */
function applyIntakeDefaults(raw: Record<string, unknown>): IntakeExtractionResponse {
  return {
    vendorName: typeof raw.vendorName === 'string' ? raw.vendorName : null,
    solutionName: typeof raw.solutionName === 'string' ? raw.solutionName : null,
    solutionType: typeof raw.solutionType === 'string' ? raw.solutionType : null,
    industry: typeof raw.industry === 'string' ? raw.industry : null,
    features: Array.isArray(raw.features) ? filterStrings(raw.features) : [],
    claims: Array.isArray(raw.claims) ? filterStrings(raw.claims) : [],
    integrations: Array.isArray(raw.integrations) ? filterStrings(raw.integrations) : [],
    complianceMentions: Array.isArray(raw.complianceMentions) ? filterStrings(raw.complianceMentions) : [],
    architectureNotes: Array.isArray(raw.architectureNotes) ? filterStrings(raw.architectureNotes) : [],
    securityMentions: Array.isArray(raw.securityMentions) ? filterStrings(raw.securityMentions) : [],
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
    suggestedQuestions: Array.isArray(raw.suggestedQuestions) ? filterStrings(raw.suggestedQuestions) : [],
    coveredCategories: Array.isArray(raw.coveredCategories) ? filterStrings(raw.coveredCategories) : [],
    gapCategories: Array.isArray(raw.gapCategories) ? filterStrings(raw.gapCategories) : [],
  };
}

/**
 * Check if value is a non-null object (safe for property access)
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Apply safe defaults to scoring extraction response
 */
function applyScoringDefaults(raw: Record<string, unknown>): ScoringExtractionResponse {
  const rawResponses = Array.isArray(raw.responses) ? raw.responses : [];

  return {
    assessmentId: typeof raw.assessmentId === 'string' ? raw.assessmentId : null,
    vendorName: typeof raw.vendorName === 'string' ? raw.vendorName : null,
    solutionName: typeof raw.solutionName === 'string' ? raw.solutionName : null,
    // Filter out null/non-object elements before mapping
    responses: rawResponses
      .filter(isObject)
      .map((r) => ({
        sectionNumber: typeof r.sectionNumber === 'number' ? r.sectionNumber : 0,
        sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : null,
        questionNumber: typeof r.questionNumber === 'number' ? r.questionNumber : 0,
        questionText: typeof r.questionText === 'string' ? r.questionText : '',
        responseText: typeof r.responseText === 'string' ? r.responseText : '',
        confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
        hasVisualContent: r.hasVisualContent === true,
        visualContentDescription: typeof r.visualContentDescription === 'string' ? r.visualContentDescription : null,
      })),
    expectedQuestionCount: typeof raw.expectedQuestionCount === 'number' ? raw.expectedQuestionCount : null,
    parsedQuestionCount: typeof raw.parsedQuestionCount === 'number' ? raw.parsedQuestionCount : 0,
    unparsedQuestions: Array.isArray(raw.unparsedQuestions) ? filterStrings(raw.unparsedQuestions) : [],
    isComplete: raw.isComplete === true,
    overallConfidence: typeof raw.overallConfidence === 'number' ? raw.overallConfidence : 0.5,
  };
}

export class DocumentParserService
  implements IIntakeDocumentParser, IScoringDocumentParser
{
  constructor(
    /** Inject IClaudeClient interface for testability */
    private readonly claudeClient: IClaudeClient,
    /** Inject IVisionClient for image processing */
    private readonly visionClient: IVisionClient
  ) {}

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
      // 1. Extract content from document (text or vision-based)
      const { text: rawDocumentText, visionContent } = await this.extractContent(
        file,
        metadata.documentType,
        metadata.mimeType
      );

      // 2. Apply text length limits to prevent context overflow
      const maxChars = options?.maxExtractedTextChars ?? DEFAULT_MAX_EXTRACTED_TEXT_CHARS;
      const documentText = this.truncateText(rawDocumentText, maxChars);

      // 3. Build extraction prompt
      const prompt = buildIntakeExtractionPrompt({
        focusCategories: options?.focusCategories,
        filename: metadata.filename,
      });

      // 4. Call Claude for extraction (use Vision API for images)
      let responseContent: string;

      if (visionContent && visionContent.length > 0) {
        // Use Vision API for image-based documents
        const visionResponse = await this.visionClient.analyzeImages({
          images: visionContent,
          prompt: `${prompt}\n\nAnalyze the document shown in the image(s).`,
          systemPrompt: INTAKE_EXTRACTION_SYSTEM_PROMPT,
          maxTokens: 4096,
        });
        responseContent = visionResponse.content;
      } else {
        // Use text-based API for PDF/DOCX
        const response = await this.claudeClient.sendMessage(
          [
            {
              role: 'user',
              content: `${prompt}\n\nDOCUMENT CONTENT:\n${documentText}`,
            },
          ],
          { systemPrompt: INTAKE_EXTRACTION_SYSTEM_PROMPT, maxTokens: 4096 }
        );
        responseContent = response.content;
      }

      // 5. Parse and apply safe defaults
      const rawJson = this.parseJsonResponse(responseContent);
      if (!rawJson) {
        return this.createFailedIntakeResult(
          metadata,
          startTime,
          'Failed to parse extraction response'
        );
      }
      const extracted = applyIntakeDefaults(rawJson);

      // 6. Build successful result
      // Note: rawTextExcerpt is populated by service (not Claude) - first 2000 chars
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
        metadata,
        startTime,
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
      // 1. Extract content from document (text or vision-based)
      const { text: rawDocumentText, visionContent } = await this.extractContent(
        file,
        metadata.documentType,
        metadata.mimeType
      );

      // 2. Apply text length limits to prevent context overflow
      const maxChars = options?.maxExtractedTextChars ?? DEFAULT_MAX_EXTRACTED_TEXT_CHARS;
      const documentText = this.truncateText(rawDocumentText, maxChars);

      // 3. Build extraction prompt
      const prompt = buildScoringExtractionPrompt({
        expectedAssessmentId: options?.expectedAssessmentId,
        filename: metadata.filename,
      });

      // 4. Call Claude for extraction (use Vision API for images)
      let responseContent: string;

      if (visionContent && visionContent.length > 0) {
        // Use Vision API for image-based documents (scanned questionnaires)
        const visionResponse = await this.visionClient.analyzeImages({
          images: visionContent,
          prompt: `${prompt}\n\nAnalyze the questionnaire shown in the image(s).`,
          systemPrompt: SCORING_EXTRACTION_SYSTEM_PROMPT,
          maxTokens: 8192, // Larger for full questionnaire
        });
        responseContent = visionResponse.content;
      } else {
        // Use text-based API for PDF/DOCX
        const response = await this.claudeClient.sendMessage(
          [
            {
              role: 'user',
              content: `${prompt}\n\nDOCUMENT CONTENT:\n${documentText}`,
            },
          ],
          { systemPrompt: SCORING_EXTRACTION_SYSTEM_PROMPT, maxTokens: 8192 }
        );
        responseContent = response.content;
      }

      // 5. Parse and apply safe defaults
      const rawJson = this.parseJsonResponse(responseContent);
      if (!rawJson) {
        return this.createFailedScoringResult(
          metadata,
          startTime,
          'Failed to parse extraction response'
        );
      }
      const extracted = applyScoringDefaults(rawJson);

      // 6. Validate assessment ID - must exist
      if (!extracted.assessmentId) {
        throw new AssessmentNotFoundError(
          'Assessment ID not found in document header. Please ensure this is a Guardian-exported questionnaire.',
          metadata
        );
      }

      // 7. Validate assessment ID matches expected (if provided)
      if (options?.expectedAssessmentId && extracted.assessmentId !== options.expectedAssessmentId) {
        throw new QuestionnaireMismatchError(
          `Document assessment ID "${extracted.assessmentId}" does not match expected "${options.expectedAssessmentId}". Please ensure you uploaded the correct questionnaire.`,
          options.expectedAssessmentId,
          extracted.assessmentId
        );
      }

      // 8. Filter by confidence if threshold set
      let responses = extracted.responses;
      if (options?.minConfidence && !options.includeLowConfidence) {
        responses = responses.filter(
          (r) => r.confidence >= (options.minConfidence ?? 0.7)
        );
      }

      // 9. Build successful result
      return {
        success: true,
        confidence: extracted.overallConfidence,
        metadata,
        parseTimeMs: Date.now() - startTime,
        assessmentId: extracted.assessmentId,
        vendorName: extracted.vendorName,
        solutionName: extracted.solutionName,
        responses,
        expectedQuestionCount: extracted.expectedQuestionCount,
        parsedQuestionCount: responses.length,
        unparsedQuestions: extracted.unparsedQuestions,
        isComplete: extracted.isComplete,
      };
    } catch (error) {
      console.error('[DocumentParserService] Scoring parsing error:', error);

      // Re-throw specific errors for upstream handling
      if (error instanceof AssessmentNotFoundError || error instanceof QuestionnaireMismatchError) {
        throw error;
      }

      return this.createFailedScoringResult(
        metadata,
        startTime,
        error instanceof Error ? error.message : 'Unknown parsing error'
      );
    }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Extract content from document - returns text AND/OR vision content
   */
  private async extractContent(
    buffer: Buffer,
    documentType: DocumentType,
    mimeType: string
  ): Promise<{ text: string; visionContent: VisionContent[] | null }> {
    switch (documentType) {
      case 'pdf':
        // PDF: Extract text (for text-based PDFs)
        return {
          text: await this.extractPdfText(buffer),
          visionContent: null,
        };

      case 'docx':
        // DOCX: Text extraction only (no embedded images for MVP)
        return {
          text: await this.extractDocxText(buffer),
          visionContent: null,
        };

      case 'image':
        // Image: Use Vision API - prepare base64 content
        const visionContent = await this.visionClient.prepareDocument(
          buffer,
          mimeType
        );
        return {
          text: '', // No text extraction for images
          visionContent,
        };

      default:
        throw new DocumentParseError(`Unsupported document type: ${documentType}`);
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const data = await pdf(buffer);
    return data.text;
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  /**
   * Parse JSON from Claude response, returning raw object
   *
   * @param content - Raw response from Claude (may contain markdown code blocks)
   * @returns Parsed JSON object, or null if parsing fails
   */
  private parseJsonResponse(content: string): Record<string, unknown> | null {
    try {
      // Try to extract JSON from response (handle markdown code blocks)
      let jsonStr = content;

      // Check for markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      // Use isObject to fail fast on arrays, nulls, primitives
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

  /**
   * Truncate text to max characters, adding notice if truncated
   */
  private truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }

    // Guard: If maxChars is too small to fit notice + meaningful content,
    // just truncate without notice to avoid returning less than maxChars
    const minMeaningfulContent = 100;
    if (maxChars < TRUNCATION_NOTICE.length + minMeaningfulContent) {
      return text.slice(0, maxChars);
    }

    // Reserve space for truncation notice
    const truncatedText = text.slice(0, maxChars - TRUNCATION_NOTICE.length);
    return truncatedText + TRUNCATION_NOTICE;
  }

  private createFailedIntakeResult(
    metadata: DocumentMetadata,
    startTime: number,
    error: string
  ): IntakeParseResult {
    return {
      success: false,
      error,
      confidence: 0,
      metadata,
      parseTimeMs: Date.now() - startTime,
      context: null,
      suggestedQuestions: [],
      coveredCategories: [],
      gapCategories: [],
    };
  }

  private createFailedScoringResult(
    metadata: DocumentMetadata,
    startTime: number,
    error: string
  ): ScoringParseResult {
    return {
      success: false,
      error,
      confidence: 0,
      metadata,
      parseTimeMs: Date.now() - startTime,
      assessmentId: null,
      vendorName: null,
      solutionName: null,
      responses: [],
      expectedQuestionCount: null,
      parsedQuestionCount: 0,
      unparsedQuestions: [],
      isComplete: false,
    };
  }
}
