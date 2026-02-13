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
| **37.2.2** | framework_versions schema | Table + types for standard version tracking | None |
| **37.2.3** | framework_controls schema | Table + types + indexes for ISO controls | None |
| **37.2.4** | interpretive_criteria schema | Table + types for Guardian's criteria | None |
| **37.2.5** | dimension_control_mappings schema | Table + types for dimension-to-control maps | None |
| **37.2.6** | assessment_compliance_results schema | Table + types for per-assessment compliance | None |
| **37.2.7** | Update schema/index.ts barrel exports | Add 6 new table exports | 37.2.1-37.2.6 |
| **37.2.8** | Update test-db.ts truncation list | Add 6 tables to TRUNCATE CASCADE | 37.2.7 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-----------------------------------------------+--------------------+
    | Story    | Files Touched                                 | Conflicts          |
    +----------+-----------------------------------------------+--------------------+
    | 37.2.1   | schema/complianceFrameworks.ts (NEW)           | None               |
    | 37.2.2   | schema/frameworkVersions.ts (NEW)              | None               |
    | 37.2.3   | schema/frameworkControls.ts (NEW)              | None               |
    | 37.2.4   | schema/interpretiveCriteria.ts (NEW)           | None               |
    | 37.2.5   | schema/dimensionControlMappings.ts (NEW)       | None               |
    | 37.2.6   | schema/assessmentComplianceResults.ts (NEW)    | None               |
    | 37.2.7   | schema/index.ts (MODIFY)                      | 37.2.8             |
    | 37.2.8   | __tests__/setup/test-db.ts (MODIFY)            | None               |
    +----------+-----------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Schema File Creation (6 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|           (Each story creates an independent new file)                 |
+------------------------+------------------------+----------------------+
|   37.2.1               |   37.2.2               |   37.2.3             |
|   compliance_          |   framework_            |   framework_         |
|   frameworks           |   versions              |   controls           |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   complianceFrame-     |   frameworkVersions    |   frameworkControls  |
|   works.ts (NEW)       |   .ts (NEW)            |   .ts (NEW)          |
+------------------------+------------------------+----------------------+
|   37.2.4               |   37.2.5               |   37.2.6             |
|   interpretive_        |   dimension_control_    |   assessment_        |
|   criteria             |   mappings             |   compliance_results |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   interpretive-        |   dimensionControl-    |   assessmentCompl-   |
|   Criteria.ts (NEW)    |   Mappings.ts (NEW)    |   ianceResults.ts    |
+------------------------+------------------------+----------------------+
```

**Stories:** 37.2.1, 37.2.2, 37.2.3, 37.2.4, 37.2.5, 37.2.6
**Agents needed:** Up to 6 (or 2-3 with batching)
**File overlap:** None
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
