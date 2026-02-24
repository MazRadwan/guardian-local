# Story 39.2.2: Fix `% 500` Progress Bug in ScoringLLMService

## Description

Fix the scoring stream progress reporting bug in `ScoringLLMService.scoreWithClaude()`. The current code at line 114 uses `narrativeReport.length % 500 === 0` to trigger progress messages, which fires near-randomly because streaming chunks have variable sizes. Replace with threshold-based delta reporting that fires when the accumulated text crosses 500-character thresholds.

This was identified as a Codex catch -- the modulo approach means progress messages fire unpredictably (sometimes rapidly, sometimes not at all for long stretches).

## Acceptance Criteria

- [ ] Replace `narrativeReport.length % 500 === 0` with threshold-based delta: fires when `length - lastReportedLength >= 500`
- [ ] Progress messages fire at predictable intervals (~every 500 chars of narrative)
- [ ] `onMessage` callback receives updated progress percentage (interpolated between 60% and 85%)
- [ ] No duplicate progress messages for the same threshold
- [ ] Scoring behavior unchanged (narrative accumulation, tool payload extraction)
- [ ] Under 300 LOC (ScoringLLMService.ts is currently 139 LOC)
- [ ] No TypeScript errors

## Technical Approach

### 1. Fix in ScoringLLMService.scoreWithClaude()

**File:** `packages/backend/src/application/services/ScoringLLMService.ts`

Replace the onTextDelta handler:

```typescript
// Current (line 112-116):
onTextDelta: (delta) => {
  narrativeReport += delta;
  if (narrativeReport.length % 500 === 0) {
    onMessage('Generating risk assessment...');
  }
},

// Fixed:
let lastReportedLength = 0;
onTextDelta: (delta) => {
  narrativeReport += delta;
  if (narrativeReport.length - lastReportedLength >= 500) {
    lastReportedLength = narrativeReport.length;
    onMessage('Generating risk assessment...');
  }
},
```

### 2. Progress Percentage Interpolation (Optional Enhancement)

The scoring stream progress should interpolate between 60% and 85% based on expected narrative length. Typical narratives are ~5000-8000 chars:

```typescript
const EXPECTED_NARRATIVE_LENGTH = 6000; // typical scoring narrative
const SCORING_PROGRESS_START = 60;
const SCORING_PROGRESS_END = 85;

onTextDelta: (delta) => {
  narrativeReport += delta;
  if (narrativeReport.length - lastReportedLength >= 500) {
    lastReportedLength = narrativeReport.length;
    const fraction = Math.min(narrativeReport.length / EXPECTED_NARRATIVE_LENGTH, 1);
    const progress = SCORING_PROGRESS_START + fraction * (SCORING_PROGRESS_END - SCORING_PROGRESS_START);
    onMessage('Generating risk assessment...');
    // Note: onMessage only passes string; progress is set by ScoringService
    // which wraps onMessage in onProgress({ status: 'scoring', message, progress })
  }
},
```

**Decision:** The `onMessage` callback currently only accepts a string. To pass progress percentage, either:
- (a) Change `onMessage` signature to include progress (small interface change), or
- (b) Keep string-only and let ScoringService interpolate based on time or call count.

Recommend option (b) for Phase 1 parallel safety. Option (a) would modify `ScoringService.ts` (the call site wrapping `onMessage`), creating an undeclared cross-story dependency with Story 39.2.1 which also modifies `ScoringService.ts` in the same parallel phase. Option (b) avoids this conflict entirely.

**IMPORTANT (spec review finding):** Do NOT implement option (a) unless Story 39.2.1 has already landed. If option (a) is desired, move this story to Phase 2 (after 39.2.1) to avoid the ScoringService.ts file conflict.

## Files Touched

- `packages/backend/src/application/services/ScoringLLMService.ts` - MODIFY (fix onTextDelta handler, ~10 lines changed)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - Tests that assert onMessage call count or timing may need adjustment. The mock `onTextDelta` firing pattern changes from modulo-based to threshold-based.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `ScoringLLMService.test.ts`:
  - Test onMessage fires after every 500 chars (not on modulo match)
  - Test onMessage fires exactly once for 500-999 char narrative
  - Test onMessage fires twice for 1000-1499 char narrative
  - Test onMessage does not fire for <500 char narrative
  - Test variable chunk sizes still produce consistent firing pattern
  - Test with realistic chunk simulation: [10, 200, 3, 287, 500, 1] chars

## Definition of Done

- [ ] `% 500` modulo replaced with threshold-based delta
- [ ] Progress fires predictably every ~500 chars
- [ ] Existing ScoringLLMService tests updated
- [ ] All tests passing
- [ ] ScoringLLMService.ts still under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
