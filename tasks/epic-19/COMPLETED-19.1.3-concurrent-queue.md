# Story 19.1.3: Concurrent Upload Queue - COMPLETED

**Status:** ✅ Complete
**Date Completed:** 2026-01-13
**Agent:** frontend-agent

---

## Summary

Implemented concurrent upload queue with a configurable limit (default: 3 files). Files queue when at the limit, and new uploads start automatically as slots become available.

---

## Implementation Details

### 1. Concurrency Constant

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

Added `UPLOAD_CONCURRENCY_LIMIT = 3` constant with documentation referencing behavior-matrix.md.

```typescript
/**
 * Epic 19: Maximum concurrent uploads
 * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
 */
const UPLOAD_CONCURRENCY_LIMIT = 3;
```

### 2. Active Uploads Tracking

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

Added `activeUploadsRef` to track currently uploading file indices:

```typescript
// Epic 19: Track currently uploading file indices for concurrency control
const activeUploadsRef = useRef<Set<number>>(new Set());
```

### 3. Concurrent Queue Pattern

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

Refactored `uploadAll()` to implement worker-based concurrent queue:

- Creates upload queue from pending files (snapshot)
- Spawns up to `UPLOAD_CONCURRENCY_LIMIT` concurrent workers
- Each worker processes queue items until empty
- Workers check capacity before starting new upload
- Marks files as active/inactive in `activeUploadsRef`
- Gracefully handles file removal during queue processing

**Key Implementation Details:**
- Queue is array-based (shift to dequeue)
- Active set prevents over-starting
- Workers exit when capacity reached
- Individual file errors don't stop other workers
- Active set cleared after all workers complete

### 4. ClearAll Update

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

Updated `clearAll()` to reset active uploads tracking:

```typescript
// Epic 19: Clear active uploads tracking
activeUploadsRef.current.clear();
```

### 5. Export for Testing

**File:** `apps/web/src/hooks/useMultiFileUpload.ts`

Exported constant for test verification:

```typescript
// Export for testing
export { UPLOAD_CONCURRENCY_LIMIT };
```

---

## Tests Written

**File:** `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`

Added comprehensive test suite covering:

1. **Constant verification** - Confirms limit is 3
2. **Concurrency enforcement** - Tracks max concurrent calls, verifies never exceeds limit
3. **Queue processing** - Verifies all files complete in order
4. **File removal during queue** - Removed files don't upload
5. **ClearAll cleanup** - Active set cleared properly

**Test Results:**
```
Story 19.1.3: Concurrent Upload Queue
  ✓ should have concurrency limit of 3
  ✓ should limit concurrent uploads (103 ms)
  ✓ should queue files and process as slots open (44 ms)
  ✓ should handle file removal during queue processing (104 ms)
  ✓ should clear active set on clearAll (103 ms)
```

All 58 tests in suite pass (including new 5 tests for this story).

---

## Verification Results

### Unit Tests
```bash
pnpm --filter @guardian/web test:unit -- useMultiFileUpload
```
**Result:** ✅ All 58 tests pass

### TypeScript Check
```bash
pnpm --filter @guardian/web tsc --noEmit
```
**Result:** ✅ No TypeScript errors in useMultiFileUpload.ts

---

## Acceptance Criteria

- [x] `UPLOAD_CONCURRENCY_LIMIT` constant defined (value: 3)
- [x] `activeUploadsRef` tracking active upload indices
- [x] `uploadAll()` implements concurrent queue pattern
- [x] Maximum LIMIT concurrent uploads enforced
- [x] Remaining files queue and start as slots open
- [x] Files removed during upload are skipped
- [x] `clearAll()` resets active tracking
- [x] All tests passing

---

## Files Modified

1. `apps/web/src/hooks/useMultiFileUpload.ts`
   - Added `UPLOAD_CONCURRENCY_LIMIT` constant
   - Added `activeUploadsRef` ref
   - Refactored `uploadAll()` with concurrent queue pattern
   - Updated `clearAll()` to reset active set
   - Exported constant for testing

2. `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx`
   - Imported `UPLOAD_CONCURRENCY_LIMIT`
   - Added 5 new tests for concurrency queue

---

## Known Issues

None.

---

## Manual Testing Notes

To verify visually in browser:

1. Upload 5+ files simultaneously
2. Open Network tab in Chrome DevTools
3. Filter by "fetch" or "XHR"
4. Verify only 3 POST requests to `/api/documents/upload` are "pending" at any time
5. As requests complete, new ones should start
6. Remove a queued file - it should never make HTTP request

Expected behavior confirmed by unit tests, but manual testing with Chrome DevTools MCP can provide additional visual verification if needed.

---

## Next Steps

Continue with **Story 19.1.4: Size Validation** (optional enhancement) or proceed to Sprint 2 stories.

---

## Notes

- Implementation uses worker pattern for clean concurrency control
- Queue is snapshot at call time (avoids mutation issues)
- Active set prevents race conditions
- Individual file errors are isolated (don't affect other workers)
- Tests verify both correctness and timing behavior
