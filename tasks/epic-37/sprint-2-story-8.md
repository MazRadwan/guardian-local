# Story 37.2.8: Update test-db.ts Truncation List + Generate Migration

## Description

Add the 6 new tables to the `truncateAllTables()` function in `test-db.ts` so integration tests properly clean up ISO compliance data. Then generate and apply the Drizzle migration for all 6 new tables.

## Acceptance Criteria

- [ ] `test-db.ts` TRUNCATE list includes all 6 new tables
- [ ] Tables listed in correct dependency order (child tables before parent tables for CASCADE)
- [ ] Migration generated via `pnpm --filter @guardian/backend db:generate`
- [ ] Migration applied to dev DB via `pnpm --filter @guardian/backend db:migrate`
- [ ] Migration applied to test DB via `pnpm --filter @guardian/backend db:migrate:test`
- [ ] `pnpm test:unit` passes
- [ ] `pnpm test:integration` passes

## Technical Approach

### 1. Update test-db.ts

**File:** `packages/backend/__tests__/setup/test-db.ts`

Current truncation (line 49-62):
```sql
TRUNCATE TABLE
  assessment_results,
  dimension_scores,
  responses,
  files,
  messages,
  conversations,
  questions,
  assessments,
  vendors,
  users
CASCADE
```

Updated (add 6 new tables BEFORE `assessments` since `assessment_compliance_results` references `assessments`):
```sql
TRUNCATE TABLE
  assessment_compliance_results,
  dimension_control_mappings,
  interpretive_criteria,
  framework_controls,
  framework_versions,
  compliance_frameworks,
  assessment_results,
  dimension_scores,
  responses,
  files,
  messages,
  conversations,
  questions,
  assessments,
  vendors,
  users
CASCADE
```

**Order rationale:** CASCADE handles FK dependencies, but listing child tables before parent tables is a good practice. The new ISO tables form their own hierarchy:
1. `assessment_compliance_results` (depends on assessments, framework_versions, framework_controls)
2. `dimension_control_mappings` (depends on framework_controls)
3. `interpretive_criteria` (depends on framework_controls)
4. `framework_controls` (depends on framework_versions)
5. `framework_versions` (depends on compliance_frameworks)
6. `compliance_frameworks` (root)

### 2. Generate Migration

```bash
pnpm --filter @guardian/backend db:generate
```

This will detect all 6 new tables and generate a single migration file.

### 3. Apply Migration

```bash
# Dev database
pnpm --filter @guardian/backend db:migrate

# Test database
pnpm --filter @guardian/backend db:migrate:test
```

### 4. Verify

```bash
# All unit tests should pass
pnpm test:unit

# Integration tests should pass (new tables in truncation won't cause issues)
pnpm test:integration
```

## Files Touched

- `packages/backend/__tests__/setup/test-db.ts` - MODIFY (add 6 tables to TRUNCATE list, ~line 50-55)

## Tests Affected

- All integration tests that call `truncateAllTables()` -- they will now also truncate the 6 new (empty) tables. This is safe since CASCADE handles it and the tables are empty.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Run `pnpm test:integration` to verify truncation works with new tables
- [ ] Verify migration applies cleanly (no errors in `db:migrate` or `db:migrate:test`)

## Definition of Done

- [ ] 6 new tables in truncation list
- [ ] Migration generated
- [ ] Migration applied to dev and test databases
- [ ] All existing tests pass
- [ ] No TypeScript errors
