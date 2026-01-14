# Story 19.2.2: Late WS Event Filtering

**Sprint:** 2
**Track:** Edge Cases
**Phase:** 2 (after 19.2.1)
**Agent:** frontend-agent
**Estimated Lines:** ~250
**Dependencies:** 19.2.1 (Canceled UploadIds Tracking)

---

## Overview

### What This Story Does

Updates WebSocket event handlers to filter out events for canceled uploadIds. This prevents "resurrected" files when late events arrive after a user cancels a file.

### User-Visible Change

**Before:**
```
T0: User starts upload
T1: User clicks X to cancel → file disappears
T2: file_attached event arrives → FILE REAPPEARS (bug)
```

**After:**
```
T0: User starts upload
T1: User clicks X to cancel → file disappears
T2: file_attached event arrives → event ignored, file stays gone
```

### Why This Matters

Per behavior-matrix.md Section 12 (Edge Cases):
> `file_attached` / `upload_progress` may arrive after cancel; UI must drop updates for canceled uploadIds.

---

## Codebase Context

### Files to Modify

1. `apps/web/src/hooks/useMultiFileUpload.ts`

### Current WS Event Handlers

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**subscribeUploadProgress handler (lines 535-566):**
```typescript
const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
  // "Never adopt" - only accept events for known uploadIds
  if (!knownUploadIdsRef.current.has(data.uploadId)) return;

  setFiles((prev) =>
    prev.map((f) => {
      if (f.uploadId !== data.uploadId) return f;
      // ... update stage/progress
    })
  );
});
```

**handleFileAttached (lines 339-380):**
```typescript
const handleFileAttached = useCallback((event: FileAttachedEvent) => {
  // Check if uploadId is known
  if (!knownUploadIdsRef.current.has(event.uploadId)) {
    // Buffer event for later processing (race condition)
    earlyFileAttachedEventsRef.current.set(event.uploadId, event);
    return;
  }

  setFiles((prev) =>
    prev.map((f) => {
      if (f.uploadId !== event.uploadId) return f;
      // ... update stage/fileId/metadata
    })
  );
}, []);
```

**subscribeIntakeContextReady handler (lines 569-601):**
```typescript
const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
  if (!knownUploadIdsRef.current.has(data.uploadId)) return;
  // ... update to complete
});
```

**subscribeScoringParseReady handler (lines 604-635):**
```typescript
const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
  if (!knownUploadIdsRef.current.has(data.uploadId)) return;
  // ... update to complete
});
```

---

## Implementation Steps

### Step 1: Update Upload Progress Handler

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update subscribeUploadProgress in useEffect:**
```typescript
const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
  // "Never adopt" - only accept events for known uploadIds
  if (!knownUploadIdsRef.current.has(data.uploadId)) return;

  // Epic 19 Story 19.2.2: Filter late events for canceled uploads
  if (canceledUploadIdsRef.current.has(data.uploadId)) {
    console.debug(
      '[useMultiFileUpload] Ignoring upload_progress for canceled:',
      data.uploadId
    );
    return;
  }

  setFiles((prev) =>
    prev.map((f) => {
      if (f.uploadId !== data.uploadId) return f;

      const targetStage = data.stage as FileState['stage'];
      const shouldTransition = canTransitionTo(f.stage, targetStage);

      if (!shouldTransition && targetStage !== 'error') {
        console.debug(
          `[useMultiFileUpload] Ignoring progress: ${f.stage} → ${targetStage} (backward)`
        );
      }

      return {
        ...f,
        stage: shouldTransition ? targetStage : f.stage,
        progress: data.progress,
        error: data.error ?? f.error,
      };
    })
  );

  if (data.stage === 'error') {
    onErrorRef.current?.(data.error || 'Upload failed');
  }
});
```

