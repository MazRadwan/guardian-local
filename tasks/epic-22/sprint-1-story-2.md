# Story 22.1.2: Frontend Scoring Rehydration

## Description

Implement frontend logic to fetch scoring results from the backend when loading a conversation that has scoring data. This ensures the scoring card displays after page reload by rehydrating the Zustand store from database-persisted data.

The current flow populates `scoringResultByConversation` only via WebSocket events during active scoring. This story adds a secondary path: fetch from backend on conversation load if not already in store.

## Acceptance Criteria

- [ ] On conversation load, check if scoring result needs rehydration
- [ ] Fetch from `/api/scoring/conversation/:conversationId` if not already in store
- [ ] Populate `scoringResultByConversation` in Zustand store on success
- [ ] Handle 404 gracefully (no scoring for this conversation - no error shown)
- [ ] Avoid duplicate fetches (check in-memory store first)
- [ ] Avoid fetching while scoring is in progress (check `scoringProgress.status`)
- [ ] Unit tests for new API function
- [ ] Unit tests for rehydration logic

## Technical Approach

### 1. New API Function

Create `apps/web/src/lib/api/scoring.ts`:
```typescript
export async function fetchScoringResult(
  conversationId: string,
  token: string
): Promise<ScoringCompletePayload['result'] | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const response = await fetch(
    `${apiUrl}/api/scoring/conversation/${conversationId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 404) {
    return null; // No scoring results for this conversation
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch scoring result: ${response.statusText}`);
  }

  return response.json();
}
```

### 2. Add Rehydration Action to Store

Add to `apps/web/src/stores/chatStore.ts`:
```typescript
// In ChatState interface:
rehydrateScoringResult: (conversationId: string, result: ScoringCompletePayload['result']) => void;

// In store implementation:
rehydrateScoringResult: (conversationId, result) => {
  console.log('[chatStore] Rehydrating scoring result for conversation:', conversationId);
  set((state) => ({
    scoringResultByConversation: {
      ...state.scoringResultByConversation,
      [conversationId]: result,
    },
    // Also set the current scoringResult if this is the active conversation
    scoringResult: state.activeConversationId === conversationId ? result : state.scoringResult,
    scoringProgress: state.activeConversationId === conversationId
      ? { status: 'complete', message: 'Analysis complete!' }
      : state.scoringProgress,
  }));
},
```

### 3. Trigger Rehydration on Conversation Load

Modify `apps/web/src/components/chat/ChatInterface.tsx`:

Add new effect after the existing conversation switch effect:
```typescript
// Epic 22: Rehydrate scoring result from backend if not in cache
useEffect(() => {
  if (!activeConversationId || !token) return;

  // Guard 1: Already in cache (WebSocket event or previous rehydration)
  const cachedResult = scoringResultByConversation[activeConversationId];
  if (cachedResult) {
    console.log('[ChatInterface] Scoring result already in cache');
    return;
  }

  // Guard 2: Scoring in progress (will get result via WebSocket)
  if (scoringProgress.status !== 'idle' && scoringProgress.status !== 'complete') {
    console.log('[ChatInterface] Scoring in progress, skipping rehydration');
    return;
  }

  // Fetch from backend
  const rehydrate = async () => {
    try {
      const result = await fetchScoringResult(activeConversationId, token);
      if (result) {
        useChatStore.getState().rehydrateScoringResult(activeConversationId, result);
        console.log('[ChatInterface] Rehydrated scoring result from backend');
      }
    } catch (error) {
      // Silently fail - scoring card just won't show
      console.warn('[ChatInterface] Failed to rehydrate scoring result:', error);
    }
  };

  rehydrate();
}, [activeConversationId, token, scoringResultByConversation, scoringProgress.status]);
```

### 4. Import the API Function

Add import at top of ChatInterface.tsx:
```typescript
import { fetchScoringResult } from '@/lib/api/scoring';
```

## Files Touched

- `apps/web/src/lib/api/scoring.ts` - **NEW** API fetch function
- `apps/web/src/stores/chatStore.ts` - Add `rehydrateScoringResult` action
- `apps/web/src/components/chat/ChatInterface.tsx` - Add rehydration effect and import

## Tests Affected

Existing tests that may need updates:
- `apps/web/src/stores/__tests__/chatStore.test.ts` - May need update if tests check full store shape
- `apps/web/src/components/chat/__tests__/ChatInterface.scoring.test.tsx` - May need update to mock new API call
  - The existing effect for restoring scoring state from cache will still work
  - New effect adds network call which needs mocking

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/lib/api/__tests__/scoring.test.ts` - Unit test for API function
  - Test successful fetch returns parsed JSON
  - Test 404 returns null (not error)
  - Test other errors throw
  - Test authorization header is set
- [ ] `apps/web/src/stores/__tests__/chatStore.scoring.test.ts` - Unit test for rehydration action
  - Test rehydration populates cache
  - Test rehydration updates current scoringResult when active
  - Test rehydration doesn't overwrite existing cache entry
- [ ] Update `apps/web/src/components/chat/__tests__/ChatInterface.scoring.test.tsx`
  - Mock fetchScoringResult
  - Test rehydration called when cache miss
  - Test rehydration NOT called when already in cache
  - Test rehydration NOT called when scoring in progress

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Scoring card displays after page reload for conversations with scoring
- [ ] No duplicate fetch calls on conversation switch
