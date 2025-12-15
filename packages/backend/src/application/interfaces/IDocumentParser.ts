/**
 * IDocumentParser - Base types for document parsing
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * These foundational types are shared between intake and scoring parsers.
 * Each specific parser interface extends these base concepts.
 */

/**
 * Supported document types for parsing
 */
export type DocumentType = 'pdf' | 'docx' | 'image';

/**
 * Parsing mode determines which extraction strategy to use
 */
export type ParsingMode = 'intake' | 'scoring';

/**
 * File metadata extracted during upload
 *
 * SECURITY NOTE: `storagePath` is internal-only.
 * Never emit storage paths to clients - use opaque IDs or derived summaries.
 */
export interface DocumentMetadata {
  /** Original filename */
  filename: string;

  /** MIME type (e.g., 'application/pdf') */
  mimeType: string;

  /** File size in bytes */
  sizeBytes: number;

  /** Detected document type */
  documentType: DocumentType;

  /** Storage path (local or S3) - INTERNAL ONLY, never emit to clients */
  storagePath: string;

  /** Upload timestamp */
  uploadedAt: Date;

  /** User who uploaded */
  uploadedBy: string;
}

/**
 * Base result structure for all parsing operations
 */
export interface ParseResultBase {
  /** Whether parsing succeeded */
  success: boolean;

  /** Error message if parsing failed */
  error?: string;

  /** Overall confidence score (0-1) */
  confidence: number;

  /** Document metadata */
  metadata: DocumentMetadata;

  /** Time taken to parse (ms) */
  parseTimeMs: number;
}

/**
 * Configuration options for parsing
 */
export interface ParseOptions {
  /** Maximum pages to process (default: 50) */
  maxPages?: number;

  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number;

  /** Whether to store the original file (default: true) */
  storeOriginal?: boolean;

  /** Conversation ID for context */
  conversationId?: string;

  /** Maximum extracted text characters to send to Claude (default: 100000) */
  maxExtractedTextChars?: number;
}

/**
 * Supported file extensions mapped to document types
 *
 * NOTE: Legacy .doc format is NOT supported (mammoth requires .docx).
 * Users uploading .doc files should be prompted to export as .docx or .pdf.
 */
export const SUPPORTED_EXTENSIONS: Record<string, DocumentType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  // '.doc' intentionally omitted - mammoth only supports .docx
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
};

/**
 * File extensions that are explicitly rejected with helpful messages
 */
export const REJECTED_EXTENSIONS: Record<string, string> = {
  '.doc': 'Legacy .doc format is not supported. Please export as .docx or .pdf.',
};

/**
 * Maximum file sizes by type (in bytes)
 */
export const MAX_FILE_SIZES: Record<DocumentType, number> = {
  pdf: 20 * 1024 * 1024,    // 20MB
  docx: 20 * 1024 * 1024,   // 20MB
  image: 10 * 1024 * 1024,  // 10MB
};

/**
 * MIME types mapped to document types
 *
 * NOTE: application/msword (.doc) intentionally omitted.
 */
export const MIME_TYPE_MAP: Record<string, DocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  // 'application/msword' intentionally omitted - mammoth only supports .docx
  'image/png': 'image',
  'image/jpeg': 'image',
};

/**
 * MIME types that are explicitly rejected with helpful messages
 */
export const REJECTED_MIME_TYPES: Record<string, string> = {
  'application/msword': 'Legacy .doc format is not supported. Please export as .docx or .pdf.',
};

/**
 * Validate file type is supported
 *
 * Uses Object.hasOwn to avoid prototype pollution edge cases
 * (e.g., '__proto__' being treated as a valid MIME type)
 */
export function isSupported(mimeType: string): boolean {
  return Object.hasOwn(MIME_TYPE_MAP, mimeType);
}

/**
 * Get document type from MIME type
 */
export function getDocumentType(mimeType: string): DocumentType | null {
  return MIME_TYPE_MAP[mimeType] ?? null;
}

/**
 * Validate file size is within limits
 */
export function isValidSize(sizeBytes: number, documentType: DocumentType): boolean {
  return sizeBytes <= MAX_FILE_SIZES[documentType];
}

/**
 * Error thrown when document parsing fails
 *
 * This is the base error class used by both intake and scoring parsers.
 * Located here to avoid cross-module dependencies.
 */
export class DocumentParseError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean = false,
    public readonly metadata?: DocumentMetadata
  ) {
    super(message);
    this.name = 'DocumentParseError';
  }
}
