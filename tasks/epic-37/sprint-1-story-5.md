# Story 37.1.5: Extract Sub-Score Validation to SubScoreValidator

## Description

Extract the sub-score validation logic from `ScoringPayloadValidator.ts` (275 LOC) into a new `SubScoreValidator`. This creates space for ISO + confidence validation to be added in Sprint 6 without exceeding 300 LOC. The sub-score validation methods (lines 189-271, ~82 LOC) move to the new file, and `ScoringPayloadValidator` delegates to it.

## Acceptance Criteria

- [ ] `SubScoreValidator.ts` created with `validateAllSubScores()` and `validateDimensionSubScores()` methods
- [ ] Methods are exact logic from ScoringPayloadValidator lines 189-271
- [ ] `ScoringPayloadValidator.ts` delegates sub-score validation to `SubScoreValidator`
- [ ] `ScoringPayloadValidator.ts` is under 200 LOC (target: ~195 LOC, leaving room for ISO additions in Sprint 6)
- [ ] `SubScoreValidator.ts` is under 120 LOC
- [ ] Singleton export pattern preserved (`scoringPayloadValidator` export)
- [ ] No behavioral change
- [ ] All existing ScoringPayloadValidator tests pass

## Technical Approach

### 1. Create SubScoreValidator

**File:** `packages/backend/src/domain/scoring/SubScoreValidator.ts`

```typescript
import { RiskDimension } from '../types/QuestionnaireSchema';
import { SUB_SCORE_RULES, getValidSubScoreNames } from './subScoreRules';

/**
 * Validates sub-scores within dimension findings.
 * Produces SOFT WARNINGS only (does not reject payloads).
 *
 * Extracted from ScoringPayloadValidator to keep files under 300 LOC
 * and create space for ISO + confidence validation.
 */
export class SubScoreValidator {
  /**
   * Validate sub-scores across all dimension scores (soft warnings only).
   * Returns warnings for invalid sub-score names, values, or sum mismatches.
   *
   * Exact logic from ScoringPayloadValidator lines 189-213.
   */
  validateAllSubScores(dimensionScores: unknown[]): string[] {
    const warnings: string[] = [];

    for (let i = 0; i < dimensionScores.length; i++) {
      const ds = dimensionScores[i] as Record<string, unknown> | null;
      if (!ds || typeof ds !== 'object') continue;

      const dimension = ds.dimension as RiskDimension;
      const findings = ds.findings as Record<string, unknown> | undefined;
      if (!findings || typeof findings !== 'object') continue;

      const subScores = findings.subScores as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(subScores)) continue;

      const dimensionWarnings = this.validateDimensionSubScores(
        dimension,
        ds.score as number,
        subScores,
        i
      );
      warnings.push(...dimensionWarnings);
    }

    return warnings;
  }

  /**
   * Validate sub-scores for a single dimension against rubric rules.
   *
   * Exact logic from ScoringPayloadValidator lines 218-271.
   */
  private validateDimensionSubScores(
    dimension: RiskDimension,
    dimensionScore: number,
    subScores: Array<Record<string, unknown>>,
    index: number
  ): string[] {
    // ... exact copy from ScoringPayloadValidator
  }
}
```

### 2. Update ScoringPayloadValidator

**File:** `packages/backend/src/domain/scoring/ScoringPayloadValidator.ts`

Changes:
1. Add import: `import { SubScoreValidator } from './SubScoreValidator.js';`
2. Add instance: `private subScoreValidator = new SubScoreValidator();`
3. Replace lines 77-80 (the sub-score validation call in `validate()`):

```typescript
// BEFORE:
if (Array.isArray(p.dimensionScores)) {
  const subScoreWarnings = this.validateAllSubScores(p.dimensionScores);
  warnings.push(...subScoreWarnings);
}

// AFTER:
if (Array.isArray(p.dimensionScores)) {
  const subScoreWarnings = this.subScoreValidator.validateAllSubScores(p.dimensionScores);
  warnings.push(...subScoreWarnings);
}
```

4. Remove these methods from ScoringPayloadValidator:
   - `validateAllSubScores()` (lines 189-213)
   - `validateDimensionSubScores()` (lines 218-271)

5. Remove import of `SUB_SCORE_RULES` and `getValidSubScoreNames` from ScoringPayloadValidator (moved to SubScoreValidator).

### 3. LOC Impact

Current `ScoringPayloadValidator.ts`: 275 LOC
- Remove ~82 LOC (two methods)
- Add ~3 LOC (import + instance + no other changes)
- Result: ~196 LOC (well under 300, room for ISO + confidence in Sprint 6)

New `SubScoreValidator.ts`: ~100 LOC

## Files Touched

- `packages/backend/src/domain/scoring/SubScoreValidator.ts` - CREATE (~100 LOC)
- `packages/backend/src/domain/scoring/ScoringPayloadValidator.ts` - MODIFY (remove 2 methods, add import + delegation)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/ScoringPayloadValidator.test.ts` - All sub-score tests (lines 162-371) should still pass without changes since the public API (`validator.validate()`) is unchanged. The delegation is internal.
- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - No change expected (tests validator.validate() which is unchanged).

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/scoring/SubScoreValidator.test.ts`
  - Test `validateAllSubScores()` returns empty warnings for no findings
  - Test `validateAllSubScores()` warns on unknown sub-score name
  - Test `validateAllSubScores()` warns on invalid sub-score value
  - Test `validateAllSubScores()` warns on sub-score sum mismatch
  - Test `validateAllSubScores()` skips dimensions without rules
  - Test tolerance check (within +/-2) via `validateAllSubScores()` (validateDimensionSubScores is private — test indirectly through the public API)
- [ ] Verify all existing `ScoringPayloadValidator.test.ts` tests pass unchanged

## Definition of Done

- [ ] `SubScoreValidator.ts` created with exact logic from ScoringPayloadValidator
- [ ] `ScoringPayloadValidator.ts` delegates sub-score validation
- [ ] `ScoringPayloadValidator.ts` is under 200 LOC
- [ ] `SubScoreValidator.ts` is under 120 LOC
- [ ] All existing tests pass (including sub-score warning tests)
- [ ] New SubScoreValidator unit tests pass
- [ ] No TypeScript errors
- [ ] No behavioral change
