/**
 * Rubric Criteria Orchestrator
 *
 * Assembles rubric criteria text from dimension-specific builders.
 * Split into existing (v1.0) and new (v1.1) dimensions for 300 LOC compliance.
 */
import { buildExistingDimensionCriteria } from './rubricCriteriaExisting.js';
import { buildNewDimensionCriteria } from './rubricCriteriaNew.js';

export function buildRubricCriteria(): string {
  const existingCriteria = buildExistingDimensionCriteria();
  const newCriteria = buildNewDimensionCriteria();

  const isLocal = !!process.env.LOCAL_MODEL_NAME;

  const rule3 = isLocal
    ? `3. **Present sub-scores as professional prose.** For each dimension, describe each sub-score finding in flowing sentences. Convert field names to readable labels (e.g., "Evidence Quality" not "evidence_quality_score"). Do NOT list sub-scores as bullet points. Do NOT show addition formulas. Do NOT write enum values in parentheses.`
    : `3. **Show your arithmetic.** In the narrative, show the sub-score breakdown that produces each dimension score.`;

  let result = `## SCORING RULES (MANDATORY)

1. **Dimension score = sum of sub-scores.** For each dimension below, the dimension score MUST equal the sum of all its sub-scores. Do NOT estimate dimension scores independently.
2. **Use only defined point values.** Each sub-score MUST be exactly one of the defined point values listed for that sub-score. Do NOT interpolate or use intermediate values.
${rule3}
4. **riskRating values.** Every dimension's riskRating MUST be exactly one of: \`low\`, \`medium\`, \`high\`, \`critical\`. Never use words like "good", "excellent", "adequate", or "poor" for riskRating.

${existingCriteria}`;

  if (newCriteria) {
    result += `\n\n${newCriteria}`;
  }

  return result;
}
