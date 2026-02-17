/**
 * Validates assessmentConfidence fields in scoring output.
 * SOFT WARNINGS only (does not reject payloads).
 * Per PRD Section 7: "A bare 'Medium' without explanation is not acceptable."
 */
import type { AssessmentConfidenceLevel } from '../compliance/types.js'

const VALID_LEVELS: AssessmentConfidenceLevel[] = ['high', 'medium', 'low']
const MIN_RATIONALE_LENGTH = 20

export class ScoringConfidenceValidator {
  /** Validate assessmentConfidence across all dimension scores. */
  validateAllConfidence(dimensionScores: unknown[]): string[] {
    const warnings: string[] = []
    for (let i = 0; i < dimensionScores.length; i++) {
      const ds = dimensionScores[i] as Record<string, unknown> | null
      if (!ds || typeof ds !== 'object') continue

      const dimension = ds.dimension as string
      const findings = ds.findings as Record<string, unknown> | undefined
      if (!findings || typeof findings !== 'object') continue

      const confidence = findings.assessmentConfidence as Record<string, unknown> | undefined
      if (!confidence) {
        warnings.push(`dimensionScores[${i}] (${dimension}): missing assessmentConfidence`)
        continue
      }

      const prefix = `dimensionScores[${i}] (${dimension})`
      const level = confidence.level
      if (typeof level !== 'string' || !VALID_LEVELS.includes(level as AssessmentConfidenceLevel)) {
        warnings.push(
          `${prefix}: assessmentConfidence.level must be one of [${VALID_LEVELS.join(', ')}], got: ${level}`
        )
      }

      const rationale = confidence.rationale
      if (typeof rationale !== 'string' || rationale.trim().length < MIN_RATIONALE_LENGTH) {
        warnings.push(
          `${prefix}: assessmentConfidence.rationale must be at least ${MIN_RATIONALE_LENGTH} characters`
        )
      }
    }
    return warnings
  }
}
