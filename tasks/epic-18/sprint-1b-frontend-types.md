# Sprint 1B: Frontend - Types & State Machine

**Track:** B (Frontend)
**Stories:** 18.1B.1 - 18.1B.4
**Estimated Effort:** 2-3 hours
**Parallel With:** Sprint 1A (Backend Events)
**Dependencies:** Sprint 0 decisions (event contract)
**Agent:** `frontend-agent` or general frontend agent

---

## Context

This sprint implements frontend infrastructure for instant file attachment:
1. WebSocket type definitions for `file_attached` event
2. Updated state machine in upload hooks with **monotonic guards**
3. FileChip updates for new states
4. Early event race condition handling

**Key constraints:**
- Must handle `file_attached` arriving in any order relative to `upload_progress` events
- State transitions must be **monotonic** (never go backward unexpectedly)
- `attached` state must be treated as **in-flight** for `waitForCompletion` logic

### Critical: State Regression Prevention (from code review)

**Problem:** Current `useMultiFileUpload` overwrites stage directly on progress events. Without monotonic guards, state can regress (e.g., `attached` → `storing`), causing `waitForCompletion` to resolve early and messages to send without attachments.

**Solution:** This sprint implements state precedence guards as first-class acceptance criteria (not deferred to Sprint 2).

---

## Prerequisites (From Sprint 0)

Before starting, confirm:

- [ ] **D3:** Event ordering contract documented
- [ ] State machine design approved

---

## Story 18.1B.1: Add WebSocket Types and Adapter Subscription

**Goal:** Define TypeScript types for `file_attached` event and add subscription method to WebSocket adapter.

**Files:**
- `apps/web/src/lib/websocket.ts` - Type definitions
- `apps/web/src/hooks/useWebSocket.ts` - Adapter subscription method (NOTE: hooks folder, not root)

### New Type Definitions

```typescript
// apps/web/src/lib/websocket.ts

/**
 * file_attached event - Epic 18
 *
 * Emitted when file is stored and ready for UI display.
 * Does NOT wait for Claude enrichment to complete.
 *
 * Event ordering: May arrive before or after upload_progress events.
 * Frontend must handle any ordering.
 */
export interface FileAttachedEvent {
  conversationId: string;
  uploadId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  hasExcerpt: boolean;
}

/**
 * Extended file stage for Epic 18
 *
 * IMPORTANT: Keep existing stages (idle, selecting) to avoid breaking UI
 * New stage: 'attached' - file stored, ready for display, enrichment may continue
 */
export type FileUploadStage =
  | 'idle'        // EXISTING: No file selected
  | 'selecting'   // EXISTING: File picker open
  | 'pending'     // Not yet started
  | 'uploading'   // HTTP POST in flight
  | 'storing'     // S3 storage in progress
  | 'attached'    // NEW: File stored, ready for display
  | 'parsing'     // Claude enrichment in progress
  | 'complete'    // All done
  | 'error';      // Failed

/**
 * File metadata received from file_attached event
 */
export interface AttachedFileMetadata {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  hasExcerpt: boolean;
}
```

### WebSocket Adapter Update (REQUIRED)

**File:** `apps/web/src/hooks/useWebSocket.ts` (NOTE: in hooks folder)

**CRITICAL:** Hooks use the WebSocket adapter pattern. Without `subscribeFileAttached`, hooks won't receive the new event.

```typescript
// Add to apps/web/src/hooks/useWebSocket.ts

/**
 * Epic 18: Subscribe to file_attached events
 *
 * Hooks use the adapter pattern, so we need explicit subscription methods.
 */

// IMPORTANT: Add to BOTH the return type interface AND UseMultiFileUploadOptions.wsAdapter type

// 1. In the adapter/hook return type interface:
interface WebSocketAdapter {
  // ... existing methods ...

  // NEW: Epic 18
  subscribeFileAttached: (callback: (event: FileAttachedEvent) => void) => () => void;
  onFileAttached: (callback: (event: FileAttachedEvent) => void) => void;
}

// 2. ALSO add to UseMultiFileUploadOptions.wsAdapter type (if separate):
interface UseMultiFileUploadOptions {
  wsAdapter: {
    // ... existing methods ...
    subscribeFileAttached: (callback: (event: FileAttachedEvent) => void) => () => void;
  };
}

// Implementation:
const subscribeFileAttached = useCallback((callback: (event: FileAttachedEvent) => void) => {
  if (!socket) return () => {};

  socket.on('file_attached', callback);

  // Return unsubscribe function
  return () => {
    socket.off('file_attached', callback);
  };
}, [socket]);

// Or simpler one-shot registration:
const onFileAttached = useCallback((callback: (event: FileAttachedEvent) => void) => {
  socket?.on('file_attached', callback);
}, [socket]);

// Return in hook:
return {
  // ... existing ...
  subscribeFileAttached,
  onFileAttached,
};
```

