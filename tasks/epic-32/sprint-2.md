# Sprint 2: Frontend Integration

## Goal

Update the QuestionnaireWizard stepper to receive and display progress events from the backend, providing real-time feedback during questionnaire generation.

## Dependencies

- Sprint 1 complete (IProgressEmitter, QuestionnaireService integration, WebSocket events)

## Stories

### 32.2.1: Stepper Event Subscription

**Description:** Add WebSocket event listener for `questionnaire_progress` events in the questionnaire wizard component.

**Acceptance Criteria:**
- [ ] Component subscribes to `questionnaire_progress` event on mount
- [ ] Unsubscribes on unmount (no memory leaks)
- [ ] Stores latest progress in component state
- [ ] Handles multiple events in sequence (last wins for display)
- [ ] Event subscription only active during generation step

**Technical Approach:**
```typescript
// apps/web/src/components/questionnaire/QuestionnaireWizard.tsx

interface ProgressState {
  message: string;
  step: number;
  totalSteps: number;
  timestamp: number;
}

const [progress, setProgress] = useState<ProgressState | null>(null);

useEffect(() => {
  if (currentStep !== 'generating') return;

  const handleProgress = (event: QuestionnaireProgressEvent) => {
    // Only update if this is for our conversation
    if (event.conversationId !== conversationId) return;

    // Only update if newer than current (ordering)
    setProgress(prev => {
      if (prev && event.timestamp < prev.timestamp) return prev;
      return {
        message: event.message,
        step: event.step,
        totalSteps: event.totalSteps,
        timestamp: event.timestamp,
      };
    });
  };

  socket.on('questionnaire_progress', handleProgress);

  return () => {
    socket.off('questionnaire_progress', handleProgress);
    setProgress(null); // Clear on unmount
  };
}, [currentStep, conversationId, socket]);
```

**Files Touched:**
- `apps/web/src/components/questionnaire/QuestionnaireWizard.tsx` - Add event subscription
- `apps/web/src/types/websocket.ts` - Add QuestionnaireProgressEvent type (if not exists)

**Agent:** frontend-agent

**Tests Required:**
- `QuestionnaireWizard.test.tsx` - Verify subscribes on generation step
- `QuestionnaireWizard.test.tsx` - Verify unsubscribes on unmount
- `QuestionnaireWizard.test.tsx` - Verify filters by conversationId
- `QuestionnaireWizard.test.tsx` - Verify timestamp ordering (newer wins)

---

### 32.2.2: Progress Display Component

**Description:** Display ephemeral progress text in the stepper UI during questionnaire generation. The text should appear below the step indicator and animate smoothly.

**Acceptance Criteria:**
- [ ] Progress message displayed below "Generating Questionnaire" step
- [ ] Shows step counter: "Step 3 of 12"
- [ ] Message text animates in (fade or slide)
- [ ] Previous message fades out when new one arrives
- [ ] Loading spinner remains visible alongside text
- [ ] Progress clears when generation completes

**Technical Approach:**
```tsx
// ProgressIndicator component (new or inline)

interface ProgressIndicatorProps {
  progress: ProgressState | null;
  isGenerating: boolean;
}

function ProgressIndicator({ progress, isGenerating }: ProgressIndicatorProps) {
  if (!isGenerating || !progress) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <LoadingSpinner />
      <motion.div
        key={progress.timestamp}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="text-sm text-muted-foreground"
      >
        <span className="font-medium">
          Step {progress.step} of {progress.totalSteps}
        </span>
        <span className="mx-2">-</span>
        <span>{progress.message}</span>
      </motion.div>
    </div>
  );
}
```

**UI States:**

| State | Display |
|-------|---------|
| Before generation | (Not visible) |
| Generating, no progress yet | Spinner + "Generating..." |
| Generating, with progress | Spinner + "Step X of Y - Message" |
| Generation complete | (Hidden, moves to next step) |

**Files Touched:**
- `apps/web/src/components/questionnaire/QuestionnaireWizard.tsx` - Integrate ProgressIndicator
- `apps/web/src/components/questionnaire/ProgressIndicator.tsx` - NEW: Progress display component

**Agent:** frontend-agent

**Tests Required:**
- `ProgressIndicator.test.tsx` - Renders message and step count
- `ProgressIndicator.test.tsx` - Shows spinner when no progress
- `ProgressIndicator.test.tsx` - Animates on message change
- `QuestionnaireWizard.test.tsx` - Integration: progress appears during generation

---

### 32.2.3: Reconnection Handling

**Description:** Handle WebSocket disconnection/reconnection gracefully during questionnaire generation. Users should see appropriate feedback if connection is lost.

**Acceptance Criteria:**
- [ ] Detect socket disconnection during generation
- [ ] Show "Reconnecting..." status when disconnected
- [ ] Resume progress updates after reconnection
- [ ] If reconnection fails, show "Generation may still be in progress. Please wait..."
- [ ] Poll for completion status as fallback (optional)
- [ ] No data loss - questionnaire still generates even if client disconnects

**Technical Approach:**
```typescript
// Connection state handling

const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');

useEffect(() => {
  const handleDisconnect = () => {
    if (currentStep === 'generating') {
      setConnectionState('reconnecting');
    }
  };

  const handleReconnect = () => {
    setConnectionState('connected');
    // Could poll for current progress here
  };

  const handleReconnectFailed = () => {
    setConnectionState('disconnected');
  };

  socket.on('disconnect', handleDisconnect);
  socket.on('connect', handleReconnect);
  socket.io.on('reconnect_failed', handleReconnectFailed);

  return () => {
    socket.off('disconnect', handleDisconnect);
    socket.off('connect', handleReconnect);
    socket.io.off('reconnect_failed', handleReconnectFailed);
  };
}, [currentStep, socket]);
```

**UI States for Connection Issues:**

| State | Display |
|-------|---------|
| Reconnecting | Spinner + "Reconnecting..." + last known progress |
| Disconnected | Warning icon + "Connection lost. Generation continues on server..." |

**Files Touched:**
- `apps/web/src/components/questionnaire/QuestionnaireWizard.tsx` - Add connection state handling
- `apps/web/src/components/questionnaire/ProgressIndicator.tsx` - Handle connection states

**Agent:** frontend-agent

**Tests Required:**
- `QuestionnaireWizard.test.tsx` - Shows reconnecting state on disconnect
- `QuestionnaireWizard.test.tsx` - Resumes progress on reconnect
- `QuestionnaireWizard.test.tsx` - Shows warning on reconnect failure
- `ProgressIndicator.test.tsx` - Renders connection state variants

---

## Definition of Done

- [ ] Progress events received and displayed in stepper
- [ ] Smooth animations on progress updates
- [ ] Reconnection handling works correctly
- [ ] All unit tests pass
- [ ] Manual QA: disconnect WiFi during generation, verify graceful handling
- [ ] No memory leaks (event listeners cleaned up)
- [ ] Accessible: progress announcements for screen readers (aria-live)
