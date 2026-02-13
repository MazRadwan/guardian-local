# Story 37.2.2: Create framework_versions Schema

## Description

Create the `framework_versions` database table. This implements Level 1 of the two-level versioning system: tracking standard versions (e.g., ISO 42001:2023). Each row links to a `compliance_frameworks` entry. Versions are immutable once published.

## Acceptance Criteria

- [ ] `frameworkVersions.ts` created in `infrastructure/database/schema/`
- [ ] Table has columns: `id` (uuid PK), `framework_id` (uuid FK -> compliance_frameworks), `version_label` (text, not null), `status` (text: active|deprecated), `published_at` (timestamp), `created_at` (timestamp)
- [ ] Foreign key to `compliance_frameworks` with `onDelete: 'cascade'`
- [ ] Unique constraint on `(framework_id, version_label)`
- [ ] Index on `framework_id`
- [ ] Drizzle inferred types exported: `FrameworkVersion`, `NewFrameworkVersion`
- [ ] Under 50 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/frameworkVersions.ts`

```typescript
import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { complianceFrameworks } from './complianceFrameworks'

export const frameworkVersions = pgTable(
  'framework_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => complianceFrameworks.id, { onDelete: 'cascade' }),
    versionLabel: text('version_label').notNull(),   // "2023", "202x"
    status: text('status').notNull().$type<'active' | 'deprecated'>().default('active'),
    publishedAt: timestamp('published_at'),           // When ISO published this version
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    frameworkIdx: index('framework_versions_framework_idx').on(table.frameworkId),
    uniqueFrameworkVersion: unique('framework_versions_framework_version_unique').on(
      table.frameworkId,
      table.versionLabel
    ),
  })
)

export type FrameworkVersion = typeof frameworkVersions.$inferSelect
export type NewFrameworkVersion = typeof frameworkVersions.$inferInsert
```

**Pattern note:** The `status` column uses `.$type<>()` for type narrowing, same pattern as `assessmentResults.ts` uses for `recommendation` and `overallRiskRating`.

## Files Touched

- `packages/backend/src/infrastructure/database/schema/frameworkVersions.ts` - CREATE (~30 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (validated by migration + integration tests in later sprints)

## Definition of Done

- [ ] File created and compiles
- [ ] Foreign key relationship established
- [ ] Types exported correctly
- [ ] No TypeScript errors