**IMPORTANT:** Ensure `subscribeFileAttached` is added to:
1. The WebSocket adapter return type interface
2. The `UseMultiFileUploadOptions.wsAdapter` type (if defined separately)

Without both, TypeScript compilation will fail.

### Acceptance Criteria

- [ ] `FileAttachedEvent` type defined
- [ ] `FileUploadStage` includes 'attached' AND keeps existing 'idle'/'selecting'
- [ ] `AttachedFileMetadata` type defined
- [ ] Types exported from websocket.ts
- [ ] **`subscribeFileAttached` added to WebSocket adapter**
- [ ] Hooks can subscribe via adapter (not raw socket)

---

## Story 18.1B.2: Update State Machine in useMultiFileUpload

**Goal:** Handle `file_attached` event, new 'attached' stage, and **monotonic stage guards**.

**Files:**
- `apps/web/src/hooks/useMultiFileUpload.ts` (lines 416-637, 237-245 per code review)
- `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx` (MUST update)

### IMPORTANT: Keep Existing Field Names

**Per code review:** Keep the existing `stage` field name (not `state`) to avoid broad refactor. The existing codebase uses `stage` throughout.

### Critical: Stage Precedence (Monotonic Guards)

**FIRST-CLASS ACCEPTANCE CRITERIA** (from code review):

```typescript
/**
 * Epic 18: Stage precedence for monotonic transitions
 *
 * Guards prevent backward stage transitions due to out-of-order events.
 * Higher number = more progressed stage.
 *
 * IMPORTANT: Includes existing 'idle'/'selecting' stages to avoid breaking UI
 */
const STAGE_PRECEDENCE: Record<FileUploadStage, number> = {
  idle: -1,       // EXISTING: Not in upload flow
  selecting: -1,  // EXISTING: Not in upload flow
  pending: 0,
  uploading: 1,
  storing: 2,
  attached: 3,    // NEW: After storing, before parsing
  parsing: 4,
  complete: 5,
  error: 5,       // Terminal stage (same level as complete)
};

/**
 * Check if transition is allowed (forward only, except error)
 */
function canTransitionTo(currentStage: FileUploadStage, newStage: FileUploadStage): boolean {
  // Error can always be set (to report failures)
  if (newStage === 'error') return true;

  // idle/selecting are outside upload flow, always allow transition from them
  if (currentStage === 'idle' || currentStage === 'selecting') return true;

  // Only allow forward transitions
  return STAGE_PRECEDENCE[newStage] > STAGE_PRECEDENCE[currentStage];
}
```

### Critical: In-Flight Check Update

**MUST UPDATE:** The `isInFlight` check to include 'attached' stage:

```typescript
// BEFORE (buggy): attached files could resolve waitForCompletion early
const isInFlight = (stage: FileUploadStage) =>
  ['uploading', 'storing', 'parsing'].includes(stage);

// AFTER (correct): attached is still in-flight until enrichment completes
const isInFlight = (stage: FileUploadStage) =>
  ['uploading', 'storing', 'attached', 'parsing'].includes(stage);
```

### Current State Machine

```typescript
// Current stages (keep existing)
type FileUploadStage = 'idle' | 'selecting' | 'pending' | 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';

// Current transitions
// pending → uploading (HTTP POST)
// uploading → storing (progress event)
// storing → parsing (progress event)
// parsing → complete (progress event)
```

### New State Machine

```typescript
/**
 * Epic 18: Extended state machine with 'attached' stage
 *
 * Stage transitions:
 *
 * pending → uploading (HTTP POST started)
 * uploading → storing (upload_progress: storing)
 * uploading → attached (file_attached event) [fast path]
 * storing → attached (file_attached event)
 * storing → parsing (upload_progress: parsing) [if file_attached missed]
 * attached → parsing (upload_progress: parsing)
 * attached → complete (upload_progress: complete) [fast enrichment]
 * parsing → complete (upload_progress: complete)
 * any → error (upload_progress: error)
 *
 * Key rule: 'attached' can be entered from uploading OR storing
 * Key rule: Once in 'attached', file is ready for display
 */

// Keep existing type name, add 'attached'
type FileUploadStage = 'idle' | 'selecting' | 'pending' | 'uploading' | 'storing' | 'attached' | 'parsing' | 'complete' | 'error';

interface FileUploadItem {
  localIndex: number;
  uploadId: string | null;
  fileId: string | null;          // Set when file_attached received
  file: File;
  stage: FileUploadStage;         // Keep existing field name 'stage', not 'state'
  progress: number;
  error: string | null;
  metadata: AttachedFileMetadata | null;  // Set when file_attached received
}
```

