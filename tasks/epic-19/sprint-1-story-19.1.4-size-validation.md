# Story 19.1.4: Client-Side Size Validation

**Sprint:** 1
**Track:** Validation
**Phase:** 1 (parallel with 19.1.1)
**Agent:** frontend-agent
**Estimated Lines:** ~200
**Dependencies:** None (can run parallel with 19.1.1)

---

## Overview

### What This Story Does

Adds client-side total size validation to `addFiles()`. Since per-file uploads bypass the server's batch size middleware, the client must enforce the 50MB total limit.

### User-Visible Change

**User has 40MB of files attached, tries to add 15MB more:**
```
Toast: "Total size exceeds 50MB limit"
New files NOT added
Existing files remain
```

### Why This Matters

Per behavior-matrix.md Section 5 (Concurrency Limits):
> Max total size: 50MB - Must enforce client-side
>
> Since per-file uploads bypass the server's batch size validation middleware, the client must enforce the 50MB total limit

**Current:** Server validates total size per batch
**Per-file:** Each request is one file → server can't validate total

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Helper Function (from 19.0.1)

**File:** `apps/web/src/lib/uploadStageHelpers.ts`

```typescript
/**
 * Check if adding files would exceed total size limit
 * @param currentFiles - Files already in queue
 * @param newFiles - Files to add
 * @param maxTotalBytes - Maximum total size (default 50MB)
 */
export function wouldExceedTotalSize(
  currentFiles: { size: number }[],
  newFiles: { size: number }[],
  maxTotalBytes: number = 50 * 1024 * 1024
): boolean {
  const currentSize = currentFiles.reduce((sum, f) => sum + f.size, 0);
  const newSize = newFiles.reduce((sum, f) => sum + f.size, 0);
  return (currentSize + newSize) > maxTotalBytes;
}
```

### Current addFiles() Implementation

**File:** `apps/web/src/hooks/useMultiFileUpload.ts` (lines 234-280)

```typescript
const addFiles = useCallback(
  (fileList: FileList) => {
    const newFiles: FileState[] = [];
    const currentCount = files.length;

    for (let i = 0; i < fileList.length; i++) {
      // Check max files limit
      if (currentCount + newFiles.length >= maxFiles) {
        onErrorRef.current?.(`Maximum ${maxFiles} files allowed`);
        break;
      }

      const file = fileList[i];

      // Validate file type
      if (!VALID_TYPES.includes(file.type)) {
        onErrorRef.current?.(`${file.name}: Unsupported file type`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        onErrorRef.current?.(`${file.name}: File too large (max 20MB)`);
        continue;
      }

      // ... create FileState and add to newFiles
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  },
  [files.length, maxFiles]
);
```

---

## Implementation Steps

### Step 1: Import Helper Function

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update imports (around line 20):**
```typescript
import { isRemovable, requiresAbort, wouldExceedTotalSize } from '@/lib/uploadStageHelpers';
```

### Step 2: Add Total Size Constant

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add near other constants (around line 46):**
```typescript
/**
 * Epic 19: Maximum total size for all files combined
 * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
 */
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
```

### Step 3: Add Total Size Validation to addFiles

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update addFiles() to check total size FIRST:**
```typescript
const addFiles = useCallback(
  (fileList: FileList) => {
    // Convert FileList to array for easier handling
    const filesToAdd = Array.from(fileList);

    // Epic 19: Check total size limit FIRST (before any individual validation)
    // This prevents partially adding files when total would exceed limit
    const newFileSizes = filesToAdd.map((f) => ({ size: f.size }));
    if (wouldExceedTotalSize(files, newFileSizes, MAX_TOTAL_SIZE)) {
      onErrorRef.current?.('Total size exceeds 50MB limit');
      return; // Reject ALL new files
    }

    const newFiles: FileState[] = [];
    const currentCount = files.length;

    for (let i = 0; i < filesToAdd.length; i++) {
      // Check max files limit
      if (currentCount + newFiles.length >= maxFiles) {
        onErrorRef.current?.(`Maximum ${maxFiles} files allowed`);
        break;
      }

      const file = filesToAdd[i];

      // Validate file type
      if (!VALID_TYPES.includes(file.type)) {
        onErrorRef.current?.(`${file.name}: Unsupported file type`);
        continue;
      }

      // Validate individual file size (20MB per file)
      if (file.size > MAX_FILE_SIZE) {
        onErrorRef.current?.(`${file.name}: File too large (max 20MB)`);
        continue;
      }

      const localIndex = nextIndexRef.current++;

      newFiles.push({
        localIndex,
        file,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        uploadId: null,
        fileId: null,
        stage: 'pending',
        progress: 0,
      });
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  },
  [files, maxFiles]
);
```

