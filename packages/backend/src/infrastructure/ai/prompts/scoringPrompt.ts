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

/** Detailed output template for local models — concrete structure Qwen can follow */
const LOCAL_MODEL_OUTPUT_FORMAT = `
Stream a narrative report in markdown following this EXACT structure, then call \`scoring_complete\`.

### Executive Summary
Write 2-3 paragraphs. State the composite score, recommendation, and top concerns.

### Per-Dimension Analysis
For EACH dimension, write EXACTLY this format:

---
## [Dimension Name] (Score: XX/100 — [RATING])

**Assessment Confidence:** [High/Medium/Low] — [one sentence rationale]

[2-3 paragraphs of findings written as flowing prose. Describe each sub-score naturally in sentences. Cite evidence as [Section X, Q Y]. End with the dimension total.]

**Specific Risks:**
- [Risk described in plain English]

**Recommended Mitigations:**
1. [Action with timeline]

---

### EXAMPLE of one dimension written correctly:

## Clinical Risk (Score: 75/100 — CRITICAL)

**Assessment Confidence:** Medium — Evidence is based on vendor claims without independent verification.

The vendor's evidence base presents significant concerns. Evidence Quality scored the maximum risk of 40, as ApolloChat relies entirely on an internal retrospective review of 12,000 patient interactions with no peer-reviewed studies or independent clinical validation. Prospective validation is expected in Q4 2026, but this remains unconfirmed [Section 1, Q 2].

Regulatory Status scored 15, as no Health Canada Medical Device Licence or FDA 510(k) application has been submitted. The vendor claims the solution does not meet the medical device classification threshold, but this interpretation has not been independently verified [Section 8, Q 1]. Patient Safety scored 10, reflecting a tiered safety framework with escalation for high-risk symptoms and human-in-the-loop during operating hours [Section 3, Q 4].

Population Relevance scored 5, with training data predominantly English and skewed toward UK/US populations, though Canadian-specific content has been added as fine-tuning [Section 6, Q 1]. Workflow Integration scored 5, as override capability requires a Premium tier while Standard tier receives read-only audit access [Section 4, Q 2]. Clinical Risk totaled 75 out of 100, placing it in the critical range.

**Specific Risks:**
- No independent clinical validation or peer-reviewed evidence
- Unverified regulatory classification claim
- Human oversight limited to operating hours only

**Recommended Mitigations:**
1. Require independent clinical validation study before deployment (0-6 months)
2. Obtain formal Health Canada regulatory opinion on device classification (0-3 months)
3. Implement 24/7 automated safety escalation for high-risk symptoms (0-3 months)

### END EXAMPLE — Follow this style for ALL 10 dimensions.

### Compliance Assessment
Subsections for PIPEDA, Provincial Health Laws, Health Canada regulations.

### Recommendations
**Priority 1: Critical (Deployment Blockers)** → numbered items
**Priority 2: High-Priority** → numbered items
**Priority 3: Operational Enhancements** → numbered items

### Conclusion
Bold recommendation, brief justification, numbered next steps.

### WRITING RULES (FOLLOW STRICTLY):
- NEVER write underscore_names. Convert: evidence_quality_score → "Evidence Quality"
- NEVER show arithmetic: ~~"40 + 15 + 10 + 5 + 5 = 75"~~
- NEVER write parenthetical enums: ~~"(vendor_testing_only)"~~
- Always cite evidence: [Section X, Q Y]`;

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
