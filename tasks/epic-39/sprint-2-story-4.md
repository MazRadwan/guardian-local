# Story 39.2.4: Add Extraction Progress Events

## Description

Add per-section progress events during the regex extraction phase. When the regex extractor processes a Guardian questionnaire, emit progress messages like "Matching responses to questionnaire... section X of Y" as each section is processed. This replaces the dead air that previously occurred during the 5-minute Claude extraction.

Also thread the `onProgress` callback through `DocumentParserService.parseForResponses()` so the extraction phase can emit granular progress.

## Acceptance Criteria

- [ ] `DocumentParserService.parseForResponses()` accepts an optional `onProgress` callback parameter
- [ ] Regex extraction emits per-section progress: "Matching responses... section X of Y"
- [ ] Progress percentage interpolated between 15% and 50% during extraction (regex is fast, Claude is slow)
- [ ] Claude fallback path emits: "Processing document with AI..." at 15% (single message, since Claude is opaque)
- [ ] `ScoringService.score()` passes its `onProgress` callback to `documentParser.parseForResponses()`
- [ ] `IScoringDocumentParser` interface updated with optional `onProgress` in `ScoringParseOptions`
- [ ] No behavioral changes to extraction logic
- [ ] No TypeScript errors

## Dependencies

- **39.2.1** (Granular Progress Events in ScoringService) — MUST complete first. Story 39.2.1 adds the `onProgress` calls to `ScoringService.score()`. This story (39.2.4) threads that same callback through `DocumentParserService.parseForResponses()` so extraction can emit per-section progress. Both stories modify `ScoringService.ts` — 39.2.1 adds progress calls, 39.2.4 passes `onProgress` into parseForResponses options.

## Technical Approach

### 1. Update IScoringDocumentParser Interface

**File:** `packages/backend/src/application/interfaces/IScoringDocumentParser.ts`

Add `onProgress` to `ScoringParseOptions`:

```typescript
export interface ScoringParseOptions extends ParseOptions {
  // ... existing fields ...
  /** Progress callback for granular extraction updates.
   *  Uses ScoringStatus type for type safety (Codex finding: raw string is too loose). */
  onProgress?: (event: { status: ScoringStatus; message: string; progress?: number }) => void;
}
```

### 2. Thread onProgress Through ScoringService

**File:** `packages/backend/src/application/services/ScoringService.ts`

Pass onProgress to parseForResponses:

```typescript
const parseOptions: ScoringParseOptions = {
  expectedAssessmentId: inputAssessmentId,
  minConfidence: 0.7,
  abortSignal: abortController.signal,
  onProgress: (event) => onProgress({
    status: event.status,  // already typed as ScoringStatus
    message: event.message,
    progress: event.progress,
  }),
};
```

### 3. Emit Progress in DocumentParserService

**File:** `packages/backend/src/infrastructure/ai/DocumentParserService.ts`

In the regex path:
```typescript
// After text extraction:
options?.onProgress?.({ status: 'parsing', message: 'Extracting text from document...', progress: 10 });

// After GUARDIAN_MARKERS detection:
options?.onProgress?.({ status: 'parsing', message: 'Detected Guardian questionnaire format', progress: 15 });

// During regex extraction (per section):
// Get unique section numbers from extraction, emit progress for each
const sections = [...new Set(responses.map(r => r.sectionNumber))].sort();
for (const [i, section] of sections.entries()) {
  const sectionProgress = 15 + Math.round((i / sections.length) * 35);  // 15% -> 50%
  options?.onProgress?.({
    status: 'parsing',
    message: `Matching responses... section ${i + 1} of ${sections.length}`,
    progress: sectionProgress,
  });
}
```

In the Claude fallback path:
```typescript
options?.onProgress?.({ status: 'parsing', message: 'Processing document with AI...', progress: 15 });
// Claude extraction is opaque -- no further progress until complete
```

## Files Touched

- `packages/backend/src/application/interfaces/IScoringDocumentParser.ts` - MODIFY (add onProgress to ScoringParseOptions)
- `packages/backend/src/application/services/ScoringService.ts` - MODIFY (pass onProgress to parseForResponses)
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - MODIFY (emit progress events during extraction)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - May need to verify onProgress is passed to parseForResponses in parseOptions.
- `packages/backend/__tests__/unit/DocumentParserService.test.ts` - May need to verify progress events emitted during extraction.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Test onProgress called during regex extraction with per-section messages
- [ ] Test progress percentages interpolated between 15% and 50%
- [ ] Test Claude fallback emits single "Processing document with AI..." message
- [ ] Test onProgress is optional (no crash when not provided)
- [ ] Test ScoringService passes onProgress to parseForResponses

## Definition of Done

- [ ] Per-section progress during regex extraction
- [ ] onProgress threaded from ScoringService through DocumentParserService
- [ ] Claude fallback emits appropriate progress message
- [ ] IScoringDocumentParser interface updated
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No lint errors
