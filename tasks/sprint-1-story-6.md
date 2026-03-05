# Story 40.1.6: Add Anti-Drift Contract Test

## Description

Add a contract test that asserts dimension coverage in `buildRubricCriteria()` (prompt text)
matches `SUB_SCORE_RULES` (validator rules). This prevents silent drift where the prompt
describes sub-scores the validator doesn't enforce, or vice versa — which would cause
retry churn.

This was flagged as **Medium** by the Codex review.

## Acceptance Criteria

- [ ] Contract test verifies every dimension in SUB_SCORE_RULES has a rubric criteria section
- [ ] Contract test verifies every dimension with rubric criteria has SUB_SCORE_RULES
- [ ] Contract test verifies sub-score names match between prompt text and rules
- [ ] Test fails if a new dimension is added to one but not the other
- [ ] No TypeScript errors

## Technical Approach

### 1. Create Contract Test

**File:** `packages/backend/__tests__/unit/domain/scoring/rubric-contract.test.ts`

```typescript
import { SUB_SCORE_RULES, getValidSubScoreNames, SubScoreRule } from '../../../../src/domain/scoring/subScoreRules';
import { buildRubricCriteria } from '../../../../src/infrastructure/ai/prompts/rubricCriteria';
import { ALL_DIMENSIONS, DIMENSION_CONFIG } from '../../../../src/domain/scoring/rubric';

describe('Rubric Contract: Prompt ↔ Validator Alignment', () => {
  const rubricText = buildRubricCriteria();

  it('every dimension with sub-score rules should have rubric criteria text', () => {
    for (const dimension of Object.keys(SUB_SCORE_RULES)) {
      const label = DIMENSION_CONFIG[dimension as keyof typeof DIMENSION_CONFIG].label;
      expect(rubricText).toContain(label.toUpperCase());
    }
  });

  it('every dimension with rubric criteria should have sub-score rules', () => {
    for (const dimension of ALL_DIMENSIONS) {
      const label = DIMENSION_CONFIG[dimension].label.toUpperCase();
      if (rubricText.includes(label)) {
        expect(SUB_SCORE_RULES[dimension]).toBeDefined();
      }
    }
  });

  it('sub-score names in rubric text should match sub-score rules', () => {
    for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
      // SUB_SCORE_RULES values are SubScoreRule[] arrays — use .map(), NOT Object.keys()
      // Object.keys() on an array returns indices ("0","1","2"), not sub-score names
      const validNames = (rules as SubScoreRule[]).map(r => r.name);
      for (const name of validNames) {
        expect(rubricText).toContain(name);
      }
    }
  });

  it('all dimensions with non-zero weight should have sub-score rules', () => {
    // Import weights and verify coverage
    const { DIMENSION_WEIGHTS } = require('../../../../src/domain/scoring/rubric');
    for (const solutionType of Object.keys(DIMENSION_WEIGHTS)) {
      const weights = DIMENSION_WEIGHTS[solutionType];
      for (const [dim, weight] of Object.entries(weights)) {
        if ((weight as number) > 0) {
          expect(SUB_SCORE_RULES[dim as keyof typeof SUB_SCORE_RULES]).toBeDefined(
            `${dim} has weight ${weight} in ${solutionType} but no sub-score rules`
          );
        }
      }
    }
  });
});
```

### 2. What This Catches

- Adding a dimension to subScoreRules.ts but forgetting to add rubric criteria text
- Adding rubric criteria text but forgetting to add subScoreRules entry
- Typo in sub-score name (different between prompt and validator)
- Giving a dimension non-zero weight but no sub-score rules

## Files Touched

- `packages/backend/__tests__/unit/domain/scoring/rubric-contract.test.ts` - CREATE (~60 LOC)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test. It should pass after Stories 40.1.1-40.1.4 are complete.

## Definition of Done

- [ ] Contract test file created
- [ ] All 4 contract assertions pass
- [ ] Test fails correctly when drift is introduced (verify by temporarily removing one entry)
- [ ] No TypeScript errors