### Step 4: Export Constant for Tests

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update exports at bottom:**
```typescript
export { UPLOAD_CONCURRENCY_LIMIT, MAX_TOTAL_SIZE };
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
import { MAX_TOTAL_SIZE } from '../useMultiFileUpload';

describe('Story 19.1.4: Client-Side Size Validation', () => {
  const MB = 1024 * 1024;

  it('should have MAX_TOTAL_SIZE of 50MB', () => {
    expect(MAX_TOTAL_SIZE).toBe(50 * MB);
  });

  it('should allow files within 50MB total', () => {
    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter, onError })
    );

    // Add 40MB total using multiple files (respecting 20MB per-file limit)
    // 4 x 10MB = 40MB total, each file under 20MB limit
    const files = [
      new File([new ArrayBuffer(10 * MB)], 'file1.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'file2.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'file3.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'file4.pdf', { type: 'application/pdf' }),
    ];

    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Should succeed - all 4 files added (40MB < 50MB total limit)
    expect(result.current.files).toHaveLength(4);
    expect(onError).not.toHaveBeenCalledWith('Total size exceeds 50MB limit');
  });

  it('should reject files that would exceed 50MB total', () => {
    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter, onError })
    );

    // First add 15MB file
    const content1 = new ArrayBuffer(15 * MB);
    const file1 = new File([content1], 'file1.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles(createFileList([file1]));
    });

    expect(result.current.files).toHaveLength(1);

    // Then try to add 40MB more (total would be 55MB)
    const content2 = new ArrayBuffer(18 * MB);
    const file2 = new File([content2], 'file2.pdf', { type: 'application/pdf' });
    const content3 = new ArrayBuffer(18 * MB);
    const file3 = new File([content3], 'file3.pdf', { type: 'application/pdf' });
    const content4 = new ArrayBuffer(18 * MB);
    const file4 = new File([content4], 'file4.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles(createFileList([file2, file3, file4]));
    });

    // Should reject ALL new files
    expect(result.current.files).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith('Total size exceeds 50MB limit');
  });

  it('should reject entire batch if total would exceed limit', () => {
    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter, onError })
    );

    // Add existing 45MB
    // Note: Due to per-file 20MB limit, we need multiple files
    const files45MB = [
      new File([new ArrayBuffer(15 * MB)], 'a.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(15 * MB)], 'b.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(15 * MB)], 'c.pdf', { type: 'application/pdf' }),
    ];

    act(() => {
      result.current.addFiles(createFileList(files45MB));
    });

    expect(result.current.files).toHaveLength(3);
    onError.mockClear();

    // Try to add 10MB more (total would be 55MB)
    const newFile = new File([new ArrayBuffer(10 * MB)], 'new.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles(createFileList([newFile]));
    });

    // Should reject
    expect(result.current.files).toHaveLength(3); // Still 3
    expect(onError).toHaveBeenCalledWith('Total size exceeds 50MB limit');
  });

  it('should allow exactly 50MB total', () => {
    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter, onError })
    );

    // Add files totaling exactly 50MB
    // (Using 10MB each due to per-file 20MB limit)
    const files = [
      new File([new ArrayBuffer(10 * MB)], 'a.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'b.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'c.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'd.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(10 * MB)], 'e.pdf', { type: 'application/pdf' }),
    ];

    act(() => {
      result.current.addFiles(createFileList(files));
    });

    // Should accept all (exactly at limit)
    expect(result.current.files).toHaveLength(5);
    expect(onError).not.toHaveBeenCalledWith('Total size exceeds 50MB limit');
  });

  it('should check total size before individual file validation', () => {
    const onError = jest.fn();
    const adapter = createMockAdapter(true);
    const { result } = renderHook(() =>
      useMultiFileUpload({ wsAdapter: adapter, onError })
    );

    // Add 45MB existing
    const existing = [
      new File([new ArrayBuffer(15 * MB)], 'a.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(15 * MB)], 'b.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(15 * MB)], 'c.pdf', { type: 'application/pdf' }),
    ];
    act(() => {
      result.current.addFiles(createFileList(existing));
    });
    onError.mockClear();

    // Try to add batch with mixed valid/invalid
    // Total would exceed even with valid files filtered
    const mixed = [
      new File([new ArrayBuffer(5 * MB)], 'valid.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(5 * MB)], 'invalid.txt', { type: 'text/plain' }),
    ];

    act(() => {
      result.current.addFiles(createFileList(mixed));
    });

    // Total size check happens first (45 + 10 > 50)
    expect(onError).toHaveBeenCalledWith('Total size exceeds 50MB limit');
    expect(result.current.files).toHaveLength(3); // No new files added
  });
});
```

