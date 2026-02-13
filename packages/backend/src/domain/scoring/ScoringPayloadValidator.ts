import { ScoringCompletePayload, RiskRating, Recommendation, DimensionScoreData } from './types';
import { ALL_DIMENSIONS } from './rubric';
import { RiskDimension } from '../types/QuestionnaireSchema';
import { SubScoreValidator } from './SubScoreValidator';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
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

  /**
   * Validate a payload from Claude's scoring_complete tool call
   */
  validate(payload: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if payload is an object
    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be an object'], warnings: [] };
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

    // Validate sub-scores within dimension findings (soft warnings)
    if (Array.isArray(p.dimensionScores)) {
      const subScoreWarnings = this.subScoreValidator.validateAllSubScores(p.dimensionScores);
      warnings.push(...subScoreWarnings);
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
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

    return { valid: true, errors: [], warnings, sanitized };
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

}

// Export singleton instance
export const scoringPayloadValidator = new ScoringPayloadValidator();
