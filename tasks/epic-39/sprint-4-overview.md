# Sprint 4: Code Quality -- Split Oversized Files

**Epic:** 39 - Scoring Pipeline Optimization
**Focus:** Split 3 files exceeding 300 LOC limit on the active scoring path
**Stories:** 39.4.0 - 39.4.5 (6 stories)
**Dependencies:** Sprints 1-3 (functional changes must land before refactors)
**Agents:** `backend-agent`

---

## Context

Three files on the active scoring path exceed the 300 LOC limit:
- `DocumentParserService.ts` (784 LOC) -- implements both IIntakeDocumentParser and IScoringDocumentParser
- `ClaudeClient.ts` (844 LOC) -- implements IClaudeClient, IVisionClient, and ILLMClient
- `ScoringHandler.ts` (~567 LOC) -- WebSocket scoring orchestration + progress + post-score behaviors

These are pure refactors with zero behavioral change. Each split preserves identical functionality, method signatures, and test compatibility. The splits are deferred to Sprint 4 because Sprints 1-3 work with the existing file structure.

**Prereq cleanup:** `DocumentUploadController.ts` (920 LOC) has 2 deprecated private methods (`parseForIntake`, `parseForScoring`) with zero callers and zero tests. Story 39.4.0 deletes them (~134 LOC) before the main splits begin. Project is in dev -- no backwards compatibility needed.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **39.4.0** | Delete deprecated methods from DocumentUploadController | Remove `parseForIntake` + `parseForScoring` (134 LOC, zero callers) | None |
| **39.4.1** | Split DocumentParserService: IntakeParser | Extract intake parsing to IntakeDocumentParser.ts | None |
| **39.4.2** | Split DocumentParserService: Shared helpers | Extract shared helpers to DocumentParserHelpers.ts | 39.4.1 |
| **39.4.3** | Split ClaudeClient: Text + Vision | Extract text/vision methods to ClaudeTextClient and ClaudeVisionClient | None |
| **39.4.4** | Split ClaudeClient: Stream client | Extract streamWithTool to ClaudeStreamClient | 39.4.3 |
| **39.4.5** | Split ScoringHandler: Post-score behaviors | Extract post-score logic to ScoringPostProcessor | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+---------------------------------------------------+--------------------+
    | Story    | Files Touched                                     | Conflicts          |
    +----------+---------------------------------------------------+--------------------+
    | 39.4.1   | IntakeDocumentParser.ts (NEW)                     | 39.4.2             |
    |          | DocumentParserService.ts (MODIFY -- remove intake)|                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.4.2   | DocumentParserHelpers.ts (NEW)                    | 39.4.1             |
    |          | DocumentParserService.ts (MODIFY -- import helpers)|                    |
    |          | IntakeDocumentParser.ts (MODIFY -- import helpers) |                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.4.3   | ClaudeTextClient.ts (NEW)                         | 39.4.4             |
    |          | ClaudeVisionClient.ts (NEW)                       |                    |
    |          | ClaudeClient.ts (MODIFY -- remove methods)         |                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.4.4   | ClaudeStreamClient.ts (NEW)                       | 39.4.3             |
    |          | ClaudeClient.ts (MODIFY -- delegate streamWithTool)|                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.4.5   | ScoringPostProcessor.ts (NEW)                     | None               |
    |          | ScoringHandler.ts (MODIFY -- delegate post-score)  |                    |
    +----------+---------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 0: Prerequisite Cleanup (1 story, fast)

```
+------------------------------------------------------------------------+
|                     PHASE 0 - RUN FIRST                                |
|             (Quick deletion, no dependencies)                          |
+------------------------------------------------------------------------+
|   39.4.0                                                               |
|   Delete deprecated methods from DocumentUploadController              |
|                                                                        |
|   FILES:                                                               |
|   DocumentUploadController.ts (MODIFY -- delete 2 private methods)     |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 39.4.0
**Agents needed:** 1 (backend-agent)
**File overlap:** None with Phase 1 stories
**Review:** Quick pass (deletion only)

---

### Phase 1: Independent Splits (3 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+------------------------+------------------------+----------------------+
|   39.4.1               |   39.4.3               |   39.4.5             |
|   Intake Parser Split  |   Claude Text+Vision   |   ScoringHandler     |
|                        |   Split                |   Post-Score Split   |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   IntakeDocument-      |   ClaudeTextClient.ts  |   ScoringPost-       |
|   Parser.ts (NEW)      |   (NEW)                |   Processor.ts (NEW) |
|   DocumentParser-      |   ClaudeVisionClient.ts|   ScoringHandler.ts  |
|   Service.ts (MODIFY)  |   (NEW)                |   (MODIFY)           |
|                        |   ClaudeClient.ts      |                      |
|                        |   (MODIFY)             |                      |
|                        |                        |                      |
|   backend-agent        |   backend-agent        |   backend-agent      |
+------------------------+------------------------+----------------------+
```

**Stories:** 39.4.1, 39.4.3, 39.4.5
**Agents needed:** 3 (all backend-agent)
**File overlap:** None -- each story touches unique files
**Review:** After all complete

---

### Phase 2: Dependent Splits (2 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - RUN IN PARALLEL                          |
|     (Each depends on one Phase 1 story, but no overlap with each other)|
+----------------------------------+-------------------------------------+
|   39.4.2                         |   39.4.4                            |
|   DocumentParser Helpers         |   Claude Stream Client              |
|                                  |                                     |
|   FILES:                         |   FILES:                            |
|   DocumentParserHelpers.ts (NEW) |   ClaudeStreamClient.ts (NEW)       |
|   DocumentParserService.ts       |   ClaudeClient.ts                   |
|   (modified by 39.4.1)           |   (modified by 39.4.3)              |
|   IntakeDocumentParser.ts        |                                     |
|   (created by 39.4.1)            |                                     |
|                                  |                                     |
|   MUST wait for 39.4.1           |   MUST wait for 39.4.3              |
|                                  |                                     |
|   backend-agent                  |   backend-agent                     |
+----------------------------------+-------------------------------------+
```

**Stories:** 39.4.2, 39.4.4
**Agents needed:** 2 (both backend-agent)
**File overlap:** None between each other; each depends on a Phase 1 story
**Dependencies:** 39.4.2 requires 39.4.1; 39.4.4 requires 39.4.3
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 39.4.0 | `sprint-4-story-0.md` | backend-agent |
| 39.4.1 | `sprint-4-story-1.md` | backend-agent |
| 39.4.2 | `sprint-4-story-2.md` | backend-agent |
| 39.4.3 | `sprint-4-story-3.md` | backend-agent |
| 39.4.4 | `sprint-4-story-4.md` | backend-agent |
| 39.4.5 | `sprint-4-story-5.md` | backend-agent |

---

## Exit Criteria

Sprint 4 is complete when:
- [ ] DocumentUploadController.ts deprecated methods removed (~786 LOC remaining)
- [ ] DocumentParserService.ts under 300 LOC (intake parsing extracted)
- [ ] ClaudeClient.ts under 300 LOC (text, vision, stream extracted)
- [ ] ScoringHandler.ts under 300 LOC (post-score behaviors extracted)
- [ ] All existing tests still pass (zero behavioral change)
- [ ] No circular imports introduced
- [ ] Container wiring updated for new service classes
- [ ] All files under 300 LOC
- [ ] No TypeScript errors
- [ ] **Post-implementation review swarm passed** (3-reviewer mesh: line-by-line, data flow trace, architecture compliance)
- [ ] Review swarm findings addressed before Codex gate
