# Story 19.2.1: Canceled UploadIds Tracking

**Sprint:** 2
**Track:** Edge Cases
**Phase:** 1 (parallel with 19.2.3, 19.2.4)
**Agent:** frontend-agent
**Estimated Lines:** ~200
**Dependencies:** Sprint 1 complete (per-file uploads)

---

## Overview

### What This Story Does

Adds a `canceledUploadIdsRef` Set to track uploadIds of files that have been canceled. This enables filtering of late WebSocket events for canceled uploads.

### User-Visible Change

None directly - this is infrastructure for Story 19.2.2 (Late Event Filtering).

### Why This Matters

Per behavior-matrix.md Section 12 (Edge Cases):
> `file_attached` / `upload_progress` may arrive after cancel; UI must drop updates for canceled uploadIds.

**Problem scenario:**
```
T0: User starts upload (gets uploadId: "abc-123")
T1: User clicks X to cancel
T2: Server sends file_attached for "abc-123"
T3: Without filtering, file could be "resurrected" in UI
```

**Solution:** Track canceled uploadIds so late events can be ignored.

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Current State

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Existing knownUploadIdsRef (line 218-220):**
```typescript
// Track known uploadIds for "never adopt" pattern
// Only process WS events for uploadIds in this set
const knownUploadIdsRef = useRef<Set<string>>(new Set());
```

**Current removeFile() (Sprint 0/1 version, line 288-307):**
```typescript
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // Epic 19: Check if stage allows removal
    if (!isRemovable(file.stage)) {
      onErrorRef.current?.('Cannot cancel during analysis');
      return prev;
    }

    // Epic 19: Abort HTTP request if in cancelable stage
    if (requiresAbort(file.stage)) {
      abortAndRemoveController(localIndex);
    } else {
      abortControllerMapRef.current.delete(localIndex);
    }

    // Clear uploadId from known set
    if (file.uploadId) {
      knownUploadIdsRef.current.delete(file.uploadId);
      earlyFileAttachedEventsRef.current.delete(file.uploadId);
    }

    return prev.filter((f) => f.localIndex !== localIndex);
  });
}, [abortAndRemoveController]);
```

**Current clearAll() (line 314-334):**
```typescript
const clearAll = useCallback(() => {
  // Epic 19: Abort all per-file controllers
  abortAllControllers();

  // Clear known uploadIds and buffered events
  knownUploadIdsRef.current.clear();
  earlyFileAttachedEventsRef.current.clear();

  // ... rest
}, [abortAllControllers]);
```

---

## Implementation Steps

### Step 1: Add Canceled UploadIds Ref

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add after earlyFileAttachedEventsRef (around line 225):**
```typescript
// Epic 19: Track canceled uploadIds to filter late WS events
// When a file is canceled, its uploadId is added here to prevent
// late file_attached/upload_progress from resurrecting the file.
// Reference: behavior-matrix.md Section 12 (Edge Cases)
const canceledUploadIdsRef = useRef<Set<string>>(new Set());
```

### Step 2: Update removeFile() to Track Canceled UploadIds

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update removeFile() to add uploadId to canceled set:**
```typescript
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // Epic 19: Check if stage allows removal
    if (!isRemovable(file.stage)) {
      onErrorRef.current?.('Cannot cancel during analysis');
      return prev;
    }

    // Epic 19: Abort HTTP request if in cancelable stage
    if (requiresAbort(file.stage)) {
      abortAndRemoveController(localIndex);
    } else {
      abortControllerMapRef.current.delete(localIndex);
    }

    // Clear uploadId from known set and track as canceled
    if (file.uploadId) {
      knownUploadIdsRef.current.delete(file.uploadId);
      earlyFileAttachedEventsRef.current.delete(file.uploadId);

      // Epic 19 Story 19.2.1: Track canceled uploadId for late event filtering
      canceledUploadIdsRef.current.add(file.uploadId);
    }

    return prev.filter((f) => f.localIndex !== localIndex);
  });
}, [abortAndRemoveController]);
```

### Step 3: Update clearAll() to Reset Canceled Set

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update clearAll():**
```typescript
const clearAll = useCallback(() => {
  // Epic 19: Abort all per-file controllers
  abortAllControllers();

  // Clear active uploads tracking
  activeUploadsRef.current.clear();

  // Clear known uploadIds and buffered events
  knownUploadIdsRef.current.clear();
  earlyFileAttachedEventsRef.current.clear();

  // Epic 19 Story 19.2.1: Clear canceled tracking (new conversation = fresh state)
  canceledUploadIdsRef.current.clear();

  // Sprint 2 Fix: Resolve any pending waiters with empty array
  if (waitForCompletionResolversRef.current.length > 0) {
    const resolvers = [...waitForCompletionResolversRef.current];
    waitForCompletionResolversRef.current = [];
    resolvers.forEach((resolver) => resolver([]));
  }

  // Reset state
  setFiles([]);
  nextIndexRef.current = 0;
}, [abortAllControllers]);
```

