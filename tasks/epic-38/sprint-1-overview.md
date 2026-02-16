# Sprint 1: Refactoring Splits

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** Split 3 over-limit files to stay under 300 LOC before any ISO feature work
**Stories:** 38.1.1 - 38.1.3 (3 stories)
**Dependencies:** None (Sprint 1 is the entry point)
**Agents:** `backend-agent` | `export-agent`

---

## Context

The audit identified 3 files that exceed the 300 LOC limit and will grow further with ISO enrichment:
- `ScoringExportService.ts` (436 LOC) - Must split before adding ISO data fetching + Excel support
- `ScoringWordExporter.ts` (483 LOC) - Must split before adding ISO sections
- `exportNarrativePrompt.ts` (393 LOC) - Must split before adding ISO context injection

These splits are **blockers** for all subsequent ISO work. Zero behavioral change in this sprint.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.1.1** | Split ScoringExportService | Extract response selection + narrative helpers to ScoringExportHelpers | None |
| **38.1.2** | Split ScoringWordExporter | Extract section builders to WordSectionBuilders | None |
| **38.1.3** | Split exportNarrativePrompt | Extract system prompt and user prompt to separate files | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.1.1   | ScoringExportService.ts (MODIFY)                       | None               |
    |          | ScoringExportHelpers.ts (NEW)                          |                    |
    +----------+--------------------------------------------------------+--------------------+
    | 38.1.2   | ScoringWordExporter.ts (MODIFY)                        | None               |
    |          | WordSectionBuilders.ts (NEW)                            |                    |
    +----------+--------------------------------------------------------+--------------------+
    | 38.1.3   | exportNarrativePrompt.ts (MODIFY)                      | None               |
    |          | exportNarrativeSystemPrompt.ts (NEW)                    |                    |
    |          | exportNarrativeUserPrompt.ts (NEW)                      |                    |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: All Independent Splits (3 stories in parallel)

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                           |
|           (No file overlap between these stories)                       |
+------------------------+------------------------+-----------------------+
|   38.1.1               |   38.1.2               |   38.1.3              |
|   Export Service Split  |   Word Exporter Split  |   Narrative Split     |
|                        |                        |                       |
|   FILES:               |   FILES:               |   FILES:              |
|   ScoringExportService |   ScoringWordExporter  |   exportNarrative-    |
|   .ts (MODIFY)         |   .ts (MODIFY)         |   Prompt.ts (MODIFY)  |
|   ScoringExportHelpers |   WordSectionBuilders  |   exportNarrative-    |
|   .ts (NEW)            |   .ts (NEW)            |   SystemPrompt.ts NEW |
|                        |                        |   exportNarrative-    |
|                        |                        |   UserPrompt.ts (NEW) |
|                        |                        |                       |
|   backend-agent        |   export-agent         |   backend-agent       |
+------------------------+------------------------+-----------------------+
```

**Stories:** 38.1.1, 38.1.2, 38.1.3
**Agents needed:** Up to 3
**File overlap:** None - each story touches unique files
**Review:** After all complete

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.1.1 | `sprint-1-story-1.md` | backend-agent |
| 38.1.2 | `sprint-1-story-2.md` | export-agent |
| 38.1.3 | `sprint-1-story-3.md` | backend-agent |

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] `ScoringExportService.ts` is under 300 LOC (target: ~200 LOC)
- [ ] `ScoringWordExporter.ts` is under 300 LOC (target: ~200 LOC)
- [ ] `exportNarrativePrompt.ts` is under 300 LOC (target: ~30 LOC barrel re-export)
- [ ] All new helper/builder files exist and compile
- [ ] All existing tests pass (zero regressions)
- [ ] No TypeScript errors
- [ ] No behavioral changes (pure refactor)
