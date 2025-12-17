import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'
import { conversations } from './conversations'

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Ownership
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),

  // File metadata
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storagePath: text('storage_path').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Type exports
export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert
