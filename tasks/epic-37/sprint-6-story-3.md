# Story 37.6.3: Update ScoringPayloadValidator for ISO + Confidence

## Description

Add ISO clause reference validation and confidence validation to `ScoringPayloadValidator`. Both are **soft warnings** (same pattern as existing sub-score validation). The validator delegates to `ScoringConfidenceValidator` (created in Sprint 5) and adds inline ISO reference validation.

## Acceptance Criteria

- [ ] `ScoringPayloadValidator` delegates confidence validation to `ScoringConfidenceValidator`
- [ ] ISO clause reference validation added as soft warnings
- [ ] ISO validation checks: `clauseRef` is non-empty string, `title` is non-empty string, `status` is valid enum, `framework` is non-empty
- [ ] All ISO + confidence warnings are soft (do NOT reject the payload)
- [ ] `ScoringPayloadValidator.ts` stays under 250 LOC
- [ ] All existing tests pass (backwards compatible)
- [ ] No TypeScript errors

## Technical Approach

### 1. Update ScoringPayloadValidator

**File:** `packages/backend/src/domain/scoring/ScoringPayloadValidator.ts`

Add imports:
```typescript
import { ScoringConfidenceValidator } from './ScoringConfidenceValidator.js';
```

Add instance:
```typescript
private confidenceValidator = new ScoringConfidenceValidator();
```

In the `validate()` method, after sub-score validation (around line ~80):
```typescript
// Validate assessmentConfidence within dimension findings (soft warnings)
if (Array.isArray(p.dimensionScores)) {
  const confidenceWarnings = this.confidenceValidator.validateAllConfidence(p.dimensionScores);
  warnings.push(...confidenceWarnings);

  // Validate ISO clause references (soft warnings)
  const isoWarnings = this.validateISOReferences(p.dimensionScores);
  warnings.push(...isoWarnings);
}
```

Add new private method:
```typescript
/**
 * Validate ISO clause references across all dimension scores (soft warnings only).
 */
private validateISOReferences(dimensionScores: unknown[]): string[] {
  const warnings: string[] = [];
  const VALID_STATUSES = ['aligned', 'partial', 'not_evidenced', 'not_applicable'];

  for (let i = 0; i < dimensionScores.length; i++) {
    const ds = dimensionScores[i] as Record<string, unknown> | null;
    if (!ds || typeof ds !== 'object') continue;

    const dimension = ds.dimension as string;
    const findings = ds.findings as Record<string, unknown> | undefined;
    if (!findings || typeof findings !== 'object') continue;

    const refs = findings.isoClauseReferences as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(refs)) continue;

    const prefix = `dimensionScores[${i}] (${dimension})`;

    for (let j = 0; j < refs.length; j++) {
      const ref = refs[j];
      if (!ref || typeof ref !== 'object') {
        warnings.push(`${prefix}: isoClauseReferences[${j}] must be an object`);
        continue;
      }

      if (typeof ref.clauseRef !== 'string' || ref.clauseRef.trim().length === 0) {
        warnings.push(`${prefix}: isoClauseReferences[${j}].clauseRef is required`);
      }
      if (typeof ref.title !== 'string' || ref.title.trim().length === 0) {
        warnings.push(`${prefix}: isoClauseReferences[${j}].title is required`);
      }
      if (typeof ref.status !== 'string' || !VALID_STATUSES.includes(ref.status)) {
        warnings.push(
          `${prefix}: isoClauseReferences[${j}].status must be one of [${VALID_STATUSES.join(', ')}]`
        );
      }
      if (typeof ref.framework !== 'string' || ref.framework.trim().length === 0) {
        warnings.push(`${prefix}: isoClauseReferences[${j}].framework is required`);
      }
    }
  }

  return warnings;
}
```

### 2. LOC Budget

Current `ScoringPayloadValidator.ts` (after Sprint 1 extraction): ~196 LOC
- Add import + instance: +3 LOC
- Add confidence delegation: +5 LOC
- Add `validateISOReferences()`: +43 LOC
- Total: ~247 LOC (under 300 LOC limit)

## Files Touched

- `packages/backend/src/domain/scoring/ScoringPayloadValidator.ts` - MODIFY (add confidence + ISO validation)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/ScoringPayloadValidator.test.ts` - Existing tests should still pass. New tests needed for ISO + confidence validation.
- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - Should still pass since new validation is soft warnings only.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `ScoringPayloadValidator.test.ts`:
  - Test: payload without assessmentConfidence produces warning (not error)
  - Test: payload with valid assessmentConfidence produces no warning
  - Test: payload with invalid confidence level produces warning
  - Test: payload with short rationale produces warning
  - Test: payload with valid isoClauseReferences produces no warning
  - Test: payload with invalid ISO status produces warning
  - Test: payload with empty clauseRef produces warning
  - Test: payload with empty title produces warning
  - Test: payload without new fields still valid (backwards compatible)
  - Test: all ISO/confidence warnings are in `warnings` array, not `errors`

## Definition of Done

- [ ] Confidence validation delegated to ScoringConfidenceValidator
- [ ] ISO reference validation added as soft warnings
- [ ] All existing tests pass (backwards compatible)
- [ ] New tests for ISO + confidence validation
- [ ] Under 250 LOC
- [ ] No TypeScript errors
