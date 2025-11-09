import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { vendors } from './vendors'
import { users } from './users'

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),

    // Assessment details
    assessmentType: text('assessment_type')
      .notNull()
      .$type<'quick' | 'comprehensive' | 'renewal'>(),
    solutionName: text('solution_name'),
    solutionType: text('solution_type'),

    // Status (simplified for MVP)
    status: text('status')
      .notNull()
      .$type<'draft' | 'questions_generated' | 'exported' | 'cancelled'>()
      .default('draft'),

    // Metadata
    assessmentMetadata: jsonb('assessment_metadata').$type<{
      assessorName?: string
      stakeholders?: string[]
      notes?: string
    }>(),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => ({
    vendorIdx: index('assessments_vendor_idx').on(table.vendorId),
    statusIdx: index('assessments_status_idx').on(table.status),
    createdByIdx: index('assessments_created_by_idx').on(table.createdBy),
  })
)

// Type exports
export type Assessment = typeof assessments.$inferSelect
export type NewAssessment = typeof assessments.$inferInsert
