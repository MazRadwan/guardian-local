import { pgTable, uuid, text, integer, real, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { assessments } from './assessments'
import { files } from './files'

export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(), // Groups responses from single upload
    fileId: uuid('file_id').references(() => files.id), // Optional link to source file

    // Question identification (by position, not FK)
    sectionNumber: integer('section_number').notNull(),
    questionNumber: integer('question_number').notNull(),

    // Extracted content
    questionText: text('question_text').notNull(),
    responseText: text('response_text').notNull(),
    confidence: real('confidence'), // Extraction confidence 0-1
    hasVisualContent: boolean('has_visual_content').default(false),
    visualContentDescription: text('visual_content_description'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    assessmentBatchIdx: index('responses_assessment_batch_idx').on(table.assessmentId, table.batchId),
    positionIdx: index('responses_position_idx').on(table.assessmentId, table.sectionNumber, table.questionNumber),
  })
)

export type Response = typeof responses.$inferSelect
export type NewResponse = typeof responses.$inferInsert
