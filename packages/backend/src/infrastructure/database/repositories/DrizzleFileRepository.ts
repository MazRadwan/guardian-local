import { eq, and, isNotNull, asc } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db } from '../client.js'
import { files } from '../schema/index.js'
import {
  IFileRepository,
  FileRecord,
  FileWithIntakeContext,
} from '../../../application/interfaces/IFileRepository.js'
import type { IntakeDocumentContext } from '../../../domain/entities/Conversation.js'
import * as schema from '../schema/index.js'

export class DrizzleFileRepository implements IFileRepository {
  private db: PostgresJsDatabase<typeof schema>

  constructor(database?: PostgresJsDatabase<typeof schema>) {
    this.db = database || db
  }

  async create(file: Omit<FileRecord, 'id' | 'createdAt'>): Promise<FileRecord> {
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
      })
      .returning()

    return this.toDomain(row)
  }

  async findById(fileId: string): Promise<FileRecord | null> {
    const [row] = await this.db.select().from(files).where(eq(files.id, fileId))

    return row ? this.toDomain(row) : null
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
    }
  }
}
