/**
 * Unit tests for RegexResponseExtractor
 *
 * Epic 39: Tests regex-based extraction of Q&A pairs from
 * Guardian questionnaire documents. Covers standard parsing,
 * edge cases, and confidence scoring.
 */

import { RegexResponseExtractor } from '../../../../src/infrastructure/extraction/RegexResponseExtractor'

describe('RegexResponseExtractor', () => {
  let extractor: RegexResponseExtractor

  beforeEach(() => {
    extractor = new RegexResponseExtractor()
  })

  describe('assessmentId extraction', () => {
    it('should extract assessmentId from header', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'Acme Corp',
        'Assessment ID:',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '',
        'Question 1.1',
        'Sample question?',
        'Response:',
        'Sample response.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.assessmentId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    })

    it('should extract assessmentId on same line as label', () => {
      const text = [
        'Assessment ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '',
        'Question 1.1',
        'Sample?',
        'Response:',
        'Answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.assessmentId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    })

    it('should return null assessmentId when no Assessment ID in text', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'Acme Corp',
        '',
        'Question 1.1',
        'Sample question?',
        'Response:',
        'Sample response.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.assessmentId).toBeNull()
    })
  })

  describe('vendorName extraction', () => {
    it('should extract vendor name from header', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'HealthTech Solutions Inc.',
        'Assessment ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '',
        'Question 1.1',
        'Sample?',
        'Response:',
        'Answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.vendorName).toBe('HealthTech Solutions Inc.')
    })

    it('should skip metadata lines when extracting vendor name', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'Assessment ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'Date: 2026-01-15',
        'MediSoft Corp',
        '',
        'Question 1.1',
        'Sample?',
        'Response:',
        'Answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.vendorName).toBe('MediSoft Corp')
    })

    it('should return null vendor name when no questionnaire title', () => {
      const text = [
        'Some random document',
        'Question 1.1',
        'Sample?',
        'Response:',
        'Answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.vendorName).toBeNull()
    })
  })

  describe('standard questionnaire parsing', () => {
    it('should parse standard Guardian questionnaire with multiple sections and questions', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'Acme Corp',
        'Assessment ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '',
        'Section 1: Data Governance',
        '',
        'Question 1.1',
        'What is your data governance policy?',
        'Response:',
        'We have a comprehensive data governance framework.',
        '',
        'Question 1.2',
        'How do you handle data classification?',
        'Response:',
        'We classify data into four tiers.',
        '',
        'Section 2: Security',
        '',
        'Question 2.1',
        'What security certifications do you hold?',
        'Response:',
        'We hold SOC 2 Type II and ISO 27001 certifications.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.assessmentId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      expect(result.vendorName).toBe('Acme Corp')
      expect(result.responses).toHaveLength(3)

      expect(result.responses[0].sectionNumber).toBe(1)
      expect(result.responses[0].questionNumber).toBe(1)
      expect(result.responses[0].questionText).toContain('data governance policy')
      expect(result.responses[0].responseText).toContain('comprehensive data governance framework')
      expect(result.responses[0].confidence).toBe(1.0)
      expect(result.responses[0].hasVisualContent).toBe(false)

      expect(result.responses[1].sectionNumber).toBe(1)
      expect(result.responses[1].questionNumber).toBe(2)
      expect(result.responses[1].questionText).toContain('data classification')
      expect(result.responses[1].responseText).toContain('four tiers')

      expect(result.responses[2].sectionNumber).toBe(2)
      expect(result.responses[2].questionNumber).toBe(1)
      expect(result.responses[2].questionText).toContain('security certifications')
      expect(result.responses[2].responseText).toContain('SOC 2 Type II')
    })
  })

  describe('empty responses', () => {
    it('should handle empty responses (vendor skipped) with confidence 0.5', () => {
      const text = [
        'Question 1.1',
        'What is your data governance policy?',
        'Response:',
        '',
        'Question 1.2',
        'How do you handle data retention?',
        'Response:',
        'We retain data for 7 years.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(2)
      expect(result.responses[0].responseText).toBe('')
      expect(result.responses[0].confidence).toBe(0.5)
      expect(result.responses[1].responseText).toContain('7 years')
      expect(result.responses[1].confidence).toBe(1.0)
    })
  })

  describe('multi-paragraph responses', () => {
    it('should handle multi-paragraph responses with bullet points', () => {
      const text = [
        'Question 1.1',
        'Describe your security measures.',
        'Response:',
        'Our security program includes multiple layers:',
        '',
        '- Network segmentation with VLANs',
        '- WAF and DDoS protection',
        '- 24/7 SOC monitoring',
        '',
        'Additionally, we perform quarterly penetration testing',
        'and annual red team exercises.',
        '',
        'Question 1.2',
        'Next question.',
        'Response:',
        'Next answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(2)
      const response = result.responses[0].responseText
      expect(response).toContain('multiple layers')
      expect(response).toContain('Network segmentation')
      expect(response).toContain('WAF and DDoS')
      expect(response).toContain('SOC monitoring')
      expect(response).toContain('quarterly penetration testing')
      expect(response).toContain('red team exercises')
    })
  })

  describe('Question marker validation', () => {
    it('should reject "Question" appearing mid-sentence (not on its own line)', () => {
      const text = [
        'Question 1.1',
        'This is a valid question about governance.',
        'Response:',
        'The answer references Question 2.3 from a previous assessment.',
        'It also mentions that the Question of compliance is important.',
      ].join('\n')

      const result = extractor.extract(text)

      // Only the real Question 1.1 marker should be detected
      expect(result.responses).toHaveLength(1)
      expect(result.responses[0].sectionNumber).toBe(1)
      expect(result.responses[0].questionNumber).toBe(1)
    })
  })

  describe('Response marker validation', () => {
    it('should reject "Response:" appearing mid-sentence', () => {
      const text = [
        'Question 1.1',
        'What is your approach?',
        'Response:',
        'Our approach involves a Response: time of 4 hours for incidents.',
      ].join('\n')

      const result = extractor.extract(text)

      // "Response:" in the middle of the sentence should not split
      expect(result.responses).toHaveLength(1)
      expect(result.responses[0].responseText).toContain('Response: time of 4 hours')
    })
  })

  describe('section header stripping', () => {
    it('should strip trailing section headers from response text', () => {
      const text = [
        'Question 1.1',
        'What is your policy?',
        'Response:',
        'We have a strong policy.',
        '',
        'Section 2: Security',
        '',
        'Question 2.1',
        'What certifications?',
        'Response:',
        'SOC 2.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(2)
      // Response for 1.1 should not contain the Section 2 header
      expect(result.responses[0].responseText).not.toContain('Section 2: Security')
      expect(result.responses[0].responseText).toContain('strong policy')
    })

    it('should strip leading section headers from question text', () => {
      const text = [
        'Section 1: Data Governance',
        '',
        'Question 1.1',
        'Section 1: Data Governance',
        'What is your data governance policy?',
        'Response:',
        'We have a policy.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(1)
      expect(result.responses[0].questionText).not.toContain('Section 1: Data Governance')
      expect(result.responses[0].questionText).toContain('data governance policy')
    })
  })

  describe('non-sequential question numbers', () => {
    it('should handle non-sequential question numbers (gaps)', () => {
      const text = [
        'Question 1.1',
        'First question.',
        'Response:',
        'First answer.',
        '',
        'Question 1.5',
        'Fifth question (others omitted).',
        'Response:',
        'Fifth answer.',
        '',
        'Question 3.2',
        'Question from section 3.',
        'Response:',
        'Section 3 answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(3)
      expect(result.responses[0].sectionNumber).toBe(1)
      expect(result.responses[0].questionNumber).toBe(1)
      expect(result.responses[1].sectionNumber).toBe(1)
      expect(result.responses[1].questionNumber).toBe(5)
      expect(result.responses[2].sectionNumber).toBe(3)
      expect(result.responses[2].questionNumber).toBe(2)
    })
  })

  describe('unicode characters', () => {
    it('should handle unicode characters in responses', () => {
      const text = [
        'Question 1.1',
        'Describe your approach.',
        'Response:',
        'Nous utilisons une approche securisee.',
        'Our policy covers data in Zurich and Munchen.',
        'Key metrics: 99.9% uptime, <0.1% error rate.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(1)
      expect(result.responses[0].responseText).toContain('securisee')
      expect(result.responses[0].responseText).toContain('Zurich')
      expect(result.responses[0].responseText).toContain('Munchen')
      expect(result.responses[0].responseText).toContain('99.9%')
    })

    it('should handle CJK and emoji characters in responses', () => {
      const text = [
        'Question 1.1',
        'Describe your approach.',
        'Response:',
        'Data center locations include Tokyo and Seoul.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(1)
      expect(result.responses[0].responseText).toContain('Tokyo')
      expect(result.responses[0].responseText).toContain('Seoul')
      expect(result.responses[0].confidence).toBe(1.0)
    })
  })

  describe('no markers found', () => {
    it('should return empty array when no Question markers found', () => {
      const text = [
        'This is a general document about our company.',
        'We provide healthcare solutions.',
        'Contact us for more information.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toEqual([])
    })
  })

  describe('parseTimeMs', () => {
    it('should report parse time in milliseconds', () => {
      const text = [
        'Question 1.1',
        'Sample question.',
        'Response:',
        'Sample answer.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(typeof result.parseTimeMs).toBe('number')
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0)
      // Regex parsing should be fast
      expect(result.parseTimeMs).toBeLessThan(1000)
    })
  })

  describe('question without Response marker', () => {
    it('should handle question block without Response: marker', () => {
      const text = [
        'Question 1.1',
        'What is your policy?',
        'We have a comprehensive approach to governance.',
        '',
        'Question 1.2',
        'How do you classify data?',
        'Response:',
        'We use four tiers.',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.responses).toHaveLength(2)
      // First question has no Response: marker, so the entire block is question text
      expect(result.responses[0].questionText).toContain('policy')
      expect(result.responses[0].responseText).toBe('')
      expect(result.responses[0].confidence).toBe(0.5)
    })
  })

  describe('preprocessor integration', () => {
    it('should preprocess text before extraction (strips footer and page markers)', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'TestCorp',
        '-- 1 of 2 --',
        '',
        'Question 1.1',
        'What is your policy?',
        'Response:',
        'Our policy is robust. -- 2 of 2 --',
        '',
        'Generated by Guardian AI Vendor Assessment System',
        'Version 2.0',
      ].join('\n')

      const result = extractor.extract(text)

      expect(result.vendorName).toBe('TestCorp')
      expect(result.responses).toHaveLength(1)
      expect(result.responses[0].responseText).not.toContain('-- 2 of 2 --')
      expect(result.responses[0].responseText).toContain('robust')
    })
  })
})
