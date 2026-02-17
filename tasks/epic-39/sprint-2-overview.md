# Sprint 2: Progress Feedback Enhancement

**Epic:** 39 - Scoring Pipeline Optimization
**Focus:** Add granular progress events across the scoring pipeline and fix two known bugs
**Stories:** 39.2.1 - 39.2.4 (4 stories)
**Dependencies:** Sprint 1 (regex extraction adds new progress stages to report)
**Agents:** `backend-agent` | `frontend-agent`

---

## Context

Currently the scoring pipeline emits only 2 meaningful progress messages across a 7-minute flow, with long periods of dead air. Sprint 2 adds granular progress events at each pipeline stage (text extraction, format detection, regex parsing, ISO fetch, scoring stream, validation, storage) using the existing `ScoringProgressEvent` infrastructure. No new WebSocket event types are needed -- just more `onProgress()` calls with better messages and percentage values.

**Two bugs must also be fixed (Codex catches):**
1. `ScoringLLMService:114` -- `narrativeReport.length % 500 === 0` triggers near-randomly with variable chunk sizes. Replace with threshold-based delta reporting.
2. `MessageList.tsx:325` -- only renders progress for `parsing|scoring` status. New stages like `validating` would be invisible to users.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **39.2.1** | Granular progress in ScoringService | Add onProgress calls at each pipeline stage | None |
| **39.2.2** | Fix `% 500` progress bug in ScoringLLMService | Replace modulo with threshold-based delta reporting | None |
| **39.2.3** | Expand frontend progress rendering | Fix MessageList status filter + enhance ProgressMessage | None |
| **39.2.4** | Add extraction progress events | Add per-section progress during regex extraction | 39.2.1 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+---------------------------------------------------+--------------------+
    | Story    | Files Touched                                     | Conflicts          |
    +----------+---------------------------------------------------+--------------------+
    | 39.2.1   | ScoringService.ts (MODIFY)                        | 39.2.4             |
    +----------+---------------------------------------------------+--------------------+
    | 39.2.2   | ScoringLLMService.ts (MODIFY)                     | None               |
    +----------+---------------------------------------------------+--------------------+
    | 39.2.3   | MessageList.tsx (MODIFY)                           | None               |
    |          | ProgressMessage.tsx (MODIFY)                       |                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.2.4   | ScoringService.ts (MODIFY)                        | 39.2.1             |
    |          | DocumentParserService.ts (MODIFY)                  |                    |
    +----------+---------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Bug Fixes + Progress (3 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+------------------------+------------------------+----------------------+
|   39.2.1               |   39.2.2               |   39.2.3             |
|   ScoringService       |   ScoringLLMService    |   Frontend Progress  |
|   Progress Events      |   % 500 Bug Fix        |   Rendering Fix      |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   ScoringService.ts    |   ScoringLLMService.ts |   MessageList.tsx    |
|                        |                        |   ProgressMessage.tsx|
|                        |                        |                      |
|   backend-agent        |   backend-agent        |   frontend-agent     |
+------------------------+------------------------+----------------------+
```

**Stories:** 39.2.1, 39.2.2, 39.2.3
**Agents needed:** 3 (2 backend, 1 frontend)
**File overlap:** None -- each story touches unique files
**Review:** After all complete

---

### Phase 2: Extraction Progress (sequential -- depends on Phase 1)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|              (Depends on ScoringService.ts from Phase 1)               |
+------------------------------------------------------------------------+
|   39.2.4                                                               |
|   Extraction Progress Events                                           |
|                                                                        |
|   FILES:                                                               |
|   - ScoringService.ts (modified by 39.2.1)                             |
|   - DocumentParserService.ts (MODIFY -- add onProgress parameter)      |
|                                                                        |
|   MUST wait for 39.2.1 to complete                                     |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 39.2.4
**Agents needed:** 1
**Dependencies:** Requires 39.2.1 complete (ScoringService.ts overlap)
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 39.2.1 | `sprint-2-story-1.md` | backend-agent |
| 39.2.2 | `sprint-2-story-2.md` | backend-agent |
| 39.2.3 | `sprint-2-story-3.md` | frontend-agent |
| 39.2.4 | `sprint-2-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 2 is complete when:
- [ ] 11 granular progress messages emitted across the scoring pipeline
- [ ] Progress percentages interpolated smoothly (5% -> 100%)
- [ ] `% 500` bug fixed -- threshold-based delta reporting for scoring stream progress
- [ ] Frontend renders all progress statuses (not just `parsing|scoring`)
- [ ] Per-section progress during regex extraction (if Sprint 1 regex is active)
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] **Post-implementation review swarm passed** (3-reviewer mesh: line-by-line, data flow trace, architecture compliance)
- [ ] Review swarm findings addressed before Codex gate
