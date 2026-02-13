# Story 37.2.6: Create assessment_compliance_results Schema

## Description

Create the `assessment_compliance_results` database table. Stores per-assessment, per-control compliance evaluation data. Per PRD Section 9, this is a Phase 2 table -- Phase 1 stores confidence in the existing `findings` JSONB. However, creating the table now ensures the schema is complete and extensible. The table will not be written to during Phase 1 (Epic 37) but must exist for the extensibility test (Sprint 7).

## Acceptance Criteria

- [ ] `assessmentComplianceResults.ts` created in `infrastructure/database/schema/`
- [ ] Table has columns: `id` (uuid PK), `assessment_id` (uuid FK -> assessments), `framework_version_id` (uuid FK -> framework_versions), `criteria_version` (text, not null), `control_id` (uuid FK -> framework_controls), `finding` (jsonb), `evidence_refs` (jsonb), `created_at` (timestamp)
- [ ] Foreign key to `assessments` with `onDelete: 'cascade'`
- [ ] Foreign key to `framework_versions` with `onDelete: 'cascade'`
- [ ] Foreign key to `framework_controls` with `onDelete: 'cascade'`
- [ ] Index on `assessment_id`
- [ ] Unique constraint on `(assessment_id, control_id, criteria_version)` -- one result per control per criteria version per assessment
- [ ] Drizzle inferred types exported
- [ ] Under 60 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/assessmentComplianceResults.ts`

```typescript
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
```

**Note:** This table is Phase 2 only. Phase 1 stores confidence in the existing `findings` JSONB column of `dimension_scores`. Creating it now to complete the schema and validate extensibility.

## Files Touched

- `packages/backend/src/infrastructure/database/schema/assessmentComplianceResults.ts` - CREATE (~40 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (validated by migration + integration tests)

## Definition of Done

- [ ] File created and compiles
- [ ] Foreign keys to assessments, framework_versions, framework_controls established
- [ ] Types exported correctly
- [ ] No TypeScript errors
