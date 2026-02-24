/**
 * Scoring Prompt Helper Functions
 *
 * Extracted from scoringPrompt.ts to keep it under 300 LOC.
 * Contains dimension list builder, disqualifying factors list builder,
 * response formatting helper, and rubric criteria text builder.
 */

import { RiskDimension } from '../../../domain/types/QuestionnaireSchema.js';
import {
  DIMENSION_CONFIG,
  ALL_DIMENSIONS,
  DISQUALIFYING_FACTORS,
  DISQUALIFIER_TIER,
  DIMENSION_WEIGHTS,
  SolutionType,
} from '../../../domain/scoring/rubric.js';

/**
 * Build numbered dimension list for system prompt.
 * e.g. "- Clinical Risk (risk)\n- Privacy Risk (risk)\n..."
 */
export function buildDimensionList(): string {
  return ALL_DIMENSIONS.map(d =>
    `- ${DIMENSION_CONFIG[d].label} (${DIMENSION_CONFIG[d].type})`
  ).join('\n');
}

/**
 * Build disqualifying factors list for system prompt with tier annotations.
 * Each factor is annotated as AUTOMATIC DECLINE or REQUIRES REMEDIATION PLAN.
 */
export function buildDisqualifyingList(): string {
  return Object.entries(DISQUALIFYING_FACTORS)
    .flatMap(([dimension, factors]) => factors.map(f => {
      const tier = DISQUALIFIER_TIER[f] ?? 'hard_decline';
      const label = tier === 'hard_decline'
        ? 'AUTOMATIC DECLINE'
        : 'REQUIRES REMEDIATION PLAN (conditional eligible)';
      return `- [${dimension}] ${f} — ${label}`;
    }))
    .join('\n');
}

/**
 * Format vendor responses into prompt text.
 * Each response becomes a section with question and answer.
 */
export function formatResponsesForPrompt(responses: Array<{
  sectionNumber: number;
  questionNumber: number;
  questionText: string;
  responseText: string;
}>): string {
  return responses.map(r =>
    `### Section ${r.sectionNumber}, Question ${r.questionNumber}\n**Q:** ${r.questionText}\n**A:** ${r.responseText}`
  ).join('\n\n');
}

/**
 * Build weighted dimensions list for user prompt.
 * Filters to dimensions with weight > 0 and formats them.
 */
export function buildWeightedDimensions(solutionType: SolutionType): string {
  const weights = DIMENSION_WEIGHTS[solutionType];
  return Object.entries(weights)
    .filter(([_, weight]) => weight > 0)
    .map(([dim, weight]) => `  - ${DIMENSION_CONFIG[dim as RiskDimension].label}: ${weight}%`)
    .join('\n');
}

/**
 * Re-export buildRubricCriteria from the split rubric criteria modules.
 * Preserves existing import paths (scoringPrompt.ts imports from here).
 * See rubricCriteria.ts (orchestrator), rubricCriteriaExisting.ts, rubricCriteriaNew.ts.
 */
export { buildRubricCriteria } from './rubricCriteria.js';
