import { eq, and, isNotNull, asc, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db } from '../client.js'
import { files } from '../schema/index.js'
import {
  IFileRepository,
  FileRecord,
  FileWithIntakeContext,
  FileWithExcerpt,
  CreateFileData,
  ParseStatus,
  DetectedDocType,
} from '../../../application/interfaces/IFileRepository.js'
import type { IntakeDocumentContext } from '../../../domain/entities/Conversation.js'
import * as schema from '../schema/index.js'

export class DrizzleFileRepository implements IFileRepository {
  private db: PostgresJsDatabase<typeof schema>

  constructor(database?: PostgresJsDatabase<typeof schema>) {
    this.db = database || db
  }

  /**
   * Create a new file record
   * Epic 18: Now accepts optional textExcerpt for setting during upload
   * Epic 18.4: Accepts detectedDocType and detectedVendorName for classification
   */
  async create(file: CreateFileData): Promise<FileRecord> {
    const id = crypto.randomUUID()

    const [row] = await this.db
      .insert(files)
      .values({
        id,
        userId: file.userId,
        conversationId: file.conversationId,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        storagePath: file.storagePath,
        // Epic 18: Set text excerpt if provided
        textExcerpt: file.textExcerpt ?? null,
        // Epic 18: Default parse status is 'pending' (set in schema)
        // Epic 18.4: Document classification
        detectedDocType: file.detectedDocType ?? null,
        detectedVendorName: file.detectedVendorName ?? null,
      })
      .returning()

    return this.toDomain(row)
  }

  async findById(fileId: string): Promise<FileRecord | null> {
    const [row] = await this.db.select().from(files).where(eq(files.id, fileId))

    return row ? this.toDomain(row) : null
  }

  /**
   * Epic 18.4: Find multiple files by their IDs
   * Used for batch operations like vendor validation.
   * Returns only files that exist (skips non-existent IDs).
   */
  async findByIds(fileIds: string[]): Promise<FileRecord[]> {
    if (fileIds.length === 0) {
      return []
    }

    const rows = await this.db
      .select()
      .from(files)
      .where(inArray(files.id, fileIds))

    return rows.map((row) => this.toDomain(row))
  }

  async findByIdAndUser(fileId: string, userId: string): Promise<FileRecord | null> {
    const [row] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))

    return row ? this.toDomain(row) : null
  }

  async findByIdAndConversation(
    fileId: string,
    conversationId: string
  ): Promise<FileRecord | null> {
    const [row] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.conversationId, conversationId)))

    return row ? this.toDomain(row) : null
  }

  async updateIntakeContext(
    fileId: string,
    context: IntakeDocumentContext,
    gapCategories?: string[]
  ): Promise<void> {
    await this.db
      .update(files)
      .set({
        intakeContext: context as unknown as Record<string, unknown>,
        intakeGapCategories: gapCategories || null,
        intakeParsedAt: new Date(),
      })
      .where(eq(files.id, fileId))
  }

  async findByConversationWithContext(
    conversationId: string
  ): Promise<FileWithIntakeContext[]> {
    // Sprint 17.3 Fix: Add id ASC tie-breaker for deterministic ordering when timestamps match
    const rows = await this.db
      .select({
        id: files.id,
        conversationId: files.conversationId,
        filename: files.filename,
        mimeType: files.mimeType,
        size: files.size,
        intakeContext: files.intakeContext,
        intakeGapCategories: files.intakeGapCategories,
        intakeParsedAt: files.intakeParsedAt,
      })
      .from(files)
      .where(and(eq(files.conversationId, conversationId), isNotNull(files.intakeContext)))
      .orderBy(asc(files.intakeParsedAt), asc(files.id))

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      intakeContext: row.intakeContext as IntakeDocumentContext | null,
      intakeGapCategories: row.intakeGapCategories || null,
      intakeParsedAt: row.intakeParsedAt || null,
    }))
  }

  // Epic 18: Update text excerpt for a file after extraction
  async updateTextExcerpt(fileId: string, excerpt: string): Promise<void> {
    await this.db
      .update(files)
      .set({ textExcerpt: excerpt })
      .where(eq(files.id, fileId))
  }

  // Epic 18: Update parse status for a file
  async updateParseStatus(fileId: string, status: ParseStatus): Promise<void> {
    await this.db
      .update(files)
      .set({ parseStatus: status })
      .where(eq(files.id, fileId))
  }

  /**
   * Epic 18: Atomic operation - Try to start parsing if status is 'pending'
   *
   * Uses optimistic locking pattern:
   * - Only updates if current status is 'pending'
   * - Returns true if status changed from pending to in_progress
   * - Returns false if another process already started parsing
   */
  async tryStartParsing(fileId: string): Promise<boolean> {
    // Use .returning() to check if any row was actually updated
    // If status wasn't 'pending', no rows will be returned
    const result = await this.db
      .update(files)
      .set({ parseStatus: 'in_progress' })
      .where(and(eq(files.id, fileId), eq(files.parseStatus, 'pending')))
      .returning({ id: files.id })

    // Returns true if row was actually updated (status was pending)
    return result.length > 0
  }

  /**
   * Epic 18: Find all files in a conversation with excerpt support
   *
   * Unlike findByConversationWithContext(), returns ALL files
   * (not just those with intakeContext). Used for context injection
   * fallback hierarchy: intakeContext → textExcerpt → S3 re-read.
   */
  async findByConversationWithExcerpt(conversationId: string): Promise<FileWithExcerpt[]> {
    const rows = await this.db
      .select({
        id: files.id,
        filename: files.filename,
        mimeType: files.mimeType,
        storagePath: files.storagePath,
        textExcerpt: files.textExcerpt,
        intakeContext: files.intakeContext,
      })
      .from(files)
      .where(eq(files.conversationId, conversationId))
      .orderBy(asc(files.createdAt), asc(files.id))

    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      storagePath: row.storagePath,
      textExcerpt: row.textExcerpt ?? null,
      intakeContext: row.intakeContext as IntakeDocumentContext | null,
    }))
  }

  private toDomain(row: typeof files.$inferSelect): FileRecord {
    return {
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      storagePath: row.storagePath,
      createdAt: row.createdAt,
      // Epic 18: Include text excerpt and parse status
      textExcerpt: row.textExcerpt ?? null,
      parseStatus: (row.parseStatus as ParseStatus) ?? 'pending',
      // Epic 18.4: Document classification
      detectedDocType: (row.detectedDocType as DetectedDocType) ?? null,
      detectedVendorName: row.detectedVendorName ?? null,
    }
  }
}