### Early Event Buffer (Race Condition Fix)

**Problem (from code review):** `file_attached` may arrive BEFORE `knownUploadIds` is populated if backend is very fast.

```typescript
/**
 * Epic 18: Buffer for early file_attached events
 *
 * If file_attached arrives before addFiles() completes (race condition),
 * buffer the event and process when uploadId is registered.
 */
const earlyFileAttachedEvents = useRef<Map<string, FileAttachedEvent>>(new Map());

// Called when a new uploadId is registered
const processEarlyEvents = useCallback((uploadId: string) => {
  const bufferedEvent = earlyFileAttachedEvents.current.get(uploadId);
  if (bufferedEvent) {
    earlyFileAttachedEvents.current.delete(uploadId);
    handleFileAttached(bufferedEvent);
  }
}, [handleFileAttached]);
```

### Cleanup for Early Event Buffer (REQUIRED)

**Per code review:** Add cleanup for `earlyFileAttachedEvents` on `removeFile` and `clearAll` to prevent stale buffered events.

**IMPORTANT:** The existing hook uses `localIndex` (not array index) for file identification. Use `localIndex` for cleanup to avoid removing the wrong entry.

```typescript
// In removeFile function:
// NOTE: Uses localIndex for identification, not array index
const removeFile = useCallback((localIndex: number) => {
  setFiles(prev => {
    const fileToRemove = prev.find(f => f.localIndex === localIndex);
    if (fileToRemove?.uploadId) {
      // Clean up any buffered events for this file
      earlyFileAttachedEvents.current.delete(fileToRemove.uploadId);
      knownUploadIds.current.delete(fileToRemove.uploadId);
    }
    return prev.filter(f => f.localIndex !== localIndex);
  });
}, []);

// In clearAll function:
const clearAll = useCallback(() => {
  // Clean up all buffered events
  earlyFileAttachedEvents.current.clear();
  knownUploadIds.current.clear();
  setFiles([]);
}, []);
```

**Why localIndex matters:** The hook tracks files by `localIndex`, not array position. Using array index would remove the wrong file if earlier files were already removed.

### Event Handler Updates (with Monotonic Guards)

```typescript
// Handle file_attached event
// NOTE: Uses `stage` field name (existing), not `state`
const handleFileAttached = useCallback((event: FileAttachedEvent) => {
  // Check if uploadId is known
  if (!knownUploadIds.current.has(event.uploadId)) {
    // Buffer event for later processing (race condition)
    console.debug('[useMultiFileUpload] Buffering early file_attached:', event.uploadId);
    earlyFileAttachedEvents.current.set(event.uploadId, event);
    return;
  }

  setFiles(prev => prev.map(f => {
    if (f.uploadId !== event.uploadId) return f;

    // Use monotonic guard - only transition if allowed
    const shouldTransition = canTransitionTo(f.stage, 'attached');

    if (!shouldTransition) {
      console.debug(
        `[useMultiFileUpload] Ignoring file_attached: ${f.stage} → attached (backward)`
      );
    }

    return {
      ...f,
      // Always capture fileId and metadata (even if stage doesn't change)
      fileId: event.fileId,
      metadata: {
        fileId: event.fileId,
        filename: event.filename,
        mimeType: event.mimeType,
        size: event.size,
        hasExcerpt: event.hasExcerpt,
      },
      // Only update stage if transition is allowed (use 'stage', not 'state')
      stage: shouldTransition ? 'attached' : f.stage,
    };
  }));
}, []);

// Update upload_progress handler with monotonic guards
const handleUploadProgress = useCallback((event: UploadProgressEvent) => {
  if (!knownUploadIds.current.has(event.uploadId)) {
    return;
  }

  setFiles(prev => prev.map(f => {
    if (f.uploadId !== event.uploadId) return f;

    const targetStage = event.stage as FileUploadStage;

    // Use monotonic guard
    const shouldTransition = canTransitionTo(f.stage, targetStage);

    if (!shouldTransition && targetStage !== 'error') {
      console.debug(
        `[useMultiFileUpload] Ignoring progress: ${f.stage} → ${targetStage} (backward)`
      );
    }

    return {
      ...f,
      stage: shouldTransition ? targetStage : f.stage,
      progress: event.progress,
      error: event.error ?? f.error,
    };
  }));
}, []);
```

