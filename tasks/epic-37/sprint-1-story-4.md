# Story 37.1.4: Split scoringPrompt.ts - Extract ISO Prompt Placeholder

## Description

`scoringPrompt.ts` is currently 348 LOC (over the 300 LOC limit). Extract the ISO-related prompt building logic into a separate `scoringPrompt.iso.ts` file. For this sprint, the ISO file contains a placeholder function that returns an empty string (no ISO content yet). The main file calls it, establishing the integration point for Sprint 6. This brings `scoringPrompt.ts` under 300 LOC.

## Acceptance Criteria

- [ ] `scoringPrompt.iso.ts` created with `buildISOCatalogSection()` and `buildISOApplicabilitySection()` placeholder functions
- [ ] `buildISOCatalogSection()` returns empty string (placeholder for Sprint 6)
- [ ] `buildISOApplicabilitySection()` returns empty string (placeholder for Sprint 6)
- [ ] `scoringPrompt.ts` imports and calls the ISO functions in the appropriate locations
- [ ] `buildScoringSystemPrompt()` appends ISO catalog section (currently empty string)
- [ ] `buildScoringUserPrompt()` appends ISO applicability section (currently empty string)
- [ ] `scoringPrompt.ts` is under 300 LOC
- [ ] No behavioral change (empty strings appended = no output change)
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ISO Prompt File

**File:** `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.iso.ts`

```typescript
/**
 * ISO Compliance Prompt Sections
 *
 * Builds ISO-related prompt sections for scoring context injection.
 * Sprint 1: Placeholder functions (return empty string).
 * Sprint 6: Will query DB for ISO controls and build prompt sections.
 */

/**
 * Build the static ISO control catalog for the system prompt.
 * This section is cacheable (same across all assessments).
 *
 * @returns ISO catalog prompt section (empty until Sprint 6)
 */
export function buildISOCatalogSection(): string {
  // Sprint 6: Will inject ~30 dimension-mapped ISO controls from DB
  // Format: clause_ref + domain + title + interpretive criteria
  return '';
}

/**
 * Build per-assessment ISO applicability section for the user prompt.
 * This section varies per assessment (dynamic, not cached).
 *
 * @param _dimensions - The dimensions being scored (used to filter applicable controls)
 * @returns ISO applicability prompt section (empty until Sprint 6)
 */
export function buildISOApplicabilitySection(_dimensions?: string[]): string {
  // Sprint 6: Will filter controls by dimension relevance
  // and inject applicable controls into user prompt
  return '';
}
```

### 2. Update scoringPrompt.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts`

Add import at top:
```typescript
import { buildISOCatalogSection, buildISOApplicabilitySection } from './scoringPrompt.iso.js';
```

In `buildScoringSystemPrompt()`, after the output format section (before the closing backtick on line ~299):
```typescript
// Append ISO catalog section (populated in Sprint 6)
const isoCatalog = buildISOCatalogSection();

return `...existing prompt...${isoCatalog ? `\n\n${isoCatalog}` : ''}`;
```

In `buildScoringUserPrompt()`, before the final "Please analyze" line (line ~347):
```typescript
// Append ISO applicability section (populated in Sprint 6)
const isoApplicability = buildISOApplicabilitySection();
// Only append if non-empty
const isoSection = isoApplicability ? `\n\n${isoApplicability}` : '';
```

### 3. LOC Reduction Plan (348 → under 300)

Current `scoringPrompt.ts`: 348 LOC. Target: under 300 LOC.

**Step 1: Extract ISO placeholder** (~-15 LOC net after import+calls)
- Move future ISO logic to `scoringPrompt.iso.ts`
- Result: ~333 LOC (still over 300)

**Step 2: Extract helper functions** (~-40 LOC)
These extractions go into a new `scoringPrompt.helpers.ts` file (~50 LOC):

1. **`buildDimensionList()`** — Extract the dimension list builder (lines 23-29, ~7 LOC) that creates the numbered dimension list string
2. **`buildDisqualifyingList()`** — Extract the disqualifying factors list builder (lines ~31-45, ~15 LOC)
3. **`formatResponsesForPrompt()`** — Extract the response formatting loop from `buildScoringUserPrompt()` (lines ~319-340, ~20 LOC) that formats vendor responses into the prompt string

**Step 3: Verify**
- `scoringPrompt.ts` should land at ~293 LOC (under 300)
- `scoringPrompt.helpers.ts` should be ~50 LOC
- `scoringPrompt.iso.ts` should be ~30 LOC
- All 3 files well under limits

**MANDATORY**: The implementer MUST achieve under 300 LOC for `scoringPrompt.ts`. The Step 2 extractions are required, not optional. If different functions are extracted instead, that's fine as long as the file ends under 300 LOC.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.iso.ts` - CREATE (~30 LOC)
- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.helpers.ts` - CREATE (~50 LOC, extracted helper functions)
- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` - MODIFY (add imports, delegate to helpers + ISO calls)
- `packages/backend/__tests__/unit/infrastructure/ai/prompts/scoringPrompt.test.ts` - CREATE (~60 LOC, prompt stability regression tests)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - Should still pass since prompt output is unchanged (empty strings appended)
- Note: `scoringContract.test.ts` validates tool schema vs payload validator, NOT prompt output. The regression tests below directly validate prompt stability.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/scoringPrompt.iso.test.ts`
  - Test `buildISOCatalogSection()` returns empty string
  - Test `buildISOApplicabilitySection()` returns empty string
  - Test `buildISOApplicabilitySection()` accepts optional dimensions array
- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/scoringPrompt.test.ts` (prompt stability regression)
  - Test `buildScoringSystemPrompt()` output contains all 10 dimension headings (no content lost during extraction)
  - Test `buildScoringSystemPrompt()` output contains disqualifying factors section
  - Test `buildScoringSystemPrompt()` output contains output format instructions
  - Test `buildScoringUserPrompt()` output contains vendor info, responses, and composite score weighting
  - These tests verify the no-behavior-change claim and guard against regressions from helper extraction
- [ ] Verify existing `scoringContract.test.ts` still passes (schema/validator alignment unchanged)

## Definition of Done

- [ ] `scoringPrompt.iso.ts` created with placeholder functions
- [ ] `scoringPrompt.ts` imports and calls ISO functions
- [ ] `scoringPrompt.ts` is under 300 LOC (MANDATORY — extract helpers if needed)
- [ ] No behavioral change (prompt output identical)
- [ ] Unit tests written and passing
- [ ] No TypeScript errors
