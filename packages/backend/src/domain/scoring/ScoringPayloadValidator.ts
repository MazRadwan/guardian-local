import { ScoringCompletePayload, RiskRating, Recommendation, DimensionScoreData } from './types';
import { ALL_DIMENSIONS, ALL_DISQUALIFYING_FACTORS, DISQUALIFIER_TIER, SolutionType } from './rubric';
import { RiskDimension } from '../types/QuestionnaireSchema';
import { SubScoreValidator } from './SubScoreValidator';
import { ScoringConfidenceValidator } from './ScoringConfidenceValidator';
import { compositeScoreValidator } from './CompositeScoreValidator';
import { validateISOReferences } from './ISOClauseValidator';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  structuralViolations: string[];
  sanitized?: ScoringCompletePayload;
}

/**
 * Valid enum values
 */
const VALID_RISK_RATINGS: RiskRating[] = ['low', 'medium', 'high', 'critical'];
const VALID_RECOMMENDATIONS: Recommendation[] = ['approve', 'conditional', 'decline', 'more_info'];

/**
 * Validates scoring_complete tool payloads from Claude
 */
export class ScoringPayloadValidator {
  private subScoreValidator = new SubScoreValidator();
  private confidenceValidator = new ScoringConfidenceValidator();

  /**
   * Normalize common LLM output variations before validation.
   * Claude sometimes returns dimensionScores as an object keyed by dimension
   * name instead of an array. Coerce to array if possible.
   */
  normalizePayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return payload;
    const p = payload as Record<string, unknown>;

    if (p.dimensionScores && !Array.isArray(p.dimensionScores) && typeof p.dimensionScores === 'object') {
      const obj = p.dimensionScores as Record<string, unknown>;
      // Object keyed by dimension name → convert to array with dimension field
      p.dimensionScores = Object.entries(obj).map(([key, value]) => {
        if (value && typeof value === 'object') {
          return { ...(value as Record<string, unknown>), dimension: key };
        }
        return value;
      });
      console.warn('[ScoringPayloadValidator] Coerced dimensionScores from object to array');
    }

