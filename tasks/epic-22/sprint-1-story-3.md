# Story 22.1.3: Prevent Duplicate Card Rendering (with Fallback)

## Description

Ensure that only ONE scoring card renders per conversation, using a **fallback strategy** that preserves legacy data if rehydration fails.

**Background (corrected after external review):**
- `DocumentUploadController.ts:706-726` DOES persist `scoring_result` component in messages
- `ChatServer.ts:807-823` does NOT persist `scoring_result` component
- Frontend currently renders card from store state via `scoringResultByConversation`

**Risk of unconditional filtering:** If we always filter out `scoring_result` from messages and rehydration fails (network error, endpoint bug, race condition), the card disappears entirely with no fallback. This is a **regression** for legacy data.

**Strategy: Render from store OR message, never both**
1. If store has result for this conversation → render from store, skip message component
2. If store is empty → render from message component (fallback for legacy/failed rehydration)
3. Never render BOTH
4. **Latest-only rule:** If multiple `scoring_result` components exist in messages (repeated scoring), only the LAST one renders

## Acceptance Criteria

- [ ] Scoring card renders from store state when available (primary source)
- [ ] If store is empty AND message has `scoring_result` component → render from message (fallback)
- [ ] Never render duplicate cards (store AND message)
- [ ] If multiple `scoring_result` components exist in history, only render the LAST one (latest-only rule)
- [ ] Card position is consistent (after narrative message)
- [ ] Historical messages with `scoring_result` components continue to work if rehydration fails
- [ ] Document the fallback rendering pattern

## Technical Approach

### 1. Conditional Rendering in ChatMessage

In `apps/web/src/components/chat/ChatMessage.tsx`, conditionally render `scoring_result`:

**Note:** ChatMessage does NOT have a `conversationId` prop (see `ChatMessageProps` interface).
Use `activeConversationId` from the store since messages are always rendered in the context of the active conversation.

```typescript
// Epic 22: Conditional scoring_result rendering
// Only render from message if store doesn't have result (fallback for failed rehydration)

// Get activeConversationId from store (ChatMessage doesn't have conversationId prop)
const activeConversationId = useChatStore((state) => state.activeConversationId);
const scoringResultInStore = useChatStore(
  (state) => activeConversationId
    ? state.scoringResultByConversation[activeConversationId]
    : null
);

const filteredComponents = components?.filter((c) => {
  // If scoring_result is in store, skip rendering from message (prevent duplicate)
  if (c.type === 'scoring_result' && scoringResultInStore) {
    return false;
  }
  return true;
}) ?? [];

// Render scoring_result component if present and not in store
const scoringResultComponent = components?.find(c => c.type === 'scoring_result');
if (scoringResultComponent && !scoringResultInStore) {
  // Render ScoringResultCard from message data as fallback
}
```

### 2. Update MessageList Rendering (Latest-Only Rule)

In `apps/web/src/components/chat/MessageList.tsx`:
- Continue rendering `ScoringResultCard` from store when available
- The card from store takes precedence; ChatMessage handles fallback
- **Latest-only implementation:**

```typescript
// Find the LAST message index that has a scoring_result component
const lastScoringMessageIndex = messages.reduceRight(
  (found, msg, idx) => {
    if (found !== -1) return found;
    const hasScoringResult = msg.content?.components?.some(
      (c) => c.type === 'scoring_result'
    );
    return hasScoringResult ? idx : -1;
  },
  -1
);

// Pass isLastScoringMessage prop to ChatMessage
{messages.map((msg, idx) => (
  <ChatMessage
    key={msg.id}
    {...msg}
    isLastScoringMessage={idx === lastScoringMessageIndex}
  />
))}
```

Then in ChatMessage, only render fallback if `isLastScoringMessage` is true:
```typescript
// Only render scoring_result from message if:
// 1. Store is empty (fallback needed)
// 2. This message has the LAST scoring_result (latest-only rule)
if (scoringResultComponent && !scoringResultInStore && isLastScoringMessage) {
  // Render ScoringResultCard from message data as fallback
}
```

### 3. Rendering Priority

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SCORING CARD RENDER LOGIC                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CHECK: scoringResultByConversation[conversationId] exists?         │
│                                                                     │
│        YES                              NO                          │
│         │                                │                          │
│         ▼                                ▼                          │
│  ┌──────────────────┐          ┌──────────────────┐                │
│  │ Render from      │          │ Check message    │                │
│  │ STORE            │          │ for scoring_     │                │
│  │ (MessageList)    │          │ result component │                │
│  └──────────────────┘          └────────┬─────────┘                │
│                                         │                          │
│  Filter out scoring_result     ┌────────┴────────┐                 │
│  from message components       │                 │                 │
│  (ChatMessage)                 HAS              NONE               │
│                                 │                 │                 │
│                                 ▼                 ▼                 │
│                         ┌──────────────┐  ┌──────────────┐         │
│                         │ Render from  │  │ No card      │         │
│                         │ MESSAGE      │  │ (no scoring) │         │
│                         │ (fallback)   │  │              │         │
│                         └──────────────┘  └──────────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Add Code Comments

Document the pattern in `ChatInterface.tsx`:
```typescript
// Epic 22: Scoring card rendering with fallback strategy
//
// Primary: Render from store (populated by WebSocket or rehydration)
// Fallback: Render from message component (if store empty and message has it)
//
// This ensures:
// 1. Rehydration success → render from store
// 2. Rehydration failure → render from message (legacy support)
// 3. Never duplicate (store takes precedence)
```

## Files Touched

- `apps/web/src/components/chat/ChatMessage.tsx` - Add `isLastScoringMessage` prop, conditional render based on store state
- `apps/web/src/components/chat/MessageList.tsx` - Calculate lastScoringMessageIndex, pass `isLastScoringMessage` prop
- `apps/web/src/components/chat/ChatInterface.tsx` - Add documentation comment

## Tests Affected

Existing tests that may need updates:
- `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx` - Test conditional rendering
- `apps/web/src/components/chat/__tests__/ChatInterface.scoring.test.tsx` - Verify card still renders from store

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] Update `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx`
  - Test: `scoring_result` component filtered when store has result
  - Test: `scoring_result` component renders as fallback when store is empty
  - Test: other component types always render normally
- [ ] Verify existing `ChatInterface.scoring.test.tsx` tests pass
  - Card renders from store state
  - Card doesn't render when store is empty AND no message component
- [ ] Add fallback test
  - Store empty + message has `scoring_result` → card renders from message
- [ ] Add deduplication test
  - Store has result + message has `scoring_result` → only ONE card renders (from store)

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Conditional rendering implemented in ChatMessage.tsx
- [ ] Tests verify fallback behavior works
- [ ] Tests verify no duplicate cards
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Pattern documented in code comments
