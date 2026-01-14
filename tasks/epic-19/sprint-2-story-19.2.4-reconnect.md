# Story 19.2.4: WebSocket Reconnect Handling

**Sprint:** 2
**Track:** Edge Cases
**Phase:** 1 (parallel with 19.2.1, 19.2.3)
**Agent:** frontend-agent
**Estimated Lines:** ~250
**Dependencies:** None (can run parallel)

---

## Overview

### What This Story Does

Handles the edge case where a WebSocket disconnect/reconnect leaves files stuck in intermediate states (uploading, storing). After reconnect, orphaned uploads should transition to error state rather than hang indefinitely.

### User-Visible Change

**Before:**
```
T0: User uploads file (uploading stage)
T1: WebSocket disconnects
T2: WebSocket reconnects
T3: File stuck at "uploading" forever (UI bug)
```

**After:**
```
T0: User uploads file (uploading stage)
T1: WebSocket disconnects
T2: WebSocket reconnects
T3: After timeout, file transitions to "error" state
T4: User can remove and retry
```

### Why This Matters

Per behavior-matrix.md Section 12 (Edge Cases):
> Reconnect / WS drop: Ensure in-flight uploads resolve to `error` or `complete` after timeout; avoid stuck `uploading/storing` chips.

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`
2. `apps/web/src/lib/websocket.ts` (for reconnect event)

### Current WebSocket Adapter Interface

**File:** `apps/web/src/hooks/useMultiFileUpload.ts` (UseMultiFileUploadOptions)

```typescript
export interface UseMultiFileUploadOptions {
  wsAdapter: {
    isConnected: boolean;
    subscribeUploadProgress: (...) => () => void;
    subscribeIntakeContextReady: (...) => () => void;
    subscribeScoringParseReady: (...) => () => void;
    subscribeFileAttached: (...) => () => void;
  };
  // ...
}
```

### Current WebSocket Implementation

**File:** `apps/web/src/lib/websocket.ts`

The WebSocket adapter exposes `isConnected` state. When connection drops, `isConnected` becomes `false`. On reconnect, it becomes `true`.

---

## Implementation Steps

### Step 1: Add Upload Start Timestamps Ref

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add after canceledUploadIdsRef:**
```typescript
// Epic 19 Story 19.2.4: Track when uploads started for orphan detection
// Maps localIndex → timestamp when upload entered 'uploading' stage
const uploadStartTimesRef = useRef<Map<number, number>>(new Map());
```

### Step 2: Track Upload Start Time in uploadSingleFile

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update uploadSingleFile (from Story 19.1.2) to track start time:**
```typescript
const uploadSingleFile = useCallback(
  async (file: FileState, conversationId: string, mode: UploadMode): Promise<void> => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    const { localIndex } = file;

    // Create AbortController for this file
    const controller = createAbortController(localIndex);

    // Epic 19 Story 19.2.4: Track upload start time
    // IMPORTANT: Timestamp persists until file reaches terminal state (complete/error)
    // Do NOT clear when HTTP resolves - file may still be in 'storing' awaiting WS events
    uploadStartTimesRef.current.set(localIndex, Date.now());

    // Mark this file as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.localIndex === localIndex
          ? { ...f, stage: 'uploading' as const, progress: 10 }
          : f
      )
    );

    try {
      // ... rest of upload logic
    } catch (error) {
      // ... error handling
      // Clear timestamp on error (terminal state)
      uploadStartTimesRef.current.delete(localIndex);
    } finally {
      // Clean up abort controller only
      abortControllerMapRef.current.delete(localIndex);
      // NOTE: Do NOT clear uploadStartTimesRef here - file may be in 'storing' stage
      // Timestamp is cleared when file reaches terminal state (complete/error) or is removed
    }
  },
  [token, createAbortController, processEarlyEvents]
);
```

### Step 3: Add Orphan Detection on Reconnect

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add useEffect to handle reconnect:**
```typescript
// Epic 19 Story 19.2.4: Handle orphaned uploads on WebSocket reconnect
const ORPHAN_TIMEOUT_MS = 30000; // 30 seconds

