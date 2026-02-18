import { ScoringCompletePayload, RiskRating, Recommendation, DimensionScoreData } from './types';
import { ALL_DIMENSIONS, SolutionType } from './rubric';
import { RiskDimension } from '../types/QuestionnaireSchema';
import { SubScoreValidator } from './SubScoreValidator';
import { ScoringConfidenceValidator } from './ScoringConfidenceValidator';
import { compositeScoreValidator } from './CompositeScoreValidator';

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
      const isoWarnings = this.validateISOReferences(p.dimensionScores);
      warnings.push(...isoWarnings);
    }

    // Validate disqualifying factor / recommendation coherence (structural violation)
    const disqualifiers = Array.isArray(p.disqualifyingFactors) ? p.disqualifyingFactors as string[] : [];
    if (disqualifiers.length > 0 && p.recommendation !== 'decline') {
      structuralViolations.push(
        `disqualifyingFactors present (${disqualifiers.join(', ')}) ` +
        `but recommendation is '${p.recommendation}' — must be 'decline'`
      );
    }

    // Validate composite score arithmetic (structural violation)
    if (solutionType && Array.isArray(p.dimensionScores) && this.isValidScore(p.compositeScore)) {
      const compositeResult = compositeScoreValidator.validate(
        p.compositeScore as number,
        p.dimensionScores as Array<{ dimension: string; score: number }>,
        solutionType
      );
      if (!compositeResult.valid && compositeResult.violation) {
        structuralViolations.push(compositeResult.violation);
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

}

// Export singleton instance
export const scoringPayloadValidator = new ScoringPayloadValidator();
