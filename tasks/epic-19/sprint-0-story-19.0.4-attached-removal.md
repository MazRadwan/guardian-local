# Story 19.0.4: Attached Stage Removal Fix

**Sprint:** 0
**Track:** Core Fix
**Phase:** 2 (after 19.0.1)
**Agent:** frontend-agent
**Estimated Lines:** ~200
**Dependencies:** 19.0.1 (Stage Helpers)

---

## Overview

### What This Story Does

Fixes the `removeFile()` function in `useMultiFileUpload.ts` to allow removal at `attached` stage without showing an error toast. This is the **core bug fix** of Epic 19.

### User-Visible Change

**Before:**
```
User uploads file → File shows "Attached ✓"
User clicks X → Toast: "Cannot remove file during upload"
File remains in composer ❌
```

**After:**
```
User uploads file → File shows "Attached ✓"
User clicks X → File removed immediately ✓
No toast shown ✓
```

### Why This Matters

Per behavior-matrix.md (lines 166-179, Action Matrix):
> | Stage | X Button | Click Behavior | Server Impact |
> |-------|----------|----------------|---------------|
> | `attached` | Visible | Remove from UI + notify backend | File remains on server* |

The current code at `useMultiFileUpload.ts:294` incorrectly includes `attached` in the blocked stages:
```typescript
if (['uploading', 'storing', 'attached', 'parsing'].includes(file.stage)) {
  onErrorRef.current?.('Cannot remove file during upload');
  return prev;
}
```

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts` - Fix removeFile() function

### Current Implementation

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

```typescript
// Lines 282-307: removeFile function
/**
 * Remove file by localIndex
 * Only allowed for pending/error/complete files (not during upload)
 * Story 17.3.2: Core Operations
 * Epic 18: Clean up buffered events
 */
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // Can't remove during active upload (Epic 18: includes 'attached')
    if (['uploading', 'storing', 'attached', 'parsing'].includes(file.stage)) {
      onErrorRef.current?.('Cannot remove file during upload');
      return prev;
    }

    // Clear uploadId from known set and clean up buffered events
    if (file.uploadId) {
      knownUploadIdsRef.current.delete(file.uploadId);
      earlyFileAttachedEventsRef.current.delete(file.uploadId); // Epic 18: Cleanup
    }

    return prev.filter((f) => f.localIndex !== localIndex);
  });
}, []);
```

### Helper Function (from 19.0.1)

**File:** `apps/web/src/lib/uploadStageHelpers.ts`

```typescript
/**
 * Check if file can be removed at current stage
 * Returns true for all stages except parsing
 */
export function isRemovable(stage: FileUploadStage): boolean {
  return REMOVABLE_STAGES.includes(stage);
}

// REMOVABLE_STAGES = ['pending', 'uploading', 'storing', 'attached', 'complete', 'error']
```

### Behavior Matrix Reference

**Section:** Action Matrix - Remove/Cancel (lines 166-179)

| Stage | X Button | Click Behavior |
|-------|----------|----------------|
| `pending` | Visible | Remove from queue |
| `uploading` | Visible | Abort HTTP + notify backend |
| `storing` | Visible | Remove from UI + notify backend |
| `attached` | **Visible** | **Remove from UI + notify backend** |
| `parsing` | **Hidden** | N/A |
| `complete` | Visible | Remove from UI + notify backend |
| `error` | Visible | Remove from UI |

---

## Implementation Steps

### Step 1: Import Helper Function

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add import at top of file (around line 20):**
```typescript
import { isRemovable, requiresAbort } from '@/lib/uploadStageHelpers';
```

### Step 2: Update removeFile Function

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Before (lines 282-307):**
```typescript
/**
 * Remove file by localIndex
 * Only allowed for pending/error/complete files (not during upload)
 * Story 17.3.2: Core Operations
 * Epic 18: Clean up buffered events
 */
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // Can't remove during active upload (Epic 18: includes 'attached')
    if (['uploading', 'storing', 'attached', 'parsing'].includes(file.stage)) {
      onErrorRef.current?.('Cannot remove file during upload');
      return prev;
    }

    // Clear uploadId from known set and clean up buffered events
    if (file.uploadId) {
      knownUploadIdsRef.current.delete(file.uploadId);
      earlyFileAttachedEventsRef.current.delete(file.uploadId); // Epic 18: Cleanup
    }

    return prev.filter((f) => f.localIndex !== localIndex);
  });
}, []);
```

**After:**
```typescript
/**
 * Remove file by localIndex
 * Allowed at all stages except 'parsing' (cannot cancel enrichment)
 *
 * Story 17.3.2: Core Operations
 * Epic 18: Clean up buffered events
 * Epic 19: Use isRemovable() helper for correct stage logic
 *
 * Reference: behavior-matrix.md Section 4 (Action Matrix - Remove/Cancel)
 */