useEffect(() => {
  if (!wsAdapter.isConnected) {
    // Disconnected - nothing to do
    return;
  }

  // On reconnect, check for orphaned uploads
  const checkOrphans = () => {
    const now = Date.now();
    const orphanedIndices: number[] = [];

    // Find files that have been uploading/storing for too long
    filesRef.current.forEach((file) => {
      if (!['uploading', 'storing'].includes(file.stage)) return;

      const startTime = uploadStartTimesRef.current.get(file.localIndex);
      if (startTime && (now - startTime) > ORPHAN_TIMEOUT_MS) {
        orphanedIndices.push(file.localIndex);
      }
    });

    if (orphanedIndices.length > 0) {
      console.warn(
        '[useMultiFileUpload] Marking orphaned uploads as error:',
        orphanedIndices
      );

      setFiles((prev) =>
        prev.map((f) => {
          if (orphanedIndices.includes(f.localIndex)) {
            // Clean up tracking
            uploadStartTimesRef.current.delete(f.localIndex);
            abortControllerMapRef.current.delete(f.localIndex);

            return {
              ...f,
              stage: 'error' as const,
              progress: 0,
              error: 'Upload interrupted - please try again',
            };
          }
          return f;
        })
      );
    }
  };

  // Run check on reconnect (small delay to let WS events catch up)
  const timeoutId = setTimeout(checkOrphans, 2000);

  return () => clearTimeout(timeoutId);
}, [wsAdapter.isConnected]);
```

### Step 4: Add Periodic Orphan Check

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add periodic check for orphans (in case reconnect detection misses):**
```typescript
// Epic 19 Story 19.2.4: Periodic orphan check as fallback
useEffect(() => {
  const ORPHAN_CHECK_INTERVAL_MS = 15000; // Check every 15 seconds
  const ORPHAN_TIMEOUT_MS = 60000; // 60 seconds without progress = orphan

  const checkOrphans = () => {
    const now = Date.now();

    filesRef.current.forEach((file) => {
      // Only check uploading/storing stages
      if (!['uploading', 'storing'].includes(file.stage)) return;

      const startTime = uploadStartTimesRef.current.get(file.localIndex);
      if (startTime && (now - startTime) > ORPHAN_TIMEOUT_MS) {
        console.warn(
          '[useMultiFileUpload] Orphan detected (timeout):',
          file.localIndex,
          file.filename
        );

        // Clean up tracking
        uploadStartTimesRef.current.delete(file.localIndex);

        // Abort if controller exists
        const controller = abortControllerMapRef.current.get(file.localIndex);
        if (controller) {
          controller.abort();
          abortControllerMapRef.current.delete(file.localIndex);
        }

        // Transition to error
        setFiles((prev) =>
          prev.map((f) =>
            f.localIndex === file.localIndex
              ? {
                  ...f,
                  stage: 'error' as const,
                  progress: 0,
                  error: 'Upload timed out - please try again',
                }
              : f
          )
        );
      }
    });
  };

  const intervalId = setInterval(checkOrphans, ORPHAN_CHECK_INTERVAL_MS);

  return () => clearInterval(intervalId);
}, []);
```

### Step 5: Reset Timestamp on Progress

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update upload_progress handler to reset timestamp (proves upload is alive):**
```typescript
const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
  // ... existing checks

  // Epic 19 Story 19.2.4: Update timestamp on progress (upload is alive)
  const file = filesRef.current.find((f) => f.uploadId === data.uploadId);
  if (file) {
    uploadStartTimesRef.current.set(file.localIndex, Date.now());
  }

  setFiles((prev) =>
    prev.map((f) => {
      // ... existing mapping
    })
  );
});
```

### Step 5b: Clear Timestamp on Terminal States

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update handlers that transition to terminal states:**

**In intake_context_ready handler (complete state for intake mode):**
```typescript
const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
  // ... existing checks

  setFiles((prev) =>
    prev.map((f) => {
      if (f.uploadId === data.uploadId) {
        // Epic 19 Story 19.2.4: Clear timestamp on complete (terminal state)
        uploadStartTimesRef.current.delete(f.localIndex);

        return { ...f, stage: 'complete' as const, progress: 100 };
      }
      return f;
    })
  );
});
```

**In scoring_parse_ready handler (complete state for assessment mode):**
```typescript
const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
  // ... existing checks

  setFiles((prev) =>
    prev.map((f) => {
      if (f.uploadId === data.uploadId) {
        // Epic 19 Story 19.2.4: Clear timestamp on complete (terminal state)
        uploadStartTimesRef.current.delete(f.localIndex);

        return { ...f, stage: 'complete' as const, progress: 100 };
      }
      return f;
    })
  );
});
```

**In removeFile (file canceled/removed):**
```typescript
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // ... existing checks

    // Epic 19 Story 19.2.4: Clear timestamp on removal
    uploadStartTimesRef.current.delete(localIndex);

    // ... rest of removal logic
  });
}, []);
```

### Step 6: Clean Up on clearAll

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update clearAll to reset timestamps:**
```typescript
const clearAll = useCallback(() => {
  // Abort all controllers
  abortAllControllers();

  // Clear all tracking
  activeUploadsRef.current.clear();
  knownUploadIdsRef.current.clear();
  earlyFileAttachedEventsRef.current.clear();
  canceledUploadIdsRef.current.clear();
  uploadStartTimesRef.current.clear(); // Epic 19 Story 19.2.4

  // ... rest
}, [abortAllControllers]);
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.2.4: WebSocket Reconnect Handling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('orphan detection on reconnect', () => {
    it('should mark long-running uploads as error after reconnect', async () => {
      let isConnected = true;
      const adapter = createMockAdapter(true);
      Object.defineProperty(adapter, 'isConnected', {
        get: () => isConnected,
      });

      const { result, rerender } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and start upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // File is in storing stage
      expect(result.current.files[0].stage).toBe('storing');

      // Simulate disconnect
      isConnected = false;
      rerender();

      // Advance time past timeout
      act(() => {
        jest.advanceTimersByTime(35000);
      });

      // Simulate reconnect
      isConnected = true;
      rerender();

      // Wait for reconnect check delay
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // File should be in error state
      expect(result.current.files[0].stage).toBe('error');
      expect(result.current.files[0].error).toContain('interrupted');
    });

    it('should not mark recent uploads as error', async () => {
      let isConnected = true;
      const adapter = createMockAdapter(true);
      Object.defineProperty(adapter, 'isConnected', {
        get: () => isConnected,
      });

      const { result, rerender } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and start upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Simulate quick disconnect/reconnect (within timeout)
      isConnected = false;
      rerender();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      isConnected = true;
      rerender();
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // File should still be in storing (not yet timed out)
      expect(result.current.files[0].stage).toBe('storing');
    });
  });

  describe('periodic orphan check', () => {
    it('should mark uploads as error after 60s without progress', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and start upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Advance past orphan timeout (60s) + check interval
      act(() => {
        jest.advanceTimersByTime(75000);
      });

      // File should be in error state
      expect(result.current.files[0].stage).toBe('error');
      expect(result.current.files[0].error).toContain('timed out');
    });

    it('should reset timeout on progress event', async () => {
      const adapter = createMockAdapter(true);
      let progressHandler: ((data: UploadProgressEvent) => void) | null = null;

      jest.spyOn(adapter, 'subscribeUploadProgress').mockImplementation((handler) => {
        progressHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Setup upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Advance 50s (under timeout)
      act(() => {
        jest.advanceTimersByTime(50000);
      });

      // Send progress event (resets timer)
      act(() => {
        progressHandler?.({
          uploadId: 'upload-1',
          progress: 50,
          stage: 'storing',
        });
      });

      // Advance another 50s (would be 100s total without reset)
      act(() => {
        jest.advanceTimersByTime(50000);
      });

      // File should still be uploading (timer was reset)
      expect(result.current.files[0].stage).toBe('storing');
    });
  });

  describe('clearAll cleanup', () => {
    it('should clear upload timestamps on clearAll', () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add file
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      // Clear
      act(() => {
        result.current.clearAll();
      });

      // Files cleared
      expect(result.current.files).toHaveLength(0);
    });
  });
});
```

---

## Acceptance Criteria

- [ ] `uploadStartTimesRef` tracks upload start times
- [ ] Timestamps cleared on upload complete/error/cancel
- [ ] Reconnect triggers orphan check after delay
- [ ] Periodic orphan check runs every 15 seconds
- [ ] Files stuck > 60s transition to error with message
- [ ] Progress events reset the timeout
- [ ] `clearAll()` clears all timestamps
- [ ] All tests passing

---

## Verification

```bash
# Run tests
pnpm --filter @guardian/web test:unit -- useMultiFileUpload

