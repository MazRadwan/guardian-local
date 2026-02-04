# Story 33.3.3: Typing Indicator Swap

## Description

Update the typing indicator component to show contextual text based on `toolStatus`. When a web search is in progress, show "Searching the web..." instead of the default typing animation. This provides better UX feedback during the tool loop.

## Acceptance Criteria

- [ ] Typing indicator shows "Searching the web..." when `toolStatus === 'searching'`
- [ ] Typing indicator shows "Reading sources..." when `toolStatus === 'reading'`
- [ ] Typing indicator shows default animation when `toolStatus === 'idle'`
- [ ] Smooth transition between states (no jarring flicker)
- [ ] Text is visually distinct from regular typing indicator
- [ ] Indicator returns to default when search completes
- [ ] Works with existing isStreaming state

## Technical Approach

**IMPORTANT:** The current typing indicator shows "Guardian is thinking..." with an avatar. Preserve this existing structure - only swap the text content based on toolStatus.

The typing indicator is in MessageList.tsx (look for the existing "Guardian is thinking..." text). Update it to read toolStatus from store and swap only the text:

```tsx
// In typing indicator component
const toolStatus = useChatStore((state) => state.toolStatus);
const isStreaming = useChatStore((state) => state.isStreaming);

// Determine what TEXT to show (preserve existing avatar + container structure)
const getIndicatorText = () => {
  if (toolStatus === 'searching') {
    return 'Searching the web...';
  }
  if (toolStatus === 'reading') {
    return 'Reading sources...';
  }
  // Default text
  return 'Guardian is thinking...';
};

// Show indicator when streaming OR tool is active
const showIndicator = isStreaming || toolStatus !== 'idle';

// In the JSX, keep existing structure but swap text:
// <Avatar>...</Avatar>
// <span>{getIndicatorText()}</span>
```

**Do NOT add bouncing dots animation** - keep the existing avatar + text structure that matches other assistant messages.

## Files Touched

- `apps/web/src/components/chat/MessageList.tsx` - UPDATE: Read toolStatus from store, swap indicator content
- OR `apps/web/src/components/chat/TypingIndicator.tsx` - UPDATE: If separate component exists

## Tests Affected

- `apps/web/src/components/chat/__tests__/MessageList.test.tsx` - May need updates for new indicator states

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/components/chat/__tests__/TypingIndicator.test.tsx`
  - Shows "Searching the web..." when toolStatus is 'searching'
  - Shows "Reading sources..." when toolStatus is 'reading'
  - Shows "Guardian is thinking..." when toolStatus is 'idle'
  - Shows indicator when toolStatus is not 'idle' even if not streaming
  - Hides indicator when idle and not streaming

## QA Verification (Frontend Story)

**Route:** `/chat`
**Wait For:** `[data-testid="chat-messages"]` (message list loaded)

**Steps:**
1. action: verify_exists, selector: `[data-testid="typing-indicator"]` (while streaming)
2. action: verify_text, selector: `[data-testid="typing-indicator"]`, expected: "Searching" (during search)
3. action: verify_not_exists, selector: `[data-testid="typing-indicator"]` (after completion)

**Note:** Manual QA requires backend with Jina API key to trigger actual search.

**Screenshot:** `qa-33.3.3.png`

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Browser QA passed (frontend story)
