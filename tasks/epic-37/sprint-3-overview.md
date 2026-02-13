# Sprint 3: Domain Layer

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Domain entities, domain models, and ISO-specific types
**Stories:** 37.3.1 - 37.3.5 (5 stories)
**Dependencies:** Sprint 2 complete (database schema exists)
**Agents:** `backend-agent`

---

## Context

Create domain entities and value objects for the ISO compliance tables. These follow the existing pattern established by `Assessment.ts` (entity with `create()` and `fromPersistence()` factory methods). Also define the ISO-specific TypeScript types and DTOs that will be used across the application.

Note: AssessmentComplianceResult does not have a dedicated domain object in this sprint. The table is Phase 2 only (per PRD Section 9) and the DTO in types.ts is sufficient for the extensibility test in Sprint 7. A domain entity will be created when Phase 2 implementation begins.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.3.1** | ISO types and DTOs | Types file + DTOs for all 6 ISO entities | None |
| **37.3.2** | ComplianceFramework + FrameworkVersion entities | Domain entities with factory methods | 37.3.1 |
| **37.3.3** | FrameworkControl domain model | Immutable domain model | 37.3.1 |
| **37.3.4** | InterpretiveCriteria domain model | Domain model with versioning | 37.3.1 |
| **37.3.5** | DimensionControlMapping domain model | Simple domain model | 37.3.1 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+----------------------------------------------------+--------------------+
    | Story    | Files Touched                                      | Conflicts          |
    +----------+----------------------------------------------------+--------------------+
    | 37.3.1   | domain/compliance/types.ts (NEW)                   | None               |
    |          | domain/compliance/dtos.ts (NEW)                    |                    |
    +----------+----------------------------------------------------+--------------------+
    | 37.3.2   | domain/compliance/ComplianceFramework.ts (NEW)     | None               |
    |          | domain/compliance/FrameworkVersion.ts (NEW)         |                    |
    +----------+----------------------------------------------------+--------------------+
    | 37.3.3   | domain/compliance/FrameworkControl.ts (NEW)        | None               |
    +----------+----------------------------------------------------+--------------------+
    | 37.3.4   | domain/compliance/InterpretiveCriteria.ts (NEW)    | None               |
    +----------+----------------------------------------------------+--------------------+
    | 37.3.5   | domain/compliance/DimensionControlMapping.ts (NEW) | None               |
    +----------+----------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Types Foundation (1 story)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - TYPES FIRST                              |
+------------------------------------------------------------------------+
|   37.3.1                                                               |
|   ISO Types + DTOs                                                     |
|                                                                        |
|   FILES:                                                               |
|   domain/compliance/types.ts (NEW)                                     |
|   domain/compliance/dtos.ts (NEW)                                      |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.3.1
**Review:** After complete

### Phase 2: Entities + Domain Models (4 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - RUN IN PARALLEL                          |
|              (All import from types.ts created in Phase 1)             |
+------------------------+------------------------+----------------------+
|   37.3.2               |   37.3.3               |   37.3.4             |
|   ComplianceFramework  |   FrameworkControl     |   Interpretive-      |
|   + FrameworkVersion   |   (domain model)       |   Criteria           |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   ComplianceFrame-     |   FrameworkControl.ts  |   Interpretive-      |
|   work.ts (NEW)        |   (NEW)                |   Criteria.ts (NEW)  |
|   FrameworkVersion.ts  |                        |                      |
|   (NEW)                |                        |                      |
+------------------------+------------------------+----------------------+
|   37.3.5                                                               |
|   DimensionControlMapping (domain model)                               |
|                                                                        |
|   FILES:                                                               |
|   DimensionControlMapping.ts (NEW)                                     |
+------------------------------------------------------------------------+
```

**Stories:** 37.3.2, 37.3.3, 37.3.4, 37.3.5
**Agents needed:** Up to 4
**File overlap:** None
**Review:** After all complete

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.3.1 | `sprint-3-story-1.md` | backend-agent |
| 37.3.2 | `sprint-3-story-2.md` | backend-agent |
| 37.3.3 | `sprint-3-story-3.md` | backend-agent |
| 37.3.4 | `sprint-3-story-4.md` | backend-agent |
| 37.3.5 | `sprint-3-story-5.md` | backend-agent |

---

## Exit Criteria

Sprint 3 is complete when:
- [ ] All types and DTOs defined in `domain/compliance/`
- [ ] All entities and value objects created (5 of 6 — AssessmentComplianceResult deferred to Phase 2)
- [ ] All domain objects have `create()` and `fromPersistence()` factory methods
- [ ] Unit tests for all domain objects
- [ ] No TypeScript errors
- [ ] All existing tests pass