# TypeScript check
pnpm --filter @guardian/web tsc --noEmit
```

**Manual Testing:**

1. Start file upload
2. Use DevTools → Network → Offline to simulate disconnect
3. Wait 30+ seconds
4. Go back online
5. Verify file shows error state with "interrupted" message
6. Verify user can remove and retry

---

## Manual QA with Chrome DevTools MCP

After implementation, verify reconnect handling using Chrome DevTools MCP:

### Test 1: Simulate Disconnect During Upload

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Upload a large file (10MB+) via mcp__chrome-devtools__upload_file
3. Take screenshot showing "Uploading..." state: mcp__chrome-devtools__take_screenshot
4. Use browser Network panel to go offline (emulate offline mode)
   - mcp__chrome-devtools__emulate (network: "offline")
5. Wait 35 seconds
6. Go back online: mcp__chrome-devtools__emulate (network: "online")
7. Wait 3-5 seconds for reconnect check
8. Take screenshot: mcp__chrome-devtools__take_screenshot
```

### Test 2: Verify Error State After Timeout

```
1. After reconnect following timeout
2. Take screenshot: mcp__chrome-devtools__take_screenshot
3. VERIFY: FileChip shows ERROR state (red styling)
4. VERIFY: Error message says "Upload interrupted - please try again" or similar
5. VERIFY: X button is visible (user can remove)
```

