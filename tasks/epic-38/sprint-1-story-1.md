# Story 38.1.1: Split ScoringExportService Helpers

## Description

Extract the response selection logic and narrative helper methods from `ScoringExportService.ts` (436 LOC) into a new `ScoringExportHelpers.ts` file. The service currently has 5 private helper methods (lines 241-435) that handle response selection, section-dimension mapping, solution type determination, fallback narratives, and sleep utility. Moving these reduces the service to ~200 LOC and makes room for ISO data fetching in Sprint 2. Zero behavioral change.

## Acceptance Criteria

- [ ] `ScoringExportHelpers.ts` created with 5 extracted functions
- [ ] `selectTopResponses()` exact logic from ScoringExportService lines 299-376
- [ ] `getSectionDimensionMapping()` exact logic from lines 382-395
- [ ] `determineSolutionType()` exact logic from lines 404-428
- [ ] `buildFallbackNarrative()` exact logic from lines 271-285
- [ ] `sleep()` exact logic from lines 433-435
- [ ] `ScoringExportService.ts` imports and delegates to the new helpers
- [ ] `ScoringExportService.ts` under 300 LOC after extraction
- [ ] All existing `ScoringExportService.test.ts` tests pass unchanged
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ScoringExportHelpers.ts

**File:** `packages/backend/src/application/services/ScoringExportHelpers.ts` (CREATE)

Convert instance methods to exported pure functions. The methods are already stateless (they only use their parameters, no `this` dependencies except `sleep` which is trivial).

```typescript
import { DimensionScoreData } from '../../domain/scoring/types.js';
import { AssessmentResultDTO, ResponseDTO } from '../../domain/scoring/dtos.js';
import { SolutionType } from '../../domain/scoring/rubric.js';

/**
 * Select top vendor responses for narrative evidence.
 * Implements tiered fallback: evidenceRefs -> section mapping -> even distribution.
 */
export function selectTopResponses(
  responses: ResponseDTO[],
  dimensionScores: DimensionScoreData[]
): ResponseDTO[] {
  // Exact logic from ScoringExportService lines 299-376
}

/**
 * Maps dimensions to questionnaire sections.
 */
export function getSectionDimensionMapping(): Record<string, number[]> {
  // Exact logic from lines 382-395
}

/**
 * Determine solution type from assessment solutionType string.
 */
export function determineSolutionType(solutionType: string | null): SolutionType {
  // Exact logic from lines 404-428
}

/**
 * Build fallback narrative when LLM generation fails.
 */
export function buildFallbackNarrative(result: AssessmentResultDTO): string {
  // Exact logic from lines 271-285
}

/**
 * Sleep utility for polling
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 2. Update ScoringExportService.ts

**File:** `packages/backend/src/application/services/ScoringExportService.ts` (MODIFY)

- Add import: `import { selectTopResponses, getSectionDimensionMapping, determineSolutionType, buildFallbackNarrative, sleep } from './ScoringExportHelpers.js';`
- Replace `this.selectTopResponses(...)` with `selectTopResponses(...)`
- Replace `this.getSectionDimensionMapping()` with `getSectionDimensionMapping()`
- Replace `this.determineSolutionType(...)` with `determineSolutionType(...)`
- Replace `this.buildFallbackNarrative(...)` with `buildFallbackNarrative(...)`
- Replace `this.sleep(...)` with `sleep(...)`
- Remove the 5 private method definitions (lines 241-435 approximately)
- Remove any imports that are only used by the extracted methods

### 3. Key Rules

- **Direct function copy**: All 5 functions are copied verbatim, just converted from instance methods to exported functions (remove `private` and `this` references).
- **No behavior changes**: Identical logic, parameters, return types, error handling.
- **Keep `ensureNarrative`** in the service -- it uses `this.assessmentResultRepository` and `this.narrativeGenerator` (DI dependencies).
- **Keep `getScoringData`** in the service -- it orchestrates the full data fetch pipeline.

## Files Touched

- `packages/backend/src/application/services/ScoringExportHelpers.ts` - CREATE (~160 LOC)
- `packages/backend/src/application/services/ScoringExportService.ts` - MODIFY (remove 5 methods, add import + delegation)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` - Should pass without changes (public API unchanged)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ScoringExportHelpers.test.ts`
  - Test `selectTopResponses` uses evidenceRefs when available
  - Test `selectTopResponses` falls back to section mapping when no evidenceRefs
  - Test `selectTopResponses` falls back to even distribution when < 10 selected
  - Test `selectTopResponses` truncates responses to 500 chars
  - Test `selectTopResponses` caps at 30 responses max
  - Test `getSectionDimensionMapping` returns correct section-to-dimension map
  - Test `determineSolutionType` returns correct SolutionType for valid inputs
  - Test `determineSolutionType` defaults to 'clinical_ai' when null
  - Test `determineSolutionType` defaults to 'clinical_ai' for invalid string
  - Test `buildFallbackNarrative` includes executiveSummary and keyFindings
  - Test `buildFallbackNarrative` handles missing executiveSummary
  - Test `sleep` resolves after specified ms

## Definition of Done

- [ ] `ScoringExportHelpers.ts` created with all 5 functions
- [ ] `ScoringExportService.ts` under 300 LOC
- [ ] All existing ScoringExportService tests pass (zero regressions)
- [ ] New helper tests written and passing
- [ ] No TypeScript errors
- [ ] No behavioral changes
