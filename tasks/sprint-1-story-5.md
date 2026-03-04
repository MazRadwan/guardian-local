# Story 40.1.5: Update Unit Tests for New Rubric

## Description

Update all test files affected by the rubric v1.1 changes: recalculate hardcoded
composite scores, update weight count assertions, remove zero-weight skip tests,
update version string references, and add sub-score validation for 5 new dimensions.

## Acceptance Criteria

- [ ] All hardcoded `compositeScore` values recalculated for v1.1 weights
- [ ] Weight count assertions updated from 5 to 10
- [ ] Zero-weight skip tests removed or inverted
- [ ] Version string `guardian-v1.0` updated to `guardian-v1.1` in ALL test files
- [ ] Sub-score validation tests added for 5 new dimensions
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Composite Score Recalculation

**Old calculation (v1.0, clinical_ai, all scores = 75):**
```
Risk dims: 75×0.40 + 75×0.20 + 75×0.15 = 56.25
Capability dims (inverted): (100-75)×0.15 + (100-75)×0.10 = 6.25
Total = 62.5 → rounds to 63
```

**New calculation (v1.1, clinical_ai, all scores = 75):**
```
Risk dims: 75×0.25 + 75×0.15 + 75×0.15 = 41.25
Capability dims (inverted=25): 25×0.10 + 25×0.10 + 25×0.05 + 25×0.05
  + 25×0.05 + 25×0.05 + 25×0.05 = 11.25
Total = 52.5 → rounds to 53
```

Note: v1.1 clinical_ai risk/cap split is 55/45 (vs v1.0 which was 75/25 with only 5
weighted dims). The composite changes from 63 (v1.0) to 53 (v1.1). Verify at
implementation time using the actual weight values from Story 40.1.2.

**Files with hardcoded compositeScore: 63:**
- `ScoringService.test.ts` line 56: `compositeScore: 63` fixture → recalculate
- `ScoringService.test.ts` line 277: progress message `'Risk assessment complete -- score: 63/100'` → recalculate
- `scoring-trigger.test.ts` line 226: `compositeScore: 63` in MockLLMClient → recalculate
- `scoring-trigger.test.ts` line 827: `.toBe(63)` assertion → recalculate

### 2. CompositeScoreValidator.test.ts Updates

**Line 262:** Change weight count assertion:
```typescript
// Before:
expect(nonZeroDims).toHaveLength(5);
// After:
expect(nonZeroDims).toHaveLength(10);
```

**Line 259:** Update comment: "only 5 dimensions" → "all 10 dimensions"

**Lines 89-115:** The capability dimension inversion test hardcodes expected composite
based on old weights. Recalculate with v1.1 weights. Also update inline comments at
lines 91-108 that list old weight values (40, 20, 15, etc.).

**Lines 200-210:** The "missing weighted dimension" test uses vendor_capability as an
example of a zero-weight dimension. After v1.1, vendor_capability has weight > 0.
Update to test a different scenario or remove.

### 3. SubScoreValidator.test.ts Updates

**Lines 140-157:** Remove or update the "should skip dimensions without rules" test
that uses vendor_capability as an example. After v1.1, all 10 dimensions have rules.
Test with a hypothetical unknown dimension instead.

### 4. ScoringPayloadValidator.test.ts Updates

Update any assertions that reference zero-weight dimensions being optional or skippable.
After v1.1, all 10 dimensions are weighted and have sub-score rules.

### 5. subScoreRules.test.ts Updates

This file EXISTS. Remove the "if exists" qualifier. Specific updates:
- Line 11: Update description from "5 primary scored dimensions" → "all 10 dimensions"
- Lines 20-27: Remove assertions that vendor_capability, ai_transparency, etc. are NOT in SUB_SCORE_RULES
- Lines 117-119: `getExpectedMaxTotal('vendor_capability')` change from `toBeUndefined()` → `toBe(100)`
- Line 131: `getValidSubScoreNames('vendor_capability')` change from `toBeUndefined()` → defined with correct names

### 6. Version String Updates (Full Blast Radius)

**[Architect + Spec review finding]:** The version string `guardian-v1.0` appears in
**40+ occurrences across 9+ test files**, not the 7 originally listed.

**MUST grep before updating:**
```bash
grep -r "guardian-v1.0" packages/backend/__tests__/
```

