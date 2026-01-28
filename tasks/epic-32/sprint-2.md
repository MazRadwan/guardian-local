# Sprint 2: Frontend Integration

## Goal

Update the chat stepper and store to receive and display progress events from the backend, providing real-time feedback during questionnaire generation.

**Architecture Note:** Guardian uses a chat-first architecture. There is NO `QuestionnaireWizard.tsx` component. Progress is displayed via `VerticalStepper.tsx` inline in the chat, with state managed by `chatStore.ts`.

## Dependencies

- Sprint 1 complete (IProgressEmitter, QuestionnaireGenerationService integration, WebSocket events)

## Stories

### 32.2.1: WebSocket Event Subscription for Progress

**Description:** Add WebSocket event listener for `questionnaire_progress` events in the WebSocket client and wire to chatStore.

**Acceptance Criteria:**
- [ ] WebSocketClient has `onQuestionnaireProgress()` method for subscribing
- [ ] chatStore has `questionnaireProgress` state and `setQuestionnaireProgress` action
- [ ] Progress state includes message, step, totalSteps, timestamp, seq
- [ ] Progress state filtered by activeConversationId (ignore other conversations)
- [ ] Progress state reset on conversation switch
- [ ] Progress state reset on generation completion (export_ready event)
- [ ] Progress state reset on disconnect/reconnect
- [ ] Ordering protection: reject events with seq <= lastSeq

**Technical Approach:**
```typescript
// apps/web/src/lib/websocket.ts

export interface QuestionnaireProgressPayload {
  conversationId: string;
  message: string;
  step: number;
  totalSteps: number;
  timestamp: number;
  seq: number;
}

// Add to WebSocketClient class
onQuestionnaireProgress(callback: (data: QuestionnaireProgressPayload) => void): () => void {
  if (!this.socket) throw new Error('WebSocket not initialized');

  const handler = (data: QuestionnaireProgressPayload) => {
    console.log('[WebSocket] Questionnaire progress:', data.step, '/', data.totalSteps, '-', data.message);
    callback(data);
  };

  this.socket.on('questionnaire_progress', handler);
  return () => this.socket?.off('questionnaire_progress', handler);
}
```

```typescript
// apps/web/src/stores/chatStore.ts

interface QuestionnaireProgressState {
  message: string;
  step: number;
  totalSteps: number;
  timestamp: number;
  seq: number;
}

// Add to ChatState interface
questionnaireProgress: QuestionnaireProgressState | null;

// Add action
setQuestionnaireProgress: (progress: QuestionnaireProgressState | null) => void;

// Implementation with ordering protection
setQuestionnaireProgress: (progress) => {
  set((state) => {
    // Ignore if not for active conversation (handled by caller)
    // Ignore if seq is not newer (ordering protection)
    if (progress && state.questionnaireProgress && progress.seq <= state.questionnaireProgress.seq) {
      console.log('[chatStore] Ignoring out-of-order progress event');
      return state;
    }
    return { questionnaireProgress: progress };
  });
},
```

```typescript
// apps/web/src/hooks/useWebSocket.ts (or equivalent)

// In the effect that sets up subscriptions:
const unsubProgress = wsClient.onQuestionnaireProgress((data) => {
  // Filter by active conversation
  if (data.conversationId !== activeConversationId) return;

  setQuestionnaireProgress({
    message: data.message,
    step: data.step,
    totalSteps: data.totalSteps,
    timestamp: data.timestamp,
    seq: data.seq,
  });
});

// Reset on export_ready (generation complete)
const unsubExport = wsClient.onExportReady((data) => {
  if (data.conversationId === activeConversationId) {
    setQuestionnaireProgress(null);
  }
  // ... existing export_ready handling
});
```

**Files Touched:**
- `apps/web/src/lib/websocket.ts` - Add QuestionnaireProgressPayload type and onQuestionnaireProgress method
- `apps/web/src/stores/chatStore.ts` - Add questionnaireProgress state and setQuestionnaireProgress action
- `apps/web/src/hooks/useWebSocket.ts` - Wire progress subscription and reset logic