### Socket Listener Setup (Use WebSocket Adapter)

**Per code review:** Use WebSocket adapter subscription, not raw socket.

```typescript
// Use adapter subscription from useWebSocket hook
const { subscribeFileAttached, subscribeUploadProgress } = useWebSocket();

useEffect(() => {
  // Use adapter subscription methods (not raw socket.on)
  const unsubProgress = subscribeUploadProgress(handleUploadProgress);
  const unsubAttached = subscribeFileAttached(handleFileAttached);

  return () => {
    unsubProgress();
    unsubAttached();
  };
}, [subscribeUploadProgress, subscribeFileAttached, handleUploadProgress, handleFileAttached]);
```

### Acceptance Criteria

- [ ] 'attached' stage added to state machine
- [ ] `file_attached` event handler implemented
- [ ] **Monotonic stage guards implemented** (canTransitionTo function)
- [ ] **STAGE_PRECEDENCE defined** with attached at level 3, idle/selecting at -1
- [ ] **isInFlight includes 'attached' stage** (prevents early waitForCompletion)
- [ ] **Early event buffer for race condition** (earlyFileAttachedEvents)
- [ ] **Cleanup added** to removeFile/clearAll for earlyFileAttachedEvents
- [ ] Out-of-order events handled correctly (no backward transitions)
- [ ] fileId and metadata always captured (even without stage change)
- [ ] **Uses WebSocket adapter** (subscribeFileAttached, not raw socket)
- [ ] **subscribeFileAttached in both types** (adapter return type AND UseMultiFileUploadOptions.wsAdapter)
- [ ] **Uses `stage` field name** (not `state`) to avoid refactor
- [ ] **Cleanup uses localIndex** (not array index) for file identification
- [ ] **Unit tests updated** in `useMultiFileUpload.test.tsx`:
  - Test: storing → attached (allowed)
  - Test: attached → storing (blocked)
  - Test: parsing → attached (blocked, metadata still captured)
  - Test: early file_attached buffered and processed
  - Test: removeFile cleans up buffered events

---

## Story 18.1B.3: Update useFileUpload Hook

**Goal:** Apply same state machine changes to single-file upload hook.

**Files:**
- `apps/web/src/hooks/useFileUpload.ts`
- `apps/web/src/hooks/__tests__/useFileUpload.test.tsx` (MUST update)

### IMPORTANT: Align with Existing Stage Union

**Per code review:** The existing `UploadProgress.stage` union has `idle`/`selecting`. Must preserve these to avoid breaking existing UI.

### Early Event Buffer Consideration

**Decision required:** Should `useFileUpload` (single-file hook) also have an early event buffer?

**Arguments for buffering:**
- Same race condition could occur (fast backend)
- Consistency with multi-file hook

**Arguments against buffering:**
- Single-file timing is tighter (less likely to race)
- Simpler implementation without buffer
- Single uploadId tracked via ref, not map

**Recommendation:** Add buffering for consistency. If skipped, document why:

```typescript
// If NOT adding buffer to useFileUpload, add this comment:
/**
 * NOTE: Unlike useMultiFileUpload, this hook does NOT buffer early file_attached events.
 *
 * Reason: Single-file uploads track uploadId via currentUploadIdRef which is set
 * synchronously before HTTP POST. The race window is much smaller than multi-file
 * where uploadIds are batched and registered asynchronously.
 *
 * If flaky tests occur, consider adding buffering similar to useMultiFileUpload.
 */
```

### Changes Mirror useMultiFileUpload

```typescript
// Keep existing stage type, add 'attached'
// IMPORTANT: Keep 'idle'/'selecting' that UI depends on
type FileUploadStage = 'idle' | 'selecting' | 'pending' | 'uploading' | 'storing' | 'attached' | 'parsing' | 'complete' | 'error';

interface SingleFileUploadState {
  uploadId: string | null;
  fileId: string | null;
  file: File | null;
  stage: FileUploadStage;  // Keep 'stage' field name
  progress: number;
  error: string | null;
  metadata: AttachedFileMetadata | null;
}

// Add file_attached handler with monotonic guard
const handleFileAttached = useCallback((event: FileAttachedEvent) => {
  if (currentUploadIdRef.current !== event.uploadId) {
    return; // Not our file
  }

  setState(prev => {
    // Use monotonic guard
    const shouldTransition = canTransitionTo(prev.stage, 'attached');

    return {
      ...prev,
      fileId: event.fileId,
      stage: shouldTransition ? 'attached' : prev.stage,
      metadata: {
        fileId: event.fileId,
        filename: event.filename,
        mimeType: event.mimeType,
        size: event.size,
        hasExcerpt: event.hasExcerpt,
      },
    };
  });
}, []);
```

