# Story 37.5.4: Create ScoringConfidenceValidator

## Description

Create the `ScoringConfidenceValidator` -- a focused validator for the `assessmentConfidence` fields in scoring output. This was identified in the audit as a separate concern to extract from `ScoringPayloadValidator` to keep the main validator under 300 LOC when ISO fields are added in Sprint 6.

The confidence validator checks that each dimension's `assessmentConfidence` has a valid `level` (H/M/L) and a non-empty `rationale` that cites specific evidence. Per the PRD Compliance Condition (Section 7): "A bare 'Medium' without explanation is not acceptable."

## Acceptance Criteria

- [ ] `ScoringConfidenceValidator.ts` created in `domain/scoring/`
- [ ] `validateConfidence()` method validates `assessmentConfidence` per dimension
- [ ] Validates `level` is one of: `'high'`, `'medium'`, `'low'`
- [ ] Validates `rationale` is a non-empty string (minimum 20 characters)
- [ ] Returns warnings (soft validation, same as sub-score pattern)
- [ ] Does NOT reject the payload on confidence issues (soft warnings only)
- [ ] Under 60 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/domain/scoring/ScoringConfidenceValidator.ts`

```typescript
import { AssessmentConfidenceLevel } from '../compliance/types.js';

const VALID_CONFIDENCE_LEVELS: AssessmentConfidenceLevel[] = ['high', 'medium', 'low'];
const MIN_RATIONALE_LENGTH = 20;

/**
 * Validates assessmentConfidence fields in scoring output.
 * Produces SOFT WARNINGS only (does not reject payloads).
 *
 * Per PRD Section 7 Compliance Condition:
 * "A bare 'Medium' without explanation is not acceptable."
 */
export class ScoringConfidenceValidator {
  /**
   * Validate assessmentConfidence across all dimension scores.
   * Returns warnings for invalid/missing confidence data.
   */
  validateAllConfidence(dimensionScores: unknown[]): string[] {
    const warnings: string[] = [];

    for (let i = 0; i < dimensionScores.length; i++) {
      const ds = dimensionScores[i] as Record<string, unknown> | null;
      if (!ds || typeof ds !== 'object') continue;

      const dimension = ds.dimension as string;
      const findings = ds.findings as Record<string, unknown> | undefined;
      if (!findings || typeof findings !== 'object') continue;

      const confidence = findings.assessmentConfidence as Record<string, unknown> | undefined;
      if (!confidence) {
        // Confidence is optional during rollout (soft warning)
        warnings.push(`dimensionScores[${i}] (${dimension}): missing assessmentConfidence`);
        continue;
      }

      const prefix = `dimensionScores[${i}] (${dimension})`;

      // Validate level
      const level = confidence.level;
      if (typeof level !== 'string' || !VALID_CONFIDENCE_LEVELS.includes(level as AssessmentConfidenceLevel)) {
        warnings.push(
          `${prefix}: assessmentConfidence.level must be one of [${VALID_CONFIDENCE_LEVELS.join(', ')}], got: ${level}`
        );
      }

      // Validate rationale
      const rationale = confidence.rationale;
      if (typeof rationale !== 'string' || rationale.trim().length < MIN_RATIONALE_LENGTH) {
        warnings.push(
          `${prefix}: assessmentConfidence.rationale must be at least ${MIN_RATIONALE_LENGTH} characters`
        );
      }
    }

    return warnings;
  }
}
```

## Files Touched

- `packages/backend/src/domain/scoring/ScoringConfidenceValidator.ts` - CREATE (~55 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/scoring/ScoringConfidenceValidator.test.ts`
  - Test returns empty warnings when no findings present
  - Test warns when assessmentConfidence is missing from findings
  - Test warns when level is invalid (e.g., "very_high")
  - Test warns when rationale is too short (< 20 chars)
  - Test warns when rationale is missing
  - Test accepts valid confidence (level: 'high', rationale: 20+ chars)
  - Test validates across multiple dimensions (returns warnings for each)
  - Test skips dimensions without findings object
  - Test accepts all three valid levels: 'high', 'medium', 'low'

## Definition of Done

- [ ] Validator created and compiles
- [ ] Soft warnings pattern (does not reject payload)
- [ ] Rationale minimum length enforced (PRD compliance condition)
- [ ] Unit tests written and passing
- [ ] Under 60 LOC
- [ ] No TypeScript errors
