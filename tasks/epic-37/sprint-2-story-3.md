# Story 37.2.3: Create framework_controls Schema

## Description

Create the `framework_controls` database table. Stores individual ISO controls (e.g., "A.6.2.6 - Data quality management for AI systems"). Controls are immutable per standard version. Each control links to a `framework_versions` entry.

## Acceptance Criteria

- [ ] `frameworkControls.ts` created in `infrastructure/database/schema/`
- [ ] Table has columns: `id` (uuid PK), `version_id` (uuid FK -> framework_versions), `clause_ref` (text, not null), `domain` (text, not null), `title` (text, not null), `created_at` (timestamp)
- [ ] Foreign key to `framework_versions` with `onDelete: 'cascade'`
- [ ] Unique constraint on `(version_id, clause_ref)` -- one control per clause per version
- [ ] Composite index on `(version_id, clause_ref)` for efficient lookups
- [ ] Drizzle inferred types exported: `FrameworkControl`, `NewFrameworkControl`
- [ ] Under 50 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/frameworkControls.ts`

```typescript
import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { frameworkVersions } from './frameworkVersions'

export const frameworkControls = pgTable(
  'framework_controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => frameworkVersions.id, { onDelete: 'cascade' }),
    clauseRef: text('clause_ref').notNull(),     // "A.6.2.6", "6.3", etc.
    domain: text('domain').notNull(),             // "Data management", "Risk management"
    title: text('title').notNull(),               // "Data quality management for AI systems"
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    versionClauseIdx: index('framework_controls_version_clause_idx').on(
      table.versionId,
      table.clauseRef
    ),
    uniqueVersionClause: unique('framework_controls_version_clause_unique').on(
      table.versionId,
      table.clauseRef
    ),
  })
)

export type FrameworkControl = typeof frameworkControls.$inferSelect
export type NewFrameworkControl = typeof frameworkControls.$inferInsert
```

**Note:** The audit report specifically calls out `(version_id, clause_ref)` as a required index. This is critical for `ISOControlRetrievalService` queries in Sprint 5.

## Files Touched

- `packages/backend/src/infrastructure/database/schema/frameworkControls.ts` - CREATE (~35 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (validated by migration + integration tests)

## Definition of Done

- [ ] File created and compiles
- [ ] Unique constraint on (version_id, clause_ref) established
- [ ] Composite index created for query performance
- [ ] Types exported correctly
- [ ] No TypeScript errors
