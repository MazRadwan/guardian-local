import { eq, desc, asc, sql, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../client.js';
import { messages } from '../schema/index.js';
import { IMessageRepository } from '../../../application/interfaces/IMessageRepository.js';
import { Message, MessageRole, MessageContent, MessageAttachment } from '../../../domain/entities/Message.js';
import * as schema from '../schema/index.js';

export class DrizzleMessageRepository implements IMessageRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(database?: PostgresJsDatabase<typeof schema>) {
    this.db = database || db;
  }

  async create(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    const id = crypto.randomUUID();

    const [row] = await this.db
      .insert(messages)
      .values({
        id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content as any,
        // Epic 16.6.8: Include attachments if present
        attachments: message.attachments as MessageAttachment[] | undefined,
      })
      .returning();

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Message | null> {
    const [row] = await this.db.select().from(messages).where(eq(messages.id, id));

    return row ? this.toDomain(row) : null;
  }

  async findByConversationId(conversationId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return rows.map((row) => this.toDomain(row));
  }

  async getHistory(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    // Reverse to get chronological order (oldest first)
    return rows.reverse().map((row) => this.toDomain(row));
  }

  async count(conversationId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return Number(result.count);
  }

  async findFirstUserMessage(conversationId: string): Promise<Message | null> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.role, 'user')
        )
      )
      .orderBy(asc(messages.createdAt))
      .limit(1);

    return row ? this.toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(messages).where(eq(messages.id, id));
  }

  async deleteByConversationId(conversationId: string): Promise<void> {
    await this.db.delete(messages).where(eq(messages.conversationId, conversationId));
  }

  private toDomain(row: typeof messages.$inferSelect): Message {
    return Message.fromPersistence({
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as MessageRole,
      content: row.content as MessageContent,
      createdAt: row.createdAt,
      // Epic 16.6.8: Include attachments if present
      attachments: row.attachments as MessageAttachment[] | undefined,
    });
  }
}
