import { pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { assessments } from './assessments'

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),

    // Organization
    sectionName: text('section_name').notNull(),
    sectionNumber: integer('section_number').notNull(),
    questionNumber: integer('question_number').notNull(),

    // Content
    questionText: text('question_text').notNull(),
    questionType: text('question_type')
      .notNull()
      .$type<'text' | 'enum' | 'boolean'>()
      .default('text'),

    questionMetadata: jsonb('question_metadata').$type<{
      required?: boolean
      helpText?: string
      enumOptions?: string[]
    }>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniquePosition: uniqueIndex('questions_assessment_position_idx').on(
      table.assessmentId,
      table.sectionNumber,
      table.questionNumber
    ),
    assessmentOrderIdx: index('questions_assessment_order_idx').on(
      table.assessmentId,
      table.sectionNumber,
      table.questionNumber
    ),
  })
)

// Type exports
export type Question = typeof questions.$inferSelect
export type NewQuestion = typeof questions.$inferInsert
