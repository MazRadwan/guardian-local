/**
 * Scoring Analysis Prompt
 *
 * Part of Epic 15: Questionnaire Scoring & Analysis
 * Epic 37: ISO enrichment + confidence instructions
 *
 * SOURCE: GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md Part IV
 */

import { RUBRIC_VERSION, SolutionType, ALL_DIMENSIONS, DIMENSION_CONFIG } from '../../../domain/scoring/rubric.js';
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

## Disqualifying Factors (Two-Tier System)

Each factor below is classified by tier. Use the exact canonical key (underscore_separated) in the disqualifyingFactors array.

${disqualifyingList}

**Tier rules:**
- **AUTOMATIC DECLINE** factors represent fundamental safety/architecture gaps that cannot be remediated. If ANY are present, you MUST recommend 'decline'.
- **REQUIRES REMEDIATION PLAN** factors represent process/documentation gaps fixable in 30-90 days. If ONLY these are present (no AUTOMATIC DECLINE factors), recommend 'conditional' with specific remediation items and timelines.

---

## Recommendation Logic

**APPROVE** (overall risk <=30):
- No CRITICAL dimensions
- Maximum 1 HIGH dimension
- No disqualifying factors of any tier

**CONDITIONAL** (overall risk 31-50):
- No AUTOMATIC DECLINE disqualifying factors
- REQUIRES REMEDIATION PLAN factors allowed (must include remediation items)
- Gaps are remediable within reasonable timeframe

**DECLINE** (overall risk >50 OR):
- Any AUTOMATIC DECLINE disqualifying factor present
- Multiple CRITICAL dimensions

**MORE_INFO**:
- Insufficient information to assess key dimensions

---

## Output Format
${process.env.LOCAL_MODEL_NAME ? LOCAL_MODEL_OUTPUT_FORMAT : DEFAULT_OUTPUT_FORMAT}
${CONFIDENCE_AND_ISO_INSTRUCTIONS}`;
}

/** Default output format for Claude */
const DEFAULT_OUTPUT_FORMAT = `
1. **First**: Stream narrative report in markdown:
   - Executive Summary (2-3 paragraphs)
   - Per-dimension analysis with sub-scores
   - Key risks and recommendations

2. **Then**: Call \`scoring_complete\` tool with structured scores`;

/**
 * Scoring-only output format for local models (two-phase narrative strategy).
 *
 * Phase 1 (this prompt): Model focuses entirely on accurate scoring. Produces
 * a brief executive summary for the streaming UX, then calls scoring_complete.
 * The full detailed narrative is generated separately at export/download time
 * by ExportNarrativeGenerator, which has a dedicated prompt and full token
 * budget for prose quality.
 *
 * Why: Local models (e.g. Qwen 3B active params) produce shallow narratives
 * when asked to score AND write a 20-page report in one shot. Splitting the
 * work lets each call focus on what it does best.
 */
const LOCAL_MODEL_OUTPUT_FORMAT = `
Your PRIMARY job is accurate scoring. Follow these steps IN THIS ORDER:

1. **FIRST**: Call \`scoring_complete\` tool with ALL structured scores immediately.
2. **THEN**: Write a brief executive summary (2-3 short paragraphs max).

You MUST call the tool BEFORE writing any narrative text. Do not write analysis, do not explain your reasoning — just call the tool first.

**IMPORTANT:** Focus your effort on scoring accuracy — correct sub-scores, dimension totals, composite calculation, and disqualifying factor identification. The detailed narrative report will be generated separately.

**WRITING RULES for the brief summary (AFTER the tool call):**
- NEVER write underscore_names. Convert: evidence_quality_score → "Evidence Quality"
- NEVER show arithmetic formulas
- NEVER write enum values in parentheses
- Keep the summary under 500 words`;

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
- For RISK dimensions (${ALL_DIMENSIONS.filter(d => DIMENSION_CONFIG[d].type === 'risk').join(', ')}): use score directly (lower = less risk)
- For CAPABILITY dimensions (${ALL_DIMENSIONS.filter(d => DIMENSION_CONFIG[d].type === 'capability').join(', ')}): convert to risk-equivalent = (100 - score)
- Composite = sum of (weight% x risk_equivalent_score) for ALL dimensions listed above
- All 10 dimensions contribute to the composite score
- Example: if clinical_risk=20 (weight 25%) and vendor_capability=80 (weight 5%): contribution = 20x0.25 + (100-80)x0.05 = 5.0 + 1.0 = 6.0

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
