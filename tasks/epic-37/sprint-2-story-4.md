# Story 37.2.4: Create interpretive_criteria Schema

## Description

Create the `interpretive_criteria` database table. This implements Level 2 of the two-level versioning system: Guardian's own interpretive criteria for each ISO control. Criteria are versioned independently of the ISO standard (e.g., `guardian-iso42001-v1.0`). Includes a `review_status` column to track the human approval workflow.

## Acceptance Criteria

- [ ] `interpretiveCriteria.ts` created in `infrastructure/database/schema/`
- [ ] Table has columns: `id` (uuid PK), `control_id` (uuid FK -> framework_controls), `criteria_version` (text, not null), `criteria_text` (text, not null), `assessment_guidance` (text), `review_status` (text: draft|approved|deprecated), `approved_at` (timestamp), `approved_by` (text), `created_at` (timestamp)
- [ ] Foreign key to `framework_controls` with `onDelete: 'cascade'`
- [ ] Unique constraint on `(control_id, criteria_version)` -- one criteria per control per version
- [ ] Index on `(control_id, criteria_version)` for efficient lookups
- [ ] Drizzle inferred types exported: `InterpretiveCriteria`, `NewInterpretiveCriteria`
- [ ] Under 60 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/interpretiveCriteria.ts`

```typescript
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
```

**Key design decisions (from PRD Section 9):**
- `review_status` tracks human approval workflow for generated criteria
- `criteria_version` is Guardian-controlled, independent of ISO standard versions
- `criteria_text` is Guardian's own language (not verbatim ISO text -- copyright compliance)
- `assessment_guidance` provides scoring guidance for assessors

## Files Touched

- `packages/backend/src/infrastructure/database/schema/interpretiveCriteria.ts` - CREATE (~40 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (validated by migration + integration tests)

## Definition of Done

- [ ] File created and compiles
- [ ] Two-level versioning columns present (control_id links to standard version; criteria_version tracks Guardian's criteria version)
- [ ] Review status workflow column present
- [ ] Types exported correctly
- [ ] No TypeScript errors
