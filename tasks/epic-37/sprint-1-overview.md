# Sprint 1: Refactoring Splits

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Split 3 over-limit files to stay under 300 LOC before any ISO feature work
**Stories:** 37.1.1 - 37.1.5 (5 stories)
**Dependencies:** None (Sprint 1 is the entry point)
**Agents:** `backend-agent`

---

## Context

The audit identified 3 files that exceed or will exceed the 300 LOC limit:
- `ScoringService.ts` (542 LOC) - Must split before adding ISO integration
- `scoringPrompt.ts` (348 LOC) - Must split before adding ISO catalog
- `ScoringPayloadValidator.ts` (275 LOC) - Will exceed with ISO+confidence additions

These splits are **blockers** for all subsequent ISO work. Zero behavioral change in this sprint.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.1.1** | Extract ScoringService helper methods | Move storeResponses, storeScores, helpers to ScoringStorageService | None |
| **37.1.2** | Extract ScoringService scoreWithClaude | Move LLM orchestration to ScoringLLMService | None |
| **37.1.3** | Wire split services into ScoringService | Update constructor, delegate to new services | 37.1.1, 37.1.2 |
| **37.1.4** | Split scoringPrompt.ts ISO placeholder | Extract ISO prompt section to scoringPrompt.iso.ts | None |
| **37.1.5** | Prepare ScoringPayloadValidator for ISO | Extract sub-score validation to SubScoreValidator | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+---------------------------------------------------+--------------------+
    | Story    | Files Touched                                     | Conflicts          |
    +----------+---------------------------------------------------+--------------------+
    | 37.1.1   | ScoringStorageService.ts (NEW)                    | 37.1.3             |
    |          | ScoringService.ts (READ ONLY for copy)            |                    |
    +----------+---------------------------------------------------+--------------------+
    | 37.1.2   | ScoringLLMService.ts (NEW)                        | 37.1.3             |
    |          | ScoringService.ts (READ ONLY for copy)            |                    |
    +----------+---------------------------------------------------+--------------------+
    | 37.1.3   | ScoringService.ts (MODIFY - remove methods)       | 37.1.1, 37.1.2     |
    |          | IScoringService.ts (no change)                    |                    |
    |          | index.ts (DI container)                           |                    |
    |          | ScoringService.test.ts (update imports)            |                    |
    +----------+---------------------------------------------------+--------------------+
    | 37.1.4   | scoringPrompt.iso.ts (NEW)                        | None               |
    |          | scoringPrompt.ts (MODIFY - add import+call)        |                    |
    +----------+---------------------------------------------------+--------------------+
    | 37.1.5   | SubScoreValidator.ts (NEW)                        | None               |
    |          | ScoringPayloadValidator.ts (MODIFY - delegate)     |                    |
    |          | ScoringPayloadValidator.test.ts (update imports)    |                    |
    +----------+---------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Extractions (3 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+------------------------+------------------------+----------------------+
|   37.1.1               |   37.1.2               |   37.1.4             |
|   Storage Service      |   LLM Service          |   ISO Prompt Split   |
|   (NEW)                |   (NEW)                |                      |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   ScoringStorage-      |   ScoringLLM-          |   scoringPrompt-     |
|   Service.ts (NEW)     |   Service.ts (NEW)     |   .iso.ts (NEW)      |
|                        |                        |   scoringPrompt.ts   |
|   backend-agent        |   backend-agent        |   backend-agent      |
+------------------------+------------------------+----------------------+
```

```
+------------------------------------------------------------------------+
|   37.1.5 (ALSO PHASE 1 - independent of all above)                    |
|   SubScore Validator                                                    |
|                                                                        |
|   FILES:                                                               |
|   SubScoreValidator.ts (NEW)                                           |
|   ScoringPayloadValidator.ts                                           |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.1.1, 37.1.2, 37.1.4, 37.1.5
**Agents needed:** Up to 4 (or 2 with sequential pairs)
**File overlap:** None - each story touches unique files
**Review:** After all complete

### Phase 2: Wiring (sequential - depends on Phase 1)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|              (Depends on files created in Phase 1)                     |
+------------------------------------------------------------------------+
|   37.1.3                                                               |
|   Wire Split Services into ScoringService                              |
|                                                                        |
|   FILES:                                                               |
|   - ScoringService.ts (MODIFY - remove extracted methods)              |
|   - index.ts (MODIFY - update DI wiring)                               |
|   - ScoringService.test.ts (MODIFY - update imports)                   |
|                                                                        |
|   MUST wait for 37.1.1 + 37.1.2 to complete                           |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.1.3
**Agents needed:** 1
**Dependencies:** Requires Phase 1 complete (37.1.1 + 37.1.2 create services 37.1.3 wires)
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.1.1 | `sprint-1-story-1.md` | backend-agent |
| 37.1.2 | `sprint-1-story-2.md` | backend-agent |
| 37.1.3 | `sprint-1-story-3.md` | backend-agent |
| 37.1.4 | `sprint-1-story-4.md` | backend-agent |
| 37.1.5 | `sprint-1-story-5.md` | backend-agent |

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] `ScoringService.ts` is under 300 LOC (target: ~220 LOC)
- [ ] `scoringPrompt.ts` is under 300 LOC (target: ~280 LOC after ISO placeholder)
- [ ] `ScoringPayloadValidator.ts` is under 300 LOC (target: ~180 LOC)
- [ ] All 3 new service files exist and compile
- [ ] All existing tests pass (zero regressions)
- [ ] No TypeScript errors
- [ ] No behavioral changes (pure refactor)
