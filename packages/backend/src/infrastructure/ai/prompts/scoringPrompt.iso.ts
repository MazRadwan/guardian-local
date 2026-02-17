/**
 * ISO Compliance Prompt Sections
 *
 * Builds ISO-related prompt sections for scoring context injection.
 * Sprint 1: Placeholder functions (returned empty strings).
 * Sprint 5: Real implementations that format ISO control data for prompts.
 *
 * Data flow: ISOControlRetrievalService fetches data -> these functions format it.
 * These are PURE FORMATTERS with no database access.
 */

import type { ISOControlForPrompt } from '../../../domain/compliance/types.js'

/** Guardian-native dimensions with no ISO mapping */
const GUARDIAN_NATIVE_DIMENSIONS = [
  'clinical_risk',
  'vendor_capability',
  'ethical_considerations',
  'sustainability',
]

/**
 * Build the static ISO control catalog for the system prompt.
 * This section is cacheable (same across all assessments for a given criteria version).
 *
 * @param controls - All mapped ISO controls with criteria (from ISOControlRetrievalService.getFullCatalog())
 * @returns ISO catalog prompt section (empty string if no controls)
 */
export function buildISOCatalogSection(controls: ISOControlForPrompt[] = []): string {
  if (controls.length === 0) return ''

  let section = `## ISO Standards Reference Catalog

The following ISO-traceable controls inform your assessment. Reference relevant clauses in your dimension analysis.
These are Guardian's interpretive criteria referencing ISO clause numbers.

**IMPORTANT:** Use "ISO-traceable" or "ISO-informed" language. Do NOT use "ISO-compliant", "ISO-certified", or "meets ISO requirements".

**Guardian-Native Dimensions:** Clinical Risk, Vendor Capability, Ethical Considerations, and Sustainability are assessed using Guardian healthcare-specific criteria (no ISO mapping available in current framework scope).

### Controls by Domain\n\n`

  // Group by domain
  const byDomain = new Map<string, ISOControlForPrompt[]>()
  for (const c of controls) {
    const existing = byDomain.get(c.domain) ?? []
    existing.push(c)
    byDomain.set(c.domain, existing)
  }

  const sortedDomains = [...byDomain.keys()].sort()
  for (const domain of sortedDomains) {
    const domainControls = byDomain.get(domain)!.sort((a, b) => a.clauseRef.localeCompare(b.clauseRef))
    section += `#### ${domain}\n\n`
    for (const c of domainControls) {
      section += `- **${c.clauseRef}** (${c.framework}): ${c.title}\n`
      section += `  Criteria: ${c.criteriaText}\n`
      if (c.assessmentGuidance) {
        section += `  Guidance: ${c.assessmentGuidance}\n`
      }
      section += `  Dimensions: ${c.dimensions.join(', ')}\n\n`
    }
  }

  return section
}

/**
 * Build per-assessment ISO applicability section for the user prompt.
 * Lists which controls are relevant to the dimensions being scored.
 *
 * @param controls - Applicable controls (from ISOControlRetrievalService.getApplicableControls())
 * @param dimensions - The dimensions being scored (used for Guardian-native callout)
 * @returns ISO applicability prompt section (empty string if no controls)
 */
export function buildISOApplicabilitySection(
  controls: ISOControlForPrompt[] = [],
  dimensions?: string[]
): string {
  if (controls.length === 0) return ''

  let section = `## Applicable ISO Controls for This Assessment

Consider these ISO-traceable controls when scoring the relevant dimensions:\n\n`

  for (const c of controls) {
    section += `- ${c.clauseRef} (${c.framework}): ${c.title} -> [${c.dimensions.join(', ')}]\n`
  }

  if (dimensions) {
    const nativeDims = dimensions.filter((d) =>
      GUARDIAN_NATIVE_DIMENSIONS.includes(d)
    )
    if (nativeDims.length > 0) {
      section += `\n**Note:** ${nativeDims.join(', ')} use Guardian healthcare-specific criteria (no ISO mapping). These are Guardian-native dimensions.\n`
    }
  }

  return section
}
