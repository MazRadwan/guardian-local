/**
 * ISO Clause Reference Validator
 *
 * Validates ISO clause references within dimension score findings.
 * Extracted from ScoringPayloadValidator to stay under 300 LOC.
 */

const VALID_STATUSES = ['aligned', 'partial', 'not_evidenced', 'not_applicable'];

/**
 * Validates ISO clause references across all dimension scores (soft warnings only).
 */
export function validateISOReferences(dimensionScores: unknown[]): string[] {
  const warnings: string[] = [];

  for (let i = 0; i < dimensionScores.length; i++) {
    const ds = dimensionScores[i] as Record<string, unknown> | null;
    if (!ds || typeof ds !== 'object') continue;

    const dimension = ds.dimension as string;
    const findings = ds.findings as Record<string, unknown> | undefined;
    if (!findings || typeof findings !== 'object') continue;

    const refs = findings.isoClauseReferences as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(refs)) continue;

    const prefix = `dimensionScores[${i}] (${dimension})`;

    for (let j = 0; j < refs.length; j++) {
      const ref = refs[j];
      if (!ref || typeof ref !== 'object') {
        warnings.push(`${prefix}: isoClauseReferences[${j}] must be an object`);
        continue;
      }
      if (typeof ref.clauseRef !== 'string' || ref.clauseRef.trim().length === 0) {
        warnings.push(`${prefix}: isoClauseReferences[${j}].clauseRef is required`);
      }
      if (typeof ref.title !== 'string' || ref.title.trim().length === 0) {
        warnings.push(`${prefix}: isoClauseReferences[${j}].title is required`);
      }
      if (typeof ref.status !== 'string' || !VALID_STATUSES.includes(ref.status)) {
        warnings.push(
          `${prefix}: isoClauseReferences[${j}].status must be one of [${VALID_STATUSES.join(', ')}]`
        );
      }
      if (typeof ref.framework !== 'string' || ref.framework.trim().length === 0) {
        warnings.push(`${prefix}: isoClauseReferences[${j}].framework is required`);
      }
    }
  }

  return warnings;
}
