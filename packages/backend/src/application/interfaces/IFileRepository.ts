import type { IntakeDocumentContext } from '../../domain/entities/Conversation.js'

/**
 * Epic 18: Parse status for idempotency guard
 * - pending: File uploaded, not yet parsed
 * - in_progress: Parsing started (atomic lock acquired)
 * - completed: Parsing finished successfully
 * - failed: Parsing failed (error during processing)
 */
export type ParseStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface FileRecord {
  id: string
  userId: string
  conversationId: string
  filename: string
  mimeType: string
  size: number
  storagePath: string
  createdAt: Date
  // Epic 18: Text excerpt for fast context injection
  textExcerpt: string | null
  // Epic 18: Idempotency guard for parse/scoring operations
  parseStatus: ParseStatus
}

export interface FileWithIntakeContext {
  id: string
  conversationId: string
  filename: string
  mimeType: string
  size: number
  intakeContext: IntakeDocumentContext | null
  intakeGapCategories: string[] | null
  intakeParsedAt: Date | null
}

/**
 * Data required to create a file record
 * Epic 18: textExcerpt is optional on create (can be set during upload)
 */
export interface CreateFileData {
  userId: string
  conversationId: string
  filename: string
  mimeType: string
  size: number
  storagePath: string
  textExcerpt?: string | null
}

/**
 * Epic 18: File record with excerpt for context injection fallback
 * Returns files that may have excerpt but no intakeContext yet
 */
export interface FileWithExcerpt {
  id: string
  filename: string
  mimeType: string
  storagePath: string
  textExcerpt: string | null
  intakeContext: IntakeDocumentContext | null
}

export interface IFileRepository {
  /**
   * Create a new file record
   * Epic 18: Now accepts optional textExcerpt for setting during upload
   */
  create(file: CreateFileData): Promise<FileRecord>

  /**
   * Find file by ID
   */
  findById(fileId: string): Promise<FileRecord | null>

  /**
   * Find file by ID and user (for authorization)
   */
  findByIdAndUser(fileId: string, userId: string): Promise<FileRecord | null>

  /**
   * Find file by ID and conversation (for authorization)
   */
  findByIdAndConversation(fileId: string, conversationId: string): Promise<FileRecord | null>

  /**
   * Update intake context for a file after parsing
   */
  updateIntakeContext(
    fileId: string,
    context: IntakeDocumentContext,
    gapCategories?: string[]
  ): Promise<void>

  /**
   * Find all files in a conversation that have intake context
   */
  findByConversationWithContext(conversationId: string): Promise<FileWithIntakeContext[]>

  // Epic 18: Text excerpt storage and parsing idempotency

  /**
   * Update text excerpt for a file after extraction
   */
  updateTextExcerpt(fileId: string, excerpt: string): Promise<void>

  /**
   * Update parse status for a file
   */
  updateParseStatus(fileId: string, status: ParseStatus): Promise<void>

  /**
   * Atomic operation: Try to start parsing if status is 'pending'
   *
   * Uses optimistic locking pattern:
   * - Only updates if current status is 'pending'
   * - Returns true if status changed from pending to in_progress
   * - Returns false if another process already started parsing
   *
   * This prevents duplicate parsing when multiple triggers occur
   */
  tryStartParsing(fileId: string): Promise<boolean>

  // Epic 18: Context injection fallback

  /**
   * Find all files in a conversation with excerpt support
   *
   * Unlike findByConversationWithContext(), returns ALL files
   * (not just those with intakeContext). Used for context injection
   * fallback hierarchy: intakeContext → textExcerpt → S3 re-read.
   */
  findByConversationWithExcerpt(conversationId: string): Promise<FileWithExcerpt[]>
}
