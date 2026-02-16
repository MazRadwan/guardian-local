/**
 * Unit Tests for ISO Messaging Prohibited Terms List
 *
 * Story 38.2.4: Ensures prohibited terms are detected and
 * approved terms are not flagged.
 */

import {
  findProhibitedTerms,
  PROHIBITED_TERMS,
  APPROVED_TERMS,
  ISO_DISCLAIMER,
  ProhibitedTerm,
} from '../../../../src/domain/compliance/isoMessagingTerms'

describe('isoMessagingTerms', () => {
  describe('findProhibitedTerms', () => {
    it('should detect "ISO compliant" in text', () => {
      const result = findProhibitedTerms('This vendor is ISO compliant.')
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('ISO compliant')
      expect(result[0].alternative).toBe('ISO-informed')
    })

    it('should detect "ISO certified" in text', () => {
      const result = findProhibitedTerms(
        'The system is ISO certified for healthcare use.'
      )
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('ISO certified')
      expect(result[0].alternative).toBe('assessed against ISO standards')
    })

    it('should detect "meets ISO requirements" in text', () => {
      const result = findProhibitedTerms(
        'This product meets ISO requirements for AI safety.'
      )
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('meets ISO requirements')
      expect(result[0].alternative).toBe(
        'demonstrates alignment with ISO controls'
      )
    })

    it('should detect "complies with ISO" in text', () => {
      const result = findProhibitedTerms(
        'Our platform complies with ISO standards.'
      )
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('complies with ISO')
      expect(result[0].alternative).toBe('aligned with ISO standards')
    })

    it('should detect "ISO conformant" in text', () => {
      const result = findProhibitedTerms(
        'The solution is ISO conformant across all domains.'
      )
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('ISO conformant')
      expect(result[0].alternative).toBe('ISO-traceable')
    })

    it('should detect "ISO compliance" in text', () => {
      const result = findProhibitedTerms(
        'We have achieved ISO compliance in our processes.'
      )
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('ISO compliance')
      expect(result[0].alternative).toBe('ISO alignment')
    })

    it('should detect "certified against ISO" in text', () => {
      const result = findProhibitedTerms(
        'This product is certified against ISO 42001.'
      )
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('certified against ISO')
      expect(result[0].alternative).toBe('referenced against ISO')
    })

    it('should return empty array for clean text', () => {
      const result = findProhibitedTerms(
        'Guardian provides ISO-informed risk assessment aligned with ISO standards.'
      )
      expect(result).toEqual([])
    })

    it('should be case-insensitive', () => {
      const lower = findProhibitedTerms('iso compliant system')
      expect(lower).toHaveLength(1)
      expect(lower[0].term).toBe('ISO compliant')

      const upper = findProhibitedTerms('ISO COMPLIANT system')
      expect(upper).toHaveLength(1)
      expect(upper[0].term).toBe('ISO compliant')

      const mixed = findProhibitedTerms('Iso Certified product')
      expect(mixed).toHaveLength(1)
      expect(mixed[0].term).toBe('ISO certified')
    })

    it('should not flag approved terms', () => {
      const approvedText = [
        'ISO-traceable assessment',
        'ISO-informed evaluation',
        'aligned with ISO standards',
        'referenced against ISO controls',
        'informed by ISO standards',
        'Guardian assessment informed by ISO controls',
        'demonstrates alignment with ISO clauses',
        'ISO clause reference A.6.2.6',
      ].join('. ')

      const result = findProhibitedTerms(approvedText)
      expect(result).toEqual([])
    })

    it('should detect multiple violations in a single text', () => {
      const result = findProhibitedTerms(
        'This ISO compliant and ISO certified product meets ISO requirements.'
      )
      expect(result.length).toBeGreaterThanOrEqual(3)
    })

    it('should return consistent results on repeated calls (no /g stateful bug)', () => {
      const text = 'This is ISO compliant software.'
      const result1 = findProhibitedTerms(text)
      const result2 = findProhibitedTerms(text)
      const result3 = findProhibitedTerms(text)

      expect(result1).toHaveLength(1)
      expect(result2).toHaveLength(1)
      expect(result3).toHaveLength(1)
    })

    it('should detect hyphenated form "ISO-compliant"', () => {
      const result = findProhibitedTerms('The tool is ISO-compliant.')
      expect(result).toHaveLength(1)
      expect(result[0].term).toBe('ISO compliant')
    })
  })

  describe('ISO_DISCLAIMER', () => {
    it('should exist and be a non-empty string', () => {
      expect(typeof ISO_DISCLAIMER).toBe('string')
      expect(ISO_DISCLAIMER.length).toBeGreaterThan(0)
    })

    it('should not contain any prohibited terms', () => {
      const violations = findProhibitedTerms(ISO_DISCLAIMER)
      expect(violations).toEqual([])
    })
  })

  describe('APPROVED_TERMS', () => {
    it('should be a non-empty array', () => {
      expect(APPROVED_TERMS.length).toBeGreaterThan(0)
    })

    it('should contain ISO-traceable', () => {
      expect(APPROVED_TERMS).toContain('ISO-traceable')
    })

    it('should contain ISO-informed', () => {
      expect(APPROVED_TERMS).toContain('ISO-informed')
    })
  })

  describe('PROHIBITED_TERMS', () => {
    it('should have 7 prohibited terms', () => {
      expect(PROHIBITED_TERMS).toHaveLength(7)
    })

    it('should have a non-empty alternative for each term', () => {
      for (const pt of PROHIBITED_TERMS) {
        expect(pt.alternative.length).toBeGreaterThan(0)
      }
    })

    it('should have a non-empty reason for each term', () => {
      for (const pt of PROHIBITED_TERMS) {
        expect(pt.reason.length).toBeGreaterThan(0)
      }
    })

    it('should have a RegExp pattern for each term', () => {
      for (const pt of PROHIBITED_TERMS) {
        expect(pt.pattern).toBeInstanceOf(RegExp)
      }
    })

    it('should not use the /g flag on any pattern', () => {
      for (const pt of PROHIBITED_TERMS) {
        expect(pt.pattern.global).toBe(false)
      }
    })

    it('should use the /i flag on every pattern', () => {
      for (const pt of PROHIBITED_TERMS) {
        expect(pt.pattern.ignoreCase).toBe(true)
      }
    })
  })
})
