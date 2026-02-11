/**
 * Sub-Score Validation Rules
 *
 * Defines allowed sub-score names and point values for each dimension.
 * Extracted from the Guardian rubric rating scales in scoringPrompt.ts.
 *
 * These are used for SOFT validation (warnings only) to catch
 * unexpected values from Claude without rejecting the payload.
 */

import { RiskDimension } from '../types/QuestionnaireSchema'

/**
 * A single sub-score rule: the allowed point values for a named sub-score.
 */
export interface SubScoreRule {
  /** The sub-score field name (e.g., 'evidence_quality_score') */
  name: string
  /** Maximum points for this sub-score */
  maxPoints: number
  /** All allowed point values (e.g., [0, 10, 20, 30, 40]) */
  allowedValues: number[]
}

/**
 * Map of dimension -> array of sub-score rules.
 * Only dimensions with defined rubric sub-scores are included.
 */
export const SUB_SCORE_RULES: Partial<Record<RiskDimension, SubScoreRule[]>> = {
  clinical_risk: [
    { name: 'evidence_quality_score', maxPoints: 40, allowedValues: [0, 10, 20, 30, 40] },
    { name: 'regulatory_status_score', maxPoints: 20, allowedValues: [0, 10, 15, 20] },
    { name: 'patient_safety_score', maxPoints: 20, allowedValues: [0, 10, 15, 20] },
    { name: 'population_relevance_score', maxPoints: 10, allowedValues: [0, 5, 10] },
    { name: 'workflow_integration_score', maxPoints: 10, allowedValues: [0, 5, 8, 10] },
  ],
  privacy_risk: [
    { name: 'pipeda_compliance_score', maxPoints: 30, allowedValues: [0, 10, 20, 30] },
    { name: 'atipp_compliance_score', maxPoints: 25, allowedValues: [0, 10, 20, 25] },
    { name: 'phi_protection_score', maxPoints: 20, allowedValues: [0, 10, 15, 20] },
    { name: 'consent_mechanism_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
    { name: 'data_subject_rights_score', maxPoints: 10, allowedValues: [0, 5, 10] },
  ],
  security_risk: [
    { name: 'security_architecture_score', maxPoints: 25, allowedValues: [0, 10, 20, 25] },
    { name: 'access_control_score', maxPoints: 20, allowedValues: [0, 10, 15, 20] },
    { name: 'vulnerability_management_score', maxPoints: 20, allowedValues: [0, 10, 15, 20] },
    { name: 'incident_response_score', maxPoints: 15, allowedValues: [0, 8, 12, 15] },
    { name: 'certifications_score', maxPoints: 10, allowedValues: [0, 5, 10] },
    { name: 'phi_specific_controls_score', maxPoints: 10, allowedValues: [0, 5, 8, 10] },
  ],
  technical_credibility: [
    { name: 'ai_architecture_score', maxPoints: 25, allowedValues: [0, 10, 15, 25] },
    { name: 'development_practices_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'validation_testing_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'documentation_score', maxPoints: 15, allowedValues: [0, 3, 9, 15] },
    { name: 'explainability_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
  ],
  operational_excellence: [
    { name: 'itil4_maturity_score', maxPoints: 30, allowedValues: [0, 6, 12, 18, 24, 30] },
    { name: 'nist_csf_tier_score', maxPoints: 25, allowedValues: [0, 10, 18, 25] },
    { name: 'support_model_score', maxPoints: 20, allowedValues: [5, 10, 15, 20] },
    { name: 'change_management_score', maxPoints: 15, allowedValues: [0, 3, 9, 15] },
    { name: 'fte_sustainability_score', maxPoints: 10, allowedValues: [0, 5, 10] },
  ],
}

/**
 * Get the expected max total for a dimension's sub-scores.
 * Returns undefined if no rules are defined for the dimension.
 */
export function getExpectedMaxTotal(dimension: RiskDimension): number | undefined {
  const rules = SUB_SCORE_RULES[dimension]
  if (!rules) return undefined
  return rules.reduce((sum, rule) => sum + rule.maxPoints, 0)
}

/**
 * Get the set of valid sub-score names for a dimension.
 * Returns undefined if no rules are defined for the dimension.
 */
export function getValidSubScoreNames(dimension: RiskDimension): Set<string> | undefined {
  const rules = SUB_SCORE_RULES[dimension]
  if (!rules) return undefined
  return new Set(rules.map(r => r.name))
}