const removeFile = useCallback((localIndex: number) => {
  setFiles((prev) => {
    const file = prev.find((f) => f.localIndex === localIndex);
    if (!file) return prev;

    // Check if stage allows removal (all except parsing)
    // Reference: behavior-matrix.md lines 166-179
    if (!isRemovable(file.stage)) {
      // Only parsing blocks removal - show specific message
      onErrorRef.current?.('Cannot cancel during analysis');
      return prev;
    }

    // Clear uploadId from known set and clean up buffered events
    if (file.uploadId) {
      knownUploadIdsRef.current.delete(file.uploadId);
      earlyFileAttachedEventsRef.current.delete(file.uploadId);
    }

    // NOTE: Sprint 1 will add abort logic for 'uploading' stage using requiresAbort()
    // For now, we just remove from UI state

    return prev.filter((f) => f.localIndex !== localIndex);
  });
}, []);
```

### Step 3: Update JSDoc Comment

The new comment:
- References behavior-matrix.md
- Explains the change from Epic 18
- Notes that Sprint 1 will add abort logic

---

## Tests to Update

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

**IMPORTANT:** Do NOT mutate hook state directly (e.g., `result.current.files[0].stage = 'attached'`).
This doesn't work in React tests. Instead, simulate WebSocket events to trigger stage transitions.

```typescript
describe('Story 19.0.4: removeFile at attached stage', () => {
  it('should allow removal at attached stage without toast', async () => {
    const onError = jest.fn();

    // Create adapter with spyable event handlers
    let fileAttachedHandler: ((data: FileAttachedEvent) => void) | null = null;
    const adapter = createMockAdapter(true);
    jest.spyOn(adapter, 'subscribeFileAttached').mockImplementation((handler) => {
      fileAttachedHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() =>
      useMultiFileUpload({
        wsAdapter: adapter,
        onError,
      })
    );

    // Add a file
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    const localIndex = result.current.files[0].localIndex;

    // Simulate upload to get uploadId
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        files: [{ index: 0, uploadId: 'upload-test', status: 'accepted' }],
      }),
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Simulate file_attached WebSocket event to transition to 'attached' stage
    act(() => {
      fileAttachedHandler?.({
        uploadId: 'upload-test',
        fileId: 'file-123',
        conversationId: 'conv-1',
      });
    });

    // Verify file is in attached stage
    expect(result.current.files[0].stage).toBe('attached');

    // Remove should work without error
    act(() => {
      result.current.removeFile(localIndex);
    });

    // File should be removed
    expect(result.current.files).toHaveLength(0);
    // No error toast
    expect(onError).not.toHaveBeenCalled();
  });

  it('should still block removal during parsing stage', async () => {
    const onError = jest.fn();

    // Create adapter with spyable event handlers
    let fileAttachedHandler: ((data: FileAttachedEvent) => void) | null = null;
    const adapter = createMockAdapter(true);
    jest.spyOn(adapter, 'subscribeFileAttached').mockImplementation((handler) => {
      fileAttachedHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() =>
      useMultiFileUpload({
        wsAdapter: adapter,
        onError,
      })
    );

    // Add a file
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    const localIndex = result.current.files[0].localIndex;

    // Simulate upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        files: [{ index: 0, uploadId: 'upload-test', status: 'accepted' }],
      }),
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'assessment');
    });

    // Simulate file_attached event with injectContext=true (triggers parsing)
    act(() => {
      fileAttachedHandler?.({
        uploadId: 'upload-test',
        fileId: 'file-123',
        conversationId: 'conv-1',
        injectContext: true, // Triggers transition to 'parsing'
      });
    });

    // Verify file is in parsing stage
    expect(result.current.files[0].stage).toBe('parsing');

    // Attempt removal during parsing
    act(() => {
      result.current.removeFile(localIndex);
    });

    // Should be blocked with error message
    expect(result.current.files).toHaveLength(1); // Still there
    expect(onError).toHaveBeenCalledWith('Cannot cancel during analysis');
  });

  it('should allow removal at pending stage (no upload)', () => {
    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({
        wsAdapter: adapter,
        onError,
      })
    );

    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    const localIndex = result.current.files[0].localIndex;

    // Remove from pending (which is removable)
    act(() => {
      result.current.removeFile(localIndex);
    });

    expect(result.current.files).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });
});

