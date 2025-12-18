# Sprint 1 - Track C: useMultiFileUpload Hook - COMPLETE

**Status:** ✅ Complete
**Completed:** 2025-12-18
**Stories:** 17.3.1 - 17.3.5 (all 5 stories)
**Test Results:** 33 tests passing

---

## Implementation Summary

Created a production-ready multi-file upload hook following the "never adopt" pattern for race condition protection.

### Files Created

1. **`apps/web/src/hooks/useMultiFileUpload.ts`** (458 lines)
   - Main hook implementation
   - TypeScript interfaces for state management
   - WebSocket event handling
   - HTTP batch upload logic

2. **`apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`** (1,094 lines)
   - Comprehensive test suite with 33 test cases
   - Coverage of all 5 stories
   - Race condition protection tests
   - Callback stability tests

---

## Story Completion

### Story 17.3.1: Multi-File State Interface ✅

**Implemented:**
- `FileState` interface with all required fields
- `UseMultiFileUploadOptions` interface for hook configuration
- `UseMultiFileUploadReturn` interface for hook API

**Key Fields:**
- `localIndex` - Stable client-side identifier (array position)
- `uploadId` - Server-generated correlation ID for WebSocket events
- `fileId` - Database UUID for message attachments
- `stage` - Current upload stage (pending/uploading/storing/parsing/complete/error)
- `progress` - 0-100 percentage

**Tests:** 2 passing
- Returns expected interface
- Initial state has no files

---

### Story 17.3.2: Core Operations ✅

**Implemented:**
- `addFiles(fileList)` - Validates and adds files to queue
- `removeFile(localIndex)` - Removes file by index (not during upload)
- `clearAll()` - Clears all files and aborts in-flight upload

**Validation:**
- File type validation (PDF, DOCX, PNG, JPEG)
- File size validation (20MB max)
- Max files limit enforcement (default: 10)

**Tests:** 10 passing
- Add valid files to state
- Generate unique localIndex for each file
- Add multiple files in a single call
- Reject files exceeding maxFiles
- Reject invalid file types
- Reject files over 20MB
- Accept valid DOCX files
- Accept valid image files
- Remove pending files by localIndex
- Not remove files during upload
- Clear all files

---

### Story 17.3.3: Upload Implementation ✅

**Implemented:**
- `uploadAll(conversationId, mode)` - Batch HTTP POST upload
- FormData with field name `'files'` (plural)
- AbortController for cancellation
- Index-based uploadId correlation

**HTTP Contract:**
- **Request:** POST `/api/documents/upload`
  - Field: `'files'` (plural, multiple File objects)
  - Field: `conversationId`
  - Field: `mode` ('intake' | 'scoring')
- **Response:** 202 Accepted
  ```json
  {
    "files": [
      { "index": 0, "uploadId": "upload-abc-0", "status": "accepted" },
      { "index": 1, "uploadId": "upload-abc-1", "status": "accepted" }
    ]
  }
  ```

**Error Handling:**
- Partial rejection (some files accepted, some rejected)
- HTTP errors (graceful degradation)
- Abort errors (quiet reset to pending)

**Tests:** 6 passing
- Upload all pending files in a batch
- Handle partial rejection (some files rejected)
- Handle HTTP errors
- Handle abort gracefully
- Not upload if no pending files

---

### Story 17.3.4: WebSocket Progress Handling ✅

**Implemented:**
- Subscription to `upload_progress` events
- Subscription to `intake_context_ready` events
- Subscription to `scoring_parse_ready` events
- "Never adopt" pattern via `knownUploadIdsRef`

**Race Condition Protection:**
- Only process events for uploadIds in `knownUploadIdsRef` set
- UploadIds added to set after HTTP 202 response
- UploadIds removed from set on `clearAll()` or `removeFile()`
- Prevents late events from resurrecting deleted uploads

**Callback Invocation:**
- `onContextReady(data, localIndex)` - Called on intake completion
- `onScoringReady(data, localIndex)` - Called on scoring completion
- `onError(message)` - Called on errors

**Tests:** 8 passing
- Subscribe to WS events when connected
- Not subscribe when disconnected
- Ignore progress events for unknown uploadIds (never adopt)
- Update progress for known uploadIds
- Handle intake_context_ready events
- Handle scoring_parse_ready events
- Ignore events after clearAll (never adopt)
- Unsubscribe on unmount

---

### Story 17.3.5: Computed Values and Tests ✅

