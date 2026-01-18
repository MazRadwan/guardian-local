# Epic 22: Scoring Card Persistence

## Overview

Fix the scoring result card disappearing after session reload. Currently, the scoring card only renders from in-memory state populated by WebSocket events and is lost when the user logs out or refreshes the browser.

## Problem Statement

**Root Cause (Verified):**
1. The `scoring_complete` WebSocket event populates `scoringResultByConversation` in the Zustand store
2. The scoring card renders from this in-memory store state
3. The message saved to the database explicitly excludes the `scoring_result` component (see `ChatServer.ts:807-823`)
4. The store's `partialize` function only persists `sidebarMinimized` and `activeConversationId` to localStorage
5. After relogin: empty store + no `scoring_result` in message history = no card

**Current Behavior:**
- Same session: Card displays correctly (WebSocket event → store → UI)
- After reload/relogin: Card disappears (store reset, message has no component)

**Evidence:**
```typescript
// ChatServer.ts:807-823 - Explicitly excludes scoring_result
const reportMessage = await this.conversationService.sendMessage({
  conversationId,
  role: 'assistant',
  content: {
    text: narrativeText,
    // No components - scoring card rendered from store state via scoring_complete event
  },
});
```

```typescript
// chatStore.ts:648-651 - Only persists minimal state
partialize: (state) => ({
  sidebarMinimized: state.sidebarMinimized,
  activeConversationId: state.activeConversationId,
  // scoringResultByConversation NOT persisted
}),
```

---

## Approved Solution: Option B (Backend Rehydration)

**Rationale:** Treats assessment results in the database as the canonical source of truth. More robust than message-based persistence because it:
- Survives message pruning or history trimming
- Avoids coupling UI persistence to chat history formatting
- Leverages existing `assessmentResults` + `dimensionScores` tables
- Single source of truth (database) rather than dual paths

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SCORING CARD DATA FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SCORING COMPLETE (same session)                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │ ChatServer   │───►│ scoring_     │───►│ chatStore    │          │
│  │ scoring done │    │ complete WS  │    │ in-memory    │          │
│  └──────────────┘    └──────────────┘    └──────┬───────┘          │
│         │                                        │                  │
│         ▼                                        ▼                  │
│  ┌──────────────┐                        ┌──────────────┐          │
│  │ assessment   │                        │ ScoringCard  │          │
│  │ Results DB   │                        │ renders      │          │
│  └──────────────┘                        └──────────────┘          │
│                                                                     │
│  CONVERSATION LOAD (new session)                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │ Load convo   │───►│ GET /api/    │───►│ chatStore    │          │
│  │ messages     │    │ scoring/:id  │    │ rehydrated   │          │
│  └──────────────┘    └──────────────┘    └──────┬───────┘          │
│                              │                   │                  │
│                              ▼                   ▼                  │
│                       ┌──────────────┐   ┌──────────────┐          │
│                       │ assessment   │   │ ScoringCard  │          │
│                       │ Results DB   │   │ renders      │          │
│                       └──────────────┘   └──────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Scope

### Backend Changes

**New API endpoint:**
- `packages/backend/src/infrastructure/http/routes/scoring.routes.ts` - New route file
- `packages/backend/src/infrastructure/http/controllers/ScoringController.ts` - New controller

**Endpoint:** `GET /api/scoring/conversation/:conversationId`

**Response shape (matches `ScoringCompletePayload['result']`):**
```typescript
{
  assessmentId: string;
  compositeScore: number;
  overallRiskRating: 'Low' | 'Moderate' | 'High' | 'Critical';
  recommendation: 'Approved' | 'Conditional' | 'Not Recommended';
  dimensionScores: Array<{
    dimension: string;
    score: number;
    rating: string;
    confidence: string;
    keyFindings: string[];
  }>;
  vendorName: string;
  solutionName: string;
}
```

**Data sources:**
- `assessmentResults` table - compositeScore, overallRiskRating, recommendation
- `dimensionScores` table - per-dimension scores and findings
- `assessments` table - vendorName, solutionName (via join)
- `conversations` table - link conversation to assessment

### Frontend Changes

**Files to modify:**
- `apps/web/src/stores/chatStore.ts` - Add rehydration action
- `apps/web/src/components/chat/ChatInterface.tsx` - Trigger rehydration on conversation load
- `apps/web/src/lib/api.ts` - Add scoring fetch function

**Rehydration logic:**
```typescript
// On conversation load, after messages are fetched:
// 1. Check if conversation has associated assessment with scoring results
// 2. If yes and not in store, fetch from backend
// 3. Populate scoringResultByConversation
// 4. Card renders from store (same as real-time flow)
```

### Test Files

