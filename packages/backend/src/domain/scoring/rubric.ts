/**
 * Guardian Rubric Constants
 *
 * SOURCE: GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md Part IV
 *
 * All thresholds, weights, and disqualifying factors are from the official rubric.
 */

import { RiskDimension } from '../types/QuestionnaireSchema'
import { RiskRating } from './types'

/**
 * Current rubric version - stored with results for auditability
 */
export const RUBRIC_VERSION = 'guardian-v1.1'

/**
 * Solution types that determine dimension weighting in composite score calculation.
 *
 * These are the authoritative values for scoring weight selection (v1.1):
 * - `clinical_ai`: Clinical decision support systems - weights clinical_risk highest (25%)
 * - `administrative_ai`: Administrative/workflow tools - weights privacy_risk highest (20%)
 * - `patient_facing`: Patient engagement platforms - weights privacy_risk highest (20%)
 *
 * All 10 dimensions have non-zero weights for all 3 solution types.
 *
 * @see DIMENSION_WEIGHTS for full weight mappings
 * @see docs/design/architecture/scoring-solution-type.md for field semantics
 */
export type SolutionType = 'clinical_ai' | 'administrative_ai' | 'patient_facing'

/**
 * Risk rating thresholds (score -> rating)
 */
export const RISK_THRESHOLDS: Record<string, { max: number; rating: RiskRating }[]> = {
  // Risk dimensions: 0-20 Low, 21-40 Medium, 41-60 High, 61-100 Critical
  risk: [
    { max: 20, rating: 'low' },
    { max: 40, rating: 'medium' },
    { max: 60, rating: 'high' },
    { max: 100, rating: 'critical' },
  ],
  // Capability dimensions: 80-100 Excellent/Low, 60-79 Good/Medium, 40-59 Adequate/High, 0-39 Poor/Critical
  capability: [
    { max: 39, rating: 'critical' },
    { max: 59, rating: 'high' },
    { max: 79, rating: 'medium' },
    { max: 100, rating: 'low' },
  ],
}

/**
 * Dimension weights by solution type
 */
export const DIMENSION_WEIGHTS: Record<SolutionType, Record<RiskDimension, number>> = {
  clinical_ai: {
    clinical_risk: 25,
    privacy_risk: 15,
    security_risk: 15,
    technical_credibility: 10,
    operational_excellence: 10,
    vendor_capability: 5,
    ai_transparency: 5,
    ethical_considerations: 5,
    regulatory_compliance: 5,
    sustainability: 5,
  },
  administrative_ai: {
    clinical_risk: 5,
    privacy_risk: 20,
    security_risk: 18,
    technical_credibility: 10,
    operational_excellence: 12,
    vendor_capability: 8,
    ai_transparency: 5,
    ethical_considerations: 5,
    regulatory_compliance: 10,
    sustainability: 7,
  },
  patient_facing: {
    clinical_risk: 10,
    privacy_risk: 20,
    security_risk: 15,
    technical_credibility: 10,
    operational_excellence: 5,
    vendor_capability: 5,
    ai_transparency: 10,
    ethical_considerations: 10,
    regulatory_compliance: 10,
    sustainability: 5,
  },
}

/**
 * Dimension metadata (for display and validation)
 */
export const DIMENSION_CONFIG: Record<RiskDimension, {
  label: string
  type: 'risk' | 'capability'
}> = {
  clinical_risk: { label: 'Clinical Risk', type: 'risk' },
  privacy_risk: { label: 'Privacy Risk', type: 'risk' },
  security_risk: { label: 'Security Risk', type: 'risk' },
  technical_credibility: { label: 'Technical Credibility', type: 'capability' },
  vendor_capability: { label: 'Vendor Capability', type: 'capability' },
  ai_transparency: { label: 'AI Transparency', type: 'capability' },
  ethical_considerations: { label: 'Ethical Considerations', type: 'capability' },
  regulatory_compliance: { label: 'Regulatory Compliance', type: 'capability' },
  operational_excellence: { label: 'Operational Excellence', type: 'capability' },
  sustainability: { label: 'Sustainability', type: 'capability' },
}