### Step 2: Update File Attached Handler

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update handleFileAttached:**
```typescript
const handleFileAttached = useCallback((event: FileAttachedEvent) => {
  // Check if uploadId is known
  if (!knownUploadIdsRef.current.has(event.uploadId)) {
    // Epic 19 Story 19.2.2: Don't buffer events for canceled uploads
    if (canceledUploadIdsRef.current.has(event.uploadId)) {
      console.debug(
        '[useMultiFileUpload] Ignoring file_attached for canceled:',
        event.uploadId
      );
      return;
    }

    // Buffer event for later processing (race condition)
    console.debug('[useMultiFileUpload] Buffering early file_attached:', event.uploadId);
    earlyFileAttachedEventsRef.current.set(event.uploadId, event);
    return;
  }

  // Epic 19 Story 19.2.2: Filter late events for canceled uploads
  if (canceledUploadIdsRef.current.has(event.uploadId)) {
    console.debug(
      '[useMultiFileUpload] Ignoring file_attached for canceled:',
      event.uploadId
    );
    return;
  }

  setFiles((prev) =>
    prev.map((f) => {
      if (f.uploadId !== event.uploadId) return f;

      const shouldTransition = canTransitionTo(f.stage, 'attached');

      if (!shouldTransition) {
        console.debug(
          `[useMultiFileUpload] Ignoring file_attached: ${f.stage} → attached (backward)`
        );
      }

      return {
        ...f,
        fileId: event.fileId,
        metadata: {
          fileId: event.fileId,
          filename: event.filename,
          mimeType: event.mimeType,
          size: event.size,
          hasExcerpt: event.hasExcerpt,
          detectedDocType: event.detectedDocType,
          detectedVendorName: event.detectedVendorName,
        },
        stage: shouldTransition ? 'attached' : f.stage,
      };
    })
  );
}, []);
```

### Step 3: Update Intake Context Handler

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update subscribeIntakeContextReady in useEffect:**
```typescript
const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
  if (!knownUploadIdsRef.current.has(data.uploadId)) return;

  // Epic 19 Story 19.2.2: Filter late events for canceled uploads
  if (canceledUploadIdsRef.current.has(data.uploadId)) {
    console.debug(
      '[useMultiFileUpload] Ignoring intake_context_ready for canceled:',
      data.uploadId
    );
    return;
  }

  setFiles((prev) => {
    const updated = prev.map((f) => {
      if (f.uploadId !== data.uploadId) return f;

      if (data.success && data.fileMetadata) {
        return {
          ...f,
          stage: 'complete' as const,
          progress: 100,
          fileId: data.fileMetadata.fileId,
        };
      } else {
        return {
          ...f,
          stage: 'error' as const,
          progress: 0,
          error: data.error || 'Failed to process',
        };
      }
    });

    const updatedFile = updated.find((f) => f.uploadId === data.uploadId);
    if (updatedFile && data.success) {
      onContextReadyRef.current?.(data, updatedFile.localIndex);
    }

    return updated;
  });
});
```

### Step 4: Update Scoring Parse Handler

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

**Update subscribeScoringParseReady in useEffect:**
```typescript
const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
  if (!knownUploadIdsRef.current.has(data.uploadId)) return;

  // Epic 19 Story 19.2.2: Filter late events for canceled uploads
  if (canceledUploadIdsRef.current.has(data.uploadId)) {
    console.debug(
      '[useMultiFileUpload] Ignoring scoring_parse_ready for canceled:',
      data.uploadId
    );
    return;
  }

  setFiles((prev) => {
    const updated = prev.map((f) => {
      if (f.uploadId !== data.uploadId) return f;

      if (data.success && data.fileMetadata) {
        return {
          ...f,
          stage: 'complete' as const,
          progress: 100,
          fileId: data.fileMetadata.fileId,
        };
      } else {
        return {
          ...f,
          stage: 'error' as const,
          progress: 0,
          error: data.error || 'Failed to parse',
        };
      }
    });

    const updatedFile = updated.find((f) => f.uploadId === data.uploadId);
    if (updatedFile && data.success) {
      onScoringReadyRef.current?.(data, updatedFile.localIndex);
    }

    return updated;
  });
});
```

