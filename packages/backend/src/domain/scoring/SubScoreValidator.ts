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
   */
  private validateDimensionSubScores(
    dimension: RiskDimension,
    dimensionScore: number,
    subScores: Array<Record<string, unknown>>,
    index: number
  ): string[] {
    const warnings: string[] = [];
    const prefix = `dimensionScores[${index}] (${dimension})`;
    const rules = SUB_SCORE_RULES[dimension];

    // No rules defined for this dimension -- skip validation
    if (!rules) return warnings;

    const validNames = getValidSubScoreNames(dimension)!;
    let subScoreSum = 0;

    for (const sub of subScores) {
      const name = sub.name as string;
      const score = sub.score as number;

      // Validate sub-score name
      if (typeof name === 'string' && !validNames.has(name)) {
        warnings.push(
          `${prefix}: unknown sub-score name '${name}'. ` +
          `Valid names: ${Array.from(validNames).join(', ')}`
        );
      }

      // Validate sub-score value against allowed values
      if (typeof name === 'string' && typeof score === 'number') {
        const rule = rules.find(r => r.name === name);
        if (rule && !rule.allowedValues.includes(score)) {
          warnings.push(
            `${prefix}: sub-score '${name}' has value ${score}, ` +
            `allowed values: [${rule.allowedValues.join(', ')}]`
          );
        }
        subScoreSum += score;
      }
    }

    // Validate sub-score sum matches dimension score (within tolerance)
    if (subScores.length > 0 && typeof dimensionScore === 'number') {
      const tolerance = 2;
      if (Math.abs(subScoreSum - dimensionScore) > tolerance) {
        warnings.push(
          `${prefix}: sub-score sum ${subScoreSum} differs from ` +
          `dimension score ${dimensionScore} (tolerance: +/-${tolerance})`
        );
      }
    }

    return warnings;
  }
}
