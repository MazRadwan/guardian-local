/**
 * Rubric Criteria: New Dimensions (v1.1)
 *
 * Contains the 5 new scored dimensions:
 *   6. Vendor Capability
 *   7. AI Transparency
 *   8. Ethical Considerations
 *   9. Regulatory Compliance
 *  10. Sustainability
 *
 * Sub-score names match SUB_SCORE_RULES in subScoreRules.ts exactly.
 */

export function buildNewDimensionCriteria(): string {
  return `### VENDOR CAPABILITY (0-100, higher is better)

**Sub-scores:**
- company_stability_score (25 points max):
  - established_funded_stable: 25 points (excellent)
  - growing_adequately_funded: 15 points (good)
  - early_stage_funded: 8 points (moderate)
  - unstable_or_unfunded: 0 points (poor)

- healthcare_experience_score (25 points max):
  - extensive_healthcare_deployments: 25 points (excellent)
  - multiple_healthcare_deployments: 15 points (good)
  - limited_healthcare_experience: 8 points (moderate)
  - no_healthcare_experience: 0 points (poor)

- customer_references_score (20 points max):
  - strong_verifiable_references: 20 points (excellent)
  - adequate_references: 12 points (good)
  - limited_references: 6 points (moderate)
  - no_references: 0 points (poor)

- support_capability_score (15 points max):
  - comprehensive_support_sla: 15 points (excellent)
  - adequate_support_model: 10 points (good)
  - basic_support_only: 5 points (moderate)
  - no_formal_support: 0 points (poor)

- roadmap_credibility_score (15 points max):
  - clear_funded_roadmap: 15 points (excellent)
  - documented_roadmap: 10 points (good)
  - vague_roadmap: 5 points (moderate)
  - no_roadmap: 0 points (poor)

**Vendor Capability Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor

---

### AI TRANSPARENCY (0-100, higher is better)

**Sub-scores:**
- model_explainability_score (25 points max):
  - fully_explainable_to_clinicians: 25 points (excellent)
  - adequately_explainable: 15 points (good)
  - limited_explainability: 8 points (moderate)
  - no_explainability: 0 points (poor)

- audit_trail_score (25 points max):
  - comprehensive_audit_logging: 25 points (excellent)
  - adequate_decision_logging: 15 points (good)
  - minimal_logging: 8 points (moderate)
  - no_audit_trail: 0 points (poor)

- confidence_scoring_score (20 points max):
  - calibrated_confidence_reporting: 20 points (excellent)
  - basic_confidence_reporting: 12 points (good)
  - limited_uncertainty_info: 6 points (moderate)
  - no_confidence_scoring: 0 points (poor)

- limitations_documentation_score (15 points max):
  - comprehensive_limitations_docs: 15 points (excellent)
  - adequate_limitations_docs: 10 points (good)
  - minimal_limitations_docs: 5 points (moderate)
  - no_limitations_documented: 0 points (poor)

- interpretability_score (15 points max):
  - highly_interpretable_model: 15 points (excellent)
  - moderately_interpretable: 10 points (good)
  - limited_interpretability: 5 points (moderate)
  - black_box_model: 0 points (poor)

**AI Transparency Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor

---

### ETHICAL CONSIDERATIONS (0-100, higher is better)

**Sub-scores:**
- bias_testing_score (25 points max):
  - systematic_bias_testing_mitigation: 25 points (excellent)
  - regular_bias_testing: 15 points (good)
  - limited_bias_testing: 8 points (moderate)
  - no_bias_testing: 0 points (poor)

- population_fairness_score (25 points max):
  - validated_across_demographics: 25 points (excellent)
  - tested_multiple_demographics: 15 points (good)
  - limited_demographic_testing: 8 points (moderate)
  - no_fairness_testing: 0 points (poor)

- equity_impact_score (20 points max):
  - positive_equity_impact_demonstrated: 20 points (excellent)
  - equity_impact_considered: 12 points (good)
  - minimal_equity_consideration: 6 points (moderate)
  - no_equity_assessment: 0 points (poor)

- indigenous_rural_health_score (15 points max):
  - specific_rural_indigenous_programs: 15 points (excellent)
  - rural_indigenous_considered: 10 points (good)
  - minimal_rural_consideration: 5 points (moderate)
  - no_rural_indigenous_consideration: 0 points (poor)

- algorithmic_justice_score (15 points max):
  - formal_accountability_framework: 15 points (excellent)
  - documented_accountability: 10 points (good)
  - informal_accountability: 5 points (moderate)
  - no_accountability_framework: 0 points (poor)

**Ethical Considerations Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor

---

### REGULATORY COMPLIANCE (0-100, higher is better)

**Sub-scores:**
- health_canada_status_score (25 points max):
  - health_canada_approved: 25 points (excellent)
  - under_health_canada_review: 15 points (good)
  - submission_in_progress: 8 points (moderate)
  - not_submitted: 0 points (poor)

- qms_maturity_score (25 points max):
  - iso_13485_certified: 25 points (excellent)
  - qms_implemented_not_certified: 15 points (good)
  - qms_in_development: 8 points (moderate)
  - no_qms: 0 points (poor)

- clinical_evidence_score (20 points max):
  - rigorous_clinical_evidence: 20 points (excellent)
  - adequate_clinical_evidence: 12 points (good)
  - limited_clinical_evidence: 6 points (moderate)
  - no_clinical_evidence: 0 points (poor)

- post_market_surveillance_score (15 points max):
  - comprehensive_surveillance_program: 15 points (excellent)
  - adequate_monitoring_program: 10 points (good)
  - basic_monitoring: 5 points (moderate)
  - no_post_market_surveillance: 0 points (poor)

- regulatory_roadmap_score (15 points max):
  - clear_regulatory_milestones: 15 points (excellent)
  - documented_regulatory_plan: 10 points (good)
  - vague_regulatory_plan: 5 points (moderate)
  - no_regulatory_plan: 0 points (poor)

**Regulatory Compliance Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor

---

### SUSTAINABILITY (0-100, higher is better)

**Sub-scores:**
- itil4_service_maturity_score (25 points max):
  - level_4_5_optimizing: 25 points (excellent)
  - level_3_defined: 15 points (good)
  - level_2_repeatable: 8 points (moderate)
  - level_0_1_incomplete: 0 points (poor)

- nist_csf_alignment_score (20 points max):
  - tier_4_adaptive: 20 points (excellent)
  - tier_3_repeatable: 12 points (good)
  - tier_2_risk_informed: 6 points (moderate)
  - tier_1_partial: 0 points (poor)

- support_model_sustainability_score (20 points max):
  - long_term_support_guaranteed: 20 points (excellent)
  - adequate_long_term_support: 12 points (good)
  - limited_support_commitment: 6 points (moderate)
  - no_long_term_support: 0 points (poor)

- bcp_disaster_recovery_score (20 points max):
  - comprehensive_bcp_dr_tested: 20 points (excellent)
  - documented_bcp_dr: 12 points (good)
  - basic_bcp_only: 6 points (moderate)
  - no_bcp_dr: 0 points (poor)

- total_cost_of_ownership_score (15 points max):
  - tco_reasonable_transparent: 15 points (excellent)
  - tco_documented: 10 points (good)
  - tco_unclear: 5 points (moderate)
  - tco_unreasonable: 0 points (poor)

**Sustainability Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor`;
}
