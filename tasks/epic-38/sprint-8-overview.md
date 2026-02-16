# Sprint 8: Testing & Compliance Audit

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** E2E integration tests, snapshot tests, ISO messaging compliance audit
**Stories:** 38.8.1 - 38.8.4 (4 stories)
**Dependencies:** Sprints 3-7 complete (all export + frontend work done)
**Agents:** `backend-agent`

---

## Context

This sprint ensures everything works end-to-end and that ISO messaging compliance is enforced. The key deliverables:
1. E2E test: score an assessment -> export PDF/Word/Excel -> verify ISO data in output
2. Snapshot tests for template stability
3. Automated messaging audit scanning all templates and prompts for prohibited terms
4. Manual QA checklist spec for human reviewers

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.8.1** | E2E export integration test | Score -> export -> verify ISO in report | None |
| **38.8.2** | Snapshot tests for template stability | PDF/Word/Excel output snapshot comparison | None |
| **38.8.3** | ISO messaging compliance audit test | Scan all templates + prompts for prohibited terms | None |
| **38.8.4** | Manual QA checklist spec | Documented checklist for human 5-report review | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.8.1   | __tests__/integration/export-iso.test.ts (NEW)         | None               |
    +----------+--------------------------------------------------------+--------------------+
    | 38.8.2   | __tests__/unit/export-snapshots.test.ts (NEW)          | None               |
    +----------+--------------------------------------------------------+--------------------+
    | 38.8.3   | __tests__/unit/iso-messaging-audit.test.ts (NEW)       | None               |
    |          | ExportNarrativeGenerator.ts (MODIFY)                   |                    |
    |          | ScoringExportService.ts (MODIFY)                       |                    |
    +----------+--------------------------------------------------------+--------------------+
    | 38.8.4   | tasks/epic-38/qa-checklist.md (NEW)                     | None               |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: All stories in parallel (no file overlap)

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - ALL IN PARALLEL                           |
|             (All stories create new files, no overlap)                  |
+-----------------+------------------+------------------+-----------------+
|   38.8.1        |   38.8.2         |   38.8.3         |   38.8.4        |
|   E2E Export    |   Snapshots      |   Messaging      |   QA Checklist  |
|                 |                  |   Audit          |                 |
|   FILES:        |   FILES:         |   FILES:          |   FILES:        |
|   export-iso    |   export-snap    |   iso-messaging   |   qa-checklist  |
|   .test.ts NEW  |   .test.ts NEW   |   -audit.test NEW |   .md (NEW)     |
|                 |                  |   ExportNarrative |                 |
|                 |                  |   Generator.ts    |                 |
|                 |                  |   (MODIFY)        |                 |
|                 |                  |   ScoringExport   |                 |
|                 |                  |   Service.ts      |                 |
|                 |                  |   (MODIFY)        |                 |
|                 |                  |                   |                 |
|   backend-agent |   backend-agent  |   backend-agent   |   backend-agent |
+-----------------+------------------+------------------+-----------------+
```

**Stories:** 38.8.1, 38.8.2, 38.8.3, 38.8.4
**Agents needed:** Up to 4
**File overlap:** None
**Review:** After all complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.8.1 | `sprint-8-story-1.md` | backend-agent |
| 38.8.2 | `sprint-8-story-2.md` | backend-agent |
| 38.8.3 | `sprint-8-story-3.md` | backend-agent |
| 38.8.4 | `sprint-8-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 8 is complete when:
- [ ] E2E integration test passes: score -> export PDF/Word/Excel -> verify ISO data
- [ ] Snapshot tests capture current template output for regression detection
- [ ] Messaging audit test scans all templates/prompts and finds zero prohibited terms
- [ ] Manual QA checklist documented for human review
- [ ] All tests pass
- [ ] No TypeScript errors
