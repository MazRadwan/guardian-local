# Bug Report: Sequential File Processing Causes Upload Delays

**Bug ID:** BUG-001
**Date:** 2026-01-27
**Severity:** High
**Component:** Backend - DocumentUploadController
**Reporter:** Development Team

---

## Executive Summary

Multi-file uploads process sequentially instead of in parallel, causing significant delays when uploading large files alongside smaller ones. A 6MB PDF uploaded with a 23KB DOCX takes 47 seconds total, when it should take ~17 seconds with parallel processing.

---

## Problem Description

### Expected Behavior
When a user uploads multiple files simultaneously:
- All files should process in parallel
- Each file's `file_attached` event should emit independently
- Total processing time ≈ slowest single file (not sum of all files)

### Actual Behavior
- Files process sequentially (one after another)
- Large files block smaller files from processing
- Total processing time ≈ sum of all file processing times

### User Impact
1. **Poor UX for multi-file uploads** - Users wait significantly longer than necessary
2. **Race condition amplified** - Longer processing increases chance of user sending message before files are ready
3. **Inconsistent behavior** - Frontend sends files in parallel (3 concurrent), but backend processes sequentially

---

## Evidence

### Test Results

| Scenario | Expected | Actual | Delta |
|----------|----------|--------|-------|
| 6MB PDF + 23KB DOCX | ~17s | 47s | +30s |
| 3 small files (23KB each) | ~50ms | 8ms | OK (parallel) |
| Single 6MB PDF | ~16s | 16s | OK |

### Timing Breakdown (6MB PDF + 23KB DOCX)

```
T=0ms:      HTTP POST received (both files)
T=0ms:      HTTP 202 returned immediately
T=0ms:      processUpload(PDF) initiated
T=16000ms:  PDF file_attached emitted
T=16001ms:  processUpload(DOCX) gets CPU time
T=47058ms:  DOCX file_attached emitted

Total: 47 seconds (should be ~17 seconds)
```

### Benchmark Data (Isolated Extraction)

| File | Size | Extraction Time |
|------|------|-----------------|
| DOCX (23KB) | 23KB | 11-19ms |
| PDF (245KB) | 245KB | 71ms |
| PDF (6MB) | 5.94MB | 297ms |

Note: Extraction itself is fast. The delay is in sequential scheduling, not extraction performance.

---

## Root Cause Analysis

### Location
`packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
Lines 299-305

### Current Code
```typescript
// Fire-and-forget processing for each valid file
for (const { file, uploadId, documentType } of validFiles) {
  this.processUpload(uploadId, userId, conversationId, mode, file, documentType)
    .catch(err => {
      console.error(`[Upload] Async processing failed for ${file.originalname}:`, err);
    });
}
```

### Why This Causes Sequential Processing

1. The `for...of` loop initiates each `processUpload()` call sequentially
2. Although each call is async (returns Promise), they share the Node.js event loop
3. When `processUpload()` performs I/O (S3 storage, text extraction), it consumes event loop resources
4. Subsequent iterations must wait for event loop availability
5. Result: Large file operations block smaller file operations

### Specification vs Implementation

**Epic 17 Specification (sprint-1-backend.md):**
> "parallel parsing per file"

**Implementation:** Sequential loop initiation, not parallel execution.

This appears to be an oversight where the async nature of Node.js was assumed to provide parallelism, but the sequential loop means operations compete for the same event loop.

---

## Proposed Fix

### Option B: Concurrency Queue (Recommended)

Add a processing queue with controlled concurrency to enable true parallel processing while preventing resource exhaustion.

#### Implementation

**1. Add dependency:**
```bash
pnpm --filter @guardian/backend add p-queue
```

**2. Modify DocumentUploadController.ts:**

```typescript
import PQueue from 'p-queue';

export class DocumentUploadController {
  private readonly processingQueue: PQueue;

  constructor(
    // ... existing dependencies
  ) {
    // ... existing initialization
    this.processingQueue = new PQueue({ concurrency: 5 });
  }

