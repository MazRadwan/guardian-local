/**
 * IBackgroundExtractor - Interface for background text extraction
 *
 * Epic 31: Decouples text extraction from the upload flow.
 * Extraction happens asynchronously, updating the database when complete.
 * This enables file_attached response to return immediately without waiting
 * for potentially slow extraction operations.
 *
 * Sprint 1 Fix: Also runs document classification after extraction.
 */

import type { ValidatedDocumentType } from './ITextExtractionService.js';

export interface IBackgroundExtractor {
  /**
   * Queue a file for background text extraction.
   * Fire-and-forget - extraction happens async, updates DB when complete.
   *
   * Sprint 1 Fix: Also runs classification after extraction to backfill
   * detectedDocType and detectedVendorName fields.
   *
   * @param fileId - Database file UUID to update when extraction completes
   * @param buffer - File buffer to extract text from
   * @param documentType - Validated document type (pdf, docx, image)
   * @param mimeType - Original MIME type (used for classification heuristics)
   */
  queueExtraction(
    fileId: string,
    buffer: Buffer,
    documentType: ValidatedDocumentType,
    mimeType: string
  ): void;
}
