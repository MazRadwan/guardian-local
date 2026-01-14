# Sprint 1: Per-File Upload Infrastructure

**Epic:** 19 - File Upload Chip Cancel/Remove Refactor
**Focus:** Refactor batch upload to per-file uploads with per-file AbortControllers
**Stories:** 19.1.1 - 19.1.5 (5 stories)
**Estimated Effort:** 8-12 hours
**Dependencies:** Sprint 0 complete
**Agents:** `frontend-agent`

---

## Context

Sprint 1 refactors the upload system from batch (single request for all files) to per-file (one request per file). This enables individual file cancellation - the core requirement of Epic 19.

**Current State:**
```
uploadAll() → Single POST with FormData containing ALL files
           → Single AbortController
           → Cancel = abort ALL files
```

**Target State:**
```
uploadAll() → Loop over pending files
           → Each file gets its own POST request
           → Each file gets its own AbortController
           → Concurrency limit (2-3 simultaneous)
           → Cancel = abort only that file
```

---

## Prerequisites

### Sprint 0 Complete

| Story | Status | Provides |
|-------|--------|----------|
| 19.0.1 | Complete | `uploadStageHelpers.ts` with `requiresAbort()` |
| 19.0.2 | Complete | ModeSelector warning removed |
| 19.0.3 | Complete | FileChip warning removed |
| 19.0.4 | Complete | `attached` stage removal works |

### Reference Documents

- `behavior-matrix.md` Section 5 (Concurrency Limits)
- `behavior-matrix.md` Section 11 (Central Helper Functions)

---

## Stories

| Story | Name | Focus | Lines | Dependencies |
|-------|------|-------|-------|--------------|
| **19.1.1** | Per-File AbortController Map | Manage per-file abort controllers | ~250 | None |
| **19.1.2** | Single File Upload Function | Extract uploadSingleFile() | ~350 | 19.1.1 |
| **19.1.3** | Concurrent Upload Queue | Implement concurrency limit | ~300 | 19.1.2 |
| **19.1.4** | Client-Side Size Validation | Enforce 50MB total limit | ~200 | None |
| **19.1.5** | Queue Reschedule on New Files | Handle files added during upload | ~300 | 19.1.3 |

**Total: 5 stories, ~1,400 lines of planning documentation**

---

## Dependency Graph

```
                    SPRINT 1 DEPENDENCIES

    ⚠️  ALL STORIES TOUCH useMultiFileUpload.ts - SEQUENTIAL ONLY

    File Overlap Analysis:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Story   │ Files Touched              │ Conflicts                │
    ├─────────┼────────────────────────────┼──────────────────────────┤
    │ 19.1.1  │ useMultiFileUpload.ts      │ ALL Sprint 1 & 2 stories │
    │ 19.1.2  │ useMultiFileUpload.ts      │ ALL Sprint 1 & 2 stories │
    │ 19.1.3  │ useMultiFileUpload.ts      │ ALL Sprint 1 & 2 stories │
    │ 19.1.4  │ useMultiFileUpload.ts      │ ALL Sprint 1 & 2 stories │
    │ 19.1.5  │ useMultiFileUpload.ts      │ ALL Sprint 1 & 2 stories │
    └─────────────────────────────────────────────────────────────────┘

    Execution Order (STRICT SEQUENTIAL):
    19.1.1 ──► 19.1.2 ──► 19.1.3 ──► 19.1.4 ──► 19.1.5
       │          │          │          │          │
       └──────────┴──────────┴──────────┴──────────┘
                   All modify useMultiFileUpload.ts
```

---

## Parallel Execution Strategy

### ⚠️ NO PARALLELISM POSSIBLE

**All 5 stories modify `useMultiFileUpload.ts`.** Sub-agents editing the same file simultaneously will fail with "File modified since read."

**Sprint 1 must be executed sequentially.** One agent, one story at a time.

---

### Sequential Execution Order

```
┌────────────────────────────────────────────────────────────────────┐
│                   SPRINT 1 - SEQUENTIAL ONLY                       │
│           (All stories modify useMultiFileUpload.ts)               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   19.1.1: AbortController Map                                      │
│       └─► Adds abortControllerMapRef                               │
│           │                                                        │
│           ▼                                                        │
│   19.1.2: Single File Upload Function                              │
│       └─► Extracts uploadSingleFile()                              │
│           │                                                        │
│           ▼                                                        │
│   19.1.3: Concurrent Upload Queue                                  │
│       └─► Adds concurrency limit logic                             │
│           │                                                        │
│           ▼                                                        │
│   19.1.4: Client-Side Size Validation                              │
│       └─► Adds 50MB check in addFiles()                            │
│           │                                                        │
│           ▼                                                        │
│   19.1.5: Queue Reschedule on New Files                            │
│       └─► Adds useEffect for pending file detection                │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Agents needed:** 1 (sequential)
**Review:** After each story complete (incremental review recommended)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 19.1.1 | `sprint-1-story-19.1.1-abort-map.md` | frontend-agent |
| 19.1.2 | `sprint-1-story-19.1.2-single-upload.md` | frontend-agent |
| 19.1.3 | `sprint-1-story-19.1.3-concurrent-queue.md` | frontend-agent |
| 19.1.4 | `sprint-1-story-19.1.4-size-validation.md` | frontend-agent |
| 19.1.5 | `sprint-1-story-19.1.5-queue-reschedule.md` | frontend-agent |

---

## Key Design Decisions

### Per-File Request Pattern

**Current (batch):**
```typescript
const formData = new FormData();
formData.append('conversationId', conversationId);
formData.append('mode', mode);
pendingFiles.forEach(f => formData.append('files', f.file));

