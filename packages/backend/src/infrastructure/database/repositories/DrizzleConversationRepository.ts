import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../client.js';
import { conversations } from '../schema/index.js';
import { IConversationRepository } from '../../../application/interfaces/IConversationRepository.js';
import {
  Conversation,
  ConversationMode,
  ConversationStatus,
  ConversationContext,
} from '../../../domain/entities/Conversation.js';
import * as schema from '../schema/index.js';

export class DrizzleConversationRepository implements IConversationRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(database?: PostgresJsDatabase<typeof schema>) {
    this.db = database || db;
  }

  async create(conversation: Omit<Conversation, 'id' | 'startedAt'>): Promise<Conversation> {
    const id = crypto.randomUUID();

    const [row] = await this.db
      .insert(conversations)
      .values({
        id,
        userId: conversation.userId,
        mode: conversation.mode,
        assessmentId: conversation.assessmentId,
        status: conversation.status,
        context: conversation.context as Record<string, unknown>,
        lastActivityAt: conversation.lastActivityAt,
        completedAt: conversation.completedAt,
      })
      .returning();

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Conversation | null> {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id));

    return row ? this.toDomain(row) : null;
  }

  async findByUserId(userId: string, status?: ConversationStatus): Promise<Conversation[]> {
    const conditions = [eq(conversations.userId, userId)];

    if (status) {
      conditions.push(eq(conversations.status, status));
    }

    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(conversations.lastActivityAt);

    return rows.map((row) => this.toDomain(row));
  }

  async updateMode(id: string, mode: ConversationMode): Promise<void> {
    await this.db
      .update(conversations)
      .set({
        mode,
        lastActivityAt: new Date(),
      })
      .where(eq(conversations.id, id));
  }

  async updateStatus(id: string, status: ConversationStatus): Promise<void> {
    const updates: { status: ConversationStatus; lastActivityAt: Date; completedAt?: Date } = {
      status,
      lastActivityAt: new Date(),
    };

    if (status === 'completed') {
      updates.completedAt = new Date();
    }

    await this.db.update(conversations).set(updates).where(eq(conversations.id, id));
  }

  async linkAssessment(id: string, assessmentId: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({
        assessmentId,
        lastActivityAt: new Date(),
      })
      .where(eq(conversations.id, id));
  }

  async updateContext(id: string, context: Record<string, unknown>): Promise<void> {
    // Fetch current conversation to merge context
    const [current] = await this.db.select().from(conversations).where(eq(conversations.id, id));

    if (!current) {
      throw new Error(`Conversation ${id} not found`);
    }

    const mergedContext = {
      ...(current.context as Record<string, unknown>),
      ...context,
    };

    await this.db
      .update(conversations)
      .set({
        context: mergedContext,
        lastActivityAt: new Date(),
      })
      .where(eq(conversations.id, id));
  }

  async updateActivity(id: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({
        lastActivityAt: new Date(),
      })
      .where(eq(conversations.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.id, id));
  }

  private toDomain(row: typeof conversations.$inferSelect): Conversation {
    return Conversation.fromPersistence({
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      assessmentId: row.assessmentId,
      status: row.status,
      context: (row.context as ConversationContext) || {},
      startedAt: row.startedAt,
      lastActivityAt: row.lastActivityAt,
      completedAt: row.completedAt,
    });
  }
}