**Implemented:**
- `isUploading` - True if any file in uploading/storing/parsing
- `aggregateProgress` - Average progress across all files
- `hasFiles` - True if any files added
- `hasPendingFiles` - True if any files pending upload
- `getCompletedFileIds()` - Returns array of completed fileIds

**Tests:** 7 passing
- Compute isUploading correctly
- Compute aggregateProgress correctly
- Compute hasFiles correctly
- Compute hasPendingFiles correctly
- Return completed file IDs

**Additional Tests (Callback Stability):**
- Not resubscribe when callbacks change
- Call latest callback when event received

---

## Key Design Decisions

### 1. ID Lifecycle (localIndex → uploadId → fileId)

**Problem:** How to correlate WebSocket events with the correct file?

**Solution:** Three-stage ID lifecycle:
1. **localIndex** (client-generated) - Stable array position, used for UI operations
2. **uploadId** (server-generated) - Correlation ID for WebSocket events
3. **fileId** (database UUID) - Final ID for message attachments

**Why NOT tempId?** No need for client-generated correlation ID - array index serves this purpose.

**Why NOT filename?** Filenames are not unique (user can upload "doc.pdf" twice).

---

### 2. "Never Adopt" Pattern

**Problem:** Race condition when user cancels upload but late WebSocket events arrive.

**Solution:** `knownUploadIdsRef` set acts as a whitelist:
- UploadIds added ONLY after HTTP 202 response
- UploadIds removed on cancel/remove
- All WS event handlers check `knownUploadIdsRef.current.has(data.uploadId)`
- Events for unknown uploadIds are silently ignored

**Example:**
```typescript
// User uploads file A → uploadId "upload-A" added to set
// WebSocket events for "upload-A" are processed
// User cancels → "upload-A" removed from set
// Late WS event arrives → ignored (not in set)
```

---

### 3. Single Batch HTTP Upload

**Problem:** Should we upload files sequentially or in a batch?

**Solution:** Single batch upload with all files in one FormData:
- **Pro:** Simpler state management (all files move together)
- **Pro:** Fewer HTTP round-trips
- **Pro:** Server can validate all files before processing
- **Con:** Partial failures require careful handling

**Alternative Considered:** Sequential uploads (one HTTP request per file)
- **Pro:** Easier retry logic per file
- **Con:** Complex state management (tracking which files uploaded)
- **Con:** More HTTP overhead

---

### 4. Callback Stability (Prevents Subscription Thrashing)

**Problem:** Callbacks passed to hook change identity on every render (inline lambdas).

**Solution:** Store callbacks in refs, update refs on every render:
```typescript
const onErrorRef = useRef(onError);
onErrorRef.current = onError;  // Update on every render

// Use ref in subscription (stable identity)
wsAdapter.subscribeUploadProgress((data) => {
  onErrorRef.current?.(data.error);
});
```

**Why?** Prevents unsubscribe/resubscribe on every render.

---

## Test Coverage

**Total Tests:** 33 passing

**Coverage by Story:**
- Story 17.3.1: 2 tests (state interface)
- Story 17.3.2: 10 tests (core operations)
- Story 17.3.3: 6 tests (upload implementation)
- Story 17.3.4: 8 tests (WebSocket handling)
- Story 17.3.5: 5 tests (computed values)
- Callback Stability: 2 tests (subscription stability)

**Test Quality:**
- Unit tests for all public methods
- Integration tests for HTTP + WebSocket flow
- Race condition tests (never adopt)
- Error handling tests (partial rejection, HTTP errors, abort)
- Edge case tests (no files, max files, invalid types)

---

## API Documentation

### Hook Options

```typescript
interface UseMultiFileUploadOptions {
  maxFiles?: number;  // Default: 10
  wsAdapter: {
    isConnected: boolean;
    subscribeUploadProgress: (handler) => unsubscribe;
    subscribeIntakeContextReady: (handler) => unsubscribe;
    subscribeScoringParseReady: (handler) => unsubscribe;
  };
  onError?: (message: string) => void;
  onContextReady?: (data: IntakeContextResult, localIndex: number) => void;
  onScoringReady?: (data: ScoringParseResult, localIndex: number) => void;
}
```

### Hook Return Value

