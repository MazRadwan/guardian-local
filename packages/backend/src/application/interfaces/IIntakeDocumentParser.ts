/**
 * IIntakeDocumentParser - Interface for parsing vendor documents during intake
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * This interface defines the contract for extracting vendor context from
 * PRDs, proposals, and other vendor-provided documents. The extracted
 * context enriches the conversation for questionnaire generation.
 *
 * Clean Architecture Note:
 * - This interface lives in the Application layer
 * - Intake module depends only on this interface
 * - Infrastructure layer provides the implementation
 * - Intake module does NOT know about IScoringDocumentParser
 */

import {
  ParseResultBase,
  ParseOptions,
  DocumentMetadata,
  DocumentParseError,
} from './IDocumentParser.js';

// Re-export for convenience (consumers can import from either location)
export { DocumentParseError };

/**
 * Extracted context from a vendor document
 *
 * This represents the valuable information Guardian can use to:
 * 1. Pre-populate assessment context
 * 2. Tailor questionnaire questions
 * 3. Provide Claude with background during intake conversation
 */
export interface IntakeContext {
  /** Vendor/company name if found */
  vendorName: string | null;

  /** Product/solution name if found */
  solutionName: string | null;

  /** Type of solution (e.g., 'Clinical Decision Support', 'Administrative AI') */
  solutionType: string | null;

  /** Industry vertical if mentioned */
  industry: string | null;

  /** Key features extracted from document */
  features: string[];

  /** Marketing claims or capabilities stated */
  claims: string[];

  /** Integration points mentioned (EHR, APIs, etc.) */
  integrations: string[];

  /** Compliance/regulatory mentions (HIPAA, SOC2, etc.) */
  complianceMentions: string[];

  /** Technical architecture mentions */
  architectureNotes: string[];

  /** Security-related statements */
  securityMentions: string[];

  /** Raw text excerpt (first 2000 chars for reference)
   *  NOTE: Populated by DocumentParserService from document text, NOT extracted by Claude
   */
  rawTextExcerpt: string;

  /** Overall extraction confidence (0-1) */
  confidence: number;

  /**
   * Path to stored original file
   * SECURITY: Internal-only - never emit to clients. Use opaque IDs instead.
   */
  sourceFilePath: string;
}

/**
 * Result of parsing a document for intake context
 */
export interface IntakeParseResult extends ParseResultBase {
  /** Extracted intake context (null if parsing failed) */
  context: IntakeContext | null;

  /** Suggestions for follow-up questions based on gaps */
  suggestedQuestions: string[];

  /** Categories that appear well-covered in the document */
  coveredCategories: string[];

  /** Categories that need more information */
  gapCategories: string[];
}

/**
 * Options specific to intake parsing
 */
export interface IntakeParseOptions extends ParseOptions {
  /** Focus extraction on specific categories */
  focusCategories?: string[];

  /** Whether to extract technical details (default: true) */
  extractTechnical?: boolean;

  /** Whether to extract compliance mentions (default: true) */
  extractCompliance?: boolean;
}

/**
 * Interface for intake document parsing
 *
 * Implementations of this interface extract vendor context from documents
 * to enrich the assessment intake process.
 *
 * @example
 * ```typescript
 * class DocumentParserService implements IIntakeDocumentParser {
 *   async parseForContext(
 *     file: Buffer,
 *     metadata: DocumentMetadata,
 *     options?: IntakeParseOptions
 *   ): Promise<IntakeParseResult> {
 *     // Use Claude Vision to extract context
 *     // Return structured IntakeContext
 *   }
 * }
 * ```
 */
export interface IIntakeDocumentParser {
  /**
   * Parse a document to extract vendor context for intake
   *
   * @param file - The file buffer to parse
   * @param metadata - Metadata about the uploaded file
   * @param options - Optional parsing configuration
   * @returns Parsed intake context with confidence scores
   *
   * @throws {DocumentParseError} If parsing fails unrecoverably
   */
  parseForContext(
    file: Buffer,
    metadata: DocumentMetadata,
    options?: IntakeParseOptions
  ): Promise<IntakeParseResult>;
}

// NOTE: DocumentParseError is defined in IDocumentParser.ts (base) and re-exported above.
// This avoids cross-module dependencies between intake and scoring interfaces.
