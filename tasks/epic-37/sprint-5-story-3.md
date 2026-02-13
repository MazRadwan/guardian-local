# Story 37.5.3: Implement ISO Prompt Builder (scoringPrompt.iso.ts)

## Description

Replace the placeholder functions in `scoringPrompt.iso.ts` (created in Sprint 1, Story 37.1.4) with real implementations that build ISO prompt sections from database data via the `ISOControlRetrievalService`.

Per the PRD prompt architecture:
- **System prompt** (cacheable): Static ISO control catalog (~30 dimension-mapped controls)
- **User prompt** (dynamic): Per-assessment applicable controls based on dimensions being scored

## Acceptance Criteria

- [ ] `buildISOCatalogSection()` replaced with implementation that builds static catalog string
- [ ] `buildISOApplicabilitySection()` replaced with implementation that builds per-assessment section
- [ ] Catalog section includes: clause_ref, domain, title, interpretive criteria, mapped dimensions
- [ ] Applicability section includes: relevant controls for the assessed dimensions
- [ ] ISO messaging compliance: uses "ISO-traceable" / "ISO-informed" language only
- [ ] No prohibited terms: "ISO-compliant", "ISO-certified", "meets ISO requirements", "ISO score"
- [ ] Guardian-native dimensions noted: "Clinical Risk, Vendor Viability, Ethical Considerations, and Sustainability use Guardian healthcare-specific criteria (no ISO mapping)"
- [ ] Under 150 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Update scoringPrompt.iso.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.iso.ts`

Replace placeholder functions. The functions now accept pre-fetched control data (the service layer fetches; the prompt layer formats):

```typescript
import { ISOControlForPrompt } from '../../../domain/compliance/types.js';

/**
 * Build the static ISO control catalog for the system prompt.
 * This section is cacheable (same across all assessments for a given criteria version).
 *
 * @param controls - All mapped ISO controls with criteria (from ISOControlRetrievalService.getFullCatalog())
 * @returns Formatted prompt section for system prompt
 */
export function buildISOCatalogSection(controls: ISOControlForPrompt[] = []): string {
  if (controls.length === 0) return '';

  let section = `## ISO Standards Reference Catalog

The following ISO-traceable controls inform your assessment. Reference relevant clauses in your dimension analysis.
These are Guardian's interpretive criteria referencing ISO clause numbers.

**IMPORTANT:** Use "ISO-traceable" or "ISO-informed" language. Do NOT use "ISO-compliant", "ISO-certified", or "meets ISO requirements".

**Guardian-Native Dimensions:** Clinical Risk, Vendor Viability, Ethical Considerations, and Sustainability are assessed using Guardian healthcare-specific criteria (no ISO mapping available in current framework scope).

### Controls by Domain\n\n`;

  // Group by domain
  const byDomain = new Map<string, ISOControlForPrompt[]>();
  for (const c of controls) {
    const existing = byDomain.get(c.domain) ?? [];
    existing.push(c);
    byDomain.set(c.domain, existing);
  }

  for (const [domain, domainControls] of byDomain) {
    section += `#### ${domain}\n\n`;
    for (const c of domainControls) {
      section += `- **${c.clauseRef}** (${c.framework}): ${c.title}\n`;
      section += `  Criteria: ${c.criteriaText}\n`;
      if (c.assessmentGuidance) {
        section += `  Guidance: ${c.assessmentGuidance}\n`;
      }
      section += `  Dimensions: ${c.dimensions.join(', ')}\n\n`;
    }
  }

  return section;
}

/**
 * Build per-assessment ISO applicability section for the user prompt.
 * Lists which controls are relevant to the dimensions being scored.
 *
 * @param controls - Applicable controls for assessed dimensions (from ISOControlRetrievalService.getApplicableControls())
 * @param dimensions - The dimensions being scored
 * @returns Formatted prompt section for user prompt
 */
export function buildISOApplicabilitySection(
  controls: ISOControlForPrompt[] = [],
  dimensions?: string[]
): string {
  if (controls.length === 0) return '';

  let section = `## Applicable ISO Controls for This Assessment

Consider these ISO-traceable controls when scoring the relevant dimensions:\n\n`;

  for (const c of controls) {
    section += `- ${c.clauseRef} (${c.framework}): ${c.title} -> [${c.dimensions.join(', ')}]\n`;
  }

  if (dimensions) {
    const nativeDims = dimensions.filter(d =>
      d === 'clinical_risk' || d === 'vendor_capability' || d === 'ethical_considerations' || d === 'sustainability'
    );
    if (nativeDims.length > 0) {
      section += `\n**Note:** ${nativeDims.join(', ')} use Guardian healthcare-specific criteria (no ISO mapping). These are Guardian-native dimensions.\n`;
    }
  }

  return section;
}
```

### 2. Key Design Decisions

- **Data flow**: Service fetches -> prompt function formats. The prompt functions are pure formatters that take data as input. This avoids database calls in the prompt layer.
- **Backwards compatibility**: The `controls` parameter defaults to `[]` so Sprint 1 callers that call with no args still work. This prevents a build break between Sprint 5 and Sprint 6.
- **Cacheability**: The system prompt catalog is the same for all assessments using the same criteria version. The user prompt section varies per assessment.
- **Messaging compliance**: Every ISO reference uses "ISO-traceable" / "ISO-informed" per PRD Section 13.
- **Guardian-native callout**: Explicit note about clinical_risk, vendor_capability, ethical_considerations, and sustainability having no ISO mapping.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.iso.ts` - MODIFY (replace placeholder implementations)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/ai/prompts/scoringPrompt.iso.test.ts` - Tests from Sprint 1 (37.1.4) will need updating since function signatures changed (now accept data params instead of no params)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `scoringPrompt.iso.test.ts` (from Sprint 1):
  - Test `buildISOCatalogSection([])` returns empty string
  - Test `buildISOCatalogSection(controls)` includes clause refs, titles, criteria text
  - Test `buildISOCatalogSection(controls)` groups by domain
  - Test `buildISOCatalogSection(controls)` includes messaging guidelines ("ISO-traceable")
  - Test `buildISOCatalogSection(controls)` does NOT contain prohibited terms
  - Test `buildISOApplicabilitySection([])` returns empty string
  - Test `buildISOApplicabilitySection(controls, dimensions)` lists controls with dimensions
  - Test `buildISOApplicabilitySection(controls, ['clinical_risk', 'ethical_considerations'])` includes Guardian-native note
  - Test messaging compliance: no "ISO-compliant", "ISO-certified", "meets ISO requirements"

## Definition of Done

- [ ] Placeholder functions replaced with real implementations
- [ ] ISO catalog section properly formatted for system prompt
- [ ] ISO applicability section properly formatted for user prompt
- [ ] Messaging guidelines enforced (no prohibited terms)
- [ ] Guardian-native dimensions noted
- [ ] Unit tests updated and passing
- [ ] Under 150 LOC
- [ ] No TypeScript errors