```typescript
interface UseMultiFileUploadReturn {
  files: FileState[];              // Array of file states
  isUploading: boolean;            // Any file uploading/storing/parsing
  aggregateProgress: number;       // 0-100 average across all files
  addFiles: (fileList: FileList) => void;
  removeFile: (localIndex: number) => void;
  clearAll: () => void;
  uploadAll: (conversationId: string, mode: UploadMode) => Promise<void>;
  getCompletedFileIds: () => string[];
  hasFiles: boolean;
  hasPendingFiles: boolean;
}
```

### FileState

```typescript
interface FileState {
  localIndex: number;   // Stable client-side ID
  file: File;           // Original File object
  filename: string;
  size: number;
  mimeType: string;
  uploadId: string | null;  // Server-generated correlation ID
  fileId: string | null;    // Database UUID
  stage: 'pending' | 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  progress: number;     // 0-100
  error?: string;
}
```

---

## Usage Example

```typescript
const {
  files,
  isUploading,
  aggregateProgress,
  addFiles,
  removeFile,
  clearAll,
  uploadAll,
  getCompletedFileIds,
} = useMultiFileUpload({
  maxFiles: 5,
  wsAdapter: {
    isConnected: true,
    subscribeUploadProgress: (handler) => wsClient.onUploadProgress(handler),
    subscribeIntakeContextReady: (handler) => wsClient.onIntakeContextReady(handler),
    subscribeScoringParseReady: (handler) => wsClient.onScoringParseReady(handler),
  },
  onError: (msg) => toast.error(msg),
  onContextReady: (data, localIndex) => {
    console.log(`File ${localIndex} processed:`, data.context);
  },
});

// User selects files
const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files) {
    addFiles(e.target.files);
  }
};

// User clicks upload
const handleUpload = async () => {
  await uploadAll(conversationId, 'intake');
};

// User removes a file
const handleRemove = (localIndex: number) => {
  removeFile(localIndex);
};

// Attach completed files to message
const fileIds = getCompletedFileIds();
sendMessage('Here are the files', conversationId, fileIds);
```

---

## Integration Notes

### Backend Contract (Track A)

**Endpoint:** POST `/api/documents/upload`

**Request:**
- Field name: `'files'` (plural)
- Multiple File objects appended
- `conversationId` and `mode` fields

**Response:**
```json
{
  "files": [
    {
      "index": 0,
      "filename": "doc.pdf",
      "uploadId": "upload-abc-0",
      "status": "accepted"
    },
    {
      "index": 1,
      "filename": "doc2.pdf",
      "status": "rejected",
      "error": "Corrupted file"
    }
  ]
}
```

**WebSocket Events:**
- `upload_progress` - Progress updates (0-100)
- `intake_context_ready` - Intake parsing complete
- `scoring_parse_ready` - Scoring parsing complete

---

## Next Steps (Sprint 2)

### Track D: Composer Integration
- Update MessageComposer to use `useMultiFileUpload`
- Add file picker UI
- Render FileChip components for each file
- Handle completed file IDs for message attachments

### Track E: End-to-End Testing
- E2E test for multi-file upload flow
- Test file selection → upload → progress → completion
- Test partial rejection handling
- Test cancel/remove during upload

---

## Known Limitations

1. **No Resume:** If user refreshes page during upload, progress is lost
   - **Future:** Store upload state in localStorage

2. **No Retry:** If upload fails, user must manually re-add files
   - **Future:** Add retry logic for failed files

3. **No Drag-and-Drop:** File selection is via `<input type="file">`
   - **Future:** Add drag-and-drop zone (Sprint 2, Track D)

4. **Max 10 Files:** Hardcoded default limit
   - **Rationale:** MVP constraint to prevent server overload
   - **Future:** Make configurable via backend

---

## Code Quality Metrics

- **TypeScript:** 100% typed (strict mode)
- **Test Coverage:** 33 tests, all passing
- **Lines of Code:** 458 (hook) + 1,094 (tests)
- **Lint Errors:** 0
- **Type Errors:** 0

---

## Review Checklist

- [x] All 5 stories implemented
- [x] 33 tests passing
- [x] No TypeScript errors
- [x] "Never adopt" pattern verified
- [x] UploadId correlation works correctly
- [x] NO filename-based mapping
- [x] AbortController cleanup on unmount
- [x] Callback stability (prevents subscription thrashing)
- [x] Error handling for HTTP failures
- [x] Error handling for partial rejection
- [x] Computed values tested
- [x] WebSocket event filtering tested

---

**Completion Signature:**
- Implemented by: frontend-agent
- Date: 2025-12-18
- Ready for: Sprint 2 (Composer Integration)