### Acceptance Criteria

- [ ] Same stage machine as useMultiFileUpload
- [ ] **Keeps 'idle'/'selecting' stages** (existing UI depends on these)
- [ ] `file_attached` handler with monotonic guard
- [ ] Uses `stage` field name (not `state`)
- [ ] Backward compatible with existing usage
- [ ] **Early event buffer decision documented** (add buffer OR document why not needed)
- [ ] Unit tests for stage transitions

---

## Story 18.1B.4: Update FileChip Component

**Goal:** Display 'attached' stage visually.

**Files:**
- `apps/web/src/components/chat/FileChip.tsx`
- `apps/web/src/components/chat/__tests__/FileChip.test.tsx` (MUST update)

### Current Stages Display

```typescript
// Current implementation (uses 'stage' field name)
const getStageDisplay = (stage: FileUploadStage) => {
  switch (stage) {
    case 'pending': return { icon: Clock, text: 'Queued', color: 'text-gray-400' };
    case 'uploading': return { icon: Spinner, text: `${progress}%`, color: 'text-blue-500' };
    case 'storing': return { icon: Spinner, text: 'Storing...', color: 'text-blue-500' };
    case 'parsing': return { icon: Spinner, text: 'Analyzing...', color: 'text-blue-500' };
    case 'complete': return { icon: CheckCircle, text: 'Ready', color: 'text-green-500' };
    case 'error': return { icon: AlertCircle, text: error, color: 'text-red-500' };
  }
};
```

### New Stage Display

```typescript
/**
 * Epic 18: Add 'attached' stage display
 *
 * 'attached' stage means:
 * - File is stored and ready for display
 * - Text excerpt is available (if applicable)
 * - Claude enrichment may still be running
 *
 * Visual: Checkmark with "Attached" text, optional "Enriching..." indicator
 */

const getStageDisplay = (stage: FileUploadStage, isEnriching: boolean = false) => {
  switch (stage) {
    case 'idle':
    case 'selecting':
      return null;  // Not displayed in chip

    case 'pending':
      return { icon: Clock, text: 'Queued', color: 'text-gray-400' };

    case 'uploading':
      return { icon: Spinner, text: `${progress}%`, color: 'text-blue-500' };

    case 'storing':
      return { icon: Spinner, text: 'Storing...', color: 'text-blue-500' };

    case 'attached':
      // File is ready, but enrichment may still be running
      return {
        icon: CheckCircle,
        text: 'Attached',
        color: 'text-green-500',
        subtext: isEnriching ? 'Enriching...' : undefined,
      };

    case 'parsing':
      return { icon: Spinner, text: 'Analyzing...', color: 'text-blue-500' };

    case 'complete':
      return { icon: CheckCircle, text: 'Ready', color: 'text-green-500' };

    case 'error':
      return { icon: AlertCircle, text: error || 'Error', color: 'text-red-500' };
  }
};
```

### Component Props Update

```typescript
interface FileChipProps {
  file: File;
  stage: FileUploadStage;  // Use 'stage' not 'state'
  progress: number;
  error: string | null;
  metadata: AttachedFileMetadata | null;  // NEW: For displaying file info
  onRemove?: () => void;
  variant?: 'default' | 'compact';
  isEnriching?: boolean;  // NEW: Show enrichment indicator
}
```

### Visual Design

```
┌─────────────────────────────────────┐
│ 📄 document.pdf          ✓ Attached │
│    1.2 MB               Enriching...│
└─────────────────────────────────────┘

Stages:
- pending:   [Clock] "Queued"
- uploading: [Spinner] "45%"
- storing:   [Spinner] "Storing..."
- attached:  [Check] "Attached" + optional "Enriching..."
- parsing:   [Spinner] "Analyzing..."
- complete:  [Check] "Ready"
- error:     [Alert] "{error message}"
```

### Acceptance Criteria

