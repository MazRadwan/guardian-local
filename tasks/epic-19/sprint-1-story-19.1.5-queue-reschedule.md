# Story 19.1.5: Queue Reschedule on New Files

**Sprint:** 1
**Track:** Concurrency Enhancement
**Phase:** 3 (after 19.1.3)
**Agent:** frontend-agent
**Estimated Lines:** ~300
**Dependencies:** 19.1.3 (Concurrent Upload Queue)

---

## Overview

### What This Story Does

Enables adding new files while uploads are in progress. When new pending files are added during an active upload session, the queue detects them and starts new workers to process them (respecting the concurrency limit).

### User-Visible Change

**Before:**
```
User uploads 5 files → Files 1-3 start uploading, 4-5 queue
User adds file 6 while upload in progress
File 6 sits in "pending" forever ❌ (queue workers already exited)
```

**After:**
```
User uploads 5 files → Files 1-3 start uploading, 4-5 queue
User adds file 6 while upload in progress
File 6 joins queue → Starts uploading when slot opens ✓
```

### Why This Matters

Per GPT/Claude parity requirements and user expectations:
- Users expect to add more files to an in-progress upload
- The file picker should remain enabled during uploads
- New files should automatically join the upload queue

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Current Queue Implementation (from 19.1.3)

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

```typescript
const uploadAll = useCallback(
  async (conversationId: string, mode: UploadMode) => {
    // Get pending files (snapshot at call time)
    const pendingFiles = filesRef.current.filter((f) => f.stage === 'pending');
    if (pendingFiles.length === 0) return;

    // Create queue from pending files
    const uploadQueue = [...pendingFiles];

    const processQueue = async (): Promise<void> => {
      while (uploadQueue.length > 0) {
        if (activeUploadsRef.current.size >= UPLOAD_CONCURRENCY_LIMIT) {
          return; // No capacity - worker exits
        }
        const file = uploadQueue.shift();
        // ... upload logic
      }
    };

    // Start workers
    const workerCount = Math.min(UPLOAD_CONCURRENCY_LIMIT, pendingFiles.length);
    const workers = Array(workerCount).fill(null).map(() => processQueue());
    await Promise.all(workers);
  },
  [token, uploadSingleFile]
);
```

**Problem:** Queue is snapshotted at `uploadAll()` call time. New files added later are not in `uploadQueue`.

### Target Behavior

```typescript
// When new pending files appear while uploads active:
// 1. Detect new pending files
// 2. Start new workers to process them (if capacity available)
// 3. Respect concurrency limit
```

---

## Implementation Steps

### Step 1: Add Session and Queue Tracking Refs

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**CRITICAL:** We need to track BOTH active uploads AND queued uploads to prevent double-upload.
The uploadQueue inside uploadAll is a local array, so the useEffect can't see it. We use
`queuedUploadsRef` to track files that are queued but not yet processing.

**Add after activeUploadsRef:**
```typescript
// Epic 19 Story 19.1.5: Track if upload session is active
const isUploadingRef = useRef<boolean>(false);

// Store current upload params for new file workers
const uploadParamsRef = useRef<{ conversationId: string; mode: UploadMode } | null>(null);

// CRITICAL: Track files that are QUEUED (in uploadQueue but not yet in activeUploads)
// This prevents the useEffect from starting the same file that a queue worker is about to start
const queuedUploadsRef = useRef<Set<number>>(new Set());
```

### Step 2: Update uploadAll with Session Guard and Queue Tracking

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**IMPORTANT - Session Ownership:**
- `uploadAll()` is the **session initializer** - only starts a NEW session
- If session already active, `uploadAll()` **bails early** (no-op)
- The reschedule useEffect (Step 3) handles files added DURING an active session
- This prevents re-entrant calls from Composer's auto-upload effect

**Other requirements:**
- Do NOT clear session state in `finally` block (cleared in Step 4)
- Mark files as QUEUED before adding to uploadQueue (prevents double-upload race)
- Move from queued → active when processing starts

