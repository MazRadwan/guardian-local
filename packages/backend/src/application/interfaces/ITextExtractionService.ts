/**
 * ITextExtractionService - Interface for text extraction from documents
 *
 * Epic 18: Defined in application layer, implemented in infrastructure layer.
 * Used during upload phase to extract text for immediate context injection.
 */

/**
 * Document type from FileValidationService
 * Use validated document type (not raw MIME) for reliability
 */
export type ValidatedDocumentType = 'pdf' | 'docx' | 'image'

/**
 * Result of text extraction operation
 */
export interface ExtractionResult {
  /** Whether extraction succeeded */
  success: boolean
  /** Extracted text (truncated to MAX_EXCERPT_LENGTH) */
  excerpt: string
  /** Length of full text before truncation */
  fullLength: number
  /** Time taken for extraction in milliseconds */
  extractionMs: number
  /** Error message if extraction failed */
  error?: string
}

/**
 * Interface for text extraction service
 *
 * Implementations should:
 * - Handle PDF and DOCX extraction
 * - Return empty string for images (Vision API handles these)
 * - Timeout after SLO threshold (3s)
 * - Truncate to MAX_EXCERPT_LENGTH (10k chars)
 * - Fail gracefully (return error result, don't throw)
 */
export interface ITextExtractionService {
  /**
   * Extract text from a document buffer
   *
   * @param buffer - File buffer
   * @param documentType - Validated document type from FileValidationService
   * @returns Extraction result with excerpt (max 10k chars)
   */
  extract(buffer: Buffer, documentType: ValidatedDocumentType): Promise<ExtractionResult>
}