**Backend tests:**
- `packages/backend/__tests__/unit/controllers/ScoringController.test.ts` - New
- `packages/backend/__tests__/integration/scoring-rehydration.test.ts` - New

**Frontend tests:**
- `apps/web/src/components/chat/__tests__/ChatInterface.scoring.test.tsx` - Update
- `apps/web/src/stores/__tests__/chatStore.scoring.test.ts` - New or update

---

## Stories

### Story 22.1: Backend Scoring Rehydration Endpoint

**Description:** Create API endpoint to fetch scoring results for a conversation.

**Acceptance Criteria:**
- [ ] `GET /api/scoring/conversation/:conversationId` returns scoring data
- [ ] Returns 404 if no scoring results exist for conversation
- [ ] Returns 403 if user doesn't own the conversation
- [ ] Response shape matches `ScoringCompletePayload['result']`
- [ ] Joins assessmentResults + dimensionScores + assessments tables
- [ ] Unit tests for controller
- [ ] Integration test for full flow

**Files Touched:**
- `packages/backend/src/infrastructure/http/routes/scoring.routes.ts` (new)
- `packages/backend/src/infrastructure/http/controllers/ScoringController.ts` (new)
- `packages/backend/src/infrastructure/http/routes/index.ts` (register route)
- `packages/backend/src/application/services/ScoringService.ts` (add method)

**Agent:** backend-agent

---

### Story 22.2: Frontend Scoring Rehydration

**Description:** Fetch and populate scoring results when loading a conversation.

**Acceptance Criteria:**
- [ ] On conversation load, check if scoring results need rehydration
- [ ] Fetch from `/api/scoring/conversation/:id` if not in store
- [ ] Populate `scoringResultByConversation` on success
- [ ] Handle 404 gracefully (no scoring for this conversation)
- [ ] Avoid duplicate fetches (check store first)
- [ ] Loading state while fetching (optional, can be silent)

**Files Touched:**
- `apps/web/src/stores/chatStore.ts` - Add `rehydrateScoringResult` action
- `apps/web/src/components/chat/ChatInterface.tsx` - Trigger rehydration
- `apps/web/src/lib/api.ts` - Add `fetchScoringResult` function

**Agent:** frontend-agent

---

### Story 22.3: Prevent Duplicate Card Rendering

**Description:** Ensure only one scoring card renders (from store, not message components).

**Acceptance Criteria:**
- [ ] Scoring card renders from store state only
- [ ] No `scoring_result` component in message content (current behavior, verify)
- [ ] If both exist (edge case), store takes precedence
- [ ] Card position is consistent (after narrative message)

**Files Touched:**
- `apps/web/src/components/chat/ChatInterface.tsx` - Verify render logic
- `apps/web/src/components/chat/ChatMessage.tsx` - Verify no duplicate render

**Agent:** frontend-agent

---

### Story 22.4: E2E Test - Scoring Persistence

**Description:** Verify scoring card persists across session reload.

**Acceptance Criteria:**
- [ ] Upload questionnaire, complete scoring
- [ ] Verify card displays with correct data
- [ ] Refresh page / simulate relogin
- [ ] Verify card still displays with same data
- [ ] Verify data matches database values

**Files Touched:**
- `apps/web/__tests__/e2e/scoring-persistence.spec.ts` (new)

**Agent:** frontend-agent

---

## Non-Goals (Out of Scope)

- Persisting scoring results to localStorage (rejected - database is source of truth)
- Adding `scoring_result` component to message history (Option A - rejected)
- Real-time sync across tabs (future enhancement)
- Scoring result caching/invalidation strategy (simple fetch-on-load for now)

---

## Dependencies

- Existing `assessmentResults` table with scoring data
- Existing `dimensionScores` table with per-dimension data
- Existing `conversations` table with `assessmentId` link
- Authentication middleware for user ownership check

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Conversation without assessment link | Return 404, card simply doesn't render |
| Stale data after re-scoring | Re-scoring overwrites DB, next load gets fresh data |
| Performance (extra API call) | Single lightweight query, can add caching later |
| Race condition (WS event vs fetch) | Store-first check prevents duplicate fetch |

---

## Success Criteria

1. User completes scoring → card displays (same as today)
2. User refreshes page → card still displays
3. User logs out and back in → card still displays
4. Card data matches database values exactly
5. No duplicate cards rendered
6. All existing tests pass
7. New tests cover rehydration flow

---

## References

- Root cause analysis: External reviewer debug session (2026-01-17)
- Current scoring flow: `ChatServer.ts:750-835`
- Store persistence: `chatStore.ts:644-655`
- Database schema: `assessmentResults`, `dimensionScores` tables
- Epic 15 Story 5c: Original scoring UI integration
