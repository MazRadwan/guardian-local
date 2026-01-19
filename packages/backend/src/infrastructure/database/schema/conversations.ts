import { pgTable, uuid, text, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core'
import { users } from './users'
import { assessments } from './assessments'
import type { ConversationContext } from '../../../domain/entities/Conversation.js'

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    // Mode
    mode: text('mode').notNull().$type<'consult' | 'assessment' | 'scoring'>().default('consult'),

    // Optional links
    assessmentId: uuid('assessment_id').references(() => assessments.id),

    // Session state
    status: text('status').notNull().$type<'active' | 'completed'>().default('active'),
    // Domain type is source of truth for context structure (Epic 16: includes intakeContext)
    context: jsonb('context').$type<ConversationContext>(),

    // Epic 25: Chat Title Intelligence
    // Generated or user-edited conversation title
    title: text('title'),
    // Flag to prevent auto-updates from overwriting user-edited titles
    titleManuallyEdited: boolean('title_manually_edited').default(false).notNull(),

    // Timestamps
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    userIdx: index('conversations_user_idx').on(table.userId),
    statusIdx: index('conversations_status_idx').on(table.status),
  })
)

// Type exports
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
