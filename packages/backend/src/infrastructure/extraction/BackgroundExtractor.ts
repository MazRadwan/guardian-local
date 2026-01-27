/**
 * BackgroundExtractor - Fire-and-forget text extraction service
 *
 * Epic 31: Decouples file upload from text extraction by running
 * extraction as a background task. Updates file.textExcerpt when complete.
 *
 * Sprint 1 Fix: Also runs document classification after extraction
 * and persists detectedDocType + detectedVendorName to file record.
 *
 * Design:
 * - queueExtraction() returns immediately (fire-and-forget)
 * - Extraction runs asynchronously via extractAndUpdate()
 * - Classification runs after successful extraction
 * - Errors are caught and logged, never thrown to caller
 * - Timing logs for observability
 */

import type { IBackgroundExtractor } from '../../application/interfaces/IBackgroundExtractor.js'
import type {
  ITextExtractionService,
  ValidatedDocumentType,
} from '../../application/interfaces/ITextExtractionService.js'
import type { IFileRepository } from '../../application/interfaces/IFileRepository.js'
import { classifyDocument } from './DocumentClassifier.js'

export class BackgroundExtractor implements IBackgroundExtractor {
  constructor(
    private readonly textExtractionService: ITextExtractionService,
    private readonly fileRepository: IFileRepository
  ) {}

  /**
   * Queue extraction for background processing
   *
   * Fire-and-forget: returns immediately, extraction runs async.
   * Errors are caught and logged, never propagated to caller.
   *
   * Sprint 1 Fix: Also runs classification to backfill detectedDocType
   * and detectedVendorName fields.
   */
  queueExtraction(
    fileId: string,
    buffer: Buffer,
    documentType: ValidatedDocumentType,
    mimeType: string
  ): void {
    // Fire-and-forget - don't await
    this.extractAndUpdate(fileId, buffer, documentType, mimeType).catch((err) => {
      console.error(`[BackgroundExtractor] Failed for fileId=${fileId}:`, err)
    })
  }

  /**
   * Extract text and update file record with excerpt AND classification
   *
   * Private async method that performs the actual work.
   * Errors thrown here are caught by the .catch() in queueExtraction().
   *
   * Sprint 1 Fix: Runs classification after successful extraction to
   * backfill detectedDocType and detectedVendorName fields.
   */
  private async extractAndUpdate(
    fileId: string,
    buffer: Buffer,
    documentType: ValidatedDocumentType,
    mimeType: string
  ): Promise<void> {
    const startTime = Date.now()
    console.log(
      `[TIMING] BackgroundExtractor START: ${startTime} (fileId: ${fileId})`
    )

    try {
      const result = await this.textExtractionService.extract(buffer, documentType)

      if (result.success && result.excerpt) {
        // Sprint 1 Fix: Run classification on the excerpt
        const classification = classifyDocument(result.excerpt, mimeType)

        // Update file record with excerpt AND classification
        await this.fileRepository.updateExcerptAndClassification(fileId, {
          textExcerpt: result.excerpt,
          detectedDocType: classification.docType,
          detectedVendorName: classification.vendorName,
        })

        console.log(
          `[TIMING] BackgroundExtractor SUCCESS: ${Date.now()} (fileId: ${fileId}, duration: ${Date.now() - startTime}ms, docType: ${classification.docType})`
        )
      } else {
        console.warn(
          `[BackgroundExtractor] Extraction failed for fileId=${fileId}: ${result.error}`
        )
      }
    } catch (err) {
      console.error(`[BackgroundExtractor] Error for fileId=${fileId}:`, err)
    }
  }
}