**Agent:** frontend-agent

**Tests Required:**
- `websocket.test.ts` - Verify onQuestionnaireProgress subscription/unsubscription
- `chatStore.test.ts` - Verify setQuestionnaireProgress sets state
- `chatStore.test.ts` - Verify ordering protection rejects old seq
- `chatStore.test.ts` - Verify progress state resets on conversation switch
- `chatStore.test.ts` - Verify progress state resets on generation completion
- `chatStore.test.ts` - Verify progress state resets on disconnect/reconnect

---

### 32.2.2: Progress Display in VerticalStepper

**Description:** Display ephemeral progress text in the VerticalStepper component during questionnaire generation. The text should appear below the active step indicator.

**Acceptance Criteria:**
- [ ] Progress message displayed below the active "Generating..." step
- [ ] Shows step counter: "Step 3 of 11"
- [ ] Message text updates smoothly (CSS transition)
- [ ] Previous message fades out when new one arrives
- [ ] Loading spinner/pulse remains visible alongside text
- [ ] Progress clears when generation completes
- [ ] Falls back to generic "Generating..." if no progress yet

**Technical Approach:**
```tsx
// apps/web/src/components/chat/VerticalStepper.tsx

interface VerticalStepperProps {
  steps: Step[];
  currentStep: number;
  isRunning: boolean;
  progress?: {
    message: string;
    step: number;
    totalSteps: number;
  } | null;
}

export const VerticalStepper = React.memo<VerticalStepperProps>(
  ({ steps, currentStep, isRunning, progress }) => {
    // ... existing rendering ...

    // For active step, show progress if available
    {isActive && progress && (
      <div
        className="mt-1 text-xs text-muted-foreground transition-opacity duration-300"
        key={progress.step} // Re-render on step change for animation
      >
        <span className="text-sky-600">
          Step {progress.step} of {progress.totalSteps}
        </span>
        <span className="mx-1">-</span>
        <span className="animate-pulse">{progress.message}</span>
      </div>
    )}

    // ... rest of component
  }
);
```

```tsx
// apps/web/src/components/chat/ChatInterface.tsx (or MessageList.tsx)
// Where VerticalStepper is rendered during generation

const { questionnaireProgress } = useChatStore();

<VerticalStepper
  steps={generationSteps}
  currentStep={currentGenerationStep}
  isRunning={isGeneratingQuestionnaire}
  progress={questionnaireProgress}
/>
```

**UI States:**

| State | Display |
|-------|---------|
| Generation not started | (Stepper not visible) |
| Generating, no progress yet | Spinner + "Generating..." (existing behavior) |
| Generating, with progress | Spinner + "Step X of Y - Message" |
| Generation complete | (Stepper shows checkmark, progress hidden) |

**Files Touched:**
- `apps/web/src/components/chat/VerticalStepper.tsx` - Add progress prop and display
- `apps/web/src/components/chat/ChatInterface.tsx` - Pass questionnaireProgress to stepper
- `apps/web/src/components/chat/QuestionnaireMessage.tsx` - May also need progress (if stepper rendered here)

**Agent:** frontend-agent

**Tests Required:**
- `VerticalStepper.test.tsx` - Renders progress message and step count when provided
- `VerticalStepper.test.tsx` - Shows default "Generating..." when no progress
- `VerticalStepper.test.tsx` - Does not render progress when not in running state
- `ChatInterface.test.tsx` - Integration: progress appears during generation

---

### 32.2.3: Reconnection and Edge Case Handling

**Description:** Handle WebSocket disconnection/reconnection gracefully during questionnaire generation. Users should see appropriate feedback if connection is lost.

