/**
 * Anti-Drift Contract Test: Rubric Prompt <-> Validator Alignment
 *
 * Verifies that:
 * 1. SUB_SCORE_RULES (validator) matches buildRubricCriteria() (prompt text)
 * 2. DIMENSION_WEIGHTS entries have corresponding SUB_SCORE_RULES
 *
 * Prevents silent drift where the prompt describes sub-scores the validator
 * doesn't enforce, or vice versa -- which would cause retry churn.
 */
import {
  SUB_SCORE_RULES,
  SubScoreRule,
} from '../../../../src/domain/scoring/subScoreRules';
import { buildRubricCriteria } from '../../../../src/infrastructure/ai/prompts/rubricCriteria';
import {
  ALL_DIMENSIONS,
  DIMENSION_CONFIG,
  DIMENSION_WEIGHTS,
} from '../../../../src/domain/scoring/rubric';

describe('Rubric Contract: Prompt <-> Validator Alignment', () => {
  const rubricText = buildRubricCriteria();

  it('every dimension with sub-score rules should have rubric criteria text', () => {
    for (const dimension of Object.keys(SUB_SCORE_RULES)) {
      const label =
        DIMENSION_CONFIG[dimension as keyof typeof DIMENSION_CONFIG].label;
      expect(rubricText).toContain(label.toUpperCase());
    }
  });

  it('every dimension with rubric criteria should have sub-score rules', () => {
    for (const dimension of ALL_DIMENSIONS) {
      const label = DIMENSION_CONFIG[dimension].label.toUpperCase();
      if (rubricText.includes(label)) {
        expect(
          SUB_SCORE_RULES[dimension],
        ).toBeDefined();
      }
    }
  });

  it('sub-score names and maxPoints in rubric text should match sub-score rules', () => {
    for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
      // SUB_SCORE_RULES values are SubScoreRule[] arrays -- use .map(), NOT Object.keys()
      // Object.keys() on an array returns indices ("0","1","2"), not sub-score names
      const typedRules = rules as SubScoreRule[];
      for (const rule of typedRules) {
        expect(rubricText).toContain(rule.name);
        expect(rubricText).toContain(`${rule.maxPoints} points max`);
      }
    }
  });

  it('all dimensions with non-zero weight should have sub-score rules', () => {
    for (const solutionType of Object.keys(DIMENSION_WEIGHTS)) {
      const weights =
        DIMENSION_WEIGHTS[solutionType as keyof typeof DIMENSION_WEIGHTS];
      for (const [dim, weight] of Object.entries(weights)) {
        if ((weight as number) > 0) {
          // Using explicit assertion message via test structure
          const hasRules =
            SUB_SCORE_RULES[dim as keyof typeof SUB_SCORE_RULES];
          expect(hasRules).toBeDefined();
        }
      }
    }
  });
});
