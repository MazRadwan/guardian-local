# Story 39.2.3: Expand Frontend Progress Rendering

## Description

Fix the `MessageList.tsx` status filter that only renders progress for `parsing|scoring` statuses. New stages like `validating` and `storage` would be invisible to users. Also update `ProgressMessage.tsx` to handle the richer progress percentage and show a more descriptive progress bar.

This was identified as a Codex catch -- line 325 of MessageList.tsx hardcodes `scoringProgress.status === 'parsing' || scoringProgress.status === 'scoring'`.

## Acceptance Criteria

- [ ] `MessageList.tsx` renders progress for ALL active statuses (not just `parsing|scoring`)
- [ ] Active statuses: `uploading`, `parsing`, `scoring`, `validating` (all non-terminal)
- [ ] Terminal statuses (`idle`, `complete`, `error`) do not render the progress indicator
- [ ] `ProgressMessage.tsx` displays progress bar when `progress` percentage is provided
- [ ] Progress bar fills smoothly based on percentage (already implemented, just verify it works with new values)
- [ ] No behavioral changes to scoring result card or error handling
- [ ] No TypeScript errors

## Technical Approach

### 1. Fix MessageList.tsx Status Filter

**File:** `apps/web/src/components/chat/MessageList.tsx`

Replace the hardcoded status check:

```typescript
// Current (line 325):
{scoringProgress && (scoringProgress.status === 'parsing' || scoringProgress.status === 'scoring') && (

// Fixed -- show for all non-terminal statuses:
{scoringProgress && scoringProgress.status !== 'idle' && scoringProgress.status !== 'complete' && scoringProgress.status !== 'error' && (
```

This approach is future-proof -- any new status values will automatically be rendered. Only terminal states are excluded.

### 2. Verify ProgressMessage.tsx

**File:** `apps/web/src/components/chat/ProgressMessage.tsx`

The existing `ProgressMessage` component already handles:
- Progress bar rendering when `progress` is defined (line 130-142)
- Status-based icon selection (Loader2 spinner, Clock, CheckCircle)
- Alternating wait message after 5 seconds

Verify it works correctly with the new granular progress percentages (5%, 10%, 15%, 50%, 55%, 60%, 90%, 95%, 100%). The progress bar should fill smoothly. No code changes expected unless the component has issues with rapid updates.

### 3. Frontend ScoringStatus Type

**File:** `apps/web/src/types/scoring.ts` (or wherever `ScoringStatus` is defined in frontend)

Verify the frontend `ScoringStatus` type includes `validating`. The backend type at `packages/backend/src/domain/scoring/types.ts:76-83` includes: `idle | uploading | parsing | scoring | validating | complete | error`. The frontend must match.

## Files Touched

- `apps/web/src/components/chat/MessageList.tsx` - MODIFY (fix status filter, ~2 lines changed)
- `apps/web/src/components/chat/ProgressMessage.tsx` - VERIFY (may not need changes)

## Tests Affected

Existing tests that may need updates:
- `apps/web/src/components/chat/__tests__/MessageList.test.tsx` - If tests assert progress visibility for specific statuses, they need to include `validating` status.
- `apps/web/src/components/chat/__tests__/ProgressMessage.test.tsx` - May need new test cases for `validating` status rendering.

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] Update/add `MessageList.test.tsx`:
  - Test progress indicator visible when status is `parsing`
  - Test progress indicator visible when status is `scoring`
  - Test progress indicator visible when status is `validating`
  - Test progress indicator visible when status is `uploading`
  - Test progress indicator hidden when status is `idle`
  - Test progress indicator hidden when status is `complete`
  - Test progress indicator hidden when status is `error`

- [ ] Update/add `ProgressMessage.test.tsx`:
  - Test progress bar renders with percentage value
  - Test progress bar fills to correct width (e.g., 50% width for progress=50)
  - Test handles rapid progress updates without flickering

- [ ] VERIFY `RotatingStatus.tsx` handles all ScoringStatus values (Codex finding)

- [ ] Add `useWebSocketEvents` throttling test (Codex finding):
  - Test 500ms throttle collapses rapid progress updates correctly
  - Test no progress messages are silently dropped (last message always displayed)
  - Test dense progress bursts (11 stages firing in <2 sec for regex path) don't cause UI regressions

## QA Verification

**Route:** N/A (progress is transient during scoring -- cannot be reliably triggered in static QA)
**Manual verification:** Trigger a scoring run and observe progress messages transition through all stages in the chat.

## Definition of Done

- [ ] MessageList.tsx renders progress for all non-terminal statuses
- [ ] Existing tests updated
- [ ] New test cases for `validating` status
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No lint errors
