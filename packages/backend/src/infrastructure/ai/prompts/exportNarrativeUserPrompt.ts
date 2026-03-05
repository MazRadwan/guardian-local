/**
 * Export Narrative User Prompt
 *
 * Dynamic prompt with scoring data and evidence.
 * Extracted from exportNarrativePrompt.ts for single responsibility.
 *
 * Part of Epic 20: Scoring Optimisation
 * Refactored in Epic 38: File splitting
 */

import { RiskDimension } from '../../../domain/types/QuestionnaireSchema.js';
import {
  DIMENSION_CONFIG,
  DIMENSION_WEIGHTS,
  SolutionType,
} from '../../../domain/scoring/rubric.js';
import {
  RiskRating,
  Recommendation,
  DimensionScoreData,
} from '../../../domain/scoring/types.js';

/**
 * Depth targets appended to the END of the user prompt for local models.
 * Positioned last so the model sees these right before generating (recency bias).
 */
const LOCAL_MODEL_DEPTH_TARGETS = `

## DEPTH REQUIREMENTS — READ THIS LAST, FOLLOW STRICTLY

You MUST write a THOROUGH report. Do NOT stop early.

**Per Dimension (write ALL 10):**
- Key Findings: 2-3 paragraphs, 3-4 sentences each
- Specific Risks: at least 4-5 bullet points
- Mitigations: at least 3-4 numbered items with timelines

**Compliance Assessment:** at least 4 PIPEDA gaps, 3 ATIPP items
**Recommendations:** at least 4 items per priority tier (P1, P2, P3)
**Conclusion:** recommendation + at least 4 next steps

**TARGET: at least 5000 words total. You have 65,000 tokens of budget. USE IT. Keep writing until ALL 10 dimensions and ALL sections are complete.**
`;

/**
 * Maximum characters for individual vendor response truncation.
 * Keeps input within token budget while preserving evidence.
 */
export const MAX_RESPONSE_LENGTH = 500;

/**
 * Maximum number of top responses to include per assessment.
 * Selected based on evidence relevance from findings.
 */
export const MAX_TOP_RESPONSES = 30;

/**
 * Truncate text to maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format dimension score for display
 */
function formatDimensionScore(dimScore: DimensionScoreData): string {
  const config = DIMENSION_CONFIG[dimScore.dimension];
  const label = config?.label || dimScore.dimension.replace(/_/g, ' ');
  const type = config?.type || 'unknown';

  let output = `### ${label}\n`;
  output += `- **Score:** ${dimScore.score}/100\n`;
  output += `- **Rating:** ${dimScore.riskRating.toUpperCase()}\n`;
  output += `- **Type:** ${type === 'risk' ? 'Risk (lower is better)' : 'Capability (higher is better)'}\n`;

  // ISO enrichment from findings (Epic 38)
  if (dimScore.findings?.assessmentConfidence) {
    const conf = dimScore.findings.assessmentConfidence;
    output += `- **Assessment Confidence:** ${conf.level.toUpperCase()} - ${conf.rationale}\n`;
  }

  if (dimScore.findings?.isoClauseReferences && dimScore.findings.isoClauseReferences.length > 0) {
    output += '\n**ISO Clause Alignment:**\n';
    for (const ref of dimScore.findings.isoClauseReferences) {
      output += `- ${ref.clauseRef} (${ref.framework}): ${ref.title} - **${ref.status.toUpperCase()}**\n`;
    }
  }

  if (dimScore.findings) {
    if (dimScore.findings.subScores && dimScore.findings.subScores.length > 0) {
      output += '\n**Sub-scores:**\n';
      for (const sub of dimScore.findings.subScores) {
        output += `- ${sub.name}: ${sub.score}/${sub.maxScore}`;
        if (sub.notes) {
          output += ` - ${sub.notes}`;
        }
        output += '\n';
      }
    }

    if (dimScore.findings.keyRisks && dimScore.findings.keyRisks.length > 0) {
      output += '\n**Key Risks:**\n';
      for (const risk of dimScore.findings.keyRisks) {
        output += `- ${risk}\n`;
      }
    }

    if (dimScore.findings.mitigations && dimScore.findings.mitigations.length > 0) {
      output += '\n**Recommended Mitigations:**\n';
      for (const mit of dimScore.findings.mitigations) {
        output += `- ${mit}\n`;
      }
    }

    if (dimScore.findings.evidenceRefs && dimScore.findings.evidenceRefs.length > 0) {
      output += '\n**Evidence References:**\n';
      for (const ref of dimScore.findings.evidenceRefs) {
        const quote = ref.quote ? truncateText(ref.quote, 100) : 'N/A';
        output += `- [Section ${ref.sectionNumber}, Q ${ref.questionNumber}]: "${quote}"\n`;
      }
    }
  }

  return output;
}

