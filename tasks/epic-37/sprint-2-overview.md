# Sprint 2: Database Foundation

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Create 6 new database tables for ISO compliance framework
**Stories:** 37.2.1 - 37.2.8 (8 stories)
**Dependencies:** Sprint 1 complete (refactoring splits done)
**Agents:** `backend-agent`

---

## Context

Create the 6 new database tables defined in the PRD Section 9 and audit report. Each table follows the existing pattern established by `dimensionScores.ts` and `assessmentResults.ts`. After this sprint, the database schema is ready for domain entities and repositories.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.2.1** | compliance_frameworks schema | Table + types for ISO framework registry | None |
| **37.2.2** | framework_versions schema | Table + types for standard version tracking | 37.2.1 (imports complianceFrameworks FK) |
| **37.2.3** | framework_controls schema | Table + types + indexes for ISO controls | 37.2.2 (imports frameworkVersions FK) |
| **37.2.4** | interpretive_criteria schema | Table + types for Guardian's criteria | 37.2.3 (imports frameworkControls FK) |
| **37.2.5** | dimension_control_mappings schema | Table + types for dimension-to-control maps | 37.2.3 (imports frameworkControls FK) |
| **37.2.6** | assessment_compliance_results schema | Table + types for per-assessment compliance | 37.2.2, 37.2.3 (imports frameworkVersions + frameworkControls FKs) |
| **37.2.7** | Update schema/index.ts barrel exports | Add 6 new table exports | 37.2.1-37.2.6 |
| **37.2.8** | Update test-db.ts truncation list | Add 6 tables to TRUNCATE CASCADE | 37.2.7 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-----------------------------------------------+--------------------------------------+
    | Story    | Files Touched                                 | Import Dependencies                  |
    +----------+-----------------------------------------------+--------------------------------------+
    | 37.2.1   | schema/complianceFrameworks.ts (NEW)           | None                                 |
    | 37.2.2   | schema/frameworkVersions.ts (NEW)              | 37.2.1 (imports complianceFrameworks)|
    | 37.2.3   | schema/frameworkControls.ts (NEW)              | 37.2.2 (imports frameworkVersions)   |
    | 37.2.4   | schema/interpretiveCriteria.ts (NEW)           | 37.2.3 (imports frameworkControls)   |
    | 37.2.5   | schema/dimensionControlMappings.ts (NEW)       | 37.2.3 (imports frameworkControls)   |
    | 37.2.6   | schema/assessmentComplianceResults.ts (NEW)    | 37.2.2 + 37.2.3 (imports both)      |
    | 37.2.7   | schema/index.ts (MODIFY)                      | 37.2.1-37.2.6 (all schemas)         |
    | 37.2.8   | __tests__/setup/test-db.ts (MODIFY)            | 37.2.7 (barrel exports)             |
    +----------+-----------------------------------------------+--------------------------------------+
```

---

## Execution Strategy

### Dependency Chain

```
37.2.1 (complianceFrameworks)
  └─→ 37.2.2 (frameworkVersions)
        └─→ 37.2.3 (frameworkControls)
              ├─→ 37.2.4 (interpretiveCriteria)      ─┐
              ├─→ 37.2.5 (dimensionControlMappings)   ├─ parallel after 37.2.3
              └─→ 37.2.6 (assessmentComplianceResults)─┘
                        └─→ 37.2.7 (barrel exports)
                              └─→ 37.2.8 (test-db truncation)
```

**Execution order:** 37.2.1 -> 37.2.2 -> 37.2.3 -> (37.2.4 + 37.2.5 + 37.2.6 in parallel) -> 37.2.7 -> 37.2.8

> **Practical note:** Since all 6 schema stories are NEW file creations by a single `backend-agent`, they can be created sequentially in dependency order within a single implementation pass without blocking. No file contention exists -- each story creates its own file. The key constraint is **compile-time**: all imports must resolve before `tsc` runs, so files must be created in dependency order (or all at once before compilation).

### Phase 1: Schema File Creation (sequential by dependency)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - SEQUENTIAL BY DEPENDENCY                 |
|       (Single agent creates files in import-resolution order)          |
+------------------------------------------------------------------------+
|   37.2.1 → 37.2.2 → 37.2.3 → 37.2.4 + 37.2.5 + 37.2.6              |
|                                                                        |
|   complianceFrameworks.ts                                              |
|     └→ frameworkVersions.ts (imports complianceFrameworks)              |
|          └→ frameworkControls.ts (imports frameworkVersions)            |
|               ├→ interpretiveCriteria.ts (imports frameworkControls)    |
|               ├→ dimensionControlMappings.ts (imports frameworkControls)|
|               └→ assessmentComplianceResults.ts (imports fwVersions +  |
|                    frameworkControls)                                   |
+------------------------------------------------------------------------+
```

**Stories:** 37.2.1, 37.2.2, 37.2.3, 37.2.4, 37.2.5, 37.2.6
**Agents needed:** 1 (sequential in dependency order)
**File overlap:** None (each story creates a new file)
**Review:** After all complete

### Phase 2: Barrel Exports + Test Setup (sequential)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|              (Depends on all Phase 1 files existing)                   |
+------------------------------------------------------------------------+
|   37.2.7 -> 37.2.8                                                     |
|   Update schema/index.ts, then test-db.ts                              |
|                                                                        |
|   FILES:                                                               |
|   - schema/index.ts (MODIFY - add 6 exports)                          |
|   - __tests__/setup/test-db.ts (MODIFY - add 6 tables to TRUNCATE)    |
|                                                                        |
|   MUST wait for 37.2.1-37.2.6 to complete                             |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.2.7, 37.2.8
**Agents needed:** 1 (sequential)
**Dependencies:** All Phase 1 files must exist for exports
**Review:** After complete + migration run

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.2.1 | `sprint-2-story-1.md` | backend-agent |
| 37.2.2 | `sprint-2-story-2.md` | backend-agent |
| 37.2.3 | `sprint-2-story-3.md` | backend-agent |
| 37.2.4 | `sprint-2-story-4.md` | backend-agent |
| 37.2.5 | `sprint-2-story-5.md` | backend-agent |
| 37.2.6 | `sprint-2-story-6.md` | backend-agent |
| 37.2.7 | `sprint-2-story-7.md` | backend-agent |
| 37.2.8 | `sprint-2-story-8.md` | backend-agent |

---

## Migration Strategy

After all 8 stories complete:
1. Run `pnpm --filter @guardian/backend db:generate` to generate migration
2. Run `pnpm --filter @guardian/backend db:migrate` for dev database
3. Run `pnpm --filter @guardian/backend db:migrate:test` for test database
4. Verify tables exist in both databases

---

## Exit Criteria

Sprint 2 is complete when:
- [ ] All 6 schema files created
- [ ] schema/index.ts exports all 6 tables
- [ ] test-db.ts TRUNCATE list includes all 6 tables
- [ ] Migration generated and applied to dev + test DB
- [ ] `pnpm test:unit` passes
- [ ] `pnpm test:integration` passes (new tables in truncation)
- [ ] No TypeScript errors
