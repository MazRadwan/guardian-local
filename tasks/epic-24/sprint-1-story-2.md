# Story 24.2: Scoring Progress Message Reliability

## Description

Ensure all 8 scoring progress messages display reliably in sequence with smooth transitions during the scoring workflow. Currently, some progress messages may be skipped or overwritten too quickly.

**Why:** Users need visual feedback during the long scoring process. If progress messages skip or flash too quickly, users may think the system is stuck or not working properly.

## Acceptance Criteria

- [ ] All 8 progress messages display during scoring flow in sequence
- [ ] Messages transition smoothly (no flicker or jumps)
- [ ] Each message displays for minimum 500ms before transitioning
- [ ] Progress percentage updates correctly when available
- [ ] Error states display with proper styling
- [ ] No messages skipped or overwritten too quickly
- [ ] **Browser QA:** Upload questionnaire, verify ALL progress messages appear in sequence

## Technical Approach

### Backend Progress Messages (Reference)

The backend emits 8 progress messages from `ScoringService.ts`:

| Line | Status | Message |
|------|--------|---------|
| 65 | parsing | "Retrieving uploaded document..." |
| 80 | parsing | "Extracting responses from document..." |
| 188 | parsing | "Storing extracted responses..." |
| 196 | scoring | "Analyzing responses against rubric..." |
| 203 | scoring | (dynamic from Claude streaming) |
| 211 | validating | "Validating scoring results..." |
| 220 | validating | "Storing assessment results..." |
| 243 | complete | "Scoring complete!" |

### Frontend Changes

**1. Add message queue/debounce (`apps/web/src/hooks/useWebSocketEvents.ts:561-579`):**

```typescript
// Track last update time to enforce minimum display duration
const lastProgressUpdate = useRef<number>(0);
const pendingProgress = useRef<ScoringProgressPayload | null>(null);
const MIN_DISPLAY_MS = 500;

const handleScoringProgress = useCallback(
  (data: ScoringProgressPayload) => {
    if (data.conversationId !== activeConversationId) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - lastProgressUpdate.current;

    if (timeSinceLastUpdate < MIN_DISPLAY_MS) {
      // Queue this update to display after minimum duration
      pendingProgress.current = data;
      setTimeout(() => {
        if (pendingProgress.current === data) {
          useChatStore.getState().updateScoringProgress({
            status: data.status,
            message: data.message,
            progress: data.progress,
          });
          lastProgressUpdate.current = Date.now();
          pendingProgress.current = null;
        }
      }, MIN_DISPLAY_MS - timeSinceLastUpdate);
    } else {
      // Update immediately
      useChatStore.getState().updateScoringProgress({
        status: data.status,
        message: data.message,
        progress: data.progress,
      });
      lastProgressUpdate.current = now;
    }
  },
  [activeConversationId]
);
```

**2. Add smooth transitions (`apps/web/src/components/chat/ProgressMessage.tsx`):**

```typescript
// Add transition classes for smooth message changes
<p className="text-sm font-medium text-gray-900 transition-opacity duration-300">
  {message}
</p>
```

**3. Track message history for debugging:**

Add console logging to verify all messages are received:
```typescript
console.log('[useWebSocketEvents] Scoring progress:', data.status, data.message,
  `(${Date.now() - lastProgressUpdate.current}ms since last)`);
```

## Files Touched

- `apps/web/src/hooks/useWebSocketEvents.ts:561-579` - Add debounce/queue logic
- `apps/web/src/components/chat/ProgressMessage.tsx` - Add transition animations
- `apps/web/src/stores/chatStore.ts:594-608` - Verify update method (no changes expected)

## Agent Assignment

**frontend-agent**

## Tests Required

### Unit Tests

**`apps/web/src/hooks/__tests__/useWebSocketEvents.test.ts`:**
```typescript
describe('handleScoringProgress', () => {
  it('should display all progress messages in sequence', async () => {
    const messages = [
      { status: 'parsing', message: 'Retrieving...' },
      { status: 'parsing', message: 'Extracting...' },
      { status: 'scoring', message: 'Analyzing...' },
      { status: 'complete', message: 'Complete!' },
    ];

    // Emit messages rapidly
    for (const msg of messages) {
      handleScoringProgress({ conversationId: 'test', ...msg });
    }

    // Wait for debounce
    await new Promise(r => setTimeout(r, 2500));

    // Verify all messages were displayed
    expect(mockStore.updateScoringProgress).toHaveBeenCalledTimes(4);
  });

  it('should enforce minimum display duration', async () => {
    handleScoringProgress({ conversationId: 'test', status: 'parsing', message: 'First' });
    handleScoringProgress({ conversationId: 'test', status: 'parsing', message: 'Second' });

    // Second update should be delayed
    expect(mockStore.updateScoringProgress).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 600));
    expect(mockStore.updateScoringProgress).toHaveBeenCalledTimes(2);
  });
});
```

**`apps/web/src/components/chat/__tests__/ProgressMessage.test.tsx`:**
```typescript
describe('ProgressMessage', () => {
  it('should render with smooth transitions', () => {
    const { rerender } = render(
      <ProgressMessage status="parsing" message="First message" />
    );

    expect(screen.getByText('First message')).toHaveClass('transition-opacity');

    rerender(<ProgressMessage status="scoring" message="Second message" />);
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });
});
```

## Browser QA Required

**Steps for Playwright MCP verification:**

1. Navigate to chat interface
2. Switch to Scoring mode
3. Upload a completed Guardian questionnaire
4. Observe progress messages as they appear
5. Take screenshots at each stage:
   - "Retrieving uploaded document..."
   - "Extracting responses from document..."
   - "Storing extracted responses..."
   - "Analyzing scoring..." (after Story 24.4)
   - "Validating scoring results..."
   - "Storing assessment results..."
   - "Scoring complete!"

**Screenshot naming:**
- `24.2-progress-1-retrieving.png`
- `24.2-progress-2-extracting.png`
- `24.2-progress-3-storing.png`
- `24.2-progress-4-analyzing.png`
- `24.2-progress-5-validating.png`
- `24.2-progress-6-storing-results.png`
- `24.2-progress-7-complete.png`

**Success criteria:** ALL progress messages MUST be visible in sequence without skipping.
