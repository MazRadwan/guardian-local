# Sprint 3: Mode-Specific Frontend Implementation Summary

**Date:** 2026-01-09
**Status:** ✅ Complete
**Stories:** 18.3.1, 18.3.4

---

## Overview

Sprint 3 implemented mode-aware send enablement and mode transition handling for Epic 18's trigger-on-send upload pattern. This allows users to send messages as soon as files are attached, without waiting for full enrichment to complete.

---

## Story 18.3.1: Mode-Aware Send Enablement

### Goal
Allow users to send messages when files are in 'attached' stage (not waiting for enrichment to complete).

### Implementation

**File:** `apps/web/src/components/chat/Composer.tsx`

1. **Send Enablement Logic** (lines 224-235):
   - Added `canSendWithAttachments` useMemo hook
   - Checks if all files are in sendable stages: `attached`, `parsing`, or `complete`
   - Uses `stage` field (not `state`) per Sprint 1B

2. **Early Upload Gate** (lines 150-155):
   - Replaced `isUploading` check with specific stage check
   - Only blocks send during early stages: `pending`, `uploading`, `storing`
   - Allows send when files are `attached`, `parsing`, or `complete`

3. **Trigger-on-Send Flow** (lines 174-191):
   - Skip `waitForCompletion()` for files already attached
   - Build attachments from files with `fileId` (attached+)
   - Send immediately without waiting for parsing/scoring
   - Parsing/scoring continues in background after send

### Key Technical Decisions

**Decision 1:** All modes use same behavior (no per-mode gating)
- Trigger-on-send is the ONLY pattern
- Consult, Assessment, and Scoring modes all allow send at 'attached'

**Decision 2:** Skip waitForCompletion for trigger-on-send
- Old flow: Wait for all files to complete → send
- New flow: Send with files that have fileId → continue processing in background
- Prevents hanging on files that are still parsing

**Decision 3:** Use fileId presence as readiness indicator
- Files get fileId when `file_attached` event fires
- Any file with fileId can be included in send (attached, parsing, or complete)
- Files without fileId are ignored (still in early upload stages)

### Tests Added

**File:** `apps/web/src/components/chat/__tests__/Composer.sprint3.test.tsx`

- `should enable send when files are in attached stage` ✅
- `should enable send with files in parsing stage` ✅
- `should enable send with files in complete stage` ✅
- `should disable send when files are in pending or uploading stage` ✅

### Tests Updated

**File:** `apps/web/src/components/chat/__tests__/Composer.test.tsx`

- `should enable send button with files only (no text)` - Updated to expect disabled when pending
- `should disable send button during upload (isUploading)` - Updated to match new behavior

---

## Story 18.3.4: Mode Transition Handling

### Goal
Handle file state when user switches modes mid-upload. Show warning but don't block mode switch.

### Implementation

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

1. **Added hasIncompleteFiles Prop** (lines 20-21):
   - New optional boolean prop
   - Indicates files are still processing

2. **Warning Icon** (lines 82-85):
   - Shows AlertTriangle icon when `hasIncompleteFiles` is true
   - Yellow color (`text-yellow-600`)
   - Only visible when files are incomplete

3. **Accessibility** (lines 77-78):
   - Updated aria-label to include warning context
   - Added title attribute for tooltip
   - Message: "Files are still processing. Switching modes may affect analysis."

**File:** `apps/web/src/components/chat/Composer.tsx`

1. **Incomplete Files Detection** (lines 237-243):
   - Added `hasIncompleteFiles` useMemo hook
   - Checks for files not in terminal states (`complete` or `error`)
   - Files in `pending`, `uploading`, `storing`, `attached`, `parsing` are "incomplete"

2. **Prop Passing** (line 323):
   - Pass `hasIncompleteFiles` to ModeSelector
   - Warning updates reactively as file stages change

### Key Technical Decisions

**Decision 1:** Warning doesn't block mode change
- User can still switch modes (not disabled)
- Warning informs user but doesn't prevent action
- Aligns with "inform, don't block" UX principle

**Decision 2:** Use terminal states for completion check
- `complete` and `error` are terminal states
- All other stages are considered "incomplete"
- Simple, unambiguous logic

**Decision 3:** Reactive warning (not one-time)
- Warning appears/disappears as files progress
- Updates automatically via useMemo dependencies
- No manual state management needed

### Tests Added

**File:** `apps/web/src/components/chat/__tests__/Composer.sprint3.test.tsx`

- `should show warning icon when files are incomplete` ✅
- `should show tooltip on mode selector when files incomplete` ✅
- `should NOT show warning when files are complete` ✅
- `should allow mode change with incomplete files (no blocking)` ✅
- `should NOT show warning when files in error state` ✅

---

## Acceptance Criteria