/**
 * All 10 dimensions (for validation)
 */
export const ALL_DIMENSIONS: RiskDimension[] = Object.keys(DIMENSION_CONFIG) as RiskDimension[]

/**
 * Recommendation thresholds
 */
export const RECOMMENDATION_THRESHOLDS = {
  approve: {
    maxOverallRisk: 30,
    maxCriticalDimensions: 0,
    maxHighDimensions: 1,
    requireNoDisqualifiersOfAnyTier: true,
  },
  conditional: {
    maxOverallRisk: 50,
    maxCriticalDimensions: 0,
    maxHighDimensions: Infinity,
    requireNoHardDisqualifiers: true,
  },
  decline: {
    minOverallRisk: 51,
    allowCriticalDimensions: true,
  },
}

/**
 * Disqualifying factors by dimension
 */
export const DISQUALIFYING_FACTORS = {
  clinical_risk: [
    'no_clinical_validation_for_diagnosis_treatment_ai',
    'false_negative_rate_above_2_percent_for_triage_ai',
    'no_clinician_override_for_clinical_decision_support',
    'regulatory_approval_required_but_not_obtained',
  ],
  privacy_risk: [
    'no_privacy_impact_assessment_for_phi_processing',
    'cross_border_data_transfer_without_safeguards',
    'non_compliance_with_pipeda_atipp',
    'no_breach_notification_process',
  ],
  security_risk: [
    'no_encryption_for_phi',
    'no_penetration_testing_ever_conducted',
    'no_incident_response_plan',
    'critical_vulnerabilities_unfixed_over_90_days',
  ],
}

/**
 * Flatten all disqualifying factors for validation
 */
export const ALL_DISQUALIFYING_FACTORS: string[] = Object.values(DISQUALIFYING_FACTORS).flat()

/**
 * Disqualifier tier classification
 *
 * - hard_decline: fundamental safety/architecture gaps -> must recommend 'decline'
 * - remediable_blocker: process/documentation gaps fixable in 30-90 days -> blocks 'approve', allows 'conditional'
 */
export type DisqualifierTier = 'hard_decline' | 'remediable_blocker'

export const DISQUALIFIER_TIER: Record<string, DisqualifierTier> = {
  // Clinical (all hard — fundamental safety gaps)
  no_clinical_validation_for_diagnosis_treatment_ai: 'hard_decline',
  false_negative_rate_above_2_percent_for_triage_ai: 'hard_decline',
  no_clinician_override_for_clinical_decision_support: 'hard_decline',
  regulatory_approval_required_but_not_obtained: 'hard_decline',
  // Privacy (2 hard, 2 remediable)
  no_privacy_impact_assessment_for_phi_processing: 'remediable_blocker',
  cross_border_data_transfer_without_safeguards: 'hard_decline',
  non_compliance_with_pipeda_atipp: 'hard_decline',
  no_breach_notification_process: 'remediable_blocker',
  // Security (2 hard, 2 remediable)
  no_encryption_for_phi: 'hard_decline',
  no_penetration_testing_ever_conducted: 'remediable_blocker',
  no_incident_response_plan: 'remediable_blocker',
  critical_vulnerabilities_unfixed_over_90_days: 'hard_decline',
}

/** All factors classified as hard_decline — must recommend 'decline' */
export const HARD_DISQUALIFIERS: string[] = Object.entries(DISQUALIFIER_TIER)
  .filter(([, tier]) => tier === 'hard_decline')
  .map(([factor]) => factor)

/** All factors classified as remediable_blocker — blocks 'approve', allows 'conditional' */
export const REMEDIABLE_BLOCKERS: string[] = Object.entries(DISQUALIFIER_TIER)
  .filter(([, tier]) => tier === 'remediable_blocker')
  .map(([factor]) => factor)
