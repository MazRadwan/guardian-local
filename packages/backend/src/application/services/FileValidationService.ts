/**
 * FileValidationService - Validates uploaded files
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Performs comprehensive validation:
 * - File size limits
 * - MIME type verification
 * - Magic byte verification (actual file type)
 * - Extension validation
 */

import { fileTypeFromBuffer } from 'file-type';
import {
  DocumentType,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZES,
  MIME_TYPE_MAP,
} from '../interfaces/IDocumentParser.js';

export interface ValidationResult {
  valid: boolean;
  documentType: DocumentType | null;
  error?: string;
  warnings: string[];
}

export class FileValidationService {
  /**
   * Validate a file buffer
   */
  async validate(
    buffer: Buffer,
    declaredMimeType: string,
    filename: string
  ): Promise<ValidationResult> {
    const warnings: string[] = [];

    // 1. Check file extension
    const ext = this.getExtension(filename);
    if (!ext || !SUPPORTED_EXTENSIONS[ext]) {
      return {
        valid: false,
        documentType: null,
        error: `Unsupported file extension: ${ext || 'none'}. Supported: PDF, DOCX, PNG, JPEG`,
        warnings,
      };
    }

    const expectedType = SUPPORTED_EXTENSIONS[ext];

    // 2. Verify actual file type using magic bytes
    const detectedType = await fileTypeFromBuffer(buffer);

    if (detectedType) {
      // Handle DOCX-as-ZIP: file-type detects DOCX as 'application/zip'
      // because DOCX is a ZIP archive. If extension is .docx and detected
      // type is zip, trust the extension.
      const isDocxAsZip = (
        detectedType.mime === 'application/zip' &&
        ext === '.docx'
      );

      if (!isDocxAsZip) {
        const actualType = this.mapMimeToDocType(detectedType.mime);

        if (actualType && actualType !== expectedType) {
          warnings.push(
            `File extension (${ext}) doesn't match actual content (${detectedType.ext})`
          );
        }

        // Use detected type as source of truth (unless it's the docx-as-zip case)
        if (actualType && !this.isSupported(actualType)) {
          return {
            valid: false,
            documentType: null,
            error: `Detected file type (${detectedType.mime}) is not supported`,
            warnings,
          };
        }
      }
    }

    // 3. Verify declared MIME type matches
    const declaredType = MIME_TYPE_MAP[declaredMimeType];
    if (declaredType && declaredType !== expectedType) {
      warnings.push(`Declared MIME type doesn't match extension`);
    }

    // 4. Check file size
    const documentType = detectedType
      ? this.mapMimeToDocType(detectedType.mime) || expectedType
      : expectedType;

    if (!this.isValidSize(buffer.length, documentType)) {
      const maxMB = MAX_FILE_SIZES[documentType] / (1024 * 1024);
      return {
        valid: false,
        documentType,
        error: `File too large. Maximum size for ${documentType}: ${maxMB}MB`,
        warnings,
      };
    }

    // 5. Check for empty file
    if (buffer.length === 0) {
      return {
        valid: false,
        documentType: null,
        error: 'File is empty',
        warnings,
      };
    }

    // 6. Check minimum size (likely corrupt if too small)
    if (buffer.length < 100) {
      return {
        valid: false,
        documentType,
        error: 'File appears to be corrupt (too small)',
        warnings,
      };
    }

    return {
      valid: true,
      documentType,
      warnings,
    };
  }

  /**
   * Quick validation by extension and size only (no magic byte check)
   *
   * Use for early rejection before reading file buffer.
   * NOTE: This validates extension and size only - mime type consistency
   * is NOT checked here. For full validation including content verification,
   * use validate() instead.
   */
  quickValidateByExtensionAndSize(
    sizeBytes: number,
    filename: string
  ): ValidationResult {
    const warnings: string[] = [];

    const ext = this.getExtension(filename);
    if (!ext || !SUPPORTED_EXTENSIONS[ext]) {
      return {
        valid: false,
        documentType: null,
        error: `Unsupported file extension: ${ext || 'none'}`,
        warnings,
      };
    }

    const documentType = SUPPORTED_EXTENSIONS[ext];

    if (!this.isValidSize(sizeBytes, documentType)) {
      const maxMB = MAX_FILE_SIZES[documentType] / (1024 * 1024);
      return {
        valid: false,
        documentType,
        error: `File exceeds ${maxMB}MB limit`,
        warnings,
      };
    }

    return { valid: true, documentType, warnings };
  }

  private getExtension(filename: string): string | null {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : null;
  }

  private mapMimeToDocType(mime: string): DocumentType | null {
    // Handle DOCX-as-ZIP detection
    // file-type may detect DOCX as 'application/zip' since DOCX is a ZIP archive
    if (mime === 'application/zip') {
      // Will need to check extension or use more specific detection
      // For now, return null and let extension-based detection handle it
      return null;
    }
    return MIME_TYPE_MAP[mime] ?? null;
  }

  private isSupported(type: DocumentType): boolean {
    return type in MAX_FILE_SIZES;
  }

  private isValidSize(sizeBytes: number, type: DocumentType): boolean {
    return sizeBytes <= MAX_FILE_SIZES[type];
  }
}
