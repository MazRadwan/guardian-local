# Sprint 1: Core Tool Loop

**Epic:** 33 - Consult Search Tool
**Focus:** Web search tool definition, Jina client, and Claude client tool_result support
**Stories:** 33.1.1 - 33.1.4 (4 stories)
**Dependencies:** None (first sprint)
**Agents:** `backend-agent`

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **33.1.1** | Web Search Tool Definition | Tool schema for Claude | None |
| **33.1.2** | Jina Client Service | HTTP client for Jina Search + Reader APIs | None |
| **33.1.3** | WebSearchToolService | IToolUseHandler implementation | 33.1.1, 33.1.2 |
| **33.1.4** | Claude Client Tool Result Support | Extend streamMessage for tool_result blocks | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +-----------------------------------------------------------------------------------+
    | Story   | Files Touched                                            | Conflicts    |
    +---------+----------------------------------------------------------+--------------+
    | 33.1.1  | IWebSearchTool.ts (NEW), webSearchTool.ts (NEW),         | 33.1.3       |
    |         | tools/index.ts                                           |              |
    | 33.1.2  | IJinaClient.ts (NEW), infrastructure/ai/JinaClient.ts    | None         |
    | 33.1.3  | WebSearchToolService.ts (NEW)                            | None         |
    | 33.1.4  | IClaudeClient.ts, ClaudeClient.ts                        | See note*    |
    +-----------------------------------------------------------------------------------+

    * Note: 33.1.4 adds a required method to IClaudeClient interface. This may require
      updates to test mocks that implement IClaudeClient. However, since mocks are in
      test files (not production code), this doesn't block parallel execution. The
      implementing agent should update mocks in the same story.
```

---

## Parallel Execution Strategy

### Phase 1: Independent Foundation (3 stories in parallel)

```
+----------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                              |
|                (No file overlap between these stories)                     |
+------------------------+------------------------+---------------------------+
|   33.1.1               |   33.1.2               |   33.1.4                  |
|   Web Search Tool      |   Jina Client Service  |   Claude Tool Result      |
|                        |                        |                           |
|   FILES:               |   FILES:               |   FILES:                  |
|   IWebSearchTool.ts    |   IJinaClient.ts (NEW) |   IClaudeClient.ts        |
|   webSearchTool.ts     |   ai/JinaClient.ts     |   ClaudeClient.ts         |
|   tools/index.ts       |                        |                           |
|                        |                        |                           |
|   backend-agent        |   backend-agent        |   backend-agent           |
+------------------------+------------------------+---------------------------+
```

**Stories:** 33.1.1, 33.1.2, 33.1.4
**Agents needed:** 3 backend-agent instances
**File overlap:** None - each story touches unique files
**Review:** After all Phase 1 stories complete

---

### Phase 2: Integration (sequential - depends on Phase 1)

```
+----------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                   |
|              (Depends on files/exports from Phase 1)                       |
+----------------------------------------------------------------------------+
|   33.1.3                                                                   |
|   WebSearchToolService                                                     |
|                                                                            |
|   FILES:                                                                   |
|   - WebSearchToolService.ts (NEW)                                          |
|                                                                            |
|   IMPORTS:                                                                 |
|   - webSearchTool from 33.1.1                                              |
|   - JinaClient from 33.1.2                                                 |
|                                                                            |
|   backend-agent                                                            |
+----------------------------------------------------------------------------+
```

**Stories:** 33.1.3
**Agents needed:** 1
**Dependencies:** Requires Phase 1 complete:
  - Imports `webSearchTool` schema from 33.1.1
  - Imports `JinaClient` and `JINA_CONFIG` constants from 33.1.2
**Review:** After complete (Sprint 1 done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 33.1.1 | `sprint-1-story-1.md` | backend-agent |
| 33.1.2 | `sprint-1-story-2.md` | backend-agent |
| 33.1.3 | `sprint-1-story-3.md` | backend-agent |
| 33.1.4 | `sprint-1-story-4.md` | backend-agent |

---

## Sprint Scope Clarifications

**IMPORTANT:** Sprint 1 creates the building blocks only. Wiring and integration happens in Sprint 2.

| Component | Sprint 1 (This Sprint) | Sprint 2 |
|-----------|------------------------|----------|
| WebSearchToolService | Creates service with `handle()` method | Registers in DI container (33.2.1) |
| JinaClient | Creates client with search/read methods | Instantiated in DI container (33.2.1) |
| ClaudeClient | Adds `continueWithToolResult()` method | Called by ConsultMessageHandler (33.2.2) |
| Tool enablement | N/A | `enableTools: true` for consult mode (33.2.2) |
| Tool loop wiring | N/A | MessageHandler calls WebSearchToolService (33.2.2) |

**Current codebase note:** MessageHandler's consult mode configuration has `enableTools: false`. This is intentionally changed in Sprint 2 (story 33.2.2) when the full tool loop is wired.

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] webSearchTool definition created with proper schema
- [ ] JinaClient can call Search and Reader APIs
- [ ] WebSearchToolService implements IToolUseHandler
- [ ] ClaudeClient supports tool_result content blocks
- [ ] All unit tests passing
- [ ] Code reviewed and approved
