/**
 * ISO Compliance Prompt Sections
 *
 * Builds ISO-related prompt sections for scoring context injection.
 * Sprint 1: Placeholder functions (return empty string).
 * Sprint 6: Will query DB for ISO controls and build prompt sections.
 */

/**
 * Build the static ISO control catalog for the system prompt.
 * This section is cacheable (same across all assessments).
 *
 * @returns ISO catalog prompt section (empty until Sprint 6)
 */
export function buildISOCatalogSection(): string {
  // Sprint 6: Will inject ~30 dimension-mapped ISO controls from DB
  // Format: clause_ref + domain + title + interpretive criteria
  return '';
}

/**
 * Build per-assessment ISO applicability section for the user prompt.
 * This section varies per assessment (dynamic, not cached).
 *
 * @param _dimensions - The dimensions being scored (used to filter applicable controls)
 * @returns ISO applicability prompt section (empty until Sprint 6)
 */
export function buildISOApplicabilitySection(_dimensions?: string[]): string {
  // Sprint 6: Will filter controls by dimension relevance
  // and inject applicable controls into user prompt
  return '';
}
