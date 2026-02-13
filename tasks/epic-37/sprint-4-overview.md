# Sprint 4: Repository Layer

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Repository interfaces + Drizzle ORM implementations for all ISO tables
**Stories:** 37.4.1 - 37.4.5 (5 stories)
**Dependencies:** Sprint 3 complete (domain entities + types exist)
**Agents:** `backend-agent`

---

## Context

Create 5 repository pairs (interface + Drizzle implementation) for the ISO compliance tables. Follows the existing pattern from `IDimensionScoreRepository` + `DrizzleDimensionScoreRepository`. Each repository handles CRUD for one or two related tables. The `assessment_compliance_results` table does not need a repository yet (Phase 2 only) but can share one with another story if needed.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.4.1** | ComplianceFramework repository | Interface + Drizzle impl for frameworks + versions | None |
| **37.4.2** | FrameworkControl repository | Interface + Drizzle impl for controls | None |
| **37.4.3** | InterpretiveCriteria repository | Interface + Drizzle impl for criteria | None |
| **37.4.4** | DimensionControlMapping repository | Interface + Drizzle impl for mappings | None |
| **37.4.5** | Repository integration tests | Test all 4 repos against real test DB | 37.4.1-37.4.4 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-------------------------------------------------------+--------------------+
    | Story    | Files Touched                                         | Conflicts          |
    +----------+-------------------------------------------------------+--------------------+
    | 37.4.1   | IComplianceFrameworkRepository.ts (NEW)               | None               |
    |          | DrizzleComplianceFrameworkRepository.ts (NEW)          |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 37.4.2   | IFrameworkControlRepository.ts (NEW)                  | None               |
    |          | DrizzleFrameworkControlRepository.ts (NEW)             |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 37.4.3   | IInterpretiveCriteriaRepository.ts (NEW)              | None               |
    |          | DrizzleInterpretiveCriteriaRepository.ts (NEW)         |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 37.4.4   | IDimensionControlMappingRepository.ts (NEW)           | None               |
    |          | DrizzleDimensionControlMappingRepository.ts (NEW)      |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 37.4.5   | __tests__/integration/iso-repositories.test.ts (NEW)  | None               |
    +----------+-------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: All 4 Repository Pairs (in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|           (Each story creates independent new files)                   |
+------------------------+------------------------+----------------------+
|   37.4.1               |   37.4.2               |   37.4.3             |
|   Framework Repo       |   Control Repo         |   Criteria Repo      |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   IComplianceFrame-    |   IFrameworkControl-   |   IInterpretive-     |
|   workRepository.ts    |   Repository.ts (NEW)  |   CriteriaRepo-     |
|   (NEW)                |                        |   sitory.ts (NEW)    |
|   DrizzleCompliance-   |   DrizzleFramework-    |   DrizzleInterpre-   |
|   FrameworkRepo.ts     |   ControlRepo.ts       |   tiveCriteriaRepo   |
|   (NEW)                |   (NEW)                |   .ts (NEW)          |
+------------------------+------------------------+----------------------+
|   37.4.4                                                               |
|   Mapping Repo                                                         |
|                                                                        |
|   FILES:                                                               |
|   IDimensionControlMappingRepository.ts (NEW)                          |
|   DrizzleDimensionControlMappingRepository.ts (NEW)                    |
+------------------------------------------------------------------------+
```

**Stories:** 37.4.1, 37.4.2, 37.4.3, 37.4.4
**Agents needed:** Up to 4
**File overlap:** None
**Review:** After all complete

### Phase 2: Integration Tests (sequential)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|              (Depends on all repos existing)                           |
+------------------------------------------------------------------------+
|   37.4.5                                                               |
|   Integration tests for all 4 repositories                            |
|                                                                        |
|   FILES:                                                               |
|   __tests__/integration/iso-repositories.test.ts (NEW)                |
|                                                                        |
|   MUST wait for 37.4.1-37.4.4 to complete                             |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.4.5
**Dependencies:** All Phase 1 repos
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.4.1 | `sprint-4-story-1.md` | backend-agent |
| 37.4.2 | `sprint-4-story-2.md` | backend-agent |
| 37.4.3 | `sprint-4-story-3.md` | backend-agent |
| 37.4.4 | `sprint-4-story-4.md` | backend-agent |
| 37.4.5 | `sprint-4-story-5.md` | backend-agent |

---

## Exit Criteria

Sprint 4 is complete when:
- [ ] All 4 repository interfaces created in `application/interfaces/`
- [ ] All 4 Drizzle implementations created in `infrastructure/database/repositories/`
- [ ] Integration tests pass against real test database
- [ ] `pnpm test:integration` passes
- [ ] No TypeScript errors
