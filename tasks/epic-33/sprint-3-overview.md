# Sprint 3: UI Feedback & Tests

**Epic:** 33 - Consult Search Tool
**Focus:** tool_status WebSocket event, frontend typing indicator swap, integration tests
**Stories:** 33.3.1 - 33.3.4 (4 stories)
**Dependencies:** Sprint 2 complete (tool loop working)
**Agents:** `backend-agent` | `frontend-agent`

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **33.3.1** | Tool Status WebSocket Event | Emit tool_status during search | None |
| **33.3.2** | Frontend Tool Status Handler | Listen for tool_status, update store, state hygiene | 33.3.1 (type definition) |
| **33.3.3** | Typing Indicator Swap | Show "Searching the web..." during search | 33.3.2 |
| **33.3.4** | Integration Tests | E2E test for consult search flow | 33.3.1 (event must exist) |

---

## Dependency Graph

```
    File Overlap Analysis:
    +---------------------------------------------------------------------+
    | Story   | Files Touched                              | Conflicts    |
    +---------+--------------------------------------------+--------------+
    | 33.3.1  | ChatServer.ts, WebSearchToolService.ts     | None         |
    | 33.3.2  | websocket.ts, chatStore.ts, useWebSocketEvents.ts | 33.3.3 |
    | 33.3.3  | MessageList.tsx, TypingIndicator           | None         |
    | 33.3.4  | __tests__/integration/                     | None         |
    +---------------------------------------------------------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Backend Event Definition (1 story)

```
+----------------------------------------------------------------------------+
|                     PHASE 1 - SEQUENTIAL                                   |
|              (Must complete first - defines event type)                    |
+----------------------------------------------------------------------------+
|   33.3.1                                                                   |
|   Tool Status WebSocket Event                                              |
|                                                                            |
|   FILES:                                                                   |
|   - ChatServer.ts                                                          |
|   - WebSearchToolService.ts                                                |
|                                                                            |
|   backend-agent                                                            |
+----------------------------------------------------------------------------+
```

**Stories:** 33.3.1
**Agents needed:** 1 backend-agent
**Dependencies:** None
**Review:** After complete

---

### Phase 2: Frontend Handler + Integration Tests (2 stories in parallel)

```
+----------------------------------------------------------------------------+
|                     PHASE 2 - RUN IN PARALLEL                              |
|           (Both depend on 33.3.1, no file overlap with each other)         |
+------------------------------------+---------------------------------------+
|   33.3.2                           |   33.3.4                              |
|   Frontend Tool Status Handler     |   Integration Tests                   |
|   + State Hygiene                  |                                       |
|                                    |                                       |
|   FILES:                           |   FILES:                              |
|   websocket.ts                     |   __tests__/integration/              |
|   chatStore.ts                     |                                       |
|   useWebSocketEvents.ts            |                                       |
|   useWebSocket.ts                  |                                       |
|   useWebSocketAdapter.ts           |                                       |
|                                    |                                       |
|   STATE HYGIENE:                   |                                       |
|   - Clear on disconnect            |                                       |
|   - Clear on abort                 |                                       |
|   - Clear on conversation switch   |                                       |
|   - 30s safety timeout             |                                       |
|                                    |                                       |
|   frontend-agent                   |   backend-agent                       |
+------------------------------------+---------------------------------------+
```

**Stories:** 33.3.2, 33.3.4
**Agents needed:** 1 frontend-agent, 1 backend-agent
**Dependencies:** Both need 33.3.1 complete (event type definition)
**File overlap:** None between these two stories
**Review:** After Phase 2 complete

---

### Phase 3: UI Component (sequential - depends on store state)

```
+----------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL                                   |
|              (Depends on store state from 33.3.2)                          |
+----------------------------------------------------------------------------+
|   33.3.3                                                                   |
|   Typing Indicator Swap                                                    |
|                                                                            |
|   FILES:                                                                   |
|   - MessageList.tsx or TypingIndicator component                           |
|                                                                            |
|   frontend-agent                                                           |
+----------------------------------------------------------------------------+
```

**Stories:** 33.3.3
**Agents needed:** 1 frontend-agent
**Dependencies:** Requires 33.3.2 store state
**Review:** After complete (Sprint 3 done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 33.3.1 | `sprint-3-story-1.md` | backend-agent |
| 33.3.2 | `sprint-3-story-2.md` | frontend-agent |
| 33.3.3 | `sprint-3-story-3.md` | frontend-agent |
| 33.3.4 | `sprint-3-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 3 is complete when:
- [ ] tool_status event emitted during web search
- [ ] Frontend receives and stores tool_status
- [ ] Typing indicator shows "Searching the web..." during search
- [ ] Indicator returns to normal after search completes
- [ ] Integration tests verify full flow
- [ ] All unit tests passing
- [ ] Browser QA passed
- [ ] Code reviewed and approved
