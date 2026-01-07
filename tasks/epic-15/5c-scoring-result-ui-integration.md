# Story 5c: Scoring Result UI Integration

## Background

Story 5b implemented the scoring export endpoints and wired `DownloadButton` into `ScoringResultCard`. However, `ScoringResultCard` is not rendered anywhere in the chat flow.

**Gap identified by reviewer:**
> "The scoring export buttons live in ScoringResultCard, but the chat UI only renders embedded components (button/link/form/download/error) and has no scoring result branch. Users won't see the scoring export actions."

---

## Current State

1. **Backend emits** `scoring_complete` event with result data
2. **`handleScoringComplete`** stores result in `chatStore.scoringResult`
3. **`ScoringResultCard`** exists with export buttons (Story 4.2 + 5b)
4. **BUT** nothing reads `scoringResult` from store to render the card

---

## Solution Options

### Option A: Render in ChatInterface (Recommended)

Render `ScoringResultCard` directly in `ChatInterface.tsx` when `scoringResult` is present:

```tsx
// ChatInterface.tsx
const scoringResult = useChatStore((state) => state.scoringResult);

return (
  <div className="chat-container">
    {/* Messages */}
    {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}

    {/* Scoring Result Card - appears after scoring completes */}
    {scoringResult && (
      <ScoringResultCard result={scoringResult} />
    )}

    {/* Composer */}
    <ChatComposer />
  </div>
);
```

**Pros:**
- Simple implementation
- Appears at bottom of chat (natural position after processing)
- Easy to dismiss/reset

**Cons:**
- Not part of message history (won't persist on reload)

### Option B: Add as Embedded Component Type

Add `scoring_result` to `EmbeddedComponent` types in `ChatMessage.tsx`:

```tsx
case 'scoring_result':
  return <ScoringResultCard result={component.data} />;
```

Backend would include it as an embedded component in a message.

**Pros:**
- Part of message history (persists)
- Consistent with other embedded components

**Cons:**
- Requires backend change to emit as message
- More complex data flow

### Option C: Hybrid (Recommended for Production)

1. Render immediately from store (Option A) for real-time feedback
2. Backend also sends as embedded component for persistence
3. Store clears when card is rendered from message

---

## Recommended Approach: Option A (Simple, Fast)

For MVP, Option A is fastest and addresses the immediate gap.

---

## Implementation Plan

### Phase 1: Frontend Only (~15 min)

**5c.1 - Update ChatInterface to render ScoringResultCard**

**File:** `apps/web/src/components/chat/ChatInterface.tsx`

Add import and store selector:
```tsx
import { ScoringResultCard } from './ScoringResultCard';

// Inside component (after existing store selectors ~line 50):
const scoringResult = useChatStore((state) => state.scoringResult);
const resetScoring = useChatStore((state) => state.resetScoring);
```

Add rendering after MessageList (~line 348):
```tsx
<div className="flex-1 min-h-0 overflow-hidden">
  <MessageList ... />
</div>

{/* Scoring Result Card - appears after scoring completes */}
{scoringResult && scoringResult.assessmentId && (
  <div className="flex-shrink-0 bg-white border-t px-4 py-4 max-w-3xl mx-auto w-full">
    <ScoringResultCard result={scoringResult} />
  </div>
)}

<div className="flex-shrink-0 bg-white z-10">
  <Composer ... />
</div>
```

**5c.2 - Reset scoring state on conversation switch**

Add effect to reset scoring when conversation changes (~line 100):
```tsx
// Reset scoring state when conversation changes
useEffect(() => {
  resetScoring();
}, [activeConversationId, resetScoring]);
```

### Phase 2: Unit Tests (~10 min)

**5c.3 - Test ScoringResultCard renders when scoringResult present**

```tsx
describe('ChatInterface scoring result', () => {
  it('renders ScoringResultCard when scoringResult is present', () => {
    // Set up store with scoringResult
    useChatStore.setState({ scoringResult: mockScoringResult });

    render(<ChatInterface />);

    expect(screen.getByText('Export PDF')).toBeInTheDocument();
  });

  it('does not render ScoringResultCard when scoringResult is null', () => {
    useChatStore.setState({ scoringResult: null });

    render(<ChatInterface />);

    expect(screen.queryByText('Export PDF')).not.toBeInTheDocument();
  });
});
```

---

## Files to Modify

| File | Change | Agent |
|------|--------|-------|
| `apps/web/src/components/chat/ChatInterface.tsx` | Add ScoringResultCard rendering + reset effect | frontend-agent |
| `apps/web/src/components/chat/__tests__/ChatInterface.test.tsx` | Add tests for scoring result rendering | frontend-agent |

---

## Acceptance Criteria

- [ ] `ScoringResultCard` renders in chat when `scoringResult` is present
- [ ] Export PDF/Word buttons are visible and clickable
- [ ] Card clears when conversation changes
- [ ] Unit tests pass

---

## Dependencies

- **Requires:** Story 5b complete (export buttons wired)
- **Blocks:** None (completes MVP scoring flow)

---

## Notes

- This story completes the scoring export MVP
- Future enhancement: persist as embedded component for message history
- Consider scroll-to behavior when card appears
