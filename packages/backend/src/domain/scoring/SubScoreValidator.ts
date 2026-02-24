import { RiskDimension } from '../types/QuestionnaireSchema';
import { SUB_SCORE_RULES, getValidSubScoreNames } from './subScoreRules';

/**
 * Result of sub-score validation, split into hard failures and soft warnings.
 * - structuralViolations: invalid values or sum mismatches (hard fail)
 * - softWarnings: unknown names or informational issues (logged only)
 */
export interface SubScoreValidationResult {
  structuralViolations: string[];
  softWarnings: string[];
}

/**
 * Validates sub-scores within dimension findings.
 * Returns structural violations (hard fail) and soft warnings (logged only).
 *
 * Extracted from ScoringPayloadValidator to keep files under 300 LOC
 * and create space for ISO + confidence validation.
 */
export class SubScoreValidator {
  /**
   * Validate sub-scores across all dimension scores.
   * Returns structural violations and soft warnings separately.
   */
  validateAllSubScores(dimensionScores: unknown[]): SubScoreValidationResult {
    const result: SubScoreValidationResult = {
      structuralViolations: [],
      softWarnings: [],
    };

    for (let i = 0; i < dimensionScores.length; i++) {
      const ds = dimensionScores[i] as Record<string, unknown> | null;
      if (!ds || typeof ds !== 'object') continue;

      const dimension = ds.dimension as RiskDimension;
      const findings = ds.findings as Record<string, unknown> | undefined;
      if (!findings || typeof findings !== 'object') continue;

      const subScores = findings.subScores as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(subScores)) continue;

      const dimensionResult = this.validateDimensionSubScores(
        dimension,
        ds.score as number,
        subScores,
        i
      );
      result.structuralViolations.push(...dimensionResult.structuralViolations);
      result.softWarnings.push(...dimensionResult.softWarnings);
    }

    return result;
  }

  /**
   * Validate sub-scores for a single dimension against rubric rules.
   */
  private validateDimensionSubScores(
    dimension: RiskDimension,
    dimensionScore: number,
    subScores: Array<Record<string, unknown>>,
    index: number
  ): SubScoreValidationResult {
    const structuralViolations: string[] = [];
    const softWarnings: string[] = [];
    const prefix = `dimensionScores[${index}] (${dimension})`;
    const rules = SUB_SCORE_RULES[dimension];

    // No rules defined for this dimension -- skip validation
    if (!rules) return { structuralViolations, softWarnings };

    const validNames = getValidSubScoreNames(dimension)!;
    let subScoreSum = 0;

    for (const sub of subScores) {
      const name = sub.name as string;
      const score = sub.score as number;
      const isKnown = typeof name === 'string' && validNames.has(name);

      // Unknown sub-score name -> soft warning (excluded from sum)
      if (typeof name === 'string' && !isKnown) {
        softWarnings.push(
          `${prefix}: unknown sub-score name '${name}'. ` +
          `Valid names: ${Array.from(validNames).join(', ')}`
        );
      }

      // Sub-score value not in allowed values -> structural violation
      if (isKnown && typeof score === 'number') {
        const rule = rules.find(r => r.name === name);
        if (rule && !rule.allowedValues.includes(score)) {
          structuralViolations.push(
            `${prefix}: sub-score '${name}' has value ${score}, ` +
            `allowed values: [${rule.allowedValues.join(', ')}]`
          );
        }
        subScoreSum += score;
      }
    }

    // Sub-score sum mismatch -> structural violation
    if (subScores.length > 0 && typeof dimensionScore === 'number') {
      const tolerance = 2;
      if (Math.abs(subScoreSum - dimensionScore) > tolerance) {
        structuralViolations.push(
          `${prefix}: sub-score sum ${subScoreSum} differs from ` +
          `dimension score ${dimensionScore} (tolerance: +/-${tolerance})`
        );
      }
    }

    return { structuralViolations, softWarnings };
  }
}
