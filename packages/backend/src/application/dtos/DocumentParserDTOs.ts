/**
 * DocumentParserDTOs - Data Transfer Objects for document parsing
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * These DTOs define the contract for document upload and parsing operations
 * between the presentation (WebSocket/HTTP) and application layers.
 */

import { DocumentType, ParsingMode } from '../interfaces/IDocumentParser.js';

/**
 * DTO for initiating a document upload
 *
 * SECURITY NOTE: `userId` must be derived from authenticated session/socket context.
 * NEVER accept userId from client payload. This field is populated server-side
 * after authentication validation.
 */
export interface UploadDocumentDTO {
  /** Conversation ID to associate upload with */
  conversationId: string;

  /** Original filename */
  filename: string;

  /** MIME type of the file */
  mimeType: string;

  /** File size in bytes */
  sizeBytes: number;

  /** Parsing mode (intake or scoring) */
  mode: ParsingMode;

  /**
   * User ID performing upload
   * SECURITY: Derived from auth context, never from client payload
   */
  userId: string;
}

/**
 * DTO for upload progress updates
 */
export interface UploadProgressDTO {
  /** Conversation ID */
  conversationId: string;

  /** Progress percentage (0-100) */
  progress: number;

  /** Current stage of processing */
  stage: 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';

  /** Human-readable status message */
  message: string;

  /** Error details if stage is 'error' */
  error?: string;
}

/**
 * DTO for intake parsing request
 */
export interface ParseIntakeDocumentDTO {
  /** Conversation ID */
  conversationId: string;

  /** Path to stored file */
  filePath: string;

  /** Document type */
  documentType: DocumentType;

  /** User ID requesting parse */
  userId: string;

  /** Optional focus categories */
  focusCategories?: string[];
}

/**
 * DTO for scoring parsing request
 */
export interface ParseScoringDocumentDTO {
  /** Conversation ID */
  conversationId: string;

  /** Path to stored file */
  filePath: string;

  /** Document type */
  documentType: DocumentType;

  /** User ID requesting parse */
  userId: string;

  /** Expected assessment ID (if known) */
  expectedAssessmentId?: string;
}

/**
 * DTO for intake context result (sent to frontend)
 */
export interface IntakeContextResultDTO {
  /** Conversation ID */
  conversationId: string;

  /** Whether parsing succeeded */
  success: boolean;

  /** Extracted context (null if failed) */
  context: {
    vendorName: string | null;
    solutionName: string | null;
    solutionType: string | null;
    industry: string | null;
    features: string[];
    claims: string[];
    complianceMentions: string[];
  } | null;

  /** Suggested follow-up questions */
  suggestedQuestions: string[];

  /** Categories with good coverage */
  coveredCategories: string[];

  /** Categories needing more info */
  gapCategories: string[];

  /** Overall confidence (0-1) */
  confidence: number;

  /** Error message if failed */
  error?: string;
}

/**
 * DTO for scoring parse result (sent to frontend)
 */
export interface ScoringParseResultDTO {
  /** Conversation ID */
  conversationId: string;

  /** Whether parsing succeeded */
  success: boolean;

  /** Extracted assessment ID */
  assessmentId: string | null;

  /** Vendor name from document */
  vendorName: string | null;

  /** Number of responses extracted */
  responseCount: number;

  /** Expected question count */
  expectedCount: number | null;

  /** Whether all questions were parsed */
  isComplete: boolean;

  /** Overall confidence (0-1) */
  confidence: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Validation result for file upload
 */
export interface FileValidationResult {
  /** Whether file is valid */
  valid: boolean;

  /** Validation error if invalid */
  error?: string;

  /** Detected document type */
  documentType?: DocumentType;
}

/**
 * Validate an upload request
 */
export function validateUploadRequest(dto: UploadDocumentDTO): FileValidationResult {
  // Check required fields
  if (!dto.conversationId) {
    return { valid: false, error: 'Conversation ID is required' };
  }

  if (!dto.filename) {
    return { valid: false, error: 'Filename is required' };
  }

  if (!dto.mimeType) {
    return { valid: false, error: 'MIME type is required' };
  }

  if (!dto.mode || !['intake', 'scoring'].includes(dto.mode)) {
    return { valid: false, error: 'Valid parsing mode is required (intake or scoring)' };
  }

  if (!dto.userId) {
    return { valid: false, error: 'User ID is required' };
  }

  return { valid: true };
}
