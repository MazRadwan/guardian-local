import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { frameworkControls } from './frameworkControls'

export const interpretiveCriteria = pgTable(
  'interpretive_criteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    controlId: uuid('control_id')
      .notNull()
      .references(() => frameworkControls.id, { onDelete: 'cascade' }),
    criteriaVersion: text('criteria_version').notNull(),  // "guardian-iso42001-v1.0"
    criteriaText: text('criteria_text').notNull(),          // Guardian's interpretive language
    assessmentGuidance: text('assessment_guidance'),        // How to assess this criterion
    reviewStatus: text('review_status')
      .notNull()
      .$type<'draft' | 'approved' | 'deprecated'>()
      .default('draft'),
    approvedAt: timestamp('approved_at'),
    approvedBy: text('approved_by'),                        // Who approved (user ID or name)
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    controlCriteriaIdx: index('interpretive_criteria_control_version_idx').on(
      table.controlId,
      table.criteriaVersion
    ),
    uniqueControlVersion: unique('interpretive_criteria_control_version_unique').on(
      table.controlId,
      table.criteriaVersion
    ),
  })
)

export type InterpretiveCriteria = typeof interpretiveCriteria.$inferSelect
export type NewInterpretiveCriteria = typeof interpretiveCriteria.$inferInsert