---

## Acceptance Criteria

- [ ] `wouldExceedTotalSize` imported from uploadStageHelpers
- [ ] `MAX_TOTAL_SIZE` constant defined (50MB)
- [ ] Total size checked FIRST in addFiles()
- [ ] Error toast shown when total would exceed 50MB
- [ ] ALL new files rejected (not partial)
- [ ] Existing files remain unchanged
- [ ] Exactly 50MB total is allowed
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

1. Upload 3 x 15MB files (total 45MB)
2. Try to upload 10MB more
3. Verify toast: "Total size exceeds 50MB limit"
4. Verify no new files added
5. Verify existing 3 files remain

---

## Manual QA with Chrome DevTools MCP

After implementation, verify size validation using Chrome DevTools MCP:

### Test 1: Upload Files Approaching Limit

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Prepare 3 PDF files of ~15MB each
3. Upload them via mcp__chrome-devtools__upload_file
4. Take screenshot showing 3 FileChips: mcp__chrome-devtools__take_screenshot
5. VERIFY: All 3 files added successfully (total ~45MB < 50MB limit)
```

### Test 2: Verify Toast on Size Exceed

```
1. With 3 x 15MB files already attached
2. Try to upload another 10MB+ file via mcp__chrome-devtools__upload_file
3. Take screenshot immediately: mcp__chrome-devtools__take_screenshot
4. VERIFY:
   - Toast appears: "Total size exceeds 50MB limit"
   - No new FileChip appears
   - Existing 3 files remain
```

### Test 3: Verify Toast Disappears

```
1. After triggering size limit toast
2. Wait 5 seconds
3. Take screenshot: mcp__chrome-devtools__take_screenshot
4. VERIFY: Toast is no longer visible
```

### Test 4: Verify File Count Unchanged

```
1. After failed add attempt
2. Take snapshot: mcp__chrome-devtools__take_snapshot
3. Count FileChip elements
4. VERIFY: Still exactly 3 FileChips (no new files added)
```

### Expected Results

| Scenario | Expected Behavior |
|----------|-------------------|
| 45MB existing + 5MB new | Allowed (total 50MB) |
| 45MB existing + 10MB new | Rejected with toast |
| Toast content | "Total size exceeds 50MB limit" |
| Toast duration | ~5 seconds |
| Existing files after reject | Unchanged |

---

## Dependencies

### Uses

- `wouldExceedTotalSize()` from Story 19.0.1 (uploadStageHelpers.ts)

### Provides For

- Complete size validation for per-file upload pattern

---

## Notes for Agent

1. **Check total FIRST** - The total size check must happen before any individual file processing. This prevents partially adding files.

2. **Per-file limit still applies** - The 20MB per-file limit (MAX_FILE_SIZE) remains. Files can fail both checks.

3. **Error message** - Use exactly "Total size exceeds 50MB limit" for consistency with behavior-matrix.md.

4. **No partial addition** - If batch would exceed, reject ALL new files. Don't add "as many as fit."

5. **Test with ArrayBuffer** - Use `new ArrayBuffer(size)` to create files of exact sizes for testing.
