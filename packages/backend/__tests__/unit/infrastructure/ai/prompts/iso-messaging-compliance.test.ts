/**
 * ISO Messaging Compliance Audit (Story 37.7.3 / SC-8)
 *
 * Automated regression guard ensuring:
 * - NO prohibited ISO terms appear in scoring prompt output
 * - All required (approved) ISO terms ARE present
 *
 * Per PRD Section 13:
 *   Required:   "ISO-traceable", "ISO-informed", "maps to ISO 42001"
 *   Prohibited: "ISO-compliant", "ISO-certified", "meets ISO requirements", "ISO score"
 */

import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
} from '../../../../../src/infrastructure/ai/prompts/scoringPrompt'
import {
  buildISOCatalogSection,
  buildISOApplicabilitySection,
} from '../../../../../src/infrastructure/ai/prompts/scoringPrompt.iso'
import type { ISOControlForPrompt } from '../../../../../src/domain/compliance/types'

/**
 * Prohibited terms per PRD Section 13.
 * These must NEVER appear as guidance/description in prompts.
 * They MAY appear at most once in a "Do NOT use" instruction context.
 */
const PROHIBITED_TERMS = [
  'ISO-compliant',
  'ISO compliant',
  'ISO-certified',
  'ISO certified',
  'meets ISO requirements',
  'compliant with ISO',
  'certified under ISO',
  'ISO score',
  'ISO scores',
]

/**
 * Required terms per PRD Section 13.
 * These MUST appear in the appropriate prompt sections.
 */
const REQUIRED_TERMS = [
  'ISO-traceable',
  'ISO-informed',
]

const sampleControls: ISOControlForPrompt[] = [
  {
    clauseRef: 'A.6.2.6',
    domain: 'Data management',
    title: 'Data quality management for AI systems',
    framework: 'ISO/IEC 42001',
    criteriaText: 'Organization implements systematic data quality processes.',
    assessmentGuidance: 'Evaluate data quality processes and governance.',
    dimensions: ['regulatory_compliance'],
    relevanceWeights: { regulatory_compliance: 1.0 },
  },
  {
    clauseRef: '6.3',
    domain: 'Risk management',
    title: 'Risk treatment for AI systems',
    framework: 'ISO/IEC 23894',
    criteriaText: 'Organization applies systematic risk treatment.',
    dimensions: ['regulatory_compliance', 'operational_excellence'],
    relevanceWeights: { regulatory_compliance: 1.0 },
  },
  {
    clauseRef: 'A.5.4',
    domain: 'Resources',
    title: 'AI system inventory',
    framework: 'ISO/IEC 42001',
    criteriaText: 'Organization maintains comprehensive AI system inventory.',
    dimensions: ['operational_excellence'],
    relevanceWeights: { operational_excellence: 0.8 },
  },
]

