# Story 19.2.3: Send + Cancel Race Handling

**Sprint:** 2
**Track:** Edge Cases
**Phase:** 1 (parallel with 19.2.1, 19.2.4)
**Agent:** frontend-agent
**Estimated Lines:** ~200
**Dependencies:** None (can run parallel with 19.2.1)

---

## Overview

### What This Story Does

Handles the race condition where a user clicks Send, then quickly clicks X to cancel a file. Ensures the canceled file is excluded from the send payload and not processed for parsing/scoring.

### User-Visible Change

**Before:**
```
T0: User clicks Send (all files start processing)
T1: User clicks X on file2.pdf
T2: file2.pdf still gets parsed/scored (bug)
T3: file2.pdf appears in message attachments (bug)
```

**After:**
```
T0: User clicks Send (all files start processing)
T1: User clicks X on file2.pdf
T2: file2.pdf excluded from attachments
T3: Message sent with only file1.pdf, file3.pdf
```

### Why This Matters

Per behavior-matrix.md Section 12 (Edge Cases):
> Send + cancel race: If user clicks Send then X quickly, ensure canceled file is not parsed/scored and not included in chat attachments.

---

## Codebase Context

### Files to Modify

1. `apps/web/src/components/chat/Composer.tsx`
2. `apps/web/src/hooks/useMultiFileUpload.ts` (expose canceled check)

### Current Composer Send Flow

**File:** `apps/web/src/components/chat/Composer.tsx`

**Current handleSend (simplified):**
```typescript
const handleSend = async () => {
  if (!canSend) return;

  setIsSending(true);

  try {
    // Start uploads if needed
    if (files.hasPendingFiles) {
      await files.uploadAll(conversationId, mode);
    }

    // Wait for all files to complete
    const attachments = await files.waitForCompletion();

    // Send message with attachments
    sendMessage({
      content: message,
      attachments,
    });

    // Clear composer
    setMessage('');
    files.clearAll();
  } finally {
    setIsSending(false);
  }
};
```

### Current waitForCompletion

**File:** `apps/web/src/hooks/useMultiFileUpload.ts` (lines 741-785)

The current implementation builds attachments from `filesRef.current` at resolution time. Files that were removed (canceled) are already excluded because they don't exist in the files array.

**However**, the issue is that:
1. User cancels file AFTER clicking send
2. File is still in `filesRef.current` when `waitForCompletion` starts
3. File might complete and be included in attachments before cancel takes effect

---

## Implementation Steps

### Step 1: Add isCanceled Helper to Hook Return

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Add to return interface (UseMultiFileUploadReturn):**
```typescript
export interface UseMultiFileUploadReturn {
  // ... existing
  /** Check if an uploadId was canceled - Epic 19 */
  isCanceled: (uploadId: string) => boolean;
}
```

**Add to return statement:**
```typescript
return {
  // ... existing
  isCanceled,
};
```

### Step 2: Update buildAttachmentsFromRef to Exclude Canceled and Carry uploadId

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update MessageAttachment interface to include uploadId:**
```typescript
// Add uploadId to attachment for downstream cancel checking
export interface MessageAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadId?: string; // Epic 19: Carry uploadId for cancel filtering
}
```

**Update buildAttachmentsFromRef helper:**
```typescript
/**
 * Helper: Build MessageAttachment[] from current files state
 * Reads from filesRef to get latest state (avoids stale closure)
 * Epic 19: Excludes files whose uploadId is in canceled set
 * Epic 19: Carries uploadId in attachment for downstream cancel checking
 */
const buildAttachmentsFromRef = useCallback((): MessageAttachment[] => {
  return filesRef.current
    .filter((f) => {
      // Must be complete with fileId
      if (f.stage !== 'complete' || !f.fileId) return false;

      // Epic 19 Story 19.2.3: Exclude canceled files
      // This handles race where file completes after cancel was requested
      if (f.uploadId && canceledUploadIdsRef.current.has(f.uploadId)) {
        console.debug(
          '[useMultiFileUpload] Excluding canceled file from attachments:',
          f.uploadId
        );
        return false;
      }

      return true;
    })
    .map((f) => ({
      fileId: f.fileId!,
      filename: f.filename,
      mimeType: f.mimeType,
      size: f.size,
      uploadId: f.uploadId ?? undefined, // Epic 19: Carry uploadId
    }));
}, []);
```

### Step 3: Update getCompletedFileIds to Exclude Canceled

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update getCompletedFileIds:**
```typescript
const getCompletedFileIds = useCallback(() => {
  return files
    .filter((f) => {
      // Must be complete with fileId
      if (f.stage !== 'complete' || !f.fileId) return false;

      // Epic 19 Story 19.2.3: Exclude canceled files
      if (f.uploadId && canceledUploadIdsRef.current.has(f.uploadId)) {
        return false;
      }

      return true;
    })
    .map((f) => f.fileId!);
}, [files]);
```