**Files with hardcoded `'guardian-v1.0'` string literals that WILL break:**
- `ScoringService.test.ts` - fixture
- `scoring-trigger.test.ts` - mock
- `scoring-rehydration.test.ts` - fixture
- `scoringPrompt.test.ts` line 56 - `expect(systemPrompt).toContain('guardian-v1.0')`
- `ExportNarrativePromptBuilder.test.ts` line 36 - hardcoded assertion
- `DrizzleAssessmentResultRepository.test.ts` - 24 occurrences in fixtures
- `DrizzleResponseRepository.test.ts` - 3 occurrences
- `TransactionalScoreStorage.test.ts` - 6 occurrences
- `export-iso.test.ts` - 1 occurrence
- `export-snapshots.test.ts` + snapshot - 2 occurrences

**Note on repository test fixtures:** `DrizzleAssessmentResultRepository.test.ts` etc.
construct data records for persistence tests. They should use `RUBRIC_VERSION` import
rather than hardcoded strings where possible, but some fixtures intentionally test
storage of specific version values. Use judgment: if the test is checking "can I store
and retrieve version X", keep the literal. If it's a mock payload, use the import.

### 7. scoring-rehydration.test.ts

**Pre-existing bug:** `dimension: 'data_governance'` at lines 158, 207, 209 is not a valid
dimension. Fix to use a real dimension name (e.g., `privacy_risk`).

**[Architect review finding]:** Same bug exists in `ScoringRehydrationController.test.ts`
at line 33. Fix both files.

### 8. scoringPrompt.test.ts

**[Spec review finding]:** Lines 39-45 assert only 5 dimension rubric criteria:
```typescript
expect(systemPrompt).toContain('### CLINICAL RISK');
// ... only 5 dimensions
```
Add 5 new assertions for the new dimensions.

### 9. golden-sample-regression.test.ts User Prompt Assertions

**[Architect + Spec review finding]:** Lines 183-186 hardcode weight percentages:
```typescript
expect(prompt).toContain('Clinical Risk: 40%');
expect(prompt).toContain('Privacy Risk: 20%');
expect(prompt).toContain('Security Risk: 15%');
```
Update to v1.1 weight values. The user prompt snapshot at line 230 will also need
regeneration (covered in Story 40.1.7).

## Files Touched

**Scoring domain tests:**
- `packages/backend/__tests__/unit/domain/scoring/CompositeScoreValidator.test.ts` - MODIFY
- `packages/backend/__tests__/unit/domain/scoring/SubScoreValidator.test.ts` - MODIFY
- `packages/backend/__tests__/unit/domain/scoring/ScoringPayloadValidator.test.ts` - MODIFY
- `packages/backend/__tests__/unit/domain/scoring/subScoreRules.test.ts` - MODIFY

**Service tests:**
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - MODIFY

**Integration tests:**
- `packages/backend/__tests__/integration/scoring-trigger.test.ts` - MODIFY
- `packages/backend/__tests__/integration/scoring-rehydration.test.ts` - MODIFY (fix data_governance)
- `packages/backend/__tests__/integration/golden-sample-regression.test.ts` - MODIFY (weight % assertions)

**Prompt tests:**
- `packages/backend/__tests__/unit/infrastructure/ai/prompts/scoringPrompt.test.ts` - MODIFY (add 5 dim assertions, version string)
- `packages/backend/__tests__/unit/infrastructure/ai/ExportNarrativePromptBuilder.test.ts` - MODIFY (version string)

**Infrastructure/controller tests:**
- `packages/backend/__tests__/unit/infrastructure/http/ScoringRehydrationController.test.ts` - MODIFY (fix data_governance)

**Repository tests (version string only):**
- `packages/backend/__tests__/integration/repositories/DrizzleAssessmentResultRepository.test.ts` - MODIFY (24 occurrences)
- `packages/backend/__tests__/integration/repositories/DrizzleResponseRepository.test.ts` - MODIFY
- `packages/backend/__tests__/integration/repositories/TransactionalScoreStorage.test.ts` - MODIFY

**Export tests (version string only):**
- `packages/backend/__tests__/integration/export-iso.test.ts` - MODIFY
- `packages/backend/__tests__/unit/infrastructure/export/export-snapshots.test.ts` - MODIFY (+ snapshot)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story. The Definition of Done is that all tests pass:

- [ ] `pnpm --filter @guardian/backend test:unit` passes
- [ ] `pnpm --filter @guardian/backend test:integration` passes

## Definition of Done

- [ ] All composite score values recalculated correctly
- [ ] Weight count assertion updated to 10
- [ ] Zero-weight skip tests removed/updated
- [ ] Version strings updated to guardian-v1.1 in ALL affected files
- [ ] data_governance bug fixed in both rehydration test files
- [ ] scoringPrompt.test.ts has 10 dimension assertions
- [ ] golden-sample weight percentage assertions updated
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No TypeScript errors
