import { pgTable, uuid, text, timestamp, index, unique, jsonb } from 'drizzle-orm/pg-core'
import { assessments } from './assessments'
import { frameworkVersions } from './frameworkVersions'
import { frameworkControls } from './frameworkControls'

export const assessmentComplianceResults = pgTable(
  'assessment_compliance_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    frameworkVersionId: uuid('framework_version_id')
      .notNull()
      .references(() => frameworkVersions.id, { onDelete: 'cascade' }),
    criteriaVersion: text('criteria_version').notNull(),  // "guardian-iso42001-v1.0"
    controlId: uuid('control_id')
      .notNull()
      .references(() => frameworkControls.id, { onDelete: 'cascade' }),
    finding: jsonb('finding'),                         // Per-control evaluation data
    evidenceRefs: jsonb('evidence_refs'),               // Q&A references supporting the finding
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    assessmentIdx: index('assessment_compliance_results_assessment_idx').on(table.assessmentId),
    uniqueAssessmentControlVersion: unique('assessment_compliance_results_unique').on(
      table.assessmentId,
      table.controlId,
      table.criteriaVersion
    ),
  })
)

export type AssessmentComplianceResult = typeof assessmentComplianceResults.$inferSelect
export type NewAssessmentComplianceResult = typeof assessmentComplianceResults.$inferInsert
