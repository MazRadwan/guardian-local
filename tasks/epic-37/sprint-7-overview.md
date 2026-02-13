# Sprint 7: Validation + Regression

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Golden sample regression, extensibility test, messaging compliance audit
**Stories:** 37.7.1 - 37.7.3 (3 stories)
**Dependencies:** Sprint 6 complete (full scoring pipeline enriched)
**Agents:** `backend-agent`

---

## Context

This sprint validates the epic's success criteria. No new features -- only testing and verification:
1. **Golden sample regression** (SC-6): Verify existing scoring quality does not degrade
2. **Extensibility test** (SC-3): Seed a fake Tier 2 standard with zero code changes
3. **Messaging audit** (SC-8): Verify no prohibited ISO terms in prompts

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.7.1** | Golden sample regression baseline | Capture scoring baseline, compare before/after | None |
| **37.7.2** | Extensibility test (fake Tier 2) | Seed ISO 22989 with zero code changes | None |
| **37.7.3** | ISO messaging compliance audit | Automated check for prohibited terms in prompts | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-------------------------------------------------------+--------------------+
    | Story    | Files Touched                                         | Conflicts          |
    +----------+-------------------------------------------------------+--------------------+
    | 37.7.1   | __tests__/integration/golden-sample-regression.test.ts| None               |
    |          | (NEW)                                                 |                    |
    | 37.7.2   | __tests__/integration/iso-extensibility.test.ts (NEW) | None               |
    | 37.7.3   | __tests__/unit/infrastructure/ai/prompts/             | None               |
    |          | iso-messaging-compliance.test.ts (NEW)                 |                    |
    +----------+-------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: All 3 Stories in Parallel

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (All create independent new test files)                    |
+------------------------+------------------------+----------------------+
|   37.7.1               |   37.7.2               |   37.7.3             |
|   Golden Sample        |   Extensibility Test   |   Messaging Audit    |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   golden-sample-       |   iso-extensibility    |   iso-messaging-     |
|   regression.test.ts   |   .test.ts (NEW)       |   compliance.test.ts |
|   (NEW)                |                        |   (NEW)              |
|                        |                        |                      |
|   backend-agent        |   backend-agent        |   backend-agent      |
+------------------------+------------------------+----------------------+
```

**Stories:** 37.7.1, 37.7.2, 37.7.3
**Agents needed:** Up to 3
**File overlap:** None
**Review:** After all complete (Epic done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.7.1 | `sprint-7-story-1.md` | backend-agent |
| 37.7.2 | `sprint-7-story-2.md` | backend-agent |
| 37.7.3 | `sprint-7-story-3.md` | backend-agent |

---

## Exit Criteria

Sprint 7 is complete when:
- [ ] Golden sample regression framework exists and can compare scoring before/after
- [ ] Extensibility test passes: fake Tier 2 standard seeded with zero code changes
- [ ] Messaging compliance test passes: no prohibited terms in any prompt output
- [ ] All Epic 37 success criteria verified
- [ ] `pnpm test` passes (unit + integration)
- [ ] No TypeScript errors
