/**
 * Scoring Analysis Prompt
 *
 * Part of Epic 15: Questionnaire Scoring & Analysis
 *
 * SOURCE: GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md Part IV
 */

import { RUBRIC_VERSION, SolutionType } from '../../../domain/scoring/rubric.js';
import {
  buildDimensionList,
  buildDisqualifyingList,
  buildRubricCriteria,
  formatResponsesForPrompt,
  buildWeightedDimensions,
} from './scoringPrompt.helpers.js';
import { buildISOCatalogSection, buildISOApplicabilitySection } from './scoringPrompt.iso.js';

/**
 * Build scoring system prompt with full rubric criteria
 */
export function buildScoringSystemPrompt(): string {
  const dimensionList = buildDimensionList();
  const disqualifyingList = buildDisqualifyingList();
  const rubricCriteria = buildRubricCriteria();

  // Append ISO catalog section (populated in Sprint 6)
  const isoCatalog = buildISOCatalogSection();

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

2. **Then**: Call \`scoring_complete\` tool with structured scores`;

  return isoCatalog ? `${prompt}\n\n${isoCatalog}` : prompt;
}

/**
 * Build user prompt with responses
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
}): string {
  const { vendorName, solutionName, solutionType, responses } = params;

  const weightedDimensions = buildWeightedDimensions(solutionType);
  const responsesText = formatResponsesForPrompt(responses);

  // Append ISO applicability section (populated in Sprint 6)
  const isoApplicability = buildISOApplicabilitySection();
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