describe('ISO Messaging Compliance (SC-8)', () => {
  describe('System Prompt', () => {
    it('should not contain any prohibited ISO terms as guidance', () => {
      const prompt = buildScoringSystemPrompt(sampleControls)
      for (const term of PROHIBITED_TERMS) {
        const occurrences = countOccurrences(prompt, term)
        // Prohibited terms may appear in "Do NOT use" instruction contexts only.
        // The system prompt contains ISO messaging rules + the catalog section,
        // both of which include a prohibition instruction, so up to 2 is acceptable.
        // Every occurrence must be verified as appearing in prohibition context.
        verifyAllOccurrencesInProhibitionContext(prompt, term, occurrences)
      }
    })

    it('should contain all required ISO messaging terms', () => {
      const prompt = buildScoringSystemPrompt(sampleControls)
      for (const term of REQUIRED_TERMS) {
        expect(prompt).toContain(term)
      }
    })

    it('should contain ISO clause reference instructions', () => {
      const prompt = buildScoringSystemPrompt(sampleControls)
      expect(prompt).toContain('isoClauseReferences')
      expect(prompt).toContain('aligned')
      expect(prompt).toContain('partial')
      expect(prompt).toContain('not_evidenced')
    })

    it('should not use prohibited terms even without ISO controls', () => {
      const prompt = buildScoringSystemPrompt()
      for (const term of PROHIBITED_TERMS) {
        const occurrences = countOccurrences(prompt, term)
        verifyAllOccurrencesInProhibitionContext(prompt, term, occurrences)
      }
    })
  })

  describe('ISO Catalog Section', () => {
    it('should not contain prohibited terms in catalog output', () => {
      const section = buildISOCatalogSection(sampleControls)
      for (const term of PROHIBITED_TERMS) {
        // In the catalog section, the "Do NOT use" instruction IS present once
        const occurrences = countOccurrences(section, term)
        expect(occurrences).toBeLessThanOrEqual(1)

        if (occurrences === 1) {
          const idx = section.indexOf(term)
          const surrounding = section.substring(Math.max(0, idx - 60), idx + term.length + 60)
          const isInProhibitionContext =
            surrounding.includes('Do NOT use') ||
            surrounding.includes('Do not use')
          expect(isInProhibitionContext).toBe(true)
        }
      }
    })

    it('should use approved language in catalog section', () => {
      const section = buildISOCatalogSection(sampleControls)
      expect(section).toContain('ISO-traceable')
    })

    it('should mention Guardian-native dimensions in catalog', () => {
      const section = buildISOCatalogSection(sampleControls)
      expect(section).toContain('Clinical Risk')
      expect(section).toContain('Vendor Capability')
      expect(section).toContain('Guardian healthcare-specific criteria')
    })

    it('should not contain prohibited terms when catalog is empty', () => {
      const section = buildISOCatalogSection([])
      for (const term of PROHIBITED_TERMS) {
        expect(section).not.toContain(term)
      }
    })

    it('should contain control clause refs and titles', () => {
      const section = buildISOCatalogSection(sampleControls)
      expect(section).toContain('A.6.2.6')
      expect(section).toContain('Data quality management for AI systems')
      expect(section).toContain('6.3')
      expect(section).toContain('Risk treatment for AI systems')
    })
  })

  describe('ISO Applicability Section', () => {
    it('should not contain prohibited terms', () => {
      const section = buildISOApplicabilitySection(sampleControls, [
        'regulatory_compliance',
      ])
      for (const term of PROHIBITED_TERMS) {
        expect(section).not.toContain(term)
      }
    })

    it('should use approved language in applicability section', () => {
      const section = buildISOApplicabilitySection(sampleControls, [
        'regulatory_compliance',
      ])
      expect(section).toContain('ISO-traceable')
    })

    it('should note Guardian-native dimensions when included', () => {
      const section = buildISOApplicabilitySection(sampleControls, [
        'clinical_risk',
        'regulatory_compliance',
      ])
      expect(section).toContain('Guardian healthcare-specific criteria')
      expect(section).toContain('clinical_risk')
    })

    it('should not contain prohibited terms when empty', () => {
      const section = buildISOApplicabilitySection([], ['regulatory_compliance'])
      // Empty controls returns empty string
      expect(section).toBe('')
    })

    it('should list all applicable controls with clause refs', () => {
      const section = buildISOApplicabilitySection(sampleControls, [
        'regulatory_compliance',
      ])
      expect(section).toContain('A.6.2.6')
      expect(section).toContain('6.3')
      expect(section).toContain('A.5.4')
    })
  })

  describe('User Prompt', () => {
    const baseParams = {
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: 'clinical_ai' as const,
      responses: [
        { sectionNumber: 1, questionNumber: 1, questionText: 'Q', responseText: 'A' },
      ],
    }

    it('should not contain prohibited terms when ISO controls provided', () => {
      const prompt = buildScoringUserPrompt({
        ...baseParams,
        isoControls: sampleControls,
      })
      for (const term of PROHIBITED_TERMS) {
        expect(prompt).not.toContain(term)
      }
    })

    it('should not contain prohibited terms without ISO controls', () => {
      const prompt = buildScoringUserPrompt(baseParams)
      for (const term of PROHIBITED_TERMS) {
        expect(prompt).not.toContain(term)
      }
    })

    it('should contain ISO-traceable language when ISO controls are present', () => {
      const prompt = buildScoringUserPrompt({
        ...baseParams,
        isoControls: sampleControls,
      })
      expect(prompt).toContain('ISO-traceable')
    })
  })

  describe('Full Prompt Composition Audit', () => {
    it('should maintain compliance across system + user prompts combined', () => {
      const system = buildScoringSystemPrompt(sampleControls)
      const user = buildScoringUserPrompt({
        vendorName: 'AuditVendor',
        solutionName: 'AuditSolution',
        solutionType: 'administrative_ai',
        responses: [
          { sectionNumber: 1, questionNumber: 1, questionText: 'Q1', responseText: 'A1' },
          { sectionNumber: 2, questionNumber: 1, questionText: 'Q2', responseText: 'A2' },
        ],
        isoControls: sampleControls,
      })

      // Combine both prompts as Claude would see them
      const fullPrompt = `${system}\n\n${user}`

      // Required terms must exist in the combined prompt
      for (const term of REQUIRED_TERMS) {
        expect(fullPrompt).toContain(term)
      }

      // Count all prohibited term occurrences in the combined prompt
      for (const term of PROHIBITED_TERMS) {
        const occurrences = countOccurrences(fullPrompt, term)
        // At most present in "Do NOT use" instruction contexts
        if (occurrences > 0) {
          // Every occurrence should be in a prohibition instruction
          let searchStart = 0
          for (let i = 0; i < occurrences; i++) {
            const idx = fullPrompt.indexOf(term, searchStart)
            const surrounding = fullPrompt.substring(
              Math.max(0, idx - 60),
              idx + term.length + 60
            )
            const isProhibitionContext =
              surrounding.includes('Do NOT use') ||
              surrounding.includes('Do not use') ||
              surrounding.includes('never use') ||
              surrounding.includes('Never use')
            expect(isProhibitionContext).toBe(true)
            searchStart = idx + term.length
          }
        }
      }
    })
  })
})

/**
 * Count case-sensitive occurrences of a substring in a string.
 */
function countOccurrences(text: string, term: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++
    pos += term.length
  }
  return count
}

/**
 * Verify that every occurrence of a prohibited term appears within a
 * "Do NOT use" / prohibition instruction context. Fails if any
 * occurrence is found outside such context.
 */
function verifyAllOccurrencesInProhibitionContext(
  text: string,
  term: string,
  occurrences: number
): void {
  let searchStart = 0
  for (let i = 0; i < occurrences; i++) {
    const idx = text.indexOf(term, searchStart)
    const surroundingStart = Math.max(0, idx - 80)
    const surroundingEnd = Math.min(text.length, idx + term.length + 80)
    const surrounding = text.substring(surroundingStart, surroundingEnd)
    const isProhibitionContext =
      surrounding.includes('Do NOT use') ||
      surrounding.includes('Do not use') ||
      surrounding.includes('never use') ||
      surrounding.includes('Never use')
    expect(isProhibitionContext).toBe(true)
    searchStart = idx + term.length
  }
}
