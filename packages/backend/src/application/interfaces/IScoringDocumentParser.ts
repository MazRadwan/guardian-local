/**
 * IScoringDocumentParser - Interface for parsing completed questionnaires
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * This interface defines the contract for extracting Q&A responses from
 * completed assessment questionnaires. The extracted responses feed into
 * the scoring pipeline.
 *
 * Clean Architecture Note:
 * - This interface lives in the Application layer
 * - Scoring module depends only on this interface
 * - Infrastructure layer provides the implementation
 * - Scoring module does NOT know about IIntakeDocumentParser
 */

import {
  ParseResultBase,
  ParseOptions,
  DocumentMetadata,
  DocumentParseError,
} from './IDocumentParser.js';
import type { ScoringStatus } from '../../domain/scoring/types.js';

// Re-export for convenience
export { DocumentParseError };

/**
 * A single extracted response from the questionnaire
 */
export interface ExtractedResponse {
  /** Section number from questionnaire (1-based) */
  sectionNumber: number;

  /** Section title if extractable */
  sectionTitle: string | null;

  /** Question number within section (1-based) */
  questionNumber: number;

  /** The question text (for verification) */
  questionText: string;

  /** The vendor's response text */
  responseText: string;

  /** Confidence in this extraction (0-1) */
  confidence: number;

  /** Whether response contains/references a screenshot or image */
  hasVisualContent: boolean;

  /** Description of visual content if present */
  visualContentDescription: string | null;
}

/**
 * Result of parsing a questionnaire for scoring
 */
export interface ScoringParseResult extends ParseResultBase {
  /** Assessment ID extracted from document header */
  assessmentId: string | null;

  /** Vendor name extracted from document */
  vendorName: string | null;

  /** Solution name extracted from document */
  solutionName: string | null;

  /** All extracted responses */
  responses: ExtractedResponse[];

  /** Total questions expected (from questionnaire structure) */
  expectedQuestionCount: number | null;

  /** Number of questions successfully parsed */
  parsedQuestionCount: number;

  /** Questions that couldn't be parsed (by section.question) */
  unparsedQuestions: string[];

  /** Whether all expected questions were found */
  isComplete: boolean;
}

/**
 * Options specific to scoring document parsing
 */
export interface ScoringParseOptions extends ParseOptions {
  /** Expected assessment ID (for validation) */
  expectedAssessmentId?: string;

  /** Minimum confidence threshold (default: 0.7) */
  minConfidence?: number;

  /** Whether to include low-confidence extractions (default: false) */
  includeLowConfidence?: boolean;

  /** Abort signal to cancel parsing (Story 20.3.3) */
  abortSignal?: AbortSignal;

  /** Maximum characters per response before truncation (default: 2000, Story 20.4.2) */
  maxResponseChars?: number;

  /** Progress callback for granular extraction updates (Story 39.2.4).
   *  Uses ScoringStatus type for type safety. */
  onProgress?: (event: { status: ScoringStatus; message: string; progress?: number }) => void;
}

/**
 * Interface for scoring document parsing
 *
 * Implementations of this interface extract Q&A responses from completed
 * questionnaires for the scoring pipeline.
 *
 * @example
 * ```typescript
 * class DocumentParserService implements IScoringDocumentParser {
 *   async parseForResponses(
 *     file: Buffer,
 *     metadata: DocumentMetadata,
 *     options?: ScoringParseOptions
 *   ): Promise<ScoringParseResult> {
 *     // Use Claude Vision to extract Q&A pairs
 *     // Match against expected questionnaire structure
 *     // Return structured responses
 *   }
 * }
 * ```
 */
export interface IScoringDocumentParser {
  /**
   * Parse a completed questionnaire to extract responses for scoring
   *
   * @param file - The file buffer to parse
   * @param metadata - Metadata about the uploaded file
   * @param options - Optional parsing configuration
   * @returns Parsed responses with assessment ID and confidence scores
   *
   * @throws {DocumentParseError} If parsing fails unrecoverably
   * @throws {AssessmentNotFoundError} If assessmentId not found in document
   */
  parseForResponses(
    file: Buffer,
    metadata: DocumentMetadata,
    options?: ScoringParseOptions
  ): Promise<ScoringParseResult>;
}

/**
 * Error thrown when assessment ID cannot be found in document
 */
export class AssessmentNotFoundError extends Error {
  constructor(
    message: string = 'Assessment ID not found in document. Please ensure you are uploading a Guardian-exported questionnaire.',
    public readonly metadata?: DocumentMetadata
  ) {
    super(message);
    this.name = 'AssessmentNotFoundError';
  }
}

/**
 * Error thrown when parsed responses don't match expected questionnaire
 */
export class QuestionnaireMismatchError extends Error {
  constructor(
    message: string,
    public readonly expectedAssessmentId: string,
    public readonly foundAssessmentId: string | null
  ) {
    super(message);
    this.name = 'QuestionnaireMismatchError';
  }
}
