# Story 19.1.1: Per-File AbortController Map

**Sprint:** 1
**Track:** Infrastructure
**Phase:** 1 (parallel with 19.1.4)
**Agent:** frontend-agent
**Estimated Lines:** ~250
**Dependencies:** Sprint 0 complete

---

## Overview

### What This Story Does

Adds infrastructure to `useMultiFileUpload.ts` for managing per-file AbortControllers. This replaces the single `abortControllerRef` with a Map that stores one controller per file.

### User-Visible Change

None directly - this is infrastructure. Enables individual file cancellation in Sprint 1.3.

### Why This Matters

**Current:** One AbortController for entire batch
```typescript
const abortControllerRef = useRef<AbortController | null>(null);
// Aborting cancels ALL files
```

**Target:** Map of localIndex → AbortController
```typescript
const abortControllerMapRef = useRef<Map<number, AbortController>>(new Map());
// Each file can be aborted independently
```

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Current Implementation

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

```typescript
// Line 228: Single AbortController
const abortControllerRef = useRef<AbortController | null>(null);

// Lines 314-317: clearAll() aborts the single controller
const clearAll = useCallback(() => {
  // Abort any in-progress upload
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
  // ...
}, []);

// Lines 411-412: uploadAll() creates single controller
abortControllerRef.current = new AbortController();

// Line 443: uploadAll() uses signal
signal: abortControllerRef.current.signal,

// Lines 496-498: uploadAll() handles abort error
if (error instanceof Error && error.name === 'AbortError') {
  // Reset ALL uploading files to pending
}

// Lines 519-520: uploadAll() cleans up
abortControllerRef.current = null;
```

---

## Implementation Steps

### Step 1: Add AbortController Map Ref

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**After line 228 (existing abortControllerRef), add:**
```typescript
// Epic 19: Per-file AbortController map
// Maps localIndex → AbortController for individual file cancellation
// Reference: behavior-matrix.md Section 4 (Cancel/Remove Action)
const abortControllerMapRef = useRef<Map<number, AbortController>>(new Map());
```

**Keep the existing `abortControllerRef` for now** - it will be removed in Story 19.1.2 when uploadAll() is refactored.

### Step 2: Add Helper Functions for Map Management

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add after the refs section (around line 230):**
```typescript
/**
 * Epic 19: Create and store AbortController for a file
 * @param localIndex - File's local index
 * @returns The created AbortController
 */
const createAbortController = useCallback((localIndex: number): AbortController => {
  const controller = new AbortController();
  abortControllerMapRef.current.set(localIndex, controller);
  return controller;
}, []);

/**
 * Epic 19: Get AbortController for a file
 * @param localIndex - File's local index
 * @returns The AbortController or undefined if not found
 */
const getAbortController = useCallback((localIndex: number): AbortController | undefined => {
  return abortControllerMapRef.current.get(localIndex);
}, []);

/**
 * Epic 19: Abort and remove controller for a file
 * @param localIndex - File's local index
 * @returns true if controller existed and was aborted
 */
const abortAndRemoveController = useCallback((localIndex: number): boolean => {
  const controller = abortControllerMapRef.current.get(localIndex);
  if (controller) {
    controller.abort();
    abortControllerMapRef.current.delete(localIndex);
    return true;
  }
  return false;
}, []);

/**
 * Epic 19: Clean up all AbortControllers
 * Called by clearAll() and on unmount
 */
const abortAllControllers = useCallback(() => {
  abortControllerMapRef.current.forEach((controller) => {
    controller.abort();
  });
  abortControllerMapRef.current.clear();
}, []);
```

