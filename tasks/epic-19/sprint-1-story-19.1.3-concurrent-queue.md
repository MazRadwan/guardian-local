# Story 19.1.3: Concurrent Upload Queue

**Sprint:** 1
**Track:** Core Refactor
**Phase:** 3 (after 19.1.2)
**Agent:** frontend-agent
**Estimated Lines:** ~300
**Dependencies:** 19.1.2 (Single File Upload)

---

## Overview

### What This Story Does

Implements a concurrent upload queue with a configurable limit (default: 3). Files queue when at the limit, and new uploads start as slots become available.

### User-Visible Change

**Upload 5 files:**
```
Files 1, 2, 3: [Uploading...]  (concurrent)
Files 4, 5:    [Queued]        (waiting)

File 1 completes → File 4 starts uploading
File 2 completes → File 5 starts uploading
```

### Why This Matters

Per behavior-matrix.md Section 5 (Concurrency Limits):
> Max concurrent uploads: **2-3**
>
> User selects 5 files:
> → Files 1-3 start uploading immediately (concurrent)
> → Files 4-5 remain in 'pending' until slot opens
> → As each upload completes, next pending file starts

Without a limit:
- All files upload simultaneously
- Can overwhelm server/network
- May hit rate limits

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Current uploadAll() (from 19.1.2)

```typescript
const uploadAll = useCallback(
  async (conversationId: string, mode: UploadMode) => {
    // ...

    // Sequential upload (from Story 19.1.2)
    for (const file of pendingFiles) {
      await uploadSingleFile(currentFile, conversationId, mode);
    }
  },
  [token, uploadSingleFile]
);
```

### Target Pattern

```typescript
const UPLOAD_CONCURRENCY_LIMIT = 3;

// Upload with concurrency limit
async function uploadWithConcurrency(files, limit) {
  const queue = [...files];
  const active = new Set();

  const startNext = async () => {
    if (queue.length === 0 || active.size >= limit) return;

    const file = queue.shift();
    active.add(file.localIndex);

    try {
      await uploadSingleFile(file);
    } finally {
      active.delete(file.localIndex);
      startNext(); // Start next in queue
    }
  };

  // Start up to LIMIT concurrent
  const starters = Array(Math.min(limit, files.length))
    .fill(null)
    .map(() => startNext());

  await Promise.all(starters);
}
```

---

## Implementation Steps

### Step 1: Add Concurrency Constant

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add near top of file (around line 35):**
```typescript
/**
 * Epic 19: Maximum concurrent uploads
 * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
 */
const UPLOAD_CONCURRENCY_LIMIT = 3;
```

### Step 2: Add Active Uploads Tracking Ref

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add after abortControllerMapRef (around line 232):**
```typescript
// Epic 19: Track currently uploading file indices for concurrency control
const activeUploadsRef = useRef<Set<number>>(new Set());
```

