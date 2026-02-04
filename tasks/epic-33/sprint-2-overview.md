# Sprint 2: Consult-Only Wiring

**Epic:** 33 - Consult Search Tool
**Focus:** Mode gating, ChatServer flow changes, prompt updates for citation format
**Stories:** 33.2.1 - 33.2.4 (4 stories)
**Dependencies:** Sprint 1 complete (tool definition, Jina client, Claude tool_result support)
**Agents:** `backend-agent`

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **33.2.1** | Register WebSearchToolService | Add to ChatServer dependency injection, use consultModeTools | None |
| **33.2.2** | Consult Mode Tool Loop | Handle tool_use -> tool_result -> final answer in MessageHandler | None |
| **33.2.3** | Consult Prompt Update | Add tool usage and citation format instructions | None |
| **33.2.4** | Assistant Done Gating | Suppress early assistant_done during tool loop | 33.2.2 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +---------------------------------------------------------------------+
    | Story   | Files Touched                              | Conflicts    |
    +---------+--------------------------------------------+--------------+
    | 33.2.1  | ChatServer.ts (DI + consultModeTools)      | None         |
    | 33.2.2  | MessageHandler.ts (tool loop)              | 33.2.4       |
    | 33.2.3  | prompts.ts, PromptCacheManager.ts          | None         |
    | 33.2.4  | MessageHandler.ts (assistant_done gating)  | 33.2.2       |
    +---------------------------------------------------------------------+

    NOTE: assistant_done is emitted in MessageHandler.ts (line 759, 1150),
    NOT in ChatServer.ts. Stories 33.2.2 and 33.2.4 both modify MessageHandler.ts.
```

---

## Parallel Execution Strategy

### Phase 1: Independent Changes (2 stories in parallel)

```
+----------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                              |
|                (No file overlap between these stories)                     |
+------------------------------------+---------------------------------------+
|   33.2.1                           |   33.2.3                              |
|   Register WebSearchToolService    |   Consult Prompt Update               |
|                                    |                                       |
|   FILES:                           |   FILES:                              |
|   ChatServer.ts                    |   prompts.ts                          |
|   tools/index.ts                   |   PromptCacheManager.ts               |
|                                    |                                       |
|   backend-agent                    |   backend-agent                       |
+------------------------------------+---------------------------------------+
```

**Stories:** 33.2.1, 33.2.3
**Agents needed:** 2 backend-agent instances
**File overlap:** None - ChatServer.ts and prompts.ts are independent
**Review:** After Phase 1 complete

---

### Phase 2: MessageHandler Integration (sequential - both modify MessageHandler.ts)

```
+----------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                   |
|              (Both stories modify MessageHandler.ts)                       |
+----------------------------------------------------------------------------+
|   33.2.2 -> 33.2.4                                                         |
|                                                                            |
|   33.2.2: Add consult mode tool loop handling                              |
|           - Receive ToolUseRegistry via constructor injection              |
|           - Extend StreamingResult with stopReason                         |
|           - Extend StreamingOptions with mode + source                     |
|           - Prevent double handling (don't return toolUseBlocks to caller) |
|           - Abort handling (cancel Jina, emit 'idle', clean up)            |
|           - Auto-summarize exclusion (only user_input triggers tools)      |
|                                                                            |
|   33.2.4: Add assistant_done gating for tool_use stop_reason               |
|           - Suppress assistant_done when entering tool loop                |
|           - Emit assistant_done only after second stream completes         |
|           - Clarify message persistence (no intermediate messages)         |
|           - Abort handling (no empty message saved, emit 'idle')           |
|                                                                            |
|   FILES:                                                                   |
|   - MessageHandler.ts (both stories)                                       |
|                                                                            |
|   MUST be sequential - both modify MessageHandler.ts                       |
|   33.2.4 depends on 33.2.2 (tool loop must exist before gating)            |
|                                                                            |
|   backend-agent                                                            |
+----------------------------------------------------------------------------+
```

**Stories:** 33.2.2, then 33.2.4
**Agents needed:** 1 (sequential)
**Dependencies:** 33.2.4 depends on 33.2.2 (tool loop must exist before adding gating logic)
**Review:** After complete (Sprint 2 done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 33.2.1 | `sprint-2-story-1.md` | backend-agent |
| 33.2.2 | `sprint-2-story-2.md` | backend-agent |
| 33.2.3 | `sprint-2-story-3.md` | backend-agent |
| 33.2.4 | `sprint-2-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 2 is complete when:
- [ ] WebSearchToolService registered in ChatServer
- [ ] Consult mode handles tool_use -> tool_result -> final answer
- [ ] Prompt includes citation format instructions
- [ ] assistant_done only emitted after final answer (not after tool_use)
- [ ] Assessment/scoring modes unaffected
- [ ] All unit tests passing
- [ ] Code reviewed and approved