/**
 * Build the export narrative user prompt
 *
 * Contains scoring results and top vendor responses for evidence-based
 * narrative generation.
 */
export function buildExportNarrativeUserPrompt(params: {
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  compositeScore: number;
  overallRiskRating: RiskRating;
  recommendation: Recommendation;
  dimensionScores: DimensionScoreData[];
  keyFindings: string[];
  executiveSummary: string;
  topResponses: Array<{
    sectionNumber: number;
    questionNumber: number;
    questionText: string;
    responseText: string;
  }>;
}): string {
  const {
    vendorName,
    solutionName,
    solutionType,
    compositeScore,
    overallRiskRating,
    recommendation,
    dimensionScores,
    keyFindings,
    executiveSummary,
    topResponses,
  } = params;

  // Get weights for this solution type
  const weights = DIMENSION_WEIGHTS[solutionType];
  const weightedDimensions = Object.entries(weights)
    .filter(([_, weight]) => weight > 0)
    .map(
      ([dim, weight]) =>
        `- ${DIMENSION_CONFIG[dim as RiskDimension]?.label || dim}: ${weight}%`
    )
    .join('\n');

  // Format key findings
  const findingsText =
    keyFindings.length > 0
      ? keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')
      : 'No key findings recorded.';

  // Format dimension scores
  const dimensionScoresText = dimensionScores
    .map((ds) => formatDimensionScore(ds))
    .join('\n---\n\n');

  // Identify Guardian-native dimensions (no ISO mapping)
  const GUARDIAN_NATIVE: RiskDimension[] = [
    'clinical_risk', 'vendor_capability', 'ethical_considerations', 'sustainability',
  ];
  const guardianNativeDims = dimensionScores
    .filter((ds) => GUARDIAN_NATIVE.includes(ds.dimension))
    .map((ds) => DIMENSION_CONFIG[ds.dimension]?.label || ds.dimension);
  const guardianNativeNote = guardianNativeDims.length > 0
    ? `\n**Guardian-Native Dimensions:** ${guardianNativeDims.join(', ')} are assessed using Guardian healthcare-specific criteria without ISO control mapping.\n`
    : '';

  // Format top responses with truncation
  const responsesText = topResponses
    .slice(0, MAX_TOP_RESPONSES)
    .map((r) => {
      const truncatedResponse = truncateText(r.responseText, MAX_RESPONSE_LENGTH);
      return `### [Section ${r.sectionNumber}, Q ${r.questionNumber}]\n**Q:** ${r.questionText}\n**A:** ${truncatedResponse}`;
    })
    .join('\n\n');

  // Get recommendation display text
  const recommendationDisplay = {
    approve: 'APPROVE - Proceed with standard monitoring',
    conditional: 'CONDITIONAL APPROVAL - Proceed with specific requirements',
    decline: 'DECLINE - Do not proceed',
    more_info: 'MORE INFORMATION REQUIRED - Cannot make recommendation',
  }[recommendation];

  return `## Vendor Assessment Summary

**Vendor:** ${vendorName}
**Solution:** ${solutionName}
**Solution Type:** ${solutionType.replace(/_/g, ' ')}

---

## Scoring Results

**Composite Score:** ${compositeScore}/100
**Overall Risk Rating:** ${overallRiskRating.toUpperCase()}
**Recommendation:** ${recommendationDisplay}

### Weighting Applied (${solutionType.replace(/_/g, ' ')})

${weightedDimensions}

---

## Executive Summary (from Scoring)

${executiveSummary || 'No executive summary available.'}

---

## Key Findings

${findingsText}

---

## Dimension Scores

${dimensionScoresText || 'No dimension scores available.'}
${guardianNativeNote}
---

## Vendor Responses (Selected Evidence)

The following responses are provided for evidence citation in your narrative.
Reference them using [Section X, Q Y] format.

${responsesText || 'No vendor responses available.'}

---

## Instructions

Generate detailed analysis following the structure in the system prompt.

**Remember:**
- DO NOT duplicate header, executive summary, or scores table (template has them)
- START with dimension-by-dimension analysis
- Use short paragraphs (2-3 sentences max)
- Use bullets for risks, numbered lists for mitigations
- Cite vendor responses as evidence: [Section X, Q Y]
- End with Compliance Assessment, Recommendations, and Conclusion
${process.env.LOCAL_MODEL_NAME ? LOCAL_MODEL_DEPTH_TARGETS : ''}
`;
}
