/**
 * TextExtractionService - Fast text extraction for upload phase
 *
 * Epic 18: Extracts text during upload (before Claude enrichment)
 * to enable immediate context injection.
 *
 * Design constraints:
 * - Must complete within SLO (3s P95)
 * - Returns truncated excerpt (10k chars max)
 * - Graceful failure: returns error result, logs warning
 * - Uses validated documentType (not raw MIME) for reliability
 */

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import {
  ITextExtractionService,
  ExtractionResult,
  ValidatedDocumentType,
} from '../../application/interfaces/ITextExtractionService.js'

/** Maximum characters to include in excerpt */
const MAX_EXCERPT_LENGTH = 10000

/** Timeout for extraction operations (SLO from Sprint 0) */
const EXTRACTION_TIMEOUT_MS = 3000

export class TextExtractionService implements ITextExtractionService {
  /**
   * Extract text excerpt from document buffer
   *
   * @param buffer - File buffer
   * @param documentType - Validated document type from FileValidationService
   *                       (NOT raw MIME - handles DOCX-as-ZIP edge case)
   * @returns Extraction result with excerpt (max 10k chars)
   */
  async extract(buffer: Buffer, documentType: ValidatedDocumentType): Promise<ExtractionResult> {
    const start = Date.now()

    try {
      // Wrap extraction in timeout
      const textPromise = this.extractText(buffer, documentType)
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Extraction timeout')), EXTRACTION_TIMEOUT_MS)
      )

      const fullText = await Promise.race([textPromise, timeoutPromise])
      const elapsed = Date.now() - start

      return {
        success: true,
        excerpt: fullText.slice(0, MAX_EXCERPT_LENGTH),
        fullLength: fullText.length,
        extractionMs: elapsed,
      }
    } catch (error) {
      const elapsed = Date.now() - start
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      console.warn(`[TextExtractionService] Extraction failed after ${elapsed}ms: ${errorMessage}`)

      return {
        success: false,
        excerpt: '',
        fullLength: 0,
        extractionMs: elapsed,
        error: errorMessage,
      }
    }
  }

  /**
   * Extract text based on validated document type
   *
   * Uses documentType from FileValidationService.validate()
   * which correctly handles edge cases like DOCX-as-ZIP.
   */
  private async extractText(buffer: Buffer, documentType: ValidatedDocumentType): Promise<string> {
    switch (documentType) {
      case 'pdf':
        return this.extractPdfText(buffer)

      case 'docx':
        return this.extractDocxText(buffer)

      case 'image':
        // Images: no text extraction (Vision API handles these)
        return ''

      default: {
        // TypeScript exhaustive check
        const _exhaustiveCheck: never = documentType
        throw new Error(`Unsupported document type: ${_exhaustiveCheck}`)
      }
    }
  }

  /**
   * Extract text from PDF using pdf-parse v2 class-based API
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  /**
   * Extract text from DOCX using mammoth
   */
  private async extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
}
