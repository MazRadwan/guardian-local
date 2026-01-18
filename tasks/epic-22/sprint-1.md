# Sprint 1: Scoring Card Persistence

**Epic:** 22 - Scoring Card Persistence
**Focus:** Fix scoring card disappearing after session reload via backend rehydration
**Stories:** 22.1.1 - 22.1.4 (4 stories)
**Dependencies:** None (new functionality)
**Agents:** `backend-agent` | `frontend-agent`

---

## Stories

| Story | Name | Focus | Dependencies | Agent |
|-------|------|-------|--------------|-------|
| **22.1.1** | Backend Scoring Rehydration Endpoint | New API to fetch scoring results by conversationId | None | backend-agent |
| **22.1.2** | Frontend Scoring Rehydration | Fetch and populate scoring results on conversation load | 22.1.1 | frontend-agent |
| **22.1.3** | Prevent Duplicate Card Rendering | Verify single card render from store state | None | frontend-agent |
| **22.1.4** | E2E Test - Scoring Persistence | End-to-end verification of persistence flow | 22.1.1, 22.1.2 | frontend-agent |

---

## Dependency Graph

```
    File Overlap Analysis:
    +---------+--------------------------------------------------+-------------------+
    | Story   | Files Touched                                    | Conflicts         |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.1  | scoring.routes.ts (NEW)                          | None              |
    |         | ScoringRehydrationController.ts (NEW)            |                   |
    |         | ScoringService.ts                                |                   |
    |         | index.ts (route registration)                    |                   |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.2  | chatStore.ts                                     | None              |
    |         | ChatInterface.tsx                                |                   |
    |         | lib/api/scoring.ts (NEW)                         |                   |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.3  | ChatInterface.tsx                                | 22.1.2 (same file)|
    |         | MessageList.tsx (verify)                         |                   |
    |         | ChatMessage.tsx (verify)                         |                   |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.4  | e2e/scoring-persistence.spec.ts (NEW)            | None              |
    +---------+--------------------------------------------------+-------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Stories (2 stories in parallel)

```
+----------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                              |
|                  (No file overlap between these stories)                   |
+-----------------------------------+----------------------------------------+
|   22.1.1                          |   22.1.3                               |
|   Backend Rehydration Endpoint    |   Prevent Duplicate Rendering          |
|                                   |                                        |
|   FILES:                          |   FILES:                               |
|   - scoring.routes.ts (NEW)       |   - ChatInterface.tsx (verify only)    |
|   - ScoringRehydrationController  |   - MessageList.tsx (verify only)      |
|   - ScoringService.ts             |   - ChatMessage.tsx (verify only)      |
|   - index.ts                      |                                        |
|                                   |                                        |
|   backend-agent                   |   frontend-agent                       |
+-----------------------------------+----------------------------------------+
```

**Stories:** 22.1.1, 22.1.3
**Agents needed:** 2 (backend-agent, frontend-agent)
**File overlap:** None - 22.1.1 is backend, 22.1.3 is verification/read-only
**Review:** After both complete

---

### Phase 2: Frontend Integration (sequential - depends on 22.1.1)

```
+----------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                   |
|              (Depends on backend endpoint from Phase 1)                    |
+----------------------------------------------------------------------------+
|   22.1.2                                                                   |
|   Frontend Scoring Rehydration                                             |
|                                                                            |
|   FILES:                                                                   |
|   - apps/web/src/stores/chatStore.ts                                       |
|   - apps/web/src/components/chat/ChatInterface.tsx                         |
|   - apps/web/src/lib/api/scoring.ts (NEW)                                  |
|                                                                            |
|   MUST wait for 22.1.1 (backend endpoint required)                         |
|                                                                            |
|   frontend-agent                                                           |
+----------------------------------------------------------------------------+
```

**Stories:** 22.1.2
**Agents needed:** 1 (frontend-agent)
**Dependencies:** Requires 22.1.1 complete (API endpoint)
**Review:** After complete

---

### Phase 3: E2E Verification (sequential - depends on Phases 1 + 2)

```
+----------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL                                   |
|              (Depends on full flow from Phases 1 + 2)                      |
+----------------------------------------------------------------------------+
|   22.1.4                                                                   |
|   E2E Test - Scoring Persistence                                           |
|                                                                            |
|   FILES:                                                                   |
|   - apps/web/e2e/scoring-persistence.spec.ts (NEW)                         |
|                                                                            |
|   MUST wait for 22.1.1 + 22.1.2 (full rehydration flow required)           |
|                                                                            |
|   frontend-agent                                                           |
+----------------------------------------------------------------------------+
```

**Stories:** 22.1.4
**Agents needed:** 1 (frontend-agent)
**Dependencies:** Requires Phase 1 + Phase 2 complete
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 22.1.1 | `sprint-1-story-1.md` | backend-agent |
| 22.1.2 | `sprint-1-story-2.md` | frontend-agent |
| 22.1.3 | `sprint-1-story-3.md` | frontend-agent |
| 22.1.4 | `sprint-1-story-4.md` | frontend-agent |

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] GET /api/scoring/conversation/:conversationId endpoint returns scoring data
- [ ] Frontend fetches and populates store on conversation load
- [ ] No duplicate scoring cards rendered
- [ ] E2E test verifies card persists across page reload
- [ ] All unit and integration tests passing
- [ ] Code reviewed and approved
