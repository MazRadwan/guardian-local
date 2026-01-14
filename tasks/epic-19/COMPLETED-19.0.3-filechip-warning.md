# Story 19.0.3: FileChip Warning Removal - COMPLETED

**Completed:** 2026-01-13
**Agent:** frontend-agent
**Status:** ✅ All tests passing

## Summary

Successfully removed the amber document type warning from FileChip. Document type issues are now communicated exclusively via chat messages from the backend.

## Changes Made

### 1. FileChip.tsx - Removed Warning Logic

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Changes:**
1. Removed `AlertTriangle` import
2. Removed `hasDocTypeMismatch` calculation (lines 67-71)
3. Simplified background/border styling (removed amber branch)
4. Simplified aria-label (removed warning text)
5. Simplified checkmark icon rendering (removed `!hasDocTypeMismatch` conditionals)
6. Removed "Not a questionnaire?" warning text block
7. Removed amber warning icon rendering

**Result:** FileChip now always shows:
- Gray background (`bg-gray-100`) for all document types
- Green checkmark for attached/complete stages
- "Attached" or "Ready" status text
- No amber warning styling or text

### 2. FileChip.test.tsx - Added Verification Tests

**File:** `apps/web/src/components/chat/__tests__/FileChip.test.tsx`

**Added test suite:** `Story 19.0.3: Document Type (No Warning)` with 9 tests:

1. ✅ Should NOT show amber styling regardless of detectedDocType
2. ✅ Should show checkmark icon for attached stage regardless of docType
3. ✅ Should NOT show "Not a questionnaire?" text
4. ✅ Should have clean aria-label without warning text
5. ✅ Should show "Attached" text for attached stage in scoring mode
6. ✅ Should show "Ready" text for complete stage regardless of document type
7. ✅ Should show normal gray styling for questionnaire in scoring mode
8. ✅ Should show normal gray styling when detectedDocType is null
9. ✅ Should show normal gray styling when mode is not provided

## Test Results

```bash
pnpm --filter @guardian/web test:unit -- FileChip

PASS src/components/chat/__tests__/FileChipInChat.test.tsx
PASS src/components/chat/__tests__/FileChip.test.tsx

Test Suites: 2 passed, 2 total
Tests:       80 passed, 80 total
Time:        1.371 s
```

**All tests passing!** ✅

## TypeScript Check

No FileChip-specific TypeScript errors. Pre-existing type errors in test files are unrelated to this story (Jest type definitions issue across the codebase).

## Files Modified

1. `/apps/web/src/components/chat/FileChip.tsx`
   - Removed: 31 lines (warning logic and styling)
   - Simplified: Icon rendering, status text, aria-labels

2. `/apps/web/src/components/chat/__tests__/FileChip.test.tsx`
   - Added: 152 lines (comprehensive test coverage for no-warning behavior)

## Acceptance Criteria

- [x] `hasDocTypeMismatch` calculation removed
- [x] Amber background/border styling removed
- [x] Aria-label no longer includes warning text
- [x] AlertTriangle icon no longer renders for document type
- [x] Checkmark always shows for attached/complete (no conditional)
- [x] "Not a questionnaire?" text removed
- [x] AlertTriangle import removed
- [x] New tests added for no-warning behavior
- [x] All tests passing

## User-Visible Change

**Before (in Scoring mode with non-questionnaire):**
```
┌─────────────────────────────────────────────┐
│ ⚠️ whitepaper.pdf              [X]          │  ← Amber warning icon
│ ┌────────────────────────────────────────┐ │  ← Amber background/border
│ │ Not a questionnaire?                   │ │  ← Warning text
│ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**After (same file, same mode):**
```
┌─────────────────────────────────────────────┐
│ ✓ whitepaper.pdf               [X]          │  ← Normal checkmark
│ ┌────────────────────────────────────────┐ │  ← Normal gray background
│ │ Attached                               │ │  ← Normal status text
│ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

Document type issues are now shown in chat via backend messages.

## Next Steps

Ready to proceed to next story in Sprint 0.

## Notes

- Props `detectedDocType` and `mode` remain in FileChipProps for backward compatibility
- Backend already handles document type warnings via `scoring_error` event
- Behavior matrix (lines 295-317) explicitly requires chat-based handling only
