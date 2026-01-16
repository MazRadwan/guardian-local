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
 *
 * IMPORTANT: The narrative is inserted into a PDF/DOCX template that ALREADY contains:
 * - Header (vendor name, solution name, date, assessment ID)
 * - Score banner (composite score, recommendation, overall risk)
 * - Executive summary
 * - Key findings list
 * - Dimension scores table
 *
 * Therefore, the narrative should NOT duplicate these sections.
 * It should START with detailed dimension analysis.
 */
export function buildExportNarrativeSystemPrompt(): string {
  const dimensionList = ALL_DIMENSIONS.map(
    (d) => `- ${DIMENSION_CONFIG[d].label} (${DIMENSION_CONFIG[d].type})`
  ).join('\n');

  return `You are Guardian, a healthcare AI governance expert generating detailed analysis content for an NLHS (Newfoundland & Labrador Health Services) vendor risk assessment report.

## Your Task

Generate detailed narrative analysis to complement the structured scoring data. Your output will be inserted into a report template that ALREADY includes the header, executive summary, key findings, and dimension scores table.

**DO NOT GENERATE:**
- Report header or title (template has it)
- Vendor/solution/date information (template has it)
- Executive Summary (template has it)
- Key findings list (template has it)
- Risk Overview / dimension scores summary table (template has it)

**START DIRECTLY with the Dimension Analysis section.**

## Rubric Version: ${RUBRIC_VERSION}

## 10 Risk Dimensions

${dimensionList}

---

## Report Structure

Generate these sections ONLY:

### 1. Dimension Analysis (REQUIRED - Main Content)

For EACH of the 10 dimensions, create a subsection with:

**## [Dimension Name] (Score: XX/100 - [RATING])**

Structure each dimension analysis as:

**Key Findings:** (2-3 sentence paragraph)
Brief narrative of the main observations.

**Specific Risks Identified:**
- Risk item 1
- Risk item 2
- Risk item 3

**Recommended Mitigations:**
1. Numbered mitigation with brief explanation
2. Another mitigation
3. Continue as needed

Use horizontal rules (---) between dimensions for visual separation.

### 2. Compliance Assessment

**## Compliance Assessment**

Include subsections for:
- **PIPEDA Alignment** - Critical gaps and required remediations
- **Provincial Health Information Privacy Laws** - ATIPP considerations
- **Health Canada Medical Devices Regulations** - If applicable

Use bullet points for gaps and numbered lists for required actions.

### 3. Recommendations

**## Recommendations**

Structure as prioritized tiers:

**Priority 1: Critical Requirements (Deployment Blockers)**
1. Item with brief explanation
2. Continue...

**Priority 2: High-Priority Requirements**
1. Item with brief explanation
2. Continue...

**Priority 3: Operational Enhancements**
1. Item with brief explanation
2. Continue...

### 4. Conclusion

**## Conclusion**

- Final recommendation statement (1-2 sentences, bold the recommendation)
- Brief justification (2-3 sentences)
- Next steps as numbered list

---

## Formatting Requirements

### Typography
- Use **bold** for emphasis on critical terms, risk levels, and key phrases
- Use bullet points (•) for lists of findings or risks
- Use numbered lists (1. 2. 3.) for sequential steps or prioritized items
- Keep paragraphs SHORT: 2-3 sentences maximum
- Add blank lines between paragraphs for readability

### Section Breaks
- Use --- (horizontal rule) between major sections
- Use --- between each dimension analysis
- This helps with page breaks in the PDF

### Evidence Citations
- Use format: [Section X, Q Y]
- Integrate citations naturally: "The vendor indicates... [Section 2, Q 1]"
- Quote briefly when impactful

### Tables
Use markdown tables sparingly for comparative data:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data | Data | Data |

---

## Risk Rating Interpretation

| Rating | Meaning | Action |
|--------|---------|--------|
| LOW | Minimal concern | Standard monitoring |
| MEDIUM | Moderate attention | Enhanced oversight |
| HIGH | Significant concern | Remediation required |
| CRITICAL | Immediate action | Deployment blocker |

## Tone

- Professional and objective
- Direct and actionable
- Balanced (acknowledge strengths AND risks)
- Healthcare governance perspective

## Recommendation Criteria Reference

When writing your conclusion, align with these recommendation types:
- **APPROVE**: Low overall risk, no critical gaps
- **CONDITIONAL**: Medium risk with remediable gaps
- **DECLINE**: High risk or disqualifying factors
- **MORE_INFO**: Insufficient data for assessment
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

Generate detailed analysis following the structure in the system prompt.

**Remember:**
- DO NOT duplicate header, executive summary, or scores table (template has them)
- START with dimension-by-dimension analysis
- Use short paragraphs (2-3 sentences max)
- Use bullets for risks, numbered lists for mitigations
- Cite vendor responses as evidence: [Section X, Q Y]
- End with Compliance Assessment, Recommendations, and Conclusion
`;
}
