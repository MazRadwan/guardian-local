# Story 37.7.3: ISO Messaging Compliance Audit

## Description

Validate SC-8: "All report language uses approved ISO messaging -- no 'compliant' or 'certified' language." Create automated tests that scan prompt output for prohibited terms. This provides a regression guard against future prompt changes introducing liability-creating language.

Per PRD Section 13:
- **Required:** "ISO-traceable", "ISO-informed", "maps to ISO 42001 A.x.x.x"
- **Prohibited:** "ISO-compliant", "ISO-certified", "meets ISO requirements", "ISO score"

## Acceptance Criteria

- [ ] Test file created that scans scoring prompt output for prohibited terms
- [ ] Tests verify system prompt does NOT contain prohibited terms
- [ ] Tests verify ISO catalog section does NOT contain prohibited terms
- [ ] Tests verify ISO applicability section does NOT contain prohibited terms
- [ ] Tests verify all 3 required terms ARE present in appropriate sections ("ISO-traceable", "ISO-informed", "maps to ISO 42001")
- [ ] Tests cover all 4 prohibited terms from PRD Section 13
- [ ] Tests serve as regression guard for future prompt changes

## Technical Approach

**File:** `packages/backend/__tests__/unit/infrastructure/ai/prompts/iso-messaging-compliance.test.ts`

```typescript
import { buildScoringSystemPrompt, buildScoringUserPrompt } from '../../../../../src/infrastructure/ai/prompts/scoringPrompt';
import { buildISOCatalogSection, buildISOApplicabilitySection } from '../../../../../src/infrastructure/ai/prompts/scoringPrompt.iso';
import type { ISOControlForPrompt } from '../../../../../src/domain/compliance/types';

const PROHIBITED_TERMS = [
  'ISO-compliant',
  'ISO compliant',
  'ISO-certified',
  'ISO certified',
  'meets ISO requirements',
  'ISO score',
  'ISO scores',
];

const REQUIRED_TERMS = [
  'ISO-traceable',
  'ISO-informed',
  'maps to ISO 42001',
];

const sampleControls: ISOControlForPrompt[] = [
  {
    clauseRef: 'A.6.2.6',
    domain: 'Data management',
    title: 'Data quality management for AI systems',
    framework: 'ISO/IEC 42001',
    criteriaText: 'Organization implements systematic data quality processes.',
    assessmentGuidance: 'Evaluate data quality processes.',
    dimensions: ['regulatory_compliance'],
    relevanceWeight: 1.0,
  },
  {
    clauseRef: '6.3',
    domain: 'Risk management',
    title: 'Risk treatment for AI systems',
    framework: 'ISO/IEC 23894',
    criteriaText: 'Organization applies systematic risk treatment.',
    dimensions: ['regulatory_compliance', 'operational_excellence'],
    relevanceWeight: 1.0,
  },
];

describe('ISO Messaging Compliance (SC-8)', () => {
  describe('System Prompt', () => {
    it('should not contain any prohibited ISO terms', () => {
      const prompt = buildScoringSystemPrompt(sampleControls);
      for (const term of PROHIBITED_TERMS) {
        // Allow the term in the instruction "Do NOT use" context
        // Check that the term doesn't appear as actual guidance/description
        const occurrences = prompt.split(term).length - 1;
        // The term may appear once in the "Do NOT use" instruction
        expect(occurrences).toBeLessThanOrEqual(1);
      }
    });

    it('should contain required ISO messaging terms', () => {
      const prompt = buildScoringSystemPrompt(sampleControls);
      for (const term of REQUIRED_TERMS) {
        expect(prompt).toContain(term);
      }
    });
  });

  describe('ISO Catalog Section', () => {
    it('should not contain prohibited terms in catalog output', () => {
      const section = buildISOCatalogSection(sampleControls);
      for (const term of PROHIBITED_TERMS) {
        // In the catalog section, prohibited terms should not appear at all
        // (the "Do NOT use" instruction is in the system prompt, not the catalog)
        expect(section).not.toContain(term);
      }
    });

    it('should use approved language', () => {
      const section = buildISOCatalogSection(sampleControls);
      expect(section).toContain('ISO-traceable');
    });

    it('should mention Guardian-native dimensions', () => {
      const section = buildISOCatalogSection(sampleControls);
      expect(section).toContain('Clinical Risk');
      expect(section).toContain('Vendor');
      expect(section).toContain('Guardian healthcare-specific criteria');
    });
  });

  describe('ISO Applicability Section', () => {
    it('should not contain prohibited terms', () => {
      const section = buildISOApplicabilitySection(sampleControls, ['regulatory_compliance']);
      for (const term of PROHIBITED_TERMS) {
        expect(section).not.toContain(term);
      }
    });

    it('should use approved language', () => {
      const section = buildISOApplicabilitySection(sampleControls, ['regulatory_compliance']);
      expect(section).toContain('ISO-traceable');
    });

    it('should note Guardian-native dimensions when included', () => {
      const section = buildISOApplicabilitySection(sampleControls, ['clinical_risk', 'regulatory_compliance']);
      expect(section).toContain('Guardian healthcare-specific criteria');
    });
  });

  describe('User Prompt', () => {
    it('should not contain prohibited terms when ISO controls provided', () => {
      const prompt = buildScoringUserPrompt({
        vendorName: 'TestVendor',
        solutionName: 'TestSolution',
        solutionType: 'clinical_ai',
        responses: [{ sectionNumber: 1, questionNumber: 1, questionText: 'Q', responseText: 'A' }],
        isoControls: sampleControls,
      });
      for (const term of PROHIBITED_TERMS) {
        expect(prompt).not.toContain(term);
      }
    });
  });
});
```

## Files Touched

- `packages/backend/__tests__/unit/infrastructure/ai/prompts/iso-messaging-compliance.test.ts` - CREATE (~120+ LOC)

## Tests Affected

- None (new test file)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story. Tests described above.

## Definition of Done

- [ ] Messaging compliance test file created
- [ ] All prohibited terms caught by tests
- [ ] Required terms verified present
- [ ] Guardian-native dimension callout verified
- [ ] `pnpm test:unit` passes
- [ ] Tests serve as regression guard for future prompt changes