### Story 18.3.1

- [x] Send enabled when files are 'attached' in ALL modes
- [x] Uses `stage` field (not `state`)
- [x] Unit tests for send enablement logic
- [x] All modes use same behavior (trigger-on-send is ONLY pattern)

### Story 18.3.4

- [x] Mode switch during upload doesn't break flow
- [x] Send rules update immediately on mode change
- [x] Warning shown for incomplete files (stage !== 'complete')
- [x] No state corruption on mode switch
- [x] Unit tests for mode transition

---

## Test Results

**Sprint 3 Tests:** 9/9 passing ✅
**All Composer Tests:** 55/55 passing ✅

**Test Command:**
```bash
pnpm --filter @guardian/web test Composer
```

---

## Files Modified

1. `apps/web/src/components/chat/Composer.tsx`
   - Added `canSendWithAttachments` logic
   - Added `hasIncompleteFiles` detection
   - Updated `handleSend` to skip waitForCompletion for trigger-on-send
   - Updated early upload gate to allow send at attached+

2. `apps/web/src/components/chat/ModeSelector.tsx`
   - Added `hasIncompleteFiles` prop
   - Added warning icon (AlertTriangle)
   - Updated accessibility labels

3. `apps/web/src/components/chat/__tests__/Composer.sprint3.test.tsx` (new)
   - 9 new tests for Sprint 3 functionality

4. `apps/web/src/components/chat/__tests__/Composer.test.tsx`
   - Updated 2 existing tests to match new behavior

---

## Integration with Sprint 1 & 2

Sprint 3 builds on:
- **Sprint 1A:** Backend `file_attached` event (provides fileId)
- **Sprint 1B:** Frontend `stage` field and monotonic guards
- **Sprint 2:** ProgressMessage component and socket wiring

Sprint 3 completes the frontend trigger-on-send flow:
- Sprint 1: Fast attach (3s SLO for file_attached)
- Sprint 2: Progress in chat (not stuck in composer)
- Sprint 3: Mode-aware send (trigger parsing/scoring on send)

---

## Next Steps

**Remaining Sprint 3 Story:**
- Story 18.3.2: Consult Mode document enrichment (backend)
- Story 18.3.3: Scoring Mode parsing (backend)

**Note:** Stories 18.3.2 and 18.3.3 are backend-focused and should be implemented by the backend-agent.

---

## Known Issues

None. All tests passing, no regressions detected.

---

## Design Rationale

### Why Skip waitForCompletion?

Old behavior:
```typescript
if (hasFiles) {
  attachments = await waitForCompletion(); // Waits for files to complete
}
```

Problem:
- `waitForCompletion()` waits for files in 'attached'/'parsing' to reach 'complete'
- User clicks send → waits 30+ seconds → timeout or success
- Defeats the purpose of trigger-on-send (should send immediately)

New behavior:
```typescript
if (hasFiles) {
  attachments = files.filter(f => f.fileId != null).map(...);
  // Send immediately with files that have fileId
}
```

Benefit:
- Send happens immediately
- Files with fileId are included
- Parsing/scoring continues in background
- User sees instant composer clear + response starts

### Why Use fileId as Readiness Indicator?

Files get `fileId` when backend emits `file_attached` event:
- Before `file_attached`: File has no fileId (pending/uploading/storing)
- After `file_attached`: File has fileId (attached/parsing/complete)

This makes fileId a perfect indicator:
- Has fileId → File is known to backend, can be referenced in message
- No fileId → File not yet registered, can't be included

### Why Allow Send During Parsing?

**Scenario:** User uploads scoring questionnaire
1. File attached after 3s (has fileId)
2. Parsing starts (takes 2 minutes)
3. User types "Score this" and clicks send

**Old behavior:** Send disabled for 2 minutes (parsing in progress)
**New behavior:** Send immediately, parsing continues

**Why this works:**
- Backend message handler checks if file needs parsing
- If parsing incomplete, backend triggers it (idempotent via `tryStartParsing`)
- Results arrive via `scoring_progress` → `scoring_complete` events
- User sees progress in chat stream, not stuck in composer

---

## Visual Flow

```
[User uploads file]
    ↓ (3 seconds - Sprint 1)
[File attached (fileId assigned)]
    ↓
[Send button ENABLED] ← Sprint 3
    ↓
[User clicks send] ← Immediate
    ↓
[Composer clears] ← Sprint 2
    ↓
[Progress appears in chat] ← Sprint 2
    ↓ (background)
[Parsing continues...]
    ↓
[Results arrive]
```

**Key point:** User can send as soon as file is attached (3s), not after parsing completes (2+ minutes).

---

**Implemented by:** Frontend Agent
**Reviewed by:** (Awaiting code-reviewer invocation)
**Date:** 2026-01-09