---

## Tests to Write

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

```typescript
describe('Story 19.2.2: Late WS Event Filtering', () => {
  describe('upload_progress filtering', () => {
    it('should ignore upload_progress for canceled uploadId', async () => {
      const adapter = createMockAdapter(true);
      let progressHandler: ((data: UploadProgressEvent) => void) | null = null;

      // Capture the progress handler
      jest.spyOn(adapter, 'subscribeUploadProgress').mockImplementation((handler) => {
        progressHandler = handler;
        return () => {};
      });

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
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Remove the file (cancel)
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      expect(result.current.files).toHaveLength(0);

      // Simulate late progress event
      act(() => {
        progressHandler?.({
          uploadId: 'upload-123',
          progress: 80,
          stage: 'storing',
        });
      });

      // File should NOT be resurrected
      expect(result.current.files).toHaveLength(0);
    });
  });

  describe('file_attached filtering', () => {
    it('should ignore file_attached for canceled uploadId', async () => {
      const adapter = createMockAdapter(true);
      let fileAttachedHandler: ((data: FileAttachedEvent) => void) | null = null;

      jest.spyOn(adapter, 'subscribeFileAttached').mockImplementation((handler) => {
        fileAttachedHandler = handler;
        return () => {};
      });

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
          files: [{ index: 0, uploadId: 'upload-456', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Remove the file (cancel)
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      expect(result.current.files).toHaveLength(0);

      // Simulate late file_attached event
      act(() => {
        fileAttachedHandler?.({
          uploadId: 'upload-456',
          fileId: 'file-uuid',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          hasExcerpt: true,
          detectedDocType: 'document',
          detectedVendorName: 'Test Vendor',
        });
      });

      // File should NOT be resurrected
      expect(result.current.files).toHaveLength(0);
    });

    it('should not buffer file_attached for canceled uploadId', async () => {
      const adapter = createMockAdapter(true);
      let fileAttachedHandler: ((data: FileAttachedEvent) => void) | null = null;

      jest.spyOn(adapter, 'subscribeFileAttached').mockImplementation((handler) => {
        fileAttachedHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add file
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      // Mock upload that will assign uploadId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-789', status: 'accepted' }],
        }),
      });

      // Start upload
      const uploadPromise = act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Cancel immediately (before upload completes)
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      await uploadPromise;

      // Send early file_attached for the now-canceled uploadId
      act(() => {
        fileAttachedHandler?.({
          uploadId: 'upload-789',
          fileId: 'file-uuid',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          hasExcerpt: true,
          detectedDocType: 'document',
          detectedVendorName: 'Test',
        });
      });

      // Event should not be buffered, file stays gone
      expect(result.current.files).toHaveLength(0);
    });
  });

  describe('intake_context_ready filtering', () => {
    it('should ignore intake_context_ready for canceled uploadId', async () => {
      const adapter = createMockAdapter(true);
      let intakeHandler: ((data: IntakeContextResult) => void) | null = null;

      jest.spyOn(adapter, 'subscribeIntakeContextReady').mockImplementation((handler) => {
        intakeHandler = handler;
        return () => {};
      });

      const onContextReady = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onContextReady })
      );

      // Setup and cancel
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-999', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // Simulate late intake_context_ready
      act(() => {
        intakeHandler?.({
          uploadId: 'upload-999',
          success: true,
          fileMetadata: {
            fileId: 'file-uuid',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1000,
          },
          intakeContext: {},
        });
      });

      // Callback should NOT be called
      expect(onContextReady).not.toHaveBeenCalled();
      expect(result.current.files).toHaveLength(0);
    });
  });

  describe('scoring_parse_ready filtering', () => {
    it('should ignore scoring_parse_ready for canceled uploadId', async () => {
      const adapter = createMockAdapter(true);
      let scoringHandler: ((data: ScoringParseResult) => void) | null = null;

      jest.spyOn(adapter, 'subscribeScoringParseReady').mockImplementation((handler) => {
        scoringHandler = handler;
        return () => {};
      });

      const onScoringReady = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onScoringReady })
      );

      // Setup and cancel
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-aaa', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'scoring');
      });

      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      // Simulate late scoring_parse_ready
      act(() => {
        scoringHandler?.({
          uploadId: 'upload-aaa',
          success: true,
          fileMetadata: {
            fileId: 'file-uuid',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1000,
          },
          parsedResponses: [],
        });
      });

      // Callback should NOT be called
      expect(onScoringReady).not.toHaveBeenCalled();
      expect(result.current.files).toHaveLength(0);
    });
  });
});
```