const response = await fetch('/api/documents/upload', {
  method: 'POST',
  body: formData,
  signal: abortController.signal, // ONE controller for ALL
});
```

**Target (per-file):**
```typescript
// For each pending file (respecting concurrency limit)
const formData = new FormData();
formData.append('conversationId', conversationId);
formData.append('mode', mode);
formData.append('files', file.file); // Single file

const controller = new AbortController();
abortControllerMapRef.current.set(file.localIndex, controller);

const response = await fetch('/api/documents/upload', {
  method: 'POST',
  body: formData,
  signal: controller.signal, // Per-file controller
});
```

### Concurrency Limit

Per behavior-matrix.md Section 5:
> Max concurrent uploads: **2-3**

```typescript
const UPLOAD_CONCURRENCY_LIMIT = 3;

// Queue pattern:
// 1. Get pending files
// 2. Start up to LIMIT concurrent uploads
// 3. As each completes, start next pending
// 4. All complete when queue empty
```

### Index Mapping Removal

**Current:** Server returns `files[].index` matching FormData order
**New:** Each request is for one file, no index mapping needed

```typescript
// Before: Map server response index to local file
const localIndex = pendingIndices[serverFile.index];

// After: Response is for THIS file only
const serverFile = result.files[0]; // Always index 0
file.uploadId = serverFile.uploadId;
```

### Total Size Validation

Per behavior-matrix.md Section 5:
> Max total size: 50MB - Must enforce client-side

```typescript
// In addFiles()
if (wouldExceedTotalSize(files, newFiles)) {
  onError?.('Total size exceeds 50MB limit');
  return;
}
```

---

## Files to Modify

### Primary Changes

| File | Changes |
|------|---------|
| `useMultiFileUpload.ts` | AbortController map, uploadSingleFile(), concurrency queue |

### Supporting Changes

| File | Changes |
|------|---------|
| `Composer.tsx` | May need to handle concurrent upload states |

### No Changes Required

| File | Reason |
|------|--------|
| Backend routes | Existing endpoint works for single-file |
| WebSocket events | Same events, same handling |
| FileChip | Already handles per-file progress |

---

## Behavior Matrix References

| Story | Behavior Matrix Sections |
|-------|-------------------------|
| 19.1.1 | Stage Transitions (94-148) - cancel behavior |
| 19.1.2 | Remove/Cancel Action (166-179) - abort on cancel |
| 19.1.3 | Concurrency Limits (221-262) |
| 19.1.4 | Concurrency Limits (244-252) - size validation |

---

## Success Metrics

- [ ] Each file uploads via separate HTTP request
- [ ] Each file has its own AbortController
- [ ] Canceling one file does not affect others
- [ ] Maximum 3 concurrent uploads
- [ ] Files queue when at concurrency limit
- [ ] 50MB total size limit enforced client-side
- [ ] No index mapping issues
- [ ] Files added during upload are automatically processed
- [ ] File picker remains enabled during upload
- [ ] All existing tests pass
- [ ] New tests for concurrent upload scenarios

---

## Exit Criteria

Sprint 1 is complete when:

- [ ] Story 19.1.1: AbortController map implemented
- [ ] Story 19.1.2: uploadSingleFile() function works
- [ ] Story 19.1.3: Concurrency limit enforced
- [ ] Story 19.1.4: Size validation prevents over 50MB
- [ ] Story 19.1.5: Files added during upload are queued and processed
- [ ] Upload 5 files → See 3 upload, 2 queue
- [ ] Cancel mid-upload → Only that file affected
- [ ] Add files during upload → New files join queue
- [ ] All unit tests passing
- [ ] Code reviewed and approved

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Race conditions in state updates | Use refs for AbortController map |
| Memory leaks from abandoned controllers | Cleanup in clearAll() and on unmount |
| Server rate limiting | Concurrency limit prevents flooding |
| Stale closure in async callbacks | Use filesRef pattern from existing code |
