/**
 * CompositeScoreValidator
 *
 * Verifies that compositeScore matches the expected weighted average
 * of dimension scores. This is arithmetic verification, not qualitative
 * reinterpretation -- Claude owns the dimension scores, we verify the math.
 */

import { DIMENSION_WEIGHTS, DIMENSION_CONFIG, SolutionType } from './rubric.js';
import { RiskDimension } from '../types/QuestionnaireSchema.js';

/**
 * Result of composite score validation
 */
export interface CompositeValidationResult {
  valid: boolean;
  expected: number;
  actual: number;
  violation?: string;
}

/**
 * Validates that a composite score matches the expected weighted average
 * of dimension scores, accounting for risk vs capability dimension types.
 *
 * Risk dimensions: score is already on risk scale (lower = better).
 * Capability dimensions: inverted to risk scale (100 - score) for aggregation.
 *
 * Weights are defined per solution type in DIMENSION_WEIGHTS.
 */
export class CompositeScoreValidator {
  /**
   * Validate composite score against weighted dimension scores.
   *
   * @param compositeScore - The composite score reported by Claude (0-100)
   * @param dimensionScores - Array of dimension name + score pairs
   * @param solutionType - Solution type determining weight profile
   * @param tolerance - Acceptable deviation in points (default 3)
   * @returns Validation result with expected vs actual comparison
   */
  validate(
    compositeScore: number,
    dimensionScores: Array<{ dimension: string; score: number }>,
    solutionType: SolutionType,
    tolerance: number = 3
  ): CompositeValidationResult {
    const weights = DIMENSION_WEIGHTS[solutionType];
    let totalContribution = 0;

    for (const dimension of Object.keys(weights) as RiskDimension[]) {
      const weight = weights[dimension];
      if (weight <= 0) continue;

      const dimEntry = dimensionScores.find(ds => ds.dimension === dimension);
      if (!dimEntry) {
        return {
          valid: false,
          expected: -1,
          actual: compositeScore,
          violation:
            `Missing dimension '${dimension}' (weight ${weight}%) ` +
            `required for ${solutionType} composite calculation`,
        };
      }

      const config = DIMENSION_CONFIG[dimension];
      const riskEquivalent = config.type === 'capability'
        ? 100 - dimEntry.score
        : dimEntry.score;

      totalContribution += (weight * riskEquivalent) / 100;
    }

    const expected = Math.round(totalContribution);
    const deviation = Math.abs(compositeScore - expected);

    if (deviation > tolerance) {
      return {
        valid: false,
        expected,
        actual: compositeScore,
        violation:
          `Composite score ${compositeScore} deviates from expected ` +
          `weighted average ${expected} by ${deviation} points ` +
          `(tolerance: +/-${tolerance}, solutionType: ${solutionType})`,
      };
    }

    return {
      valid: true,
      expected,
      actual: compositeScore,
    };
  }
}

/** Singleton instance for convenience */
export const compositeScoreValidator = new CompositeScoreValidator();
