# Story 19.1.2: Single File Upload Function

**Sprint:** 1
**Track:** Core Refactor
**Phase:** 2 (after 19.1.1)
**Agent:** frontend-agent
**Estimated Lines:** ~350
**Dependencies:** 19.1.1 (AbortController Map)

---

## Overview

### What This Story Does

Extracts a `uploadSingleFile()` function from the existing `uploadAll()` batch logic. This function uploads ONE file and handles its lifecycle independently.

### User-Visible Change

None directly - same behavior as before. But now each file uses its own HTTP request.

### Why This Matters

**Current uploadAll():**
```typescript
// One request for ALL pending files
const formData = new FormData();
pendingFiles.forEach(f => formData.append('files', f.file));
const response = await fetch(...);
// One response with files[].index mapping
```

**New uploadSingleFile():**
```typescript
// One request per file
const formData = new FormData();
formData.append('files', file.file);
const response = await fetch(...);
// Response is for THIS file only
```

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Current uploadAll() Implementation

**File:** `apps/web/src/hooks/useMultiFileUpload.ts` (lines 396-524)

```typescript
const uploadAll = useCallback(
  async (conversationId: string, mode: UploadMode) => {
    if (!token) {
      onErrorRef.current?.('Not authenticated');
      return;
    }

    const pendingFiles = files.filter((f) => f.stage === 'pending');
    if (pendingFiles.length === 0) return;

    // Create AbortController for this batch
    abortControllerRef.current = new AbortController();

    // Mark as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.stage === 'pending'
          ? { ...f, stage: 'uploading' as const, progress: 10 }
          : f
      )
    );

    try {
      // Build FormData
      const formData = new FormData();
      formData.append('conversationId', conversationId);
      formData.append('mode', mode);

      // Add files in order (server returns uploadIds in same order)
      const pendingIndices = pendingFiles.map((f) => f.localIndex);
      pendingFiles.forEach((fileState) => {
        formData.append('files', fileState.file);
      });

      // POST upload
      const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      // Parse response to get uploadIds
      const result = await response.json();

      // Map uploadIds to our files by index
      setFiles((prev) => {
        const updated = [...prev];
        result.files.forEach((serverFile: any) => {
          const localIndex = pendingIndices[serverFile.index];
          const fileIndex = updated.findIndex((f) => f.localIndex === localIndex);
          if (fileIndex !== -1) {
            if (serverFile.status === 'accepted') {
              updated[fileIndex] = {
                ...updated[fileIndex],
                uploadId: serverFile.uploadId,
                stage: 'storing',
                progress: 30,
              };
              knownUploadIdsRef.current.add(serverFile.uploadId);
              processEarlyEvents(serverFile.uploadId);
            } else {
              updated[fileIndex] = {
                ...updated[fileIndex],
                stage: 'error',
                progress: 0,
                error: serverFile.error || 'Rejected by server',
              };
            }
          }
        });
        return updated;
      });
    } catch (error) {
      // Handle abort gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        setFiles((prev) =>
          prev.map((f) =>
            f.stage === 'uploading'
              ? { ...f, stage: 'pending' as const, progress: 0, uploadId: null }
              : f
          )
        );
        return;
      }

      // Mark all uploading as error
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setFiles((prev) =>
        prev.map((f) =>
          f.stage === 'uploading'
            ? { ...f, stage: 'error' as const, progress: 0, error: errorMsg }
            : f
        )
      );
      onErrorRef.current?.(errorMsg);
    } finally {
      abortControllerRef.current = null;
    }
  },
  [files, token, processEarlyEvents]
);
```

---

## Implementation Steps

### Step 1: Create uploadSingleFile Function

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add after the helper functions (around line 395):**

