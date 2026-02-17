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
 * Build scoring system prompt with full rubric criteria
 * @param isoControls - Optional ISO control catalog for system prompt injection
 */
export function buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string {
  const dimensionList = buildDimensionList();
  const disqualifyingList = buildDisqualifyingList();
  const rubricCriteria = buildRubricCriteria();

  // Build ISO catalog section from provided controls or empty fallback
  const isoCatalog = isoControls
    ? buildISOCatalogSection(isoControls)
    : buildISOCatalogSection();

  const prompt = `You are Guardian, a healthcare AI governance expert conducting a vendor risk assessment for NLHS (Newfoundland & Labrador Health Services).

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

  return isoCatalog ? `${prompt}\n\n${isoCatalog}` : prompt;
}

/**
 * Build user prompt with responses
 * @param params - Vendor info, responses, and optional ISO applicability controls
 */
export function buildScoringUserPrompt(params: {
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
}): string {
  const { vendorName, solutionName, solutionType, responses, isoControls } = params;

  const weightedDimensions = buildWeightedDimensions(solutionType);
  const responsesText = formatResponsesForPrompt(responses);

  // Build ISO applicability section from provided controls or empty fallback
  const isoApplicability = isoControls
    ? buildISOApplicabilitySection(isoControls)
    : buildISOApplicabilitySection();
  const isoSection = isoApplicability ? `\n\n${isoApplicability}` : '';

  return `## Vendor Assessment

**Vendor:** ${vendorName}
**Solution:** ${solutionName}
**Solution Type:** ${solutionType.replace(/_/g, ' ')}

## COMPOSITE SCORE WEIGHTING

**IMPORTANT:** Use these weights for the composite score calculation:
${weightedDimensions}

All other dimensions are scored but do NOT contribute to the composite score.

## Questionnaire Responses

${responsesText}${isoSection}

---

Please analyze these responses and provide your risk assessment.`;
}
