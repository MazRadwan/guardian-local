/**
 * Rubric Criteria: Existing Dimensions (v1.0)
 *
 * Contains the 5 original scored dimensions:
 *   1. Clinical Risk
 *   2. Privacy Risk
 *   3. Security Risk
 *   4. Technical Credibility
 *   5. Operational Excellence
 *
 * Verbatim move from scoringPrompt.helpers.ts (Story 40.1.4).
 * Each dimension includes sub-scores, point values, and rating scales.
 */

export function buildExistingDimensionCriteria(): string {
  return `### CLINICAL RISK (0-100, lower is better)

**Sub-scores:**
- evidence_quality_score (40 points max):
  - peer_reviewed_RCT: 0 points (excellent)
  - prospective_observational: 10 points (good)
  - retrospective_analysis: 20 points (moderate)
  - case_series: 30 points (weak)
  - vendor_testing_only: 40 points (inadequate)

- regulatory_status_score (20 points max):
  - health_canada_approved: 0 points
  - under_review: 10 points
  - not_submitted: 15 points
  - not_applicable_but_should_be: 20 points

- patient_safety_score (20 points max):
  - robust_safety_mechanisms: 0 points
  - adequate_safety_mechanisms: 10 points
  - minimal_safety_mechanisms: 15 points
  - no_safety_mechanisms: 20 points

- population_relevance_score (10 points max):
  - validated_in_similar_population: 0 points
  - validated_in_different_population: 5 points
  - not_validated_in_any_population: 10 points

- workflow_integration_score (10 points max):
  - clinician_in_control: 0 points
  - clinician_can_override: 5 points
  - difficult_to_override: 8 points
  - no_override_capability: 10 points

**Clinical Risk Rating:**
- 0-20: Low Risk
- 21-40: Medium Risk
- 41-60: High Risk
- 61-100: Critical Risk

---

### PRIVACY RISK (0-100, lower is better)

**Sub-scores:**
- pipeda_compliance_score (30 points max):
  - fully_compliant: 0 points
  - minor_gaps: 10 points
  - significant_gaps: 20 points
  - non_compliant: 30 points

- atipp_compliance_score (25 points max):
  - fully_compliant: 0 points
  - minor_gaps: 10 points
  - significant_gaps: 20 points
  - non_compliant: 25 points

- phi_protection_score (20 points max):
  - encryption_at_rest_and_transit: 0 points
  - encryption_transit_only: 10 points
  - weak_encryption: 15 points
  - no_encryption: 20 points

- consent_mechanism_score (15 points max):
  - explicit_informed_consent: 0 points
  - implied_consent_adequate: 5 points
  - unclear_consent: 10 points
  - no_consent_mechanism: 15 points

- data_subject_rights_score (10 points max):
  - full_rights_supported: 0 points
  - partial_rights_supported: 5 points
  - no_rights_mechanism: 10 points

**Privacy Risk Rating:**
- 0-20: Low Risk
- 21-40: Medium Risk
- 41-60: High Risk
- 61-100: Critical Risk

---

### SECURITY RISK (0-100, lower is better)

**Sub-scores:**
- security_architecture_score (25 points max):
  - defense_in_depth_strong: 0 points
  - defense_in_depth_adequate: 10 points
  - basic_security_controls: 20 points
  - inadequate_architecture: 25 points

- access_control_score (20 points max):
  - mfa_rbac_strong: 0 points
  - mfa_basic_rbac: 10 points
  - basic_authentication: 15 points
  - weak_authentication: 20 points

- vulnerability_management_score (20 points max):
  - proactive_pentesting_bugbounty: 0 points
  - regular_pentesting: 10 points
  - occasional_scanning: 15 points
  - no_vuln_management: 20 points

- incident_response_score (15 points max):
  - ir_plan_tested: 0 points
  - ir_plan_documented: 8 points
  - ir_plan_basic: 12 points
  - no_ir_plan: 15 points

- certifications_score (10 points max):
  - soc2_iso27001_hitrust: 0 points
  - soc2_or_iso27001: 5 points
  - no_certifications: 10 points

- phi_specific_controls_score (10 points max):
  - comprehensive_phi_controls: 0 points
  - adequate_phi_controls: 5 points
  - minimal_phi_controls: 8 points
  - no_phi_specific_controls: 10 points

**Security Risk Rating:**
- 0-20: Low Risk
- 21-40: Medium Risk
- 41-60: High Risk
- 61-100: Critical Risk

---

### TECHNICAL CREDIBILITY (0-100, higher is better)

**Sub-scores:**
- ai_architecture_score (25 points max):
  - state_of_art_best_practices: 25 points
  - solid_architecture: 15 points
  - adequate_architecture: 10 points
  - concerning_architecture: 0 points

- development_practices_score (20 points max):
  - devops_cicd_testing: 20 points
  - structured_development: 12 points
  - basic_development: 6 points
  - ad_hoc_development: 0 points

- validation_testing_score (20 points max):
  - comprehensive_validation: 20 points
  - adequate_testing: 12 points
  - minimal_testing: 6 points
  - no_systematic_testing: 0 points

- documentation_score (15 points max):
  - comprehensive_current: 15 points
  - adequate_documentation: 9 points
  - minimal_documentation: 3 points
  - poor_documentation: 0 points

- explainability_score (20 points max):
  - highly_interpretable: 20 points
  - adequately_explainable: 12 points
  - limited_explainability: 6 points
  - black_box: 0 points

**Technical Credibility Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor

---

### OPERATIONAL EXCELLENCE (0-100, higher is better)

**Sub-scores:**
- itil4_maturity_score (30 points max):
  - level_5_optimizing: 30 points
  - level_4_managed: 24 points
  - level_3_defined: 18 points
  - level_2_repeatable: 12 points
  - level_1_initial: 6 points
  - level_0_incomplete: 0 points

- nist_csf_tier_score (25 points max):
  - tier_4_adaptive: 25 points
  - tier_3_repeatable: 18 points
  - tier_2_risk_informed: 10 points
  - tier_1_partial: 0 points

- support_model_score (20 points max):
  - 24_7_15min_response: 20 points
  - 24_7_1hr_response: 15 points
  - business_hours_24hr_response: 10 points
  - business_hours_only: 5 points

- change_management_score (15 points max):
  - robust_change_management: 15 points
  - adequate_change_management: 9 points
  - basic_change_management: 3 points
  - no_change_management: 0 points

- fte_sustainability_score (10 points max):
  - fte_requirements_reasonable: 10 points
  - fte_requirements_challenging: 5 points
  - fte_requirements_unrealistic: 0 points

**Operational Excellence Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Concerning
- 0-39: Inadequate

**NLHS Minimum Acceptable Standards:**
- ITIL4: Level 3 (Defined) minimum
- NIST CSF: Tier 2 (Risk Informed) minimum, prefer Tier 3
- Support: 24/7 for critical clinical systems
- Change Management: Adequate or better`;
}
