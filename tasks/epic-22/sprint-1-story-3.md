# Story 22.1.3: Prevent Duplicate Card Rendering

## Description

Verify and ensure that only ONE scoring card renders per conversation. The card should render from Zustand store state only, not from message components. This is defensive work to prevent edge cases where both paths could render a card.

Current behavior (verified):
- `ChatServer.ts` does NOT include `scoring_result` component in saved messages
- `ScoringResultCard` renders based on store state via `scoringResultByConversation`
- Message content has narrative text only

This story verifies this behavior is correct and adds safeguards if needed.

## Acceptance Criteria

- [ ] Scoring card renders from store state only (`scoringResultByConversation`)
- [ ] Verify no `scoring_result` component exists in message content
- [ ] If both exist (edge case), store takes precedence - no duplicate render
- [ ] Card position is consistent (after the narrative message)
- [ ] Add defensive check in ChatMessage.tsx to skip `scoring_result` component type
- [ ] Document the single-source rendering pattern

## Technical Approach

### 1. Verify Message Content Structure

Confirm in `ChatServer.ts` that scoring messages don't include `scoring_result` component.

Current code at `ChatServer.ts:807-823` (from goals doc):
```typescript
const reportMessage = await this.conversationService.sendMessage({
  conversationId,
  role: 'assistant',
  content: {
    text: narrativeText,
    // No components - scoring card rendered from store state
  },
});
```

### 2. Add Defensive Filter in ChatMessage

In `apps/web/src/components/chat/ChatMessage.tsx`, ensure we never render a `scoring_result` component even if one appears in message data:

```typescript
// Filter out scoring_result components - rendered from store, not message
const filteredComponents = components?.filter(
  (c) => c.type !== 'scoring_result'
) ?? [];
```

### 3. Verify MessageList Rendering

In `apps/web/src/components/chat/MessageList.tsx`, confirm:
- `ScoringResultCard` is rendered from `scoringResult` prop (from store)
- Position is after the last message or at a specific anchor point
- No duplicate render from both message and prop

### 4. Add Code Comment

Document the pattern in `ChatInterface.tsx`:
```typescript
// Epic 22: Scoring card renders from store state only, not from message components
// This ensures:
// 1. Card persists across reloads (via backend rehydration)
// 2. No duplicate cards (single source of truth)
// 3. Consistent positioning (always after narrative message)
```

## Files Touched

- `apps/web/src/components/chat/ChatInterface.tsx` - Verify render logic, add documentation
- `apps/web/src/components/chat/MessageList.tsx` - Verify no duplicate render path
- `apps/web/src/components/chat/ChatMessage.tsx` - Add defensive filter for `scoring_result` component type

## Tests Affected

Existing tests that may need updates:
- `apps/web/src/components/chat/__tests__/ChatInterface.scoring.test.tsx` - Tests should still pass, verify card render from store
- `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx` - May need test for filtering scoring_result components

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] Update `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx`
  - Test that `scoring_result` component type is filtered out
  - Test that other component types still render
- [ ] Verify existing `ChatInterface.scoring.test.tsx` tests pass
  - Card renders from store state
  - Card doesn't render when store is empty
- [ ] Add test case for duplicate prevention
  - If message contains `scoring_result` component AND store has result, only ONE card renders

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Defensive filter added to ChatMessage
- [ ] Tests verify single card render
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Pattern documented in code comments