```typescript
/**
 * Epic 19: Upload a single file
 *
 * Uploads one file via HTTP POST, handling its complete lifecycle:
 * - Creates AbortController for this file
 * - Sets stage to 'uploading'
 * - Makes HTTP request
 * - Updates stage based on response
 * - Cleans up AbortController
 *
 * @param file - FileState to upload
 * @param conversationId - Target conversation
 * @param mode - Upload mode (intake or scoring)
 *
 * Reference: behavior-matrix.md Section 3 (Stage Transitions)
 */
const uploadSingleFile = useCallback(
  async (file: FileState, conversationId: string, mode: UploadMode): Promise<void> => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    const { localIndex } = file;

    // Create AbortController for this file
    const controller = createAbortController(localIndex);

    // Mark this file as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.localIndex === localIndex
          ? { ...f, stage: 'uploading' as const, progress: 10 }
          : f
      )
    );

    try {
      // Build FormData for single file
      const formData = new FormData();
      formData.append('conversationId', conversationId);
      formData.append('mode', mode);
      formData.append('files', file.file); // Single file

      // POST upload
      const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      // Parse response
      const result = await response.json();

      // Response should have exactly one file (index 0)
      const serverFile = result.files?.[0];

      if (!serverFile) {
        throw new Error('Invalid server response');
      }

      // Update file state based on response
      setFiles((prev) =>
        prev.map((f) => {
          if (f.localIndex !== localIndex) return f;

          if (serverFile.status === 'accepted') {
            // Register uploadId for WebSocket event tracking
            knownUploadIdsRef.current.add(serverFile.uploadId);

            // Process any buffered file_attached events
            processEarlyEvents(serverFile.uploadId);

            return {
              ...f,
              uploadId: serverFile.uploadId,
              stage: 'storing' as const,
              progress: 30,
            };
          } else {
            return {
              ...f,
              stage: 'error' as const,
              progress: 0,
              error: serverFile.error || 'Rejected by server',
            };
          }
        })
      );
    } catch (error) {
      // Handle abort gracefully - file was canceled by user
      if (error instanceof Error && error.name === 'AbortError') {
        // File already removed by removeFile() - nothing to do
        // The setFiles filter in removeFile already removed this file
        return;
      }

      // Mark this file as error
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setFiles((prev) =>
        prev.map((f) =>
          f.localIndex === localIndex
            ? { ...f, stage: 'error' as const, progress: 0, error: errorMsg }
            : f
        )
      );

      // Report error via callback
      onErrorRef.current?.(errorMsg);
    } finally {
      // Clean up AbortController
      abortControllerMapRef.current.delete(localIndex);
    }
  },
  [token, createAbortController, processEarlyEvents]
);
```

### Step 2: Refactor uploadAll to Use uploadSingleFile

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Replace uploadAll() with:**

```typescript
/**
 * Upload all pending files
 *
 * Epic 19: Now uploads files sequentially using uploadSingleFile().
 * Story 19.1.3 will add concurrent queue with limit.
 *
 * @param conversationId - Target conversation
 * @param mode - Upload mode
 */
const uploadAll = useCallback(
  async (conversationId: string, mode: UploadMode) => {
    if (!token) {
      onErrorRef.current?.('Not authenticated');
      return;
    }

    // Get current pending files (read from ref for latest state)
    const pendingFiles = filesRef.current.filter((f) => f.stage === 'pending');
    if (pendingFiles.length === 0) return;

    // Epic 19: Upload each file individually
    // Note: Story 19.1.3 will add concurrency limit
    for (const file of pendingFiles) {
      // Check if file still exists (may have been removed during loop)
      const currentFile = filesRef.current.find((f) => f.localIndex === file.localIndex);
      if (!currentFile || currentFile.stage !== 'pending') {
        continue; // File was removed or already started
      }

      try {
        await uploadSingleFile(currentFile, conversationId, mode);
      } catch (error) {
        // Individual file errors are handled in uploadSingleFile
        // Continue with remaining files
        console.error(`Upload failed for ${file.filename}:`, error);
      }
    }
  },
  [token, uploadSingleFile]
);
```