**Update uploadAll:**
```typescript
const uploadAll = useCallback(
  async (conversationId: string, mode: UploadMode) => {
    if (!token) {
      onErrorRef.current?.('Not authenticated');
      return;
    }

    // Epic 19 Story 19.1.5: GUARD - Bail if session already active
    // The reschedule useEffect (Step 3) handles new files during active upload.
    // This prevents re-entrant uploadAll calls from Composer's auto-upload effect.
    if (isUploadingRef.current) {
      console.debug('[uploadAll] Session already active, deferring to reschedule effect');
      return;
    }

    // Get pending files (snapshot at call time)
    const pendingFiles = filesRef.current.filter((f) => f.stage === 'pending');
    if (pendingFiles.length === 0) return;

    // Epic 19 Story 19.1.5: Mark upload session as active
    // NOTE: Session is cleared by useEffect when all uploads complete (Step 4)
    isUploadingRef.current = true;
    uploadParamsRef.current = { conversationId, mode };

    // CRITICAL: Mark all pending files as QUEUED before creating the queue
    // This prevents the useEffect from double-starting these files
    pendingFiles.forEach((f) => queuedUploadsRef.current.add(f.localIndex));

    // Create queue from pending files
    const uploadQueue = [...pendingFiles];

    const processQueue = async (): Promise<void> => {
      while (uploadQueue.length > 0) {
        if (activeUploadsRef.current.size >= UPLOAD_CONCURRENCY_LIMIT) {
          return;
        }

        const file = uploadQueue.shift();
        if (!file) return;

        // CRITICAL: Move from queued → active (atomically)
        queuedUploadsRef.current.delete(file.localIndex);

        // Check if file still exists and is still pending
        const currentFile = filesRef.current.find((f) => f.localIndex === file.localIndex);
        if (!currentFile || currentFile.stage !== 'pending') {
          continue; // File was removed or already processed
        }

        activeUploadsRef.current.add(file.localIndex);

        try {
          await uploadSingleFile(currentFile, conversationId, mode);
        } catch (error) {
          console.error(`Upload failed for ${file.filename}:`, error);
        } finally {
          activeUploadsRef.current.delete(file.localIndex);
        }
      }
    };

    // Start workers
    const workerCount = Math.min(UPLOAD_CONCURRENCY_LIMIT, pendingFiles.length);
    const workers = Array(workerCount).fill(null).map(() => processQueue());
    await Promise.all(workers);

    // NOTE: Do NOT clear session state here!
    // The useEffect in Step 3 may have started new workers for newly added files.
    // Session state is cleared by the cleanup useEffect in Step 4.
  },
  [token, uploadSingleFile]
);
```

### Step 3: Add useEffect to Watch for New Pending Files

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**CRITICAL:** Check BOTH `activeUploadsRef` AND `queuedUploadsRef` to prevent double-upload.
Files in queuedUploadsRef are waiting in uploadQueue but not yet processing.

