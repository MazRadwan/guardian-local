import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { conversations } from './conversations'
import type { MessageAttachment } from '../../../domain/entities/Message.js'

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    // Message data
    role: text('role').notNull().$type<'user' | 'assistant' | 'system'>(),
    content: jsonb('content')
      .notNull()
      .$type<{
        text: string
        components?: Array<{
          type: 'button' | 'link' | 'code'
          data: any
        }>
      }>(),

    // Epic 16.6.8: File attachments
    attachments: jsonb('attachments').$type<MessageAttachment[]>(),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index('messages_conversation_idx').on(table.conversationId),
    createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
  })
)

// Type exports
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