### Step 3: Remove Legacy Batch AbortController

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Remove the single abortControllerRef (line 228):**
```typescript
// REMOVE THIS LINE:
// const abortControllerRef = useRef<AbortController | null>(null);
```

**Update clearAll() to remove legacy reference:**
```typescript
const clearAll = useCallback(() => {
  // Epic 19: Abort all per-file controllers
  abortAllControllers();

  // REMOVE these lines:
  // abortControllerRef.current?.abort();
  // abortControllerRef.current = null;

  // ... rest of function
}, [abortAllControllers]);
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.1.2: Single File Upload', () => {
  // Mock fetch for upload tests
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should upload files individually', async () => {
    // Setup mock responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
      }),
    });

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

    // Upload
    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Should have made 2 separate requests
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Each request should have only one file in FormData
    const firstCall = mockFetch.mock.calls[0];
    const formData = firstCall[1].body as FormData;
    const filesInRequest = formData.getAll('files');
    expect(filesInRequest).toHaveLength(1);
  });

  it('should handle individual file errors without affecting others', async () => {
    // First file succeeds, second fails
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'File too large' }),
      });

    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter, onError })
    );

    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    act(() => {
      result.current.addFiles(createFileList(files));
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // First file should be in 'storing' state
    const file1 = result.current.files.find((f) => f.filename === 'a.pdf');
    expect(file1?.stage).toBe('storing');

    // Second file should be in 'error' state
    const file2 = result.current.files.find((f) => f.filename === 'b.pdf');
    expect(file2?.stage).toBe('error');

    // Error callback should have been called for second file
    expect(onError).toHaveBeenCalledWith('File too large');
  });

  it('should skip files removed during upload loop', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
      }),
    });

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Remove second file before upload completes
    const secondIndex = result.current.files[1].localIndex;
    act(() => {
      result.current.removeFile(secondIndex);
    });

    await act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Only one request should have been made
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle abort gracefully', async () => {
    // Mock fetch that will be aborted
    mockFetch.mockImplementation(() =>
      new Promise((_, reject) => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 100);
      })
    );

    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter })
    );

    const file = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.addFiles(createFileList([file]));
    });

    // Start upload (will be slow)
    const uploadPromise = act(async () => {
      await result.current.uploadAll('conv-1', 'intake');
    });

    // Remove file (triggers abort)
    act(() => {
      result.current.removeFile(result.current.files[0].localIndex);
    });

    await uploadPromise;

    // File should be removed (not in error state)
    expect(result.current.files).toHaveLength(0);
  });
});
```

---

## Acceptance Criteria

- [ ] `uploadSingleFile()` function created
- [ ] `uploadAll()` refactored to call `uploadSingleFile()` for each file
- [ ] Legacy `abortControllerRef` removed
- [ ] Each file uploads via separate HTTP request
- [ ] Individual file errors don't affect other files
- [ ] Abort during upload removes file cleanly
- [ ] Files removed during upload loop are skipped
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

1. Upload 3 files
2. Open Network tab in DevTools
3. Verify 3 separate POST requests (not one batched)
4. Each request should have one file in FormData

---

## Dependencies

### Uses

- `createAbortController()` from Story 19.1.1
- `abortControllerMapRef` from Story 19.1.1

### Provides For

- Story 19.1.3: Foundation for concurrent queue

---

## Notes for Agent

1. **Sequential for now** - This story uploads files sequentially in a for loop. Story 19.1.3 adds concurrent queue.

2. **Keep endpoint the same** - The backend `/api/documents/upload` endpoint already works for single files.

3. **Index mapping gone** - Since each request has one file, server response `files[0]` is always this file.

4. **filesRef for latest state** - Use `filesRef.current` in the loop to get latest state (avoid stale closure).

5. **Error isolation** - One file's error should not prevent other files from uploading.