**Add new useEffect:**
```typescript
/**
 * Epic 19 Story 19.1.5: Watch for new pending files during upload
 * When new files are added while upload is active, start workers to process them
 *
 * CRITICAL: Checks both activeUploadsRef (processing) and queuedUploadsRef (waiting in queue)
 * to prevent starting a file that's already queued by uploadAll.
 */
useEffect(() => {
  // Only act if upload session is active
  if (!isUploadingRef.current || !uploadParamsRef.current) {
    return;
  }

  // Check if we have capacity
  // Note: queuedUploads don't count against capacity - they're waiting for a worker
  const availableSlots = UPLOAD_CONCURRENCY_LIMIT - activeUploadsRef.current.size;
  if (availableSlots <= 0) {
    return; // No capacity, existing workers will pick up when slots free
  }

  // Find pending files that aren't already being processed OR queued
  const pendingFiles = files.filter((f) => {
    if (f.stage !== 'pending') return false;
    // CRITICAL: Check BOTH refs to prevent double-upload
    if (activeUploadsRef.current.has(f.localIndex)) return false;
    if (queuedUploadsRef.current.has(f.localIndex)) return false;
    return true;
  });

  if (pendingFiles.length === 0) {
    return; // No new pending files
  }

  // Start new workers for new pending files (up to available slots)
  const { conversationId, mode } = uploadParamsRef.current;
  const filesToStart = pendingFiles.slice(0, availableSlots);

  console.debug(
    '[useMultiFileUpload] Starting workers for new files:',
    filesToStart.map((f) => f.filename)
  );

  // Process each new file (async, don't await)
  filesToStart.forEach(async (file) => {
    // CRITICAL: Mark as active BEFORE any async work to prevent race
    // Note: We don't use queuedUploadsRef here because we're starting immediately
    if (activeUploadsRef.current.has(file.localIndex)) {
      return; // Another effect iteration got here first
    }
    if (activeUploadsRef.current.size >= UPLOAD_CONCURRENCY_LIMIT) {
      return; // No more capacity
    }

    activeUploadsRef.current.add(file.localIndex);

    // Double-check file is still pending
    const currentFile = filesRef.current.find((f) => f.localIndex === file.localIndex);
    if (!currentFile || currentFile.stage !== 'pending') {
      activeUploadsRef.current.delete(file.localIndex);
      return;
    }

    try {
      await uploadSingleFile(currentFile, conversationId, mode);
    } catch (error) {
      console.error(`Upload failed for ${file.filename}:`, error);
    } finally {
      activeUploadsRef.current.delete(file.localIndex);
    }
  });
}, [files, uploadSingleFile]);
```

### Step 4: Add Session Cleanup useEffect

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**CRITICAL:** This effect clears session state when ALL uploads complete (no active, no pending, no queued).
This is the proper place to clear - not in uploadAll's finally block.

```typescript
/**
 * Epic 19 Story 19.1.5: Clear session state when all uploads complete
 * Triggers when: activeUploadsRef.size === 0 AND queuedUploadsRef.size === 0
 *                AND no pending files AND session was active
 */
useEffect(() => {
  // Only check if we think we're in an upload session
  if (!isUploadingRef.current) {
    return;
  }

  // Check if any uploads still in flight
  if (activeUploadsRef.current.size > 0) {
    return; // Still have active uploads
  }

  // Check if any files still queued (waiting in uploadQueue)
  if (queuedUploadsRef.current.size > 0) {
    return; // Still have files in queue
  }

  // Check if any files still pending
  const hasPending = files.some((f) => f.stage === 'pending');
  if (hasPending) {
    return; // Still have files waiting to upload
  }

  // All done - clear session state
  console.debug('[useMultiFileUpload] All uploads complete, clearing session state');
  isUploadingRef.current = false;
  uploadParamsRef.current = null;
  queuedUploadsRef.current.clear(); // Defensive clear
}, [files]); // Triggers on files state change
```

### Step 5: Update clearAll to Reset Upload State

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update clearAll:**
```typescript
const clearAll = useCallback(() => {
  // Abort all controllers
  abortAllControllers();

  // Clear all tracking
  activeUploadsRef.current.clear();
  knownUploadIdsRef.current.clear();
  earlyFileAttachedEventsRef.current.clear();
  canceledUploadIdsRef.current.clear();
  uploadStartTimesRef.current.clear();

  // Epic 19 Story 19.1.5: Reset upload session state
  isUploadingRef.current = false;
  uploadParamsRef.current = null;
  queuedUploadsRef.current.clear(); // Clear queued files

  // ... rest
}, [abortAllControllers]);
```

### Step 6: Update removeFile to Clear from queuedUploadsRef

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**CRITICAL:** When a file is canceled/removed before a worker picks it up from the queue,
we must remove it from `queuedUploadsRef`. Otherwise:
1. The session cleanup effect (Step 4) won't trigger (queuedUploadsRef.size > 0)
2. Session state gets stuck, preventing future uploads