### Test 3: Verify Quick Reconnect (No Error)

```
1. Start upload
2. Go offline: mcp__chrome-devtools__emulate (network: "offline")
3. Wait only 5 seconds (under timeout)
4. Go online: mcp__chrome-devtools__emulate (network: "online")
5. Take screenshot: mcp__chrome-devtools__take_screenshot
6. VERIFY: FileChip still shows "Uploading..." or "Storing..." (NOT error)
```

### Test 4: Verify Remove and Retry

```
1. After file shows error from timeout
2. Click X to remove: mcp__chrome-devtools__click
3. Take screenshot: mcp__chrome-devtools__take_screenshot
4. VERIFY: FileChip removed
5. Upload same file again: mcp__chrome-devtools__upload_file
6. VERIFY: Upload starts fresh (new FileChip)
```

### Expected Results

| Scenario | Expected Behavior |
|----------|-------------------|
| Offline > 30s → Online | File transitions to ERROR state |
| Offline < 30s → Online | File continues upload normally |
| Error message | "Upload interrupted - please try again" |
| After error | User can remove file with X button |
| Retry | Fresh upload works normally |

---

## Dependencies

### Uses

- `abortControllerMapRef` from Story 19.1.1
- `filesRef` for synchronous state access

### Provides For

- Complete disconnect recovery for Epic 19

---

## Notes for Agent

1. **Two timeout values** - Reconnect check uses 30s (aggressive), periodic uses 60s (conservative). This is intentional.

2. **Delay after reconnect** - Wait 2 seconds after reconnect before checking orphans. This gives legitimate WS events time to arrive.

3. **Progress resets timer** - Any progress event proves the upload is alive. Reset the start timestamp.

4. **Abort orphaned controllers** - If a controller exists for an orphan, abort it. The HTTP request may still be in flight.

5. **User-friendly errors** - Error messages should guide user to "try again" rather than being technical.

6. **Testing with fake timers** - Use `jest.useFakeTimers()` to control time in tests. Remember to advance timers in `act()`.