    return payload;
  }

  /**
   * Validate a payload from Claude's scoring_complete tool call.
   * When solutionType is provided, also validates composite score arithmetic.
   */
  validate(payload: unknown, solutionType?: SolutionType): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if payload is an object
    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be an object'], warnings: [], structuralViolations: [] };
    }

    const p = payload as Record<string, unknown>;

    // Validate compositeScore
    if (!this.isValidScore(p.compositeScore)) {
      errors.push(`compositeScore must be integer 0-100, got: ${p.compositeScore}`);
    }

    // Validate recommendation
    if (!this.isValidRecommendation(p.recommendation)) {
      errors.push(`recommendation must be one of ${VALID_RECOMMENDATIONS.join(', ')}, got: ${p.recommendation}`);
    }

    // Validate overallRiskRating
    if (!this.isValidRiskRating(p.overallRiskRating)) {
      errors.push(`overallRiskRating must be one of ${VALID_RISK_RATINGS.join(', ')}, got: ${p.overallRiskRating}`);
    }

    // Validate executiveSummary
    if (!p.executiveSummary || typeof p.executiveSummary !== 'string') {
      errors.push('executiveSummary is required and must be a string');
    } else if (p.executiveSummary.length < 10) {
      errors.push('executiveSummary must be at least 10 characters');
    }

    // Validate keyFindings (optional but must be array if present)
    if (p.keyFindings !== undefined && !Array.isArray(p.keyFindings)) {
      errors.push('keyFindings must be an array if provided');
    }

    // Validate disqualifyingFactors (optional but must be array if present)
    if (p.disqualifyingFactors !== undefined && !Array.isArray(p.disqualifyingFactors)) {
      errors.push('disqualifyingFactors must be an array if provided');
    }

    // Validate dimensionScores (hard errors)
    const dimensionErrors = this.validateDimensionScores(p.dimensionScores);
    errors.push(...dimensionErrors);

    // Validate sub-scores within dimension findings
    const structuralViolations: string[] = [];
    if (Array.isArray(p.dimensionScores)) {
      const subScoreResult = this.subScoreValidator.validateAllSubScores(p.dimensionScores);
      structuralViolations.push(...subScoreResult.structuralViolations);
      warnings.push(...subScoreResult.softWarnings);

      // Validate assessmentConfidence within dimension findings (soft warnings)
      const confidenceWarnings = this.confidenceValidator.validateAllConfidence(p.dimensionScores);
      warnings.push(...confidenceWarnings);

      // Validate ISO clause references (soft warnings)
      warnings.push(...validateISOReferences(p.dimensionScores));
    }

    // Validate disqualifying factor / recommendation coherence (tiered)
    const disqualifiers = Array.isArray(p.disqualifyingFactors) ? p.disqualifyingFactors as string[] : [];
    if (disqualifiers.length > 0) {
      this.validateTieredDisqualifiers(disqualifiers, p.recommendation as string, structuralViolations, warnings);
    }

    // Validate composite score arithmetic (soft warning — reconciler auto-corrects)
    if (solutionType && Array.isArray(p.dimensionScores) && this.isValidScore(p.compositeScore)) {
      const compositeResult = compositeScoreValidator.validate(
        p.compositeScore as number,
        p.dimensionScores as Array<{ dimension: string; score: number }>,
        solutionType
      );
      if (!compositeResult.valid && compositeResult.violation) {
        warnings.push(compositeResult.violation + ' (auto-corrected by reconciler)');
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings, structuralViolations };
    }

    // Build sanitized payload
    const sanitized: ScoringCompletePayload = {
      compositeScore: p.compositeScore as number,
      recommendation: p.recommendation as Recommendation,
      overallRiskRating: p.overallRiskRating as RiskRating,
      executiveSummary: p.executiveSummary as string,
      keyFindings: (p.keyFindings as string[]) || [],
      disqualifyingFactors: (p.disqualifyingFactors as string[]) || [],
      dimensionScores: p.dimensionScores as DimensionScoreData[],
    };

    return { valid: true, errors: [], warnings, structuralViolations, sanitized };
  }

  /**
   * Validate dimension scores array
   */
  private validateDimensionScores(dimensionScores: unknown): string[] {
    const errors: string[] = [];

    if (!Array.isArray(dimensionScores)) {
      errors.push('dimensionScores must be an array');
      return errors;
    }

    if (dimensionScores.length !== 10) {
      errors.push(`dimensionScores must have exactly 10 items, got: ${dimensionScores.length}`);
    }

    // Track which dimensions we've seen
    const seenDimensions = new Set<string>();

    for (let i = 0; i < dimensionScores.length; i++) {
      const ds = dimensionScores[i];
      const prefix = `dimensionScores[${i}]`;

      if (!ds || typeof ds !== 'object') {
        errors.push(`${prefix} must be an object`);
        continue;
      }

      const d = ds as Record<string, unknown>;

      // Validate dimension name
      if (!d.dimension || typeof d.dimension !== 'string') {
        errors.push(`${prefix}.dimension is required`);
      } else if (!ALL_DIMENSIONS.includes(d.dimension as RiskDimension)) {
        errors.push(`${prefix}.dimension '${d.dimension}' is not a valid dimension`);
      } else {
        if (seenDimensions.has(d.dimension as string)) {
          errors.push(`${prefix}.dimension '${d.dimension}' is duplicated`);
        }
        seenDimensions.add(d.dimension as string);
      }

      // Validate score
      if (!this.isValidScore(d.score)) {
        errors.push(`${prefix}.score must be integer 0-100, got: ${d.score}`);
      }

      // Validate riskRating
      if (!this.isValidRiskRating(d.riskRating)) {
        errors.push(`${prefix}.riskRating must be one of ${VALID_RISK_RATINGS.join(', ')}, got: ${d.riskRating}`);
      }
    }

    // Check for missing dimensions
    const missingDimensions = ALL_DIMENSIONS.filter(d => !seenDimensions.has(d));
    if (missingDimensions.length > 0) {
      errors.push(`Missing dimensions: ${missingDimensions.join(', ')}`);
    }

    return errors;
  }

  /**
   * Check if value is a valid score (integer 0-100)
   */
  private isValidScore(value: unknown): boolean {
    return typeof value === 'number' &&
           Number.isInteger(value) &&
           value >= 0 &&
           value <= 100;
  }

  /**
   * Check if value is a valid risk rating
   */
  private isValidRiskRating(value: unknown): boolean {
    return typeof value === 'string' && VALID_RISK_RATINGS.includes(value as RiskRating);
  }

  /**
   * Check if value is a valid recommendation
   */
  private isValidRecommendation(value: unknown): boolean {
    return typeof value === 'string' && VALID_RECOMMENDATIONS.includes(value as Recommendation);
  }

  /**
   * Validate disqualifying factors using tiered classification.
   *
   * - Unknown factors → treated as hard_decline (fail safe) + warning
   * - Any hard_decline factor → recommendation must be 'decline'
   * - Only remediable_blocker factors → recommendation must not be 'approve'
   */
  private validateTieredDisqualifiers(
    disqualifiers: string[],
    recommendation: string,
    structuralViolations: string[],
    warnings: string[]
  ): void {
    let hasHard = false;
    const hardFactors: string[] = [];
    const remediableFactors: string[] = [];

    for (const factor of disqualifiers) {
      if (!ALL_DISQUALIFYING_FACTORS.includes(factor)) {
        // Unknown factor — structural violation (must use canonical keys)
        structuralViolations.push(
          `Unknown disqualifying factor '${factor}' — must use canonical key from rubric`
        );
        hasHard = true;
        hardFactors.push(factor);
        continue;
      }
      const tier = DISQUALIFIER_TIER[factor] ?? 'hard_decline';
      if (tier === 'hard_decline') {
        hasHard = true;
        hardFactors.push(factor);
      } else {
        remediableFactors.push(factor);
      }
    }

    // Recommendation coherence → soft warning (reconciler auto-corrects)
    if (hasHard && recommendation !== 'decline') {
      warnings.push(
        `hard_decline disqualifier(s) present (${hardFactors.join(', ')}) ` +
        `but recommendation was '${recommendation}' — auto-corrected to 'decline'`
      );
    } else if (!hasHard && remediableFactors.length > 0 && recommendation === 'approve') {
      warnings.push(
        `remediable_blocker disqualifier(s) present (${remediableFactors.join(', ')}) ` +
        `but recommendation was 'approve' — auto-corrected to 'conditional'`
      );
    }
  }

}

// Export singleton instance
export const scoringPayloadValidator = new ScoringPayloadValidator();