// Update existing test
describe('Story 17.3.2: removeFile and clearAll', () => {
  // MODIFY this test:
  it('should NOT block removal during attached stage', async () => {
    const onError = jest.fn();

    // Setup adapter with file_attached handler spy
    let fileAttachedHandler: ((data: FileAttachedEvent) => void) | null = null;
    const adapter = createMockAdapter(true);
    jest.spyOn(adapter, 'subscribeFileAttached').mockImplementation((handler) => {
      fileAttachedHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() =>
      useMultiFileUpload({
        wsAdapter: adapter,
        onError,
      })
    );

    // Add and upload file
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });
    const localIndex = result.current.files[0].localIndex;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        files: [{ index: 0, uploadId: 'upload-test', status: 'accepted' }],
      }),
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Transition to attached via WS event
    act(() => {
      fileAttachedHandler?.({
        uploadId: 'upload-test',
        fileId: 'file-123',
        conversationId: 'conv-1',
      });
    });

    // Remove from attached stage
    act(() => {
      result.current.removeFile(localIndex);
    });

    // Should remove successfully
    expect(result.current.files).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });
});
```

**Testing Approach:**
1. Use `jest.spyOn(adapter, 'subscribeXxx')` to capture event handlers
2. Trigger stage transitions by calling the captured handlers with appropriate event data
3. Do NOT mutate `result.current.files[x].stage` directly - it doesn't work in React tests
4. The `isRemovable('attached')` helper is tested in 19.0.1; this tests the hook integration

---

## Acceptance Criteria

- [ ] `isRemovable` imported from uploadStageHelpers
- [ ] `removeFile()` uses `isRemovable()` instead of inline array check
- [ ] `attached` stage allows removal (no toast)
- [ ] `parsing` stage still blocks removal (shows "Cannot cancel during analysis")
- [ ] JSDoc updated with Epic 19 reference
- [ ] Existing tests updated
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

1. Start dev server: `pnpm dev`
2. Upload a file
3. Wait for "Attached ✓" status
4. Click X on the file chip
5. Verify:
   - File is removed immediately
   - NO toast appears
   - Composer is cleared

**Regression Testing:**

1. Upload a file
2. While showing "Uploading..." or "Storing..."
3. Click X - file should still be removable (Sprint 1 adds abort)
4. During "Analyzing..." (parsing) - X should be hidden (per FileChip)

---

## Manual QA with Chrome DevTools MCP

After implementation, verify changes using Chrome DevTools MCP:

### Test 1: Remove File at Attached Stage

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Take snapshot: mcp__chrome-devtools__take_snapshot
3. Upload a small PDF via mcp__chrome-devtools__upload_file
4. Wait for file to show "Attached ✓" (check via mcp__chrome-devtools__take_screenshot)
5. Take snapshot to find X button: mcp__chrome-devtools__take_snapshot
6. Click X button on FileChip: mcp__chrome-devtools__click (uid of X button)
7. Take screenshot after removal: mcp__chrome-devtools__take_screenshot
```

### Test 2: Verify No Toast Appears

```
1. After clicking X on attached file
2. Take screenshot immediately: mcp__chrome-devtools__take_screenshot
3. VERIFY: NO toast message visible (previously showed "Cannot remove file during upload")
4. VERIFY: FileChip is gone from composer area
```

### Test 3: Verify X Button Hidden During Parsing

```
1. Upload file and click Send to trigger parsing
2. Take screenshot during "Analyzing..." stage: mcp__chrome-devtools__take_screenshot
3. VERIFY: X button is NOT visible on FileChip during parsing
```

### Expected Results

| Stage | X Button Visible | Click X Result |
|-------|------------------|----------------|
| pending | Yes | File removed |
| uploading | Yes | File removed (abort in Sprint 1) |
| storing | Yes | File removed |
| attached | Yes | File removed, NO toast |
| parsing | **No** | N/A (button hidden) |
| complete | Yes | File removed |
| error | Yes | File removed |

---

## Dependencies

### Uses

- `isRemovable()` from Story 19.0.1 (uploadStageHelpers.ts)

### Provides For

- Sprint 1: Foundation for abort logic (will add `requiresAbort()` check)
- Sprint 2: Cancel behavior relies on correct removal logic

---

## Notes for Agent

1. **This is the core fix** - This story fixes the main user complaint: "I can't remove files after they're attached."

2. **Import path** - Use `@/lib/uploadStageHelpers` for the import.

3. **Error message change** - The error message changes from "Cannot remove file during upload" to "Cannot cancel during analysis" since only parsing blocks removal now.

4. **Sprint 1 prep** - Leave a comment noting that Sprint 1 will add abort logic using `requiresAbort()`. Don't implement abort in this story.

5. **Testing complexity** - Testing stage transitions requires mocking WebSocket events. Focus on:
   - Verifying the import works
   - Verifying the logic change (attached is removable)
   - The detailed stage transition tests are covered by helper function tests in 19.0.1
