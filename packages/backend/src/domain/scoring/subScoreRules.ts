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
 * All 10 dimensions have defined rubric sub-scores (v1.1).
 */
export const SUB_SCORE_RULES: Record<RiskDimension, SubScoreRule[]> = {
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
  vendor_capability: [
    { name: 'company_stability_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'healthcare_experience_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'customer_references_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'support_capability_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
    { name: 'roadmap_credibility_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
  ],
  ai_transparency: [
    { name: 'model_explainability_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'audit_trail_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'confidence_scoring_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'limitations_documentation_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
    { name: 'interpretability_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
  ],
  ethical_considerations: [
    { name: 'bias_testing_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'population_fairness_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'equity_impact_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'indigenous_rural_health_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
    { name: 'algorithmic_justice_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
  ],
  regulatory_compliance: [
    { name: 'health_canada_status_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'qms_maturity_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'clinical_evidence_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'post_market_surveillance_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
    { name: 'regulatory_roadmap_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
  ],
  operational_excellence: [
    { name: 'itil4_maturity_score', maxPoints: 30, allowedValues: [0, 6, 12, 18, 24, 30] },
    { name: 'nist_csf_tier_score', maxPoints: 25, allowedValues: [0, 10, 18, 25] },
    { name: 'support_model_score', maxPoints: 20, allowedValues: [5, 10, 15, 20] },
    { name: 'change_management_score', maxPoints: 15, allowedValues: [0, 3, 9, 15] },
    { name: 'fte_sustainability_score', maxPoints: 10, allowedValues: [0, 5, 10] },
  ],
  sustainability: [
    { name: 'itil4_service_maturity_score', maxPoints: 25, allowedValues: [0, 8, 15, 25] },
    { name: 'nist_csf_alignment_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'support_model_sustainability_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'bcp_disaster_recovery_score', maxPoints: 20, allowedValues: [0, 6, 12, 20] },
    { name: 'total_cost_of_ownership_score', maxPoints: 15, allowedValues: [0, 5, 10, 15] },
  ],
}

/**
 * Get the expected max total for a dimension's sub-scores.
 * All dimensions have rules in v1.1; guard retained for defensive safety.
 */
export function getExpectedMaxTotal(dimension: RiskDimension): number | undefined {
  const rules = SUB_SCORE_RULES[dimension]
  if (!rules) return undefined
  return rules.reduce((sum, rule) => sum + rule.maxPoints, 0)
}

/**
 * Get the set of valid sub-score names for a dimension.
 * All dimensions have rules in v1.1; guard retained for defensive safety.
 */
export function getValidSubScoreNames(dimension: RiskDimension): Set<string> | undefined {
  const rules = SUB_SCORE_RULES[dimension]
  if (!rules) return undefined
  return new Set(rules.map(r => r.name))
}
