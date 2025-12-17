import { eq, and } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db } from '../client.js'
import { files } from '../schema/index.js'
import { IFileRepository, FileRecord } from '../../../application/interfaces/IFileRepository.js'
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
