# Story 39.2.1: Granular Progress Events in ScoringService

## Description

Add granular `onProgress()` calls at each stage of `ScoringService.score()` to replace the current 2 generic messages that cause minutes of dead air. Uses the existing `ScoringProgressEvent` infrastructure -- no new event types needed, just more calls with better messages and percentage values.

## Acceptance Criteria

- [ ] Progress emitted at each of the following stages with percentage values:
  - Start (5%): "Processing uploaded document..."
  - Text extraction (10%): "Extracting text from document..."
  - Format detection (15%): "Detected Guardian questionnaire format" or "Processing document with AI..."
  - Parse complete (50%): "Found N of M responses"
  - ISO fetch (55%): "Loading compliance controls..."
  - Scoring start (60%): "Analyzing vendor responses against risk rubric..."
  - Validation (90%): "Validating scoring results..."
  - Storage (95%): "Storing assessment results..."
  - Complete (100%): "Risk assessment complete -- score: X/100"
- [ ] Each `onProgress` call includes the `progress` percentage field
- [ ] Messages are user-friendly (not technical/debug)
- [ ] Existing progress messages replaced (not duplicated)
- [ ] No behavioral changes to scoring logic
- [ ] Under 300 LOC (ScoringService.ts is currently 297 LOC)

## Technical Approach

### 1. Update onProgress Calls in ScoringService.score()

**File:** `packages/backend/src/application/services/ScoringService.ts`

Replace existing generic messages with granular ones:

```typescript
// Current (line 62):
onProgress({ status: 'parsing', message: 'Retrieving uploaded document...' });
// Keep as-is but add progress: 5

// Current (line 77):
onProgress({ status: 'parsing', message: 'Extracting responses from document...' });
// Replace with:
onProgress({ status: 'parsing', message: 'Extracting text from document...', progress: 10 });

// After GUARDIAN_MARKERS check (new):
onProgress({ status: 'parsing', message: 'Detected Guardian questionnaire format', progress: 15 });
// OR for Claude path:
onProgress({ status: 'parsing', message: 'Processing document with AI...', progress: 15 });

// Current (line 185):
onProgress({ status: 'parsing', message: 'Storing extracted responses...' });
// Replace with:
onProgress({ status: 'parsing', message: `Found ${parseResult.parsedQuestionCount} of ${parseResult.expectedQuestionCount ?? '?'} responses`, progress: 50 });

// Current (line 194):
onProgress({ status: 'scoring', message: 'Analyzing scoring...' });
// Split into ISO fetch + scoring start:
onProgress({ status: 'scoring', message: 'Loading compliance controls...', progress: 55 });
// ... after ISO fetch:
onProgress({ status: 'scoring', message: 'Analyzing vendor responses against risk rubric...', progress: 60 });

// Current (line 220):
onProgress({ status: 'validating', message: 'Validating scoring results...' });
// Add progress: 90

// Current (line 237):
onProgress({ status: 'validating', message: 'Storing assessment results...' });
// Add progress: 95

// Current (line 260):
onProgress({ status: 'complete', message: 'Scoring complete!' });
// Replace with score in message:
onProgress({ status: 'complete', message: `Risk assessment complete -- score: ${compositeScore}/100`, progress: 100 });
```

### 2. Composite Score for Final Message

The composite score comes from `validationResult.sanitized.compositeScore`. Access it after validation:

```typescript
const compositeScore = validationResult.sanitized!.compositeScore;
onProgress({ status: 'complete', message: `Risk assessment complete -- score: ${compositeScore}/100`, progress: 100 });
```

## Files Touched

- `packages/backend/src/application/services/ScoringService.ts` - MODIFY (update onProgress calls, ~15 lines changed)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - Tests that assert specific progress messages or call counts will need updating. The `onProgress` mock assertions need to match new message strings and progress values.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `ScoringService.test.ts` progress assertions:
  - Test onProgress called with progress: 5 at start
  - Test onProgress called with progress: 10 for text extraction
  - Test onProgress called with progress: 50 after parse complete (with response count)
  - Test onProgress called with progress: 55 for ISO fetch
  - Test onProgress called with progress: 60 for scoring start
  - Test onProgress called with progress: 90 for validation
  - Test onProgress called with progress: 95 for storage
  - Test onProgress called with progress: 100 at complete (with composite score)
  - Test progress values are monotonically increasing

## Definition of Done

- [ ] All 9 granular progress messages with percentages in ScoringService.score()
- [ ] Existing ScoringService tests updated for new messages/progress values
- [ ] All tests passing
- [ ] ScoringService.ts still under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
