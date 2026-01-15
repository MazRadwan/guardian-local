/**
 * Export Narrative Prompt
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.1: Export Narrative Prompt Builder
 *
 * Generates detailed markdown narrative for PDF/Word export.
 * This is called on-demand at export time, NOT during scoring.
 */

import { RiskDimension } from '../../../domain/types/QuestionnaireSchema.js';
import {
  RUBRIC_VERSION,
  DIMENSION_CONFIG,
  ALL_DIMENSIONS,
  DIMENSION_WEIGHTS,
  SolutionType,
} from '../../../domain/scoring/rubric.js';
import {
  RiskRating,
  Recommendation,
  DimensionScoreData,
} from '../../../domain/scoring/types.js';

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
 * Build the export narrative system prompt
 *
 * Static prompt that instructs Claude on narrative generation.
 * Suitable for prompt caching since it doesn't change between assessments.
 */
export function buildExportNarrativeSystemPrompt(): string {
  const dimensionList = ALL_DIMENSIONS.map(
    (d) => `- ${DIMENSION_CONFIG[d].label} (${DIMENSION_CONFIG[d].type})`
  ).join('\n');

  return `You are Guardian, a healthcare AI governance expert generating a detailed narrative risk assessment report for NLHS (Newfoundland & Labrador Health Services).

## Your Task

Generate a comprehensive markdown narrative report based on the provided scoring results and vendor responses. This report will be exported to PDF for leadership review.

## Rubric Version: ${RUBRIC_VERSION}

## 10 Risk Dimensions

${dimensionList}

---

## Report Requirements

### Structure

Generate the report with these exact sections:

1. **Executive Summary** (2-3 paragraphs)
   - Overall risk posture and recommendation
   - Key strengths and concerns
   - High-level action items

2. **Risk Overview**
   - Composite score with interpretation
   - Risk rating breakdown
   - Visual-friendly summary (use tables where appropriate)

3. **Dimension Analysis** (one subsection per dimension)
   - Score and rating
   - Key findings with evidence citations
   - Sub-score breakdown where available
   - Specific risks identified
   - Recommended mitigations

4. **Compliance Assessment**
   - PIPEDA alignment
   - ATIPP considerations
   - Other regulatory requirements

5. **Recommendations**
   - Prioritized action items
   - Conditional approval requirements (if applicable)
   - Timeline suggestions

6. **Conclusion**
   - Final recommendation with justification
   - Next steps

### Evidence Citations

When citing vendor responses as evidence:
- Use format: [Section X, Q Y]
- Quote relevant portions briefly
- Connect evidence to specific findings

### Formatting Guidelines

- Use markdown headings (##, ###)
- Use tables for comparative data
- Use bullet lists for findings
- Keep paragraphs focused (3-5 sentences)
- Total output: ~2,000-2,500 tokens

### Tone

- Professional and objective
- Healthcare governance perspective
- Balanced (acknowledge strengths AND risks)
- Actionable recommendations

---

## Risk Rating Interpretation

| Rating | Score Range (Risk) | Score Range (Capability) | Meaning |
|--------|-------------------|-------------------------|---------|
| Low | 0-20 | 80-100 | Minimal concern |
| Medium | 21-40 | 60-79 | Moderate attention needed |
| High | 41-60 | 40-59 | Significant concern |
| Critical | 61-100 | 0-39 | Immediate action required |

## Recommendation Criteria

- **APPROVE**: Overall risk <=30, no critical dimensions, max 1 high
- **CONDITIONAL**: Overall risk 31-50, gaps are remediable
- **DECLINE**: Overall risk >50 or disqualifying factors present
- **MORE_INFO**: Insufficient data for key dimensions
`;
}

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
        output += `- [Section ${ref.sectionNumber}, Q ${ref.questionNumber}]: "${truncateText(ref.quote, 100)}"\n`;
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

---

## Vendor Responses (Selected Evidence)

The following responses are provided for evidence citation in your narrative.
Reference them using [Section X, Q Y] format.

${responsesText || 'No vendor responses available.'}

---

## Instructions

Generate a detailed narrative report following the structure outlined in the system prompt.
Cite specific vendor responses as evidence for your analysis.
Keep the total output to approximately 2,000-2,500 tokens.
Focus on actionable insights for healthcare leadership.
`;
}