- [ ] 'attached' stage displays correctly
- [ ] Optional "Enriching..." subtext when enrichment in progress
- [ ] Visual consistency with other stages
- [ ] Compact variant updated
- [ ] Unit tests for stage rendering

---

## Testing Strategy

### Test Files to Update (REQUIRED - from code review)

**These files have existing tests that will regress without updates:**

| Test File | Required Updates |
|-----------|-----------------|
| `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx` | Add 'attached' state tests, monotonic guards, early event buffer |
| `apps/web/src/hooks/__tests__/useFileUpload.test.tsx` | Mirror changes from multi-file hook |
| `apps/web/src/components/chat/__tests__/Composer.test.tsx` | Update upload flow assertions for new states |
| `apps/web/src/components/chat/__tests__/FileChip.test.tsx` | Add 'attached' state rendering tests |

### Unit Tests

| Component | Test File | Cases |
|-----------|-----------|-------|
| useMultiFileUpload | `useMultiFileUpload.test.tsx` | State transitions, monotonic guards, early buffer |
| useFileUpload | `useFileUpload.test.tsx` | Same as above for single file |
| FileChip | `FileChip.test.tsx` | Render each state, attached variants |

### State Transition Tests (Monotonic Guards)

```typescript
describe('useMultiFileUpload state machine', () => {
  describe('monotonic guards', () => {
    it('should allow forward transition: storing → attached', () => {
      // Start in 'storing' state
      // Receive file_attached event
      // Assert state is 'attached'
      // Assert fileId and metadata are set
    });

    it('should block backward transition: attached → storing', () => {
      // Start in 'attached' state
      // Receive upload_progress: storing (late event)
      // Assert state remains 'attached' (not regressed)
    });

    it('should block backward transition: parsing → attached', () => {
      // Start in 'parsing' state
      // Receive late file_attached
      // Assert state remains 'parsing'
      // Assert fileId IS still captured from event (metadata always set)
    });

    it('should block backward transition: complete → attached', () => {
      // Start in 'complete' state
      // Receive very late file_attached
      // Assert state remains 'complete'
      // Assert fileId IS still captured (metadata always set)
    });

    it('should allow error from any state', () => {
      // Start in 'attached' state
      // Receive upload_progress: error
      // Assert state transitions to 'error'
    });
  });

  describe('early event buffer', () => {
    it('should buffer file_attached when uploadId not yet known', () => {
      // file_attached arrives before addFiles completes
      // Assert event is buffered
    });

    it('should process buffered event when uploadId is registered', () => {
      // Buffer contains file_attached for uploadId X
      // Call processEarlyEvents(X)
      // Assert state transitions to 'attached'
    });
  });

  describe('isInFlight behavior', () => {
    it('should treat attached as in-flight', () => {
      // File in 'attached' state
      // Assert isInFlight returns true
      // Assert waitForCompletion does NOT resolve early
    });
  });
});
```

### Integration with Sprint 1A

These frontend changes are designed to work with Sprint 1A backend changes:

| Backend Event | Frontend Handler | Expected State |
|---------------|------------------|----------------|
| `upload_progress: storing` | `handleUploadProgress` | 'storing' |
| `file_attached` | `handleFileAttached` | 'attached' |
| `upload_progress: parsing` | `handleUploadProgress` | 'parsing' |
| `upload_progress: complete` | `handleUploadProgress` | 'complete' |

---

## Rollback Plan

If issues discovered:

1. **Feature flag:** Check for `file_attached` event support before using 'attached' state
2. **Fallback:** If no `file_attached` received within 5s, continue with legacy flow
3. **Code revert:** Remove 'attached' state, revert to storing → parsing → complete

---

## Exit Criteria

Sprint 1B is complete when:

- [ ] All 4 stories implemented
- [ ] TypeScript types defined and exported
- [ ] **Monotonic state guards implemented** (STATE_PRECEDENCE, canTransitionTo)
- [ ] **isInFlight includes 'attached'** (waitForCompletion won't resolve early)
- [ ] **Early event buffer handles race condition** (earlyFileAttachedEvents)
- [ ] State machine handles all event orderings (no backward transitions)
- [ ] FileChip displays 'attached' state correctly
- [ ] **All test files updated:**
  - `useMultiFileUpload.test.tsx` - monotonic guard tests
  - `useFileUpload.test.tsx` - same updates
  - `Composer.test.tsx` - upload flow assertions
  - `FileChip.test.tsx` - attached state rendering
- [ ] Unit tests passing
- [ ] Ready to integrate with Sprint 1A in Sprint 2
- [ ] Code reviewed and approved
