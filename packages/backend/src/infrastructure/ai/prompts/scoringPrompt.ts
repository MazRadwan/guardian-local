/**
 * Scoring Analysis Prompt
 *
 * Part of Epic 15: Questionnaire Scoring & Analysis
 *
 * SOURCE: GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md Part IV
 */

import { RiskDimension } from '../../../domain/types/QuestionnaireSchema'
import {
  RUBRIC_VERSION,
  DIMENSION_CONFIG,
  ALL_DIMENSIONS,
  DISQUALIFYING_FACTORS,
  DIMENSION_WEIGHTS,
  SolutionType,
} from '../../../domain/scoring/rubric'

/**
 * Build scoring system prompt with full rubric criteria
 */
export function buildScoringSystemPrompt(): string {
  const dimensionList = ALL_DIMENSIONS.map(d =>
    `- ${DIMENSION_CONFIG[d].label} (${DIMENSION_CONFIG[d].type})`
  ).join('\n')

  const disqualifyingList = Object.entries(DISQUALIFYING_FACTORS)
    .flatMap(([dimension, factors]) => factors.map(f => `- [${dimension}] ${f.replace(/_/g, ' ')}`))
    .join('\n')

  return `You are Guardian, a healthcare AI governance expert conducting a vendor risk assessment for NLHS (Newfoundland & Labrador Health Services).

## Your Task

Analyze the vendor's completed questionnaire responses and produce:
1. A narrative risk assessment report (streamed as markdown)
2. Structured scores via the \`scoring_complete\` tool

## Rubric Version: ${RUBRIC_VERSION}

## 10 Risk Dimensions

${dimensionList}

---

## GUARDIAN RUBRIC CRITERIA

### CLINICAL RISK (0-100, lower is better)

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
- pipeda_compliance_score (30 points max)
- atipp_compliance_score (25 points max)
- phi_protection_score (20 points max)
- consent_mechanism_score (15 points max)
- data_subject_rights_score (10 points max)

---

### SECURITY RISK (0-100, lower is better)

**Sub-scores:**
- security_architecture_score (25 points max)
- access_control_score (20 points max)
- vulnerability_management_score (20 points max)
- incident_response_score (15 points max)
- certifications_score (10 points max)
- phi_specific_controls_score (10 points max)

---

### TECHNICAL CREDIBILITY (0-100, higher is better)

**Sub-scores:**
- ai_architecture_score (25 points max)
- development_practices_score (20 points max)
- validation_testing_score (20 points max)
- documentation_score (15 points max)
- explainability_score (20 points max)

---

### OPERATIONAL EXCELLENCE (0-100, higher is better)

**Sub-scores:**
- itil4_maturity_score (30 points max)
- nist_csf_tier_score (25 points max)
- support_model_score (20 points max)
- change_management_score (15 points max)
- fte_sustainability_score (10 points max)

---

## Disqualifying Factors (automatic DECLINE)

${disqualifyingList}

---

## Recommendation Logic

**APPROVE** (overall risk ≤30):
- No CRITICAL dimensions
- Maximum 1 HIGH dimension
- No disqualifying factors

**CONDITIONAL** (overall risk 31-50):
- No disqualifying factors
- Gaps are remediable within reasonable timeframe

**DECLINE** (overall risk >50 OR):
- Any disqualifying factor present
- Multiple CRITICAL dimensions

**MORE_INFO**:
- Insufficient information to assess key dimensions

---

## Output Format

1. **First**: Stream narrative report in markdown:
   - Executive Summary (2-3 paragraphs)
   - Per-dimension analysis with sub-scores
   - Key risks and recommendations

2. **Then**: Call \`scoring_complete\` tool with structured scores
`
}

/**
 * Build user prompt with responses
 */
export function buildScoringUserPrompt(params: {
  vendorName: string
  solutionName: string
  solutionType: SolutionType
  responses: Array<{
    sectionNumber: number
    questionNumber: number
    questionText: string
    responseText: string
  }>
}): string {
  const { vendorName, solutionName, solutionType, responses } = params

  const weights = DIMENSION_WEIGHTS[solutionType]
  const weightedDimensions = Object.entries(weights)
    .filter(([_, weight]) => weight > 0)
    .map(([dim, weight]) => `  - ${DIMENSION_CONFIG[dim as RiskDimension].label}: ${weight}%`)
    .join('\n')

  const responsesText = responses.map(r =>
    `### Section ${r.sectionNumber}, Question ${r.questionNumber}\n**Q:** ${r.questionText}\n**A:** ${r.responseText}`
  ).join('\n\n')

  return `## Vendor Assessment

**Vendor:** ${vendorName}
**Solution:** ${solutionName}
**Solution Type:** ${solutionType.replace(/_/g, ' ')}

## COMPOSITE SCORE WEIGHTING

**IMPORTANT:** Use these weights for the composite score calculation:
${weightedDimensions}

All other dimensions are scored but do NOT contribute to the composite score.

## Questionnaire Responses

${responsesText}

---

Please analyze these responses and provide your risk assessment.`
}