**Update removeFile (add after existing abort/cancel logic):**
```typescript
const removeFile = useCallback((localIndex: number) => {
  const file = filesRef.current.find((f) => f.localIndex === localIndex);
  if (!file) return;

  // ... existing abort controller logic ...

  // ... existing canceledUploadIdsRef logic ...

  // Epic 19 Story 19.1.5: Remove from queued set if present
  // This handles the case where file was added to uploadQueue but worker hasn't
  // started it yet. Without this, session cleanup can get stuck.
  queuedUploadsRef.current.delete(localIndex);

  // ... existing setFiles logic ...
}, [/* deps */]);
```

---

### Step 7: Ensure File Picker Stays Enabled During Upload

**File:** `apps/web/src/components/chat/Composer.tsx`

**IMPORTANT:** The file picker label has TWO gating mechanisms that must BOTH be updated:
1. Visual styling via className (disabled state)
2. Keyboard accessibility via tabIndex

**Current code (lines 352-368):**
```typescript
<label
  htmlFor="composer-file-input"
  className={`... ${
    disabled || !uploadEnabled || isUploading || files.length >= 10
      ? 'text-gray-300 cursor-not-allowed pointer-events-none'
      : 'text-gray-500 hover:bg-gray-100'
  }`}
  aria-label="Attach file"
  role="button"
  tabIndex={disabled || !uploadEnabled || isUploading || files.length >= 10 ? -1 : 0}
  ...
>
```

**Update BOTH conditions to remove `isUploading`:**
```typescript
<label
  htmlFor="composer-file-input"
  className={`... ${
    disabled || !uploadEnabled || files.length >= 10
      ? 'text-gray-300 cursor-not-allowed pointer-events-none'
      : 'text-gray-500 hover:bg-gray-100'
  }`}
  aria-label="Attach file"
  role="button"
  tabIndex={disabled || !uploadEnabled || files.length >= 10 ? -1 : 0}
  ...
>
```

**Both changes required:**
1. Line ~355: Remove `|| isUploading` from className condition
2. Line ~361: Remove `|| isUploading` from tabIndex condition