### Step 3: Refactor uploadAll with Concurrency Queue

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Replace uploadAll() with:**
```typescript
/**
 * Upload all pending files with concurrency limit
 *
 * Epic 19 Story 19.1.3: Implements concurrent queue pattern.
 * - Maximum UPLOAD_CONCURRENCY_LIMIT simultaneous uploads
 * - Remaining files queue and start as slots open
 * - Each file uses independent AbortController
 *
 * @param conversationId - Target conversation
 * @param mode - Upload mode
 *
 * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
 */
const uploadAll = useCallback(
  async (conversationId: string, mode: UploadMode) => {
    if (!token) {
      onErrorRef.current?.('Not authenticated');
      return;
    }

    // Get pending files (snapshot at call time)
    const pendingFiles = filesRef.current.filter((f) => f.stage === 'pending');
    if (pendingFiles.length === 0) return;

    // Create queue from pending files (copy to avoid mutation issues)
    const uploadQueue = [...pendingFiles];

    /**
     * Start next upload if slots available
     * Returns a promise that resolves when this upload chain completes
     */
    const processQueue = async (): Promise<void> => {
      while (uploadQueue.length > 0) {
        // Check if we have capacity
        if (activeUploadsRef.current.size >= UPLOAD_CONCURRENCY_LIMIT) {
          // No capacity - this worker will exit, another will continue
          return;
        }

        // Get next file from queue
        const file = uploadQueue.shift();
        if (!file) return;

        // Check if file still exists and is still pending
        const currentFile = filesRef.current.find((f) => f.localIndex === file.localIndex);
        if (!currentFile || currentFile.stage !== 'pending') {
          // File was removed or stage changed - continue to next
          continue;
        }

        // Mark as active
        activeUploadsRef.current.add(file.localIndex);

        try {
          // Upload this file
          await uploadSingleFile(currentFile, conversationId, mode);
        } catch (error) {
          // Individual errors handled in uploadSingleFile
          console.error(`Upload failed for ${file.filename}:`, error);
        } finally {
          // Release slot
          activeUploadsRef.current.delete(file.localIndex);
        }
      }
    };

    // Start up to LIMIT concurrent workers
    const workerCount = Math.min(UPLOAD_CONCURRENCY_LIMIT, pendingFiles.length);
    const workers = Array(workerCount)
      .fill(null)
      .map(() => processQueue());

    // Wait for all workers to complete
    await Promise.all(workers);

    // Clear active set (should already be empty)
    activeUploadsRef.current.clear();
  },
  [token, uploadSingleFile]
);
```

### Step 4: Update clearAll to Reset Active Set

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update clearAll():**
```typescript
const clearAll = useCallback(() => {
  // Epic 19: Abort all per-file controllers
  abortAllControllers();

  // Epic 19: Clear active uploads tracking
  activeUploadsRef.current.clear();

  // Clear known uploadIds and buffered events
  knownUploadIdsRef.current.clear();
  earlyFileAttachedEventsRef.current.clear();

  // ... rest of function
}, [abortAllControllers]);
```

### Step 5: Export Concurrency Limit (for tests)

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add export at bottom of file:**
```typescript
// Export for testing
export { UPLOAD_CONCURRENCY_LIMIT };
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
import { UPLOAD_CONCURRENCY_LIMIT } from '../useMultiFileUpload';

describe('Story 19.1.3: Concurrent Upload Queue', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should have concurrency limit of 3', () => {
    expect(UPLOAD_CONCURRENCY_LIMIT).toBe(3);
  });

  it('should limit concurrent uploads', async () => {
    // Track concurrent calls
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockFetch.mockImplementation(() => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

      return new Promise((resolve) => {
        setTimeout(() => {
          currentConcurrent--;
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: `upload-${Date.now()}`, status: 'accepted' }],
            }),
          });
        }, 50); // Simulate upload time
      });
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    // Add 5 files (more than concurrency limit)
    const files = Array(5)
      .fill(null)
      .map((_, i) => new File([`content${i}`], `file${i}.pdf`, { type: 'application/pdf' }));

    act(() => {
      result.current.addFiles(createFileList(files));
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Should never exceed limit
    expect(maxConcurrent).toBeLessThanOrEqual(UPLOAD_CONCURRENCY_LIMIT);

    // But should have reached limit (efficient use)
    expect(maxConcurrent).toBe(UPLOAD_CONCURRENCY_LIMIT);

    // All files should have been uploaded
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('should queue files and process as slots open', async () => {
    const uploadOrder: string[] = [];
    const completeOrder: string[] = [];

    mockFetch.mockImplementation((url, options) => {
      const formData = options.body as FormData;
      const file = formData.get('files') as File;
      uploadOrder.push(file.name);

      return new Promise((resolve) => {
        setTimeout(() => {
          completeOrder.push(file.name);
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: `upload-${file.name}`, status: 'accepted' }],
            }),
          });
        }, 20);
      });
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    const files = Array(5)
      .fill(null)
      .map((_, i) => new File([`c${i}`], `file${i}.pdf`, { type: 'application/pdf' }));

    act(() => {
      result.current.addFiles(createFileList(files));
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // All files should complete
    expect(completeOrder).toHaveLength(5);
  });

  it('should handle file removal during queue processing', async () => {
    mockFetch.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: `upload-${Date.now()}`, status: 'accepted' }],
            }),
          });
        }, 50);
      })
    );

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    const files = Array(5)
      .fill(null)
      .map((_, i) => new File([`c${i}`], `file${i}.pdf`, { type: 'application/pdf' }));

    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Remove file 3 (should be in queue, not yet uploading)
    const file3Index = result.current.files[3].localIndex;
    act(() => {
      result.current.removeFile(file3Index);
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Only 4 uploads should occur
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('should clear active set on clearAll', async () => {
    mockFetch.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
            }),
          });
        }, 100);
      })
    );

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    // Start upload
    const uploadPromise = act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Clear before complete
    act(() => {
      result.current.clearAll();
    });

    await uploadPromise;

    // Files should be cleared
    expect(result.current.files).toHaveLength(0);
  });
});
```

