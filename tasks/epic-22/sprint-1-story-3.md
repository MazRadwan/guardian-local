# Story 22.1.3: Prevent Duplicate Card Rendering

## Description

Ensure that only ONE scoring card renders per conversation, even though `scoring_result` components MAY exist in message history.

**Background (corrected after external review):**
- `DocumentUploadController.ts:706-726` DOES persist `scoring_result` component in messages
- `ChatServer.ts:807-823` does NOT persist `scoring_result` component
- Frontend currently renders card from store state via `scoringResultByConversation`
- **Risk:** If frontend also renders `scoring_result` from message components, duplicate cards appear

**Strategy:** Filter out `scoring_result` components from message rendering. The card should ONLY render from store state (populated by WebSocket event or backend rehydration).

## Acceptance Criteria

- [ ] Scoring card renders from store state only (`scoringResultByConversation`)
- [ ] `scoring_result` component type is filtered out in ChatMessage rendering
- [ ] No duplicate cards even if message contains `scoring_result` component AND store has result
- [ ] Card position is consistent (rendered by MessageList after narrative message)
- [ ] Historical messages with `scoring_result` components don't break (filtered gracefully)
- [ ] Document the single-source rendering pattern

## Technical Approach

### 1. Acknowledge Dual Backend Behavior

**Important context for implementation:**
```typescript
// DocumentUploadController.ts:714-724 - DOES persist scoring_result
const scoringComponent = { type: 'scoring_result', data: resultData };
const reportMessage = await this.conversationService.sendMessage({
  content: { text: narrativeText, components: [scoringComponent] },
});

// ChatServer.ts:807-823 - Does NOT persist scoring_result
const reportMessage = await this.conversationService.sendMessage({
  content: { text: narrativeText },  // No components
});
```

This means historical messages MAY contain `scoring_result` components. The frontend must handle both cases.

### 2. Add Defensive Filter in ChatMessage

In `apps/web/src/components/chat/ChatMessage.tsx`, filter out `scoring_result` components:

```typescript
// Epic 22: Filter out scoring_result - rendered from store by MessageList, not from message
// This prevents duplicate cards when messages contain persisted scoring_result components
const filteredComponents = components?.filter(
  (c) => c.type !== 'scoring_result'
) ?? [];
```

### 3. Verify MessageList Rendering

In `apps/web/src/components/chat/MessageList.tsx`, confirm:
- `ScoringResultCard` is rendered from `scoringResult` prop (from store)
- Position is after the last assistant message
- No duplicate render path exists

### 4. Add Code Comment

Document the pattern in `ChatInterface.tsx`:
```typescript
// Epic 22: Scoring card renders from store state only, not from message components
// Backend paths inconsistently persist scoring_result:
// - DocumentUploadController.ts: DOES persist component
// - ChatServer.ts: Does NOT persist component
// To prevent duplicates, ChatMessage filters out scoring_result components
// and the card is rendered solely by MessageList from store state.
```

## Files Touched

- `apps/web/src/components/chat/ChatMessage.tsx` - Add filter for `scoring_result` component type
- `apps/web/src/components/chat/MessageList.tsx` - Verify no duplicate render path
- `apps/web/src/components/chat/ChatInterface.tsx` - Add documentation comment

## Tests Affected

Existing tests that may need updates:
- `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx` - Need test for filtering scoring_result
- `apps/web/src/components/chat/__tests__/ChatInterface.scoring.test.tsx` - Verify card still renders from store

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] Update `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx`
  - Test that `scoring_result` component type is filtered out
  - Test that other component types (download, error, etc.) still render normally
  - Test with message containing `scoring_result` component - should not render card
- [ ] Verify existing `ChatInterface.scoring.test.tsx` tests pass
  - Card renders from store state
  - Card doesn't render when store is empty
- [ ] Add duplicate prevention test
  - Message contains `scoring_result` component AND store has result → only ONE card renders

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Defensive filter added to ChatMessage.tsx
- [ ] Tests verify single card render even with legacy persisted components
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Pattern documented in code comments
