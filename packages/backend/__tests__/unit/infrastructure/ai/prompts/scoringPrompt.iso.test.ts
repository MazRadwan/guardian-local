import { buildISOCatalogSection, buildISOApplicabilitySection } from '../../../../../src/infrastructure/ai/prompts/scoringPrompt.iso'
import type { ISOControlForPrompt } from '../../../../../src/domain/compliance/types'

const PROHIBITED_TERMS = ['ISO-compliant', 'ISO-certified', 'meets ISO requirements']

/**
 * Helper to create test controls
 */
function makeControl(overrides: Partial<ISOControlForPrompt> = {}): ISOControlForPrompt {
  return {
    clauseRef: 'A.4.2',
    domain: 'Context of the organization',
    title: 'AI policy',
    framework: 'ISO/IEC 42001',
    criteriaText: 'Organization has established an AI policy.',
    assessmentGuidance: 'Look for documented AI governance policy.',
    dimensions: ['regulatory_compliance'],
    relevanceWeights: { regulatory_compliance: 0.8 },
    ...overrides,
  }
}

describe('scoringPrompt.iso', () => {
  describe('buildISOCatalogSection', () => {
    it('should return empty string when called with empty array', () => {
      const result = buildISOCatalogSection([])
      expect(result).toBe('')
    })

    it('should return empty string when called with no args (backwards compat)', () => {
      const result = buildISOCatalogSection()
      expect(result).toBe('')
    })

    it('should include clause refs, titles, and criteria text', () => {
      const controls = [
        makeControl(),
        makeControl({
          clauseRef: 'A.6.2.6',
          domain: 'Data management',
          title: 'Data quality management',
          criteriaText: 'Systematic data quality processes exist.',
        }),
      ]
      const result = buildISOCatalogSection(controls)

      expect(result).toContain('A.4.2')
      expect(result).toContain('AI policy')
      expect(result).toContain('Organization has established an AI policy.')
      expect(result).toContain('A.6.2.6')
      expect(result).toContain('Data quality management')
      expect(result).toContain('Systematic data quality processes exist.')
    })

    it('should group controls by domain', () => {
      const controls = [
        makeControl({ domain: 'Context of the organization' }),
        makeControl({
          clauseRef: 'A.6.2.6',
          domain: 'Data management',
          title: 'Data quality',
          criteriaText: 'Data quality text.',
        }),
      ]
      const result = buildISOCatalogSection(controls)

      expect(result).toContain('#### Context of the organization')
      expect(result).toContain('#### Data management')
    })

    it('should include messaging guidelines (ISO-traceable)', () => {
      const controls = [makeControl()]
      const result = buildISOCatalogSection(controls)

      expect(result).toContain('ISO-traceable')
      expect(result).toContain('ISO-informed')
    })

    it('should include Guardian-native dimensions callout', () => {
      const controls = [makeControl()]
      const result = buildISOCatalogSection(controls)

      expect(result).toContain('Clinical Risk')
      expect(result).toContain('Vendor Capability')
      expect(result).toContain('Ethical Considerations')
      expect(result).toContain('Sustainability')
      expect(result).toContain('Guardian healthcare-specific criteria')
    })

    it('should include assessment guidance when present', () => {
      const controls = [makeControl()]
      const result = buildISOCatalogSection(controls)

      expect(result).toContain('Guidance: Look for documented AI governance policy.')
    })

    it('should omit guidance line when not present', () => {
      const controls = [makeControl({ assessmentGuidance: undefined })]
      const result = buildISOCatalogSection(controls)

      expect(result).not.toContain('Guidance:')
    })

    it('should include dimension list for each control', () => {
      const controls = [
        makeControl({ dimensions: ['regulatory_compliance', 'privacy_risk'] }),
      ]
      const result = buildISOCatalogSection(controls)

      expect(result).toContain('Dimensions: regulatory_compliance, privacy_risk')
    })

    it('should instruct against prohibited terms (negative instruction only)', () => {
      const controls = [makeControl()]
      const result = buildISOCatalogSection(controls)

      // The prompt includes prohibited terms only in "Do NOT use" instructions.
      // Verify the negative instruction is present.
      expect(result).toContain('Do NOT use "ISO-compliant"')
      expect(result).toContain('Do NOT use')

      // Verify prohibited terms do NOT appear in control data sections
      // (outside the instruction block). Split on "Controls by Domain" to
      // isolate the control data area from the instruction header.
      const controlDataSection = result.split('### Controls by Domain')[1] ?? ''
      for (const term of PROHIBITED_TERMS) {
        expect(controlDataSection).not.toContain(term)
      }
    })
  })

  describe('buildISOApplicabilitySection', () => {
    it('should return empty string when called with empty array', () => {
      const result = buildISOApplicabilitySection([])
      expect(result).toBe('')
    })

    it('should return empty string when called with no args (backwards compat)', () => {
      const result = buildISOApplicabilitySection()
      expect(result).toBe('')
    })

    it('should list controls with dimensions', () => {
      const controls = [
        makeControl({ clauseRef: 'A.4.2', dimensions: ['regulatory_compliance'] }),
        makeControl({
          clauseRef: '6.3',
          framework: 'ISO/IEC 23894',
          title: 'Risk treatment',
          dimensions: ['regulatory_compliance', 'operational_excellence'],
        }),
      ]
      const result = buildISOApplicabilitySection(controls, ['regulatory_compliance'])

      expect(result).toContain('A.4.2 (ISO/IEC 42001)')
      expect(result).toContain('6.3 (ISO/IEC 23894)')
      expect(result).toContain('[regulatory_compliance, operational_excellence]')
    })

    it('should include Guardian-native note when relevant dimensions present', () => {
      const controls = [makeControl()]
      const result = buildISOApplicabilitySection(controls, [
        'clinical_risk',
        'ethical_considerations',
      ])

      expect(result).toContain('clinical_risk')
      expect(result).toContain('ethical_considerations')
      expect(result).toContain('Guardian healthcare-specific criteria')
      expect(result).toContain('Guardian-native dimensions')
    })

    it('should NOT include Guardian-native note when no native dimensions', () => {
      const controls = [makeControl()]
      const result = buildISOApplicabilitySection(controls, [
        'regulatory_compliance',
        'security_risk',
      ])

      expect(result).not.toContain('Guardian-native dimensions')
    })

    it('should handle undefined dimensions', () => {
      const controls = [makeControl()]
      const result = buildISOApplicabilitySection(controls)

      expect(result).toContain('ISO-traceable')
      expect(result).not.toContain('Guardian-native dimensions')
    })

    it('should NOT contain prohibited terms', () => {
      const controls = [makeControl()]
      const result = buildISOApplicabilitySection(controls, ['regulatory_compliance'])

      for (const term of PROHIBITED_TERMS) {
        expect(result).not.toContain(term)
      }
    })
  })
})
