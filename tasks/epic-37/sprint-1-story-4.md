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

### 3. LOC Impact

Current `scoringPrompt.ts`: 348 LOC
- Extract ~20 LOC of future ISO logic to placeholder file
- Add ~5 LOC of imports + calls
- Net reduction: ~15 LOC (to ~333 LOC)

**NOTE**: The 348 LOC includes the template literal string which is dense. The real reduction comes from the fact that when ISO content is added in Sprint 6, it goes into `scoringPrompt.iso.ts` instead of `scoringPrompt.ts`. The file split prevents future growth.

If `scoringPrompt.ts` is still marginally over 300 LOC, extract the `buildScoringUserPrompt` helper logic (weight formatting, response formatting) into inline helper functions in the same file to reduce nesting depth. Alternatively, extract the disqualifying factors list building and dimension list building into small helper functions at the bottom of the file.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.iso.ts` - CREATE (~30 LOC)
- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` - MODIFY (add import, add ISO section calls)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - Should still pass since prompt output is unchanged (empty strings appended)
- No other tests directly test `scoringPrompt.ts` functions (they test via ScoringPromptBuilder which delegates)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/scoringPrompt.iso.test.ts`
  - Test `buildISOCatalogSection()` returns empty string
  - Test `buildISOApplicabilitySection()` returns empty string
  - Test `buildISOApplicabilitySection()` accepts optional dimensions array
- [ ] Verify existing `scoringContract.test.ts` still passes (prompt content unchanged)

## Definition of Done

- [ ] `scoringPrompt.iso.ts` created with placeholder functions
- [ ] `scoringPrompt.ts` imports and calls ISO functions
- [ ] `scoringPrompt.ts` is under 300 LOC (or established clear split point for Sprint 6)
- [ ] No behavioral change (prompt output identical)
- [ ] Unit tests written and passing
- [ ] No TypeScript errors