### Step 4: Add Double-Check Before Send in Composer

**File:** `apps/web/src/components/chat/Composer.tsx`

**Update handleSend to double-check canceled files:**
```typescript
const handleSend = async () => {
  if (!canSend) return;

  setIsSending(true);

  try {
    // Start uploads if needed
    if (files.hasPendingFiles) {
      await files.uploadAll(conversationId, mode);
    }

    // Wait for all files to complete
    // Note: buildAttachmentsFromRef already excludes canceled files
    const attachments = await files.waitForCompletion();

    // Epic 19 Story 19.2.3: Final check - filter any late-completed canceled files
    // Uses uploadId directly from attachment (no file state lookup needed)
    // This handles race where file was removed from state but completed late
    const validAttachments = attachments.filter((att) => {
      // Use uploadId directly from attachment (added in Step 2)
      if (att.uploadId && files.isCanceled(att.uploadId)) {
        console.debug(
          '[Composer] Filtering canceled attachment from send:',
          att.uploadId
        );
        return false;
      }
      return true;
    });

    // Only send if we have message text or valid attachments
    if (!message.trim() && validAttachments.length === 0) {
      // Nothing to send - user canceled all files
      return;
    }

    // Epic 19: Strip uploadId before sending - it's client-only for cancel tracking
    // Backend does not expect uploadId in MessageAttachment and should not receive it
    const attachmentsForSend = validAttachments.map(({ uploadId, ...rest }) => rest);

    // Send message with valid attachments (uploadId stripped)
    sendMessage({
      content: message,
      attachments: attachmentsForSend,
    });

    // Clear composer
    setMessage('');
    files.clearAll();
  } finally {
    setIsSending(false);
  }
};
```

### Step 5: Handle Cancel During waitForCompletion

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

The current `removeFile` removes the file from state, which means `waitForCompletion` won't include it. However, we should also ensure the resolver is aware of cancellation.

**Update the useEffect that checks for completion:**
```typescript
// Check and resolve pending waiters when files state changes
useEffect(() => {
  // Epic 19: Filter out canceled files when checking in-flight status
  const inFlightFiles = files.filter((f) =>
    ['uploading', 'storing', 'attached', 'parsing'].includes(f.stage)
  ).filter((f) => {
    // Don't count canceled files as in-flight
    if (f.uploadId && canceledUploadIdsRef.current.has(f.uploadId)) {
      return false;
    }
    return true;
  });

  const hasInFlight = inFlightFiles.length > 0;

  // Resolve waiters when nothing in-flight
  if (!hasInFlight && waitForCompletionResolversRef.current.length > 0) {
    const attachments = buildAttachmentsFromRef();
    const resolvers = [...waitForCompletionResolversRef.current];
    waitForCompletionResolversRef.current = [];
    resolvers.forEach((resolve) => resolve(attachments));
  }
}, [files, buildAttachmentsFromRef]);
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.2.3: Send + Cancel Race Handling', () => {
  describe('buildAttachmentsFromRef', () => {
    it('should exclude canceled files from attachments', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add two files
      const files = [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      ];
      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Upload both
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [
            { index: 0, uploadId: 'upload-a', status: 'accepted' },
            { index: 1, uploadId: 'upload-b', status: 'accepted' },
          ],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Simulate file_attached for both
      // ... (would need to trigger via adapter)

      // Cancel file b
      const fileBIndex = result.current.files.find(f => f.filename === 'b.pdf')?.localIndex;
      act(() => {
        result.current.removeFile(fileBIndex!);
      });

      // Get attachments - should only have file a
      const attachments = await result.current.waitForCompletion();

      // File b should not be in attachments even if it completed
      expect(attachments.every((a) => a.filename !== 'b.pdf')).toBe(true);
    });
  });

  describe('getCompletedFileIds', () => {
    it('should exclude canceled files', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Setup similar to above...
      // After canceling file b:

      const fileIds = result.current.getCompletedFileIds();

      // Should not include canceled file's fileId
      // (test depends on file completion simulation)
    });
  });

  describe('isCanceled helper', () => {
    it('should return true for canceled uploadId', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and upload file
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-test', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Cancel the file
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // Check isCanceled
      expect(result.current.isCanceled('upload-test')).toBe(true);
    });

    it('should return false for non-canceled uploadId', () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      expect(result.current.isCanceled('upload-unknown')).toBe(false);
    });
  });

  describe('waitForCompletion with cancel', () => {
    it('should resolve immediately if all remaining files canceled', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and upload file
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

      // Start waitForCompletion
      let attachments: MessageAttachment[] | null = null;
      const waitPromise = result.current.waitForCompletion().then((a) => {
        attachments = a;
      });

      // Cancel the only file
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // Wait should resolve with empty attachments
      await waitPromise;
      expect(attachments).toEqual([]);
    });
  });
});
```