---

## Acceptance Criteria

- [ ] `upload_progress` events ignored for canceled uploadIds
- [ ] `file_attached` events ignored for canceled uploadIds
- [ ] `file_attached` events NOT buffered for canceled uploadIds
- [ ] `intake_context_ready` events ignored for canceled uploadIds
- [ ] `scoring_parse_ready` events ignored for canceled uploadIds
- [ ] Callbacks (onContextReady, onScoringReady) NOT called for canceled uploads
- [ ] Debug logging for filtered events (for troubleshooting)
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

1. Start file upload (Network tab shows POST in flight)
2. Click X to cancel before completion
3. File should disappear immediately
4. In console, watch for `[useMultiFileUpload] Ignoring... for canceled` logs
5. File should NOT reappear after late events arrive

---

## Manual QA with Chrome DevTools MCP

After implementation, verify late event filtering using Chrome DevTools MCP:

### Test 1: Cancel During Upload - File Stays Gone

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Open console to watch logs: mcp__chrome-devtools__get_console_message
3. Upload a large file (5MB+) via mcp__chrome-devtools__upload_file
4. Take screenshot showing uploading state: mcp__chrome-devtools__take_screenshot
5. Immediately click X on FileChip: mcp__chrome-devtools__click
6. Take screenshot after cancel: mcp__chrome-devtools__take_screenshot
7. VERIFY: FileChip is GONE
```

### Test 2: Verify Debug Log Messages

```
1. After canceling file during upload
2. Check console messages: mcp__chrome-devtools__list_console_messages
3. VERIFY: See log message like "[useMultiFileUpload] Ignoring file_attached for canceled: upload-xxx"
```

### Test 3: Verify No File Resurrection

```
1. Cancel file during upload
2. Wait 5 seconds for late WS events to arrive
3. Take screenshot: mcp__chrome-devtools__take_screenshot
4. VERIFY: FileChip is still GONE (not resurrected by late events)
5. Check console: mcp__chrome-devtools__list_console_messages
6. VERIFY: Any late events show "Ignoring... for canceled" logs
```

### Test 4: Network Shows Request Was Aborted

```
1. After canceling during upload
2. Check network requests: mcp__chrome-devtools__list_network_requests
3. VERIFY: POST to /api/documents/upload shows "canceled" or "aborted" status
```

### Expected Results

| Action | Expected Behavior |
|--------|-------------------|
| Click X during uploading | File removed immediately |
| Console log | "[useMultiFileUpload] Ignoring... for canceled" |
| After 5 seconds | File still gone (no resurrection) |
| Network request | Shows canceled/aborted |

---

## Dependencies

### Uses

- `canceledUploadIdsRef` from Story 19.2.1

### Provides For

- Complete late-event handling for Epic 19

---

## Notes for Agent

1. **Order of checks** - Check `canceledUploadIdsRef` AFTER `knownUploadIdsRef`. The "never adopt" pattern still applies first.

2. **Don't buffer canceled** - In `handleFileAttached`, if uploadId is in canceled set, don't buffer it for later. It's definitely not wanted.

3. **Debug logging** - Add console.debug for filtered events. This helps debugging "why didn't my file appear" issues.

4. **No state changes** - When filtering, just return early. Don't call setFiles with unchanged data.

5. **Test setup** - Tests need to mock the WS subscriptions to capture handlers. Use `jest.spyOn` pattern shown in test examples.