If only one is updated, keyboard navigation will be broken while visual state appears enabled.

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.1.5: Queue Reschedule on New Files', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should process files added during active upload', async () => {
    const uploadOrder: string[] = [];

    mockFetch.mockImplementation((url, options) => {
      const formData = options.body as FormData;
      const file = formData.get('files') as File;
      uploadOrder.push(file.name);

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: `upload-${file.name}`, status: 'accepted' }],
            }),
          });
        }, 50);
      });
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    // Add initial 2 files
    const initialFiles = [
      new File(['a'], 'file1.pdf', { type: 'application/pdf' }),
      new File(['b'], 'file2.pdf', { type: 'application/pdf' }),
    ];
    act(() => {
      result.current.addFiles(createFileList(initialFiles));
    });

    // Start upload (don't await)
    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.uploadAll('conv-1', 'intake');
    });

    // Wait a bit, then add more files
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const newFile = new File(['c'], 'file3.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([newFile]));
    });

    // Wait for all uploads
    await act(async () => {
      await uploadPromise;
      // Wait a bit more for new file worker
      await new Promise((r) => setTimeout(r, 100));
    });

    // All 3 files should have been uploaded
    expect(uploadOrder).toContain('file1.pdf');
    expect(uploadOrder).toContain('file2.pdf');
    expect(uploadOrder).toContain('file3.pdf');
  });

  it('should respect concurrency limit for new files', async () => {
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
        }, 50);
      });
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    // Add 3 files (at limit)
    const files = Array(3)
      .fill(null)
      .map((_, i) => new File([`${i}`], `file${i}.pdf`, { type: 'application/pdf' }));
    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Start upload
    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.uploadAll('conv-1', 'intake');
    });

    // Immediately add 2 more (should queue, not exceed limit)
    const newFiles = [
      new File(['x'], 'new1.pdf', { type: 'application/pdf' }),
      new File(['y'], 'new2.pdf', { type: 'application/pdf' }),
    ];
    act(() => {
      result.current.addFiles(createFileList(newFiles));
    });

    await act(async () => {
      await uploadPromise;
      await new Promise((r) => setTimeout(r, 150));
    });

    // Should never exceed limit
    expect(maxConcurrent).toBeLessThanOrEqual(UPLOAD_CONCURRENCY_LIMIT);
  });

  it('should not double-upload files already in queue', async () => {
    const uploadCounts = new Map<string, number>();

    mockFetch.mockImplementation((url, options) => {
      const formData = options.body as FormData;
      const file = formData.get('files') as File;
      const count = (uploadCounts.get(file.name) || 0) + 1;
      uploadCounts.set(file.name, count);

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: `upload-${file.name}`, status: 'accepted' }],
            }),
          });
        }, 50);
      });
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    // Add 5 files (more than concurrency limit)
    const files = Array(5)
      .fill(null)
      .map((_, i) => new File([`${i}`], `file${i}.pdf`, { type: 'application/pdf' }));
    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Start upload
    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
      // Wait for all uploads to complete
      await new Promise((r) => setTimeout(r, 200));
    });

    // Each file should have been uploaded exactly ONCE
    expect(Array.from(uploadCounts.values())).toEqual([1, 1, 1, 1, 1]);
    // No duplicates
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('should not start workers if no upload session active', async () => {
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    // Add files without starting upload
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    // File should stay pending (no auto-upload)
    expect(result.current.files[0].stage).toBe('pending');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should clear upload session on clearAll', async () => {
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

    // Add and start upload
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    act(() => {
      result.current.uploadAll('conv-1', 'intake');
    });

    // Clear immediately
    act(() => {
      result.current.clearAll();
    });

    // Add new file after clear
    const newFile = new File(['new'], 'new.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([newFile]));
    });

    // New file should stay pending (upload session ended)
    expect(result.current.files[0].stage).toBe('pending');
  });

  it('should no-op uploadAll when session already active (guard)', async () => {
    let uploadCallCount = 0;

    mockFetch.mockImplementation(() => {
      uploadCallCount++;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{ index: 0, uploadId: `upload-${uploadCallCount}`, status: 'accepted' }],
            }),
          });
        }, 100); // Slow upload to keep session active
      });
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    // Add initial file
    const file1 = new File(['a'], 'file1.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file1]));
    });

    // Start first upload (this initializes the session)
    act(() => {
      result.current.uploadAll('conv-1', 'intake');
    });

    // Wait a bit for upload to start
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Add another file during upload
    const file2 = new File(['b'], 'file2.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file2]));
    });

    // Try to call uploadAll again (should no-op due to guard)
    act(() => {
      result.current.uploadAll('conv-1', 'intake');
    });

    // Wait for all uploads to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });

    // Both files should have been uploaded (file2 via reschedule effect, not second uploadAll)
    // The key assertion: uploadAll guard prevented double-initialization
    // Each file should only have 1 HTTP request
    expect(uploadCallCount).toBe(2); // One per file, not more
  });

  it('should remove queued file from queuedUploadsRef on cancel', async () => {
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

    // Add 5 files (more than concurrency limit, some will queue)
    const files = Array(5)
      .fill(null)
      .map((_, i) => new File([`${i}`], `file${i}.pdf`, { type: 'application/pdf' }));
    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Start upload
    act(() => {
      result.current.uploadAll('conv-1', 'intake');
    });

    // Remove a queued file (one that hasn't started yet)
    // Files 3 and 4 should be queued (concurrency limit is 3)
    act(() => {
      const queuedFile = result.current.files.find(
        (f) => f.filename === 'file4.pdf' && f.stage === 'pending'
      );
      if (queuedFile) {
        result.current.removeFile(queuedFile.localIndex);
      }
    });

    // Wait for remaining uploads
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    // Verify only 4 uploads happened (file4 was canceled before starting)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
```

---

## Acceptance Criteria

- [ ] `isUploadingRef` tracks active upload session
- [ ] `uploadParamsRef` stores conversationId and mode for new workers
- [ ] `queuedUploadsRef` tracks files in uploadQueue (prevents double-upload)
- [ ] **uploadAll bails early if session already active** (guard prevents re-entry)
- [ ] useEffect checks BOTH `activeUploadsRef` AND `queuedUploadsRef`
- [ ] useEffect detects new pending files during upload
- [ ] New workers started for new files (respecting limit)
- [ ] Concurrency limit never exceeded
- [ ] No file started twice (no duplicate HTTP requests)
- [ ] File picker remains enabled during upload
- [ ] `clearAll()` resets all session state including queuedUploadsRef
- [ ] `removeFile()` clears from queuedUploadsRef (prevents stuck session)
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

1. Start dev server: `pnpm dev`
2. Add 3 files → Start uploading
3. While upload in progress, add 2 more files via file picker
4. Verify:
   - New files show "pending" briefly
   - New files start uploading as slots open
   - All 5 files complete successfully
5. Check Network tab: never more than 3 concurrent requests

---

## Manual QA with Chrome DevTools MCP

### Test 1: Add Files During Upload

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Upload 3 large files (10MB each): mcp__chrome-devtools__upload_file
3. Wait for "Uploading..." to show: mcp__chrome-devtools__take_screenshot
4. Add 2 more files via file picker: mcp__chrome-devtools__upload_file
5. Take screenshot: mcp__chrome-devtools__take_screenshot
6. VERIFY: New files show in composer (pending or uploading)
7. Wait for all to complete
8. Take screenshot: mcp__chrome-devtools__take_screenshot
9. VERIFY: All 5 files show "Attached ✓"
```

### Test 2: Verify Concurrency Limit with New Files

```
1. Open Network panel to watch requests
2. Upload 5 files (all at once)
3. Immediately add 3 more files
4. Check network: mcp__chrome-devtools__list_network_requests
5. VERIFY: Never more than 3 concurrent POST requests
```

### Test 3: File Picker Not Disabled

```
1. Start uploading files
2. Take snapshot: mcp__chrome-devtools__take_snapshot
3. VERIFY: File input is NOT disabled
4. Click file picker
5. VERIFY: File picker opens normally
```

### Expected Results

| Scenario | Expected Behavior |
|----------|-------------------|
| Add files during upload | New files join queue, start uploading |
| Concurrency limit | Never exceeded, even with new files |
| File picker | Enabled during upload |
| Clear during upload | New files stay pending |

---

## Dependencies

### Uses

- `uploadSingleFile()` from Story 19.1.2
- `activeUploadsRef` from Story 19.1.3
- `UPLOAD_CONCURRENCY_LIMIT` from Story 19.1.3

### Provides For

- Complete GPT/Claude parity for "add during upload" behavior

---

## Notes for Agent

1. **CRITICAL: queuedUploadsRef prevents double-upload** - Files added to uploadQueue in `uploadAll` are tracked in `queuedUploadsRef`. The useEffect checks BOTH `activeUploadsRef` AND `queuedUploadsRef` to prevent starting a file that's already queued by a queue worker.

2. **Two tracking refs:**
   - `queuedUploadsRef` - Files in uploadQueue, waiting for a worker to pick them up
   - `activeUploadsRef` - Files currently being uploaded (HTTP in flight)

3. **Lifecycle: queued → active → done (or canceled)**
   - When file added to uploadQueue: add to queuedUploadsRef
   - When worker starts processing: delete from queuedUploadsRef, add to activeUploadsRef
   - When upload completes: delete from activeUploadsRef
   - **When file canceled/removed:** delete from queuedUploadsRef (if present) - prevents stuck session

4. **useEffect dependency** - The effect depends on `files` array. It triggers when files change.

5. **Two-phase auto-start behavior:**
   - **Before session starts:** Files added stay `pending` until Composer's auto-upload effect calls `uploadAll()`. The reschedule useEffect does nothing (session not active).
   - **After session starts:** New files added auto-start immediately via reschedule useEffect. `uploadAll()` bails early (guard prevents re-entry).
   - This matches GPT/Claude behavior where files start uploading immediately after first file triggers auto-upload.

6. **Race condition prevention** - Use double-checks: verify file still pending, verify under limit, check both refs, before starting.

7. **Async workers** - New workers are started without await. They run independently.

8. **Session tracking** - `isUploadingRef` distinguishes "user added files but hasn't clicked send" from "send in progress, new files should auto-queue."