**File:** `apps/web/src/components/chat/__tests__/Composer.test.tsx`

```typescript
describe('Story 19.2.3: Composer Send Race', () => {
  it('should not send canceled files', async () => {
    // Setup Composer with mock files hook
    // Simulate: click send, cancel file during wait
    // Verify: sendMessage called without canceled file
  });

  it('should abort send if all files canceled', async () => {
    // Setup with files only (no text)
    // Cancel all files during send
    // Verify: sendMessage not called
  });
});
```

---

## Acceptance Criteria

- [ ] `isCanceled()` helper exported from hook
- [ ] `buildAttachmentsFromRef()` excludes canceled files
- [ ] `getCompletedFileIds()` excludes canceled files
- [ ] `waitForCompletion()` resolves when all non-canceled files done
- [ ] Composer filters canceled files before sending
- [ ] Send aborts gracefully if all files canceled
- [ ] All tests passing

---

## Verification

```bash
# Run tests
pnpm --filter @guardian/web test:unit -- useMultiFileUpload Composer

# TypeScript check
pnpm --filter @guardian/web tsc --noEmit
```

**Manual Testing:**

1. Attach multiple files
2. Click Send
3. Immediately click X on one file while upload in progress
4. Verify message sent with only non-canceled files
5. Check chat stream - canceled file should not appear in attachments

---

## Manual QA with Chrome DevTools MCP

After implementation, verify send + cancel race using Chrome DevTools MCP:

### Test 1: Cancel One File After Send

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Upload 3 files via mcp__chrome-devtools__upload_file
3. Wait for files to show "Attached" state
4. Take screenshot showing 3 FileChips: mcp__chrome-devtools__take_screenshot
5. Take snapshot: mcp__chrome-devtools__take_snapshot
6. Click Send button: mcp__chrome-devtools__click
7. IMMEDIATELY click X on middle file: mcp__chrome-devtools__click
8. Wait for message to appear in chat
9. Take screenshot of chat: mcp__chrome-devtools__take_screenshot
```

### Test 2: Verify Message Attachments

```
1. After message appears in chat stream
2. Take screenshot: mcp__chrome-devtools__take_screenshot
3. VERIFY: Message shows only 2 attachment icons (not 3)
4. Canceled file should NOT appear in message attachments
```

### Test 3: Cancel All Files After Send (No Text)

```
1. Upload 2 files (don't type any text)
2. Click Send button: mcp__chrome-devtools__click
3. IMMEDIATELY cancel both files: mcp__chrome-devtools__click (X buttons)
4. Take screenshot: mcp__chrome-devtools__take_screenshot
5. VERIFY: No message sent (send was aborted gracefully)
6. Composer should be in normal state (not "sending")
```

### Test 4: Cancel During Upload Phase

```
1. Upload a large file (10MB+)
2. Click Send while upload in progress
3. Click X on file during "Uploading..." state
4. Take screenshot: mcp__chrome-devtools__take_screenshot
5. VERIFY:
   - File is removed
   - No error toast
   - If text was entered, text message may still send
```

### Expected Results

| Scenario | Expected Behavior |
|----------|-------------------|
| Cancel 1 of 3 after send | Message sent with 2 attachments |
| Cancel all after send (no text) | No message sent, graceful abort |
| Cancel during upload | File excluded from final message |
| Chat stream | Shows only non-canceled files |

---

## Dependencies

### Uses

- `canceledUploadIdsRef` from Story 19.2.1 (or adds its own if running parallel)

### Provides For

- Complete send race handling for Epic 19

---

## Notes for Agent

1. **Belt and suspenders** - Both the hook (buildAttachmentsFromRef) and Composer (handleSend) check for canceled files. This is intentional redundancy.

2. **File removal vs cancelation** - When a file is removed, it's no longer in `files` array. But if it completed just before removal, it could still be in attachments. The canceled set catches this.

3. **Empty send** - If user cancels all files after clicking Send, the send should abort gracefully. Don't send an empty message.

4. **isCanceled is synchronous** - This is why we use a ref. The check happens synchronously during the render/build phase.

5. **Test complexity** - Full integration tests for race conditions are hard. Unit tests verify the filtering logic; manual testing verifies the timing.

6. **uploadId is client-only** - The uploadId in MessageAttachment is ONLY for client-side cancel filtering. It MUST be stripped before sending to backend. The backend does not expect this field and should not receive it. See Step 4 where `attachmentsForSend` uses destructuring to exclude uploadId.