  // In the upload method, replace lines 299-305 with:
  const processingPromises = validFiles.map(({ file, uploadId, documentType }) =>
    this.processingQueue.add(() =>
      this.processUpload(uploadId, userId, conversationId, mode, file, documentType)
        .catch(err => {
          console.error(`[Upload] Async processing failed for ${file.originalname}:`, err);
        })
    )
  );

  // Fire-and-forget: don't await, let them process in background
  Promise.all(processingPromises).catch(() => {
    // Individual errors already logged above
  });
```

#### Why This Fix

| Benefit | Explanation |
|---------|-------------|
| True parallelism | All files process concurrently (up to limit) |
| Resource safety | Concurrency limit prevents overwhelming system |
| Matches frontend | Frontend uses `UPLOAD_CONCURRENCY_LIMIT = 3` |
| Fair scheduling | Small files don't wait behind large files |
| Minimal change | ~10 lines of code, no architectural changes |

#### Expected Result

| Scenario | Before | After |
|----------|--------|-------|
| 6MB PDF + 23KB DOCX | 47s | ~17s |
| 10 files mixed sizes | Sequential | 5 concurrent |

---

## Alternative Considered

### Option A: Simple Promise.all (Not Recommended)

```typescript
await Promise.all(
  validFiles.map(({ file, uploadId, documentType }) =>
    this.processUpload(uploadId, userId, conversationId, mode, file, documentType)
      .catch(err => { console.error(...); })
  )
);
```

**Pros:** Simpler, 2-line change
**Cons:** No concurrency limit - 10 files would all process simultaneously, potentially exhausting memory/CPU

**Verdict:** Too risky for production without resource limits.

---

## Testing Plan

### Unit Test
```typescript
it('should process multiple files in parallel', async () => {
  const largePdf = createMockFile('large.pdf', 6 * 1024 * 1024);
  const smallDocx = createMockFile('small.docx', 23 * 1024);

  // Mock S3 to simulate 16s for PDF, instant for DOCX
  mockFileStorage.store
    .mockImplementationOnce(() => delay(16000).then(() => 'path1'))
    .mockImplementationOnce(() => Promise.resolve('path2'));

  const start = Date.now();
  await controller.upload(mockRequest([largePdf, smallDocx]), mockRes);

  // Wait for both file_attached events
  await Promise.all([
    waitForEvent('file_attached', { filename: 'large.pdf' }),
    waitForEvent('file_attached', { filename: 'small.docx' })
  ]);

  const duration = Date.now() - start;
  expect(duration).toBeLessThan(18000); // ~17s, not 47s
});
```

### E2E Test
Already created: `apps/web/e2e/upload-timing.spec.ts` - Scenario D

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/backend/package.json` | Add p-queue dependency |
| `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` | Add queue, modify loop |
| `packages/backend/__tests__/unit/DocumentUploadController.test.ts` | Add parallel processing test |

---

## Rollback Plan

If issues arise:
1. Remove `PQueue` usage, revert to original for...of loop
2. No database changes required
3. No frontend changes required
4. WebSocket event contract unchanged

---

## Related Issues

1. **Race Condition (Task #2):** Users can send messages before file processing completes. This bug amplifies that issue by extending processing time.

2. **Epic 16 Fire-and-Forget Pattern:** The fix preserves the 202 immediate response pattern - files still process in background.

---

## Questions for Reviewer

1. Is concurrency limit of 5 appropriate? Should it match frontend's limit of 3?
2. Should we add metrics/logging for queue depth monitoring?
3. Any concerns about p-queue dependency (MIT license, 2M weekly downloads)?
4. Should this fix be combined with Task #2 (race condition fix) or deployed separately?

---

## Appendix: Test File Locations

- Timing test: `apps/web/e2e/upload-timing.spec.ts`
- Benchmark tool: `benchmark/extraction-benchmark.js`
- Test files: `/Users/mazradwan/Downloads/multifile-test/`
