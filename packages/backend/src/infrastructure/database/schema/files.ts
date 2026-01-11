import { pgTable, uuid, text, integer, timestamp, jsonb, index, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'
import { conversations } from './conversations'

export const files = pgTable(
  'files',
  {
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

    // Epic 17: Intake document context (parsed from uploaded files)
    intakeContext: jsonb('intake_context'),
    intakeGapCategories: text('intake_gap_categories').array(),
    intakeParsedAt: timestamp('intake_parsed_at', { withTimezone: true }),

    // Epic 18: Text excerpt for fast context injection
    textExcerpt: text('text_excerpt'),

    // Epic 18: Idempotency guard for parse/scoring operations
    parseStatus: varchar('parse_status', { length: 20 }).default('pending'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index('files_conversation_id_idx').on(table.conversationId),
  })
)

// Type exports
export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert
