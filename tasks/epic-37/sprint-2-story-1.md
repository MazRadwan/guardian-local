# Story 37.2.1: Create compliance_frameworks Schema

## Description

Create the `compliance_frameworks` database table. This is the root table of the ISO compliance hierarchy, storing one row per standard (e.g., "ISO/IEC 42001", "ISO/IEC 23894"). Follows the existing pattern established by `dimensionScores.ts`.

## Acceptance Criteria

- [ ] `complianceFrameworks.ts` created in `infrastructure/database/schema/`
- [ ] Table has columns: `id` (uuid PK), `name` (text, not null, unique), `description` (text), `created_at` (timestamp)
- [ ] Unique constraint on `name`
- [ ] Drizzle inferred types exported: `ComplianceFramework`, `NewComplianceFramework`
- [ ] Under 50 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/complianceFrameworks.ts`

```typescript
import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const complianceFrameworks = pgTable(
  'compliance_frameworks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),          // "ISO/IEC 42001", "ISO/IEC 23894"
    description: text('description'),       // Brief description of the standard
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueName: unique('compliance_frameworks_name_unique').on(table.name),
  })
)

export type ComplianceFramework = typeof complianceFrameworks.$inferSelect
export type NewComplianceFramework = typeof complianceFrameworks.$inferInsert
```

Follow the exact pattern from `dimensionScores.ts`:
- Use `pgTable` from `drizzle-orm/pg-core`
- UUID primary key with `defaultRandom()`
- Timestamp with `defaultNow().notNull()`
- Export inferred types

## Files Touched

- `packages/backend/src/infrastructure/database/schema/complianceFrameworks.ts` - CREATE (~25 LOC)

## Tests Affected

- None (pure creation, no existing code references this table)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (schema files are validated by migration generation + integration tests in later sprints)

## Definition of Done

- [ ] File created and compiles
- [ ] Types exported correctly
- [ ] Follows existing schema patterns
- [ ] No TypeScript errors
