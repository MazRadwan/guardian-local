# Sprint 3: Scoring Call Optimization

**Epic:** 39 - Scoring Pipeline Optimization
**Focus:** Optimize the Claude scoring API call (~2 min) via prompt caching improvements and ISO catalog efficiency
**Stories:** 39.3.1 - 39.3.4 (4 stories)
**Dependencies:** Sprint 1 (regex extraction must be in place first for full pipeline timing)
**Agents:** `backend-agent`

---

## Context

After Sprint 1 eliminates the ~5 min extraction call, the Claude scoring call (~2 min) becomes the dominant bottleneck. This sprint optimizes it through:

1. **ISO catalog in-memory caching** -- eliminates 2 sequential DB queries per scoring call
2. **Prompt restructuring** -- move ISO catalog from system prompt to user prompt for better cache hits
3. **Multi-block user prompt spike** -- investigate `cache_control` on user content blocks for optimal caching
4. **Metrics collection** -- measure before/after to validate optimizations

**IMPORTANT:** This sprint is experimental. The prompt caching changes need measurement, not assumption. The Codex review flagged that `ClaudeClient.streamWithTool` is string-based for `userPrompt` -- multi-block content arrays need an interface change.

---

## 300 LOC Rule: No Net Growth in Oversized Files

**HARD RULE (Codex governance finding):** Until Sprint 4 splits land, the following constraint applies:

| File | Current LOC | Rule |
|------|-------------|------|
| `ScoringLLMService.ts` | ~250 | No net growth. Metrics go in new `ScoringMetricsCollector.ts`. |
| `ClaudeClient.ts` | 844 | **No net LOC growth.** Interface type change only (string → union). No new logic inline. |

- **No net LOC growth** in any file already over 300 LOC. If you add lines, remove at least as many.
- **New logic MUST go in new modules only.** Story 39.3.2 correctly extracts metrics to `ScoringMetricsCollector.ts`. Story 39.3.4 changes a type signature, not logic.
- **Enforcement:** Code review MUST verify net LOC delta <= 0 for oversized files.

This is not a suggestion. Sprint 4 handles the proper file splits.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **39.3.1** | ISO catalog in-memory cache | Cache ISO controls on service init with TTL | None |
| **39.3.2** | Scoring metrics collector | Instrument scoring call with cache hit rate, latency, token usage | None |
| **39.3.3** | Prompt restructure: ISO to user prompt | Move ISO catalog from system prompt to user prompt | 39.3.1 |
| **39.3.4** | Multi-block user prompt spike | Investigate and (if viable) implement cache_control on user content blocks | 39.3.3 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+---------------------------------------------------+--------------------+
    | Story    | Files Touched                                     | Conflicts          |
    +----------+---------------------------------------------------+--------------------+
    | 39.3.1   | ISOControlRetrievalService.ts (MODIFY)            | None               |
    +----------+---------------------------------------------------+--------------------+
    | 39.3.2   | ScoringMetricsCollector.ts (NEW)                  | None               |
    |          | ScoringLLMService.ts (MODIFY - add metrics)       |                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.3.3   | ScoringPromptBuilder.ts (MODIFY)                  | 39.3.4             |
    |          | scoringPrompt.ts (MODIFY)                         |                    |
    |          | ScoringLLMService.ts (MODIFY - prompt params)     | 39.3.2             |
    +----------+---------------------------------------------------+--------------------+
    | 39.3.4   | ILLMClient.ts (MODIFY - interface)                | None               |
    |          | ClaudeClient.ts (MODIFY - multi-block)            |                    |
    |          | ScoringPromptBuilder.ts (MODIFY)                  | 39.3.3             |
    +----------+---------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Foundation (2 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+----------------------------------+-------------------------------------+
|   39.3.1                         |   39.3.2                            |
|   ISO In-Memory Cache            |   Scoring Metrics Collector         |
|                                  |                                     |
|   FILES:                         |   FILES:                            |
|   ISOControlRetrieval-           |   ScoringMetrics-                   |
|   Service.ts (MODIFY)            |   Collector.ts (NEW)                |
|                                  |   ScoringLLMService.ts (MODIFY)     |
|                                  |                                     |
|   backend-agent                  |   backend-agent                     |
+----------------------------------+-------------------------------------+
```

**Stories:** 39.3.1, 39.3.2
**Agents needed:** 2 (both backend-agent)
**File overlap:** None
**Review:** After all complete

---

### Phase 2: Prompt Restructure (sequential -- depends on Phase 1)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|              (Depends on ScoringLLMService from Phase 1)               |
+------------------------------------------------------------------------+
|   39.3.3                                                               |
|   Prompt Restructure: ISO to User Prompt                               |
|                                                                        |
|   FILES:                                                               |
|   - ScoringPromptBuilder.ts (MODIFY)                                   |
|   - scoringPrompt.ts (MODIFY)                                          |
|   - ScoringLLMService.ts (modified by 39.3.2)                          |
|                                                                        |
|   MUST wait for 39.3.2 to complete (ScoringLLMService overlap)         |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 39.3.3
**Agents needed:** 1
**Dependencies:** Requires Phase 1 complete
**Review:** After complete

---

### Phase 3: Multi-Block Spike (sequential -- depends on Phase 2)

```
+------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL (EXPERIMENTAL)                |
|              (Depends on prompt restructure from Phase 2)              |
+------------------------------------------------------------------------+
|   39.3.4                                                               |
|   Multi-Block User Prompt Spike                                        |
|                                                                        |
|   FILES:                                                               |
|   - ILLMClient.ts (MODIFY - interface change)                          |
|   - ClaudeClient.ts (MODIFY - multi-block support)                     |
|   - ScoringPromptBuilder.ts (modified by 39.3.3)                       |
|                                                                        |
|   MUST wait for 39.3.3 (ScoringPromptBuilder overlap)                  |
|   NOTE: This is a spike -- may be deferred if API does not support     |
|   cache_control on user content blocks.                                |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 39.3.4
**Agents needed:** 1
**Dependencies:** Requires Phase 2 complete
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 39.3.1 | `sprint-3-story-1.md` | backend-agent |
| 39.3.2 | `sprint-3-story-2.md` | backend-agent |
| 39.3.3 | `sprint-3-story-3.md` | backend-agent |
| 39.3.4 | `sprint-3-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 3 is complete when:
- [ ] ISO catalog cached in-memory (eliminates 2 DB queries per scoring call)
- [ ] Scoring metrics collected: cache hit rate, input tokens, latency, cost
- [ ] ISO catalog moved from system prompt to user prompt (system prompt is static)
- [ ] Multi-block caching spike completed (result: viable or deferred)
- [ ] Before/after metrics documented (minimum 10 sample runs)
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] **Post-implementation review swarm passed** (3-reviewer mesh: line-by-line, data flow trace, architecture compliance)
- [ ] Review swarm findings addressed before Codex gate
- [ ] **Codex gate passed** (via `mcp__codex__codex` MCP tool — autonomous, no user relay needed)
- [ ] Codex findings fixed and committed