---

## Acceptance Criteria

- [ ] `UPLOAD_CONCURRENCY_LIMIT` constant defined (value: 3)
- [ ] `activeUploadsRef` tracking active upload indices
- [ ] `uploadAll()` implements concurrent queue pattern
- [ ] Maximum LIMIT concurrent uploads enforced
- [ ] Remaining files queue and start as slots open
- [ ] Files removed during upload are skipped
- [ ] `clearAll()` resets active tracking
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

1. Upload 5+ files
2. Open Network tab
3. Verify only 3 requests at a time
4. As requests complete, new ones start
5. Remove a queued file - it should not upload

---

## Manual QA with Chrome DevTools MCP

After implementation, verify concurrency limit using Chrome DevTools MCP:

### Test 1: Verify Network Request Count

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Upload 5 PDF files at once via mcp__chrome-devtools__upload_file (multiple files)
3. IMMEDIATELY check network requests: mcp__chrome-devtools__list_network_requests
   - Filter by resourceTypes: ["fetch", "xhr"]
4. VERIFY: At most 3 POST requests to /api/documents/upload are "pending" simultaneously
```

### Test 2: Verify Queue Processing

```
1. Upload 5 files
2. Take screenshot showing FileChips: mcp__chrome-devtools__take_screenshot
3. VERIFY:
   - 3 files show "Uploading..." or "Storing..." (spinner)
   - 2 files show "Queued" (clock icon, pending stage)
4. Wait for one upload to complete
5. Take another screenshot: mcp__chrome-devtools__take_screenshot
6. VERIFY: One of the queued files now shows "Uploading..."
```

### Test 3: Remove Queued File Before Upload

```
1. Upload 5 files
2. Take snapshot to identify queued file: mcp__chrome-devtools__take_snapshot
3. Find FileChip showing "Queued" (pending stage)
4. Click X on that queued FileChip: mcp__chrome-devtools__click
5. Wait for all uploads to complete
6. Check network requests: mcp__chrome-devtools__list_network_requests
7. VERIFY: Only 4 POST requests were made (removed file never uploaded)
```

### Expected Results

| Check | Expected |
|-------|----------|
| Initial concurrent uploads | Max 3 at any time |
| Queued files | Shows "Queued" with clock icon |
| After slot opens | Next queued file starts uploading |
| Removed queued file | Never makes HTTP request |
| Total requests (5 files, 1 removed) | 4 POST requests |

---

## Dependencies

### Uses

- `uploadSingleFile()` from Story 19.1.2
- `filesRef` for latest state access

### Provides For

- Sprint 2: Concurrent upload infrastructure for cancel testing

---

## Notes for Agent

1. **Worker pattern** - Each worker pulls from queue until empty. Multiple workers run concurrently.

2. **File state check** - Always check `filesRef.current` before uploading - file may have been removed.

3. **Error isolation** - One worker's error doesn't stop other workers.

4. **Active tracking** - `activeUploadsRef` prevents over-starting even with async timing.

5. **Export for tests** - Export the constant so tests can verify the limit value.