### Step 3: Update clearAll() to Use Map

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update clearAll() (around line 314):**
```typescript
const clearAll = useCallback(() => {
  // Epic 19: Abort all per-file controllers
  abortAllControllers();

  // Legacy: Abort batch controller (removed in Story 19.1.2)
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;

  // Clear known uploadIds and buffered events
  knownUploadIdsRef.current.clear();
  earlyFileAttachedEventsRef.current.clear();

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

### Step 4: Update removeFile() to Abort Controller

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update removeFile() (around line 288):**
```typescript
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // Check if stage allows removal (all except parsing)
    if (!isRemovable(file.stage)) {
      onErrorRef.current?.('Cannot cancel during analysis');
      return prev;
    }

    // Epic 19: Abort HTTP request if in cancelable stage
    if (requiresAbort(file.stage)) {
      abortAndRemoveController(localIndex);
    } else {
      // Clean up controller even if not aborting (may exist from earlier stage)
      abortControllerMapRef.current.delete(localIndex);
    }

    // Clear uploadId from known set and clean up buffered events
    if (file.uploadId) {
      knownUploadIdsRef.current.delete(file.uploadId);
      earlyFileAttachedEventsRef.current.delete(file.uploadId);
    }

    return prev.filter((f) => f.localIndex !== localIndex);
  });
}, [abortAndRemoveController]);
```

### Step 5: Add Cleanup on Unmount

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add useEffect for cleanup (around line 730, after other effects):**
```typescript
// Epic 19: Cleanup AbortControllers on unmount
useEffect(() => {
  return () => {
    abortAllControllers();
  };
}, [abortAllControllers]);
```

### Step 6: Add Import for requiresAbort

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update import (around line 20):**
```typescript
import { isRemovable, requiresAbort } from '@/lib/uploadStageHelpers';
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.1.1: Per-File AbortController Map', () => {
  describe('clearAll with controllers', () => {
    it('should abort all controllers when clearAll called', () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add files
      const files = [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      ];
      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Start upload (would create controllers in Story 19.1.2)
      // For now, just verify clearAll works
      act(() => {
        result.current.clearAll();
      });

      expect(result.current.files).toHaveLength(0);
    });
  });

  describe('removeFile with abort', () => {
    it('should remove file and not error during uploading stage', () => {
      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      const localIndex = result.current.files[0].localIndex;

      // File starts in 'pending' which is removable
      act(() => {
        result.current.removeFile(localIndex);
      });

      expect(result.current.files).toHaveLength(0);
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('unmount cleanup', () => {
    it('should clean up on unmount', () => {
      const adapter = createMockAdapter(true);
      const { result, unmount } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      // Unmount should clean up without errors
      unmount();

      // No assertion needed - test passes if no errors thrown
    });
  });
});
```

---

## Acceptance Criteria

- [ ] `abortControllerMapRef` added as `Map<number, AbortController>`
- [ ] Helper functions added: createAbortController, getAbortController, abortAndRemoveController, abortAllControllers
- [ ] `clearAll()` calls `abortAllControllers()`
- [ ] `removeFile()` calls `abortAndRemoveController()` when `requiresAbort()` returns true
- [ ] `requiresAbort` imported from uploadStageHelpers
- [ ] Cleanup effect added for unmount
- [ ] All tests passing

---

## Verification

```bash
# Run tests
pnpm --filter @guardian/web test:unit -- useMultiFileUpload

# TypeScript check
pnpm --filter @guardian/web tsc --noEmit

# Expected: No errors, all tests pass
```

**Manual Testing:**

Not directly testable until Story 19.1.2 integrates the map with uploads. Verify:
1. No TypeScript errors
2. Existing upload flow still works (batch controller still used)
3. clearAll() still works

---

## Dependencies

### Uses

- `requiresAbort()` from Story 19.0.1 (uploadStageHelpers.ts)

### Provides For

- Story 19.1.2: createAbortController() for per-file uploads
- Story 19.1.3: Controller management for concurrent queue
- Sprint 2: abortAndRemoveController() for cancel behavior

---

## Notes for Agent

1. **Keep existing abortControllerRef** - Don't remove the batch controller yet. Story 19.1.2 will refactor uploadAll() to use the map instead.

2. **Map uses localIndex as key** - This is the stable identifier for files in this session. uploadId is not available until after upload starts.

3. **Cleanup on unmount** - Important to abort any in-flight requests when component unmounts to prevent memory leaks and orphan requests.

4. **Test complexity** - Full integration tests for abort behavior require mocking fetch. Basic structural tests verify the map management.