### Step 4: Add Helper Function to Check Canceled

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add after the refs section (for use in Story 19.2.2):**
```typescript
/**
 * Epic 19 Story 19.2.1: Check if uploadId was canceled
 * Used by WS handlers to filter late events
 */
const isCanceled = useCallback((uploadId: string): boolean => {
  return canceledUploadIdsRef.current.has(uploadId);
}, []);
```

### Step 5: Add Expiry for Canceled Set (Memory Management)

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add effect to expire old canceled entries (optional, prevents memory leak):**
```typescript
// Epic 19: Expire canceled entries after 5 minutes to prevent memory leak
// Canceled uploadIds only need to be tracked long enough for late events to arrive
useEffect(() => {
  const CANCELED_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  const interval = setInterval(() => {
    // Clear all entries if set is non-empty and we have no active uploads
    // This is a simple heuristic - in practice, late events arrive within seconds
    if (canceledUploadIdsRef.current.size > 0 && !isUploading) {
      canceledUploadIdsRef.current.clear();
    }
  }, CANCELED_EXPIRY_MS);

  return () => clearInterval(interval);
}, [isUploading]);
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.2.1: Canceled UploadIds Tracking', () => {
  describe('canceledUploadIdsRef management', () => {
    it('should track uploadId when file with uploadId is removed', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and upload a file
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      // Mock upload response to get uploadId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // File should have uploadId
      expect(result.current.files[0].uploadId).toBe('upload-123');

      // Remove file (in storing stage - allowed per Sprint 0)
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // File should be removed
      expect(result.current.files).toHaveLength(0);

      // Note: Cannot directly test canceledUploadIdsRef.current from here
      // but Story 19.2.2 tests will verify the filtering behavior
    });

    it('should not track uploadId when file without uploadId is removed', () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add file (pending stage - no uploadId yet)
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      // Remove immediately (no uploadId)
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // Should remove without issues
      expect(result.current.files).toHaveLength(0);
    });

    it('should clear canceled set on clearAll', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and upload files
      const files = [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      ];
      act(() => {
        result.current.addFiles(createFileList(files));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [
            { index: 0, uploadId: 'upload-1', status: 'accepted' },
            { index: 1, uploadId: 'upload-2', status: 'accepted' },
          ],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Remove one file
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // Now clearAll
      act(() => {
        result.current.clearAll();
      });

      // All state should be cleared
      expect(result.current.files).toHaveLength(0);

      // Canceled set is cleared internally (verified by Story 19.2.2 tests)
    });
  });
});
```

---

## Acceptance Criteria

- [ ] `canceledUploadIdsRef` added as `Set<string>`
- [ ] `removeFile()` adds uploadId to canceled set when file has uploadId
- [ ] `removeFile()` works normally for files without uploadId (pending)
- [ ] `clearAll()` clears the canceled set
- [ ] `isCanceled()` helper function available for WS handlers
- [ ] Memory expiry mechanism prevents set from growing indefinitely
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

This story is infrastructure - the effect is verified in Story 19.2.2. However, you can add console logging to verify:

1. Upload a file → note the uploadId in Network tab response
2. Cancel the file (X button)
3. Check console for `[useMultiFileUpload] Added to canceled: <uploadId>`

---

## Dependencies

### Uses

- `removeFile()` from Sprint 0 Story 19.0.4 (allows attached removal)
- `abortAndRemoveController()` from Sprint 1 Story 19.1.1

### Provides For

- Story 19.2.2: `canceledUploadIdsRef` and `isCanceled()` for event filtering

---

## Notes for Agent

1. **Ref vs State** - Use ref (not state) because WS handlers need synchronous access. Using state would cause race conditions.

2. **Memory management** - The expiry mechanism prevents the Set from growing indefinitely. In practice, late events arrive within seconds, so 5-minute expiry is conservative.

3. **Why not just use knownUploadIds?** - We need to distinguish between:
   - "Unknown uploadId" (never heard of it) → probably from another tab/session
   - "Canceled uploadId" (we knew it but user canceled) → must actively filter

4. **Clear on clearAll** - A new conversation means fresh state, so clear the canceled set.

5. **Test strategy** - Direct testing of refs is awkward. The real verification happens in Story 19.2.2 where we test that late events are actually filtered.