**Acceptance Criteria:**
- [ ] On disconnect during generation: preserve last known progress message
- [ ] On reconnect: continue showing progress (new events will arrive)
- [ ] If reconnection takes >5s: show "Reconnecting..." alongside progress
- [ ] If reconnection fails: show "Generation in progress on server..."
- [ ] No data loss - questionnaire still generates even if client disconnects
- [ ] Clear all progress state on intentional conversation switch

**Technical Approach:**
```typescript
// apps/web/src/stores/chatStore.ts

// Add connection state awareness
isReconnecting: boolean;
setReconnecting: (value: boolean) => void;

// In setQuestionnaireProgress, preserve last message during reconnect
setQuestionnaireProgress: (progress) => {
  set((state) => {
    // Don't clear progress during reconnect
    if (progress === null && state.isReconnecting) {
      return state;
    }
    // ... existing logic
  });
},
```

```typescript
// apps/web/src/hooks/useWebSocket.ts

// Track reconnection state
socket.on('disconnect', () => {
  setReconnecting(true);
});

socket.on('connect', () => {
  setReconnecting(false);
});
```

```tsx
// VerticalStepper.tsx - show reconnection state
{isActive && isReconnecting && (
  <div className="mt-1 text-xs text-amber-600">
    Reconnecting... {progress?.message && `(${progress.message})`}
  </div>
)}
```

**Files Touched:**
- `apps/web/src/stores/chatStore.ts` - Add reconnection-aware progress handling
- `apps/web/src/hooks/useWebSocket.ts` - Track reconnection state
- `apps/web/src/components/chat/VerticalStepper.tsx` - Handle reconnection display

**Agent:** frontend-agent

**Tests Required:**
- `chatStore.test.ts` - Progress not cleared during reconnect
- `chatStore.test.ts` - Progress cleared on intentional conversation switch
- `VerticalStepper.test.tsx` - Shows reconnecting state
- `useWebSocket.test.tsx` - Sets reconnecting state on disconnect/connect

---

## Definition of Done

- [x] Progress events received and displayed in stepper
- [x] Ordering protection prevents out-of-order display
- [x] Smooth animations on progress updates
- [x] Reconnection handling works correctly
- [x] All unit tests pass
- [ ] Manual QA: disconnect WiFi during generation, verify graceful handling
- [x] No memory leaks (event listeners cleaned up)
- [x] Accessible: progress announcements for screen readers (aria-live)
- [x] **Event wiring complete** (useWebSocketEvents → chatStore)
- [x] **Reconnection state wired** (disconnect/reconnect → setReconnecting)
- [x] **Excel filtered from UI** (regression fix)

---

## Review Findings (Post-Implementation)

**Date:** 2026-01-28

### Critical Miss: Event Wiring
Initial implementation created primitives (`onQuestionnaireProgress`, `setQuestionnaireProgress`, `questionnaireProgress` state) but **did not wire them together**. `useWebSocketEvents` had the handler but `useChatController` wasn't passing it to `useWebSocket`.

**Lesson:** Same as Sprint 1 - always verify the full event flow from source to sink. Unit tests on isolated components don't catch missing wiring.

### Critical Miss: Reconnection State
`setReconnecting` action existed and was tested, but nothing called it on actual socket disconnect/reconnect events.

**Lesson:** State management code needs integration tests that verify actual event sources trigger state changes.

### Regression: Excel Reintroduced
Dynamic rendering of `exportData.formats` reintroduced the Excel button that was previously removed. Backend still sends `['pdf','word','excel']`.

**Fix Applied:** Frontend filters `format !== 'excel'` before rendering.

**Recommendation (non-blocking):** Backend should stop advertising Excel in `formats` array to keep contract clean.

### What Worked Well
- Store tests caught the right invariants (seq ordering, ephemeral state)
- UI component threading was correct (ChatInterface → MessageList → QuestionnaireMessage → QuestionnairePromptCard → VerticalStepper)
- Accessibility handled properly (aria-live="polite")
