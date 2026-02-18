/**
 * Scoring Analysis Prompt
 *
 * Part of Epic 15: Questionnaire Scoring & Analysis
 * Epic 37: ISO enrichment + confidence instructions
 *
 * SOURCE: GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md Part IV
 */

import { RUBRIC_VERSION, SolutionType } from '../../../domain/scoring/rubric.js';
import type { ISOControlForPrompt } from '../../../domain/compliance/types.js';
import {
  buildDimensionList,
  buildDisqualifyingList,
  buildRubricCriteria,
  formatResponsesForPrompt,
  buildWeightedDimensions,
} from './scoringPrompt.helpers.js';
import { buildISOCatalogSection, buildISOApplicabilitySection } from './scoringPrompt.iso.js';

/** Confidence + ISO instructions appended to system prompt */
const CONFIDENCE_AND_ISO_INSTRUCTIONS = `
## Assessment Confidence

For EACH dimension, provide an assessmentConfidence in your findings:
- level: "high" (specific verifiable evidence), "medium" (partial evidence), or "low" (vague claims)
- rationale: Explain WHY this confidence level, citing specific evidence and ISO references

A bare confidence level without rationale is NOT acceptable.

## ISO Clause References

For EACH ISO-mapped dimension, include isoClauseReferences listing relevant clauses and their alignment status:
- "aligned": Vendor evidence directly supports this control
- "partial": Some evidence but gaps remain
- "not_evidenced": No evidence provided for this control
- "not_applicable": Control is not relevant to this assessment

For Clinical Risk, Vendor Capability, Ethical Considerations, and Sustainability: these are Guardian-native dimensions with no ISO mapping. Set isoClauseReferences to an empty array [] for these dimensions.

## ISO Messaging Rules
- Use "ISO-traceable" or "ISO-informed" language
- Do NOT use "ISO-compliant", "ISO-certified", or "meets ISO requirements"`;

/**
 * Build scoring system prompt with full rubric criteria.
 * Static and fully cacheable -- no per-assessment variation.
 * ISO controls have been moved to the user prompt (Story 39.3.3).
 */
export function buildScoringSystemPrompt(): string {
  const dimensionList = buildDimensionList();
  const disqualifyingList = buildDisqualifyingList();
  const rubricCriteria = buildRubricCriteria();

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

${rubricCriteria}

---

## Disqualifying Factors (automatic DECLINE)

${disqualifyingList}

---

## Recommendation Logic

**APPROVE** (overall risk <=30):
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

2. **Then**: Call \`scoring_complete\` tool with structured scores${CONFIDENCE_AND_ISO_INSTRUCTIONS}`;
}

/** User prompt params shared by buildScoringUserPrompt and buildScoringUserPromptParts */
interface UserPromptParams {
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  responses: Array<{
    sectionNumber: number;
    questionNumber: number;
    questionText: string;
    responseText: string;
  }>;
  isoControls?: ISOControlForPrompt[];
  isoCatalog?: ISOControlForPrompt[];
}

/** Build the vendor/applicability section (everything except ISO catalog) */
function buildVendorSection(params: UserPromptParams): string {
  const { vendorName, solutionName, solutionType, responses, isoControls } = params;
  const weightedDimensions = buildWeightedDimensions(solutionType);
  const responsesText = formatResponsesForPrompt(responses);

  const isoApplicability = isoControls
    ? buildISOApplicabilitySection(isoControls)
    : buildISOApplicabilitySection();

  let section = '';
  if (isoApplicability) {
    section += `${isoApplicability}\n\n---\n\n`;
  }

  section += `## Vendor Assessment

**Vendor:** ${vendorName}
**Solution:** ${solutionName}
**Solution Type:** ${solutionType.replace(/_/g, ' ')}

## COMPOSITE SCORE WEIGHTING

**IMPORTANT:** Use these weights for the composite score calculation:
${weightedDimensions}

**Composite Formula:**
- For RISK dimensions (clinical_risk, privacy_risk, security_risk): use score directly (lower = less risk)
- For CAPABILITY dimensions (technical_credibility, operational_excellence): convert to risk-equivalent = (100 - score)
- Composite = sum of (weight% x risk_equivalent_score) for all weighted dimensions
- Example: if clinical_risk=20 (weight 40%) and technical_credibility=80 (weight 15%): contribution = 20x0.40 + (100-80)x0.15 = 8 + 3 = 11

All other dimensions are scored but do NOT contribute to the composite score.

## Questionnaire Responses

${responsesText}

---

Please analyze these responses and provide your risk assessment.`;

  return section;
}

/**
 * Build user prompt with responses (single string).
 * @param params - Vendor info, responses, optional ISO catalog and applicability controls
 */
export function buildScoringUserPrompt(params: UserPromptParams): string {
  const catalogSection = params.isoCatalog?.length
    ? buildISOCatalogSection(params.isoCatalog)
    : '';

  let prompt = '';
  if (catalogSection) {
    prompt += `${catalogSection}\n\n---\n\n`;
  }
  prompt += buildVendorSection(params);
  return prompt;
}

/**
 * Build user prompt as separate parts for multi-block caching (Story 39.3.4).
 * Returns ISO catalog and vendor sections separately so ScoringPromptBuilder
 * can wrap the catalog in a cached ContentBlock.
 *
 * @param params - Must include isoCatalog with at least one control
 * @returns { catalogSection, vendorSection } for multi-block assembly
 */
export function buildScoringUserPromptParts(params: UserPromptParams): {
  catalogSection: string;
  vendorSection: string;
} {
  const catalogSection = params.isoCatalog?.length
    ? buildISOCatalogSection(params.isoCatalog)
    : '';

  const vendorSection = buildVendorSection(params);

  return { catalogSection, vendorSection };
}
