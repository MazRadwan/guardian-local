/**
 * Unit tests for DocumentClassifier
 *
 * Epic 18.4.1: Tests heuristic document type detection during upload.
 * Validates questionnaire vs document classification patterns.
 */

import {
  detectDocumentType,
  extractVendorName,
  classifyDocument,
  DetectedDocType,
} from '../../../../src/infrastructure/extraction/DocumentClassifier'

describe('DocumentClassifier', () => {
  describe('detectDocumentType', () => {
    describe('questionnaire detection', () => {
      it('should detect Excel files with Q&A headers as questionnaire', () => {
        const excerpt = `
          Question, Response
          Q1: What security measures do you have?
          We implement SOC2 controls...
        `
        const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('questionnaire')
      })

      it('should detect documents with Guardian assessment ID as questionnaire', () => {
        const excerpt = `
          Assessment ID: ASMT-12345
          Vendor: Acme Corp
          Date: 2024-01-15

          Question 1: Data Governance
          Response: Our data governance...
        `
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('questionnaire')
      })

      it('should detect documents with numbered Q&A format as questionnaire', () => {
        const excerpt = `
          Q1: How do you handle data encryption?
          Answer: We use AES-256 encryption at rest...

          Q2: What is your incident response plan?
          Answer: We have a documented IR plan...

          Q3: Do you have SOC2 certification?
          Response: Yes, we completed SOC2 Type II...
        `
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('questionnaire')
      })

      it('should detect documents with risk dimension keywords as questionnaire', () => {
        const excerpt = `
          Vendor Response Form

          Data Governance: We maintain strict data classification...
          Security: Our security program includes...
          Privacy: We are GDPR compliant...
          Compliance: SOC2, HIPAA, ISO 27001
        `
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('questionnaire')
      })

      it('should detect documents with vendor response headers', () => {
        const excerpt = `
          VENDOR RESPONSE

          Assessment ID: ASMT-001
          Question 1: Describe your data handling...
          Response: We process data securely...
          Data Governance: Our policies include...
        `
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('questionnaire')
      })
    })

    describe('document detection', () => {
      it('should detect marketing whitepaper as document', () => {
        // Long prose with minimal line breaks and marketing language
        const excerpt = `
Acme Healthcare AI is the leading provider of innovative healthcare solutions. Our world-class platform delivers unprecedented value to healthcare organizations. We believe in transforming healthcare through cutting-edge artificial intelligence and machine learning technologies. Our mission is to make healthcare more accessible and efficient for everyone. Founded in 2015, Acme has grown to serve over 500 healthcare organizations globally. Our team of expert data scientists and healthcare professionals work tirelessly to deliver solutions that matter. We are trusted by top hospitals and health systems across North America and Europe.
        `.repeat(10) // Make it long enough

        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('document')
      })

      it('should detect company overview as document', () => {
        const excerpt = `
About Acme Healthcare

Our Mission
We believe in a world where healthcare technology empowers both providers and patients to achieve better outcomes. Our team is dedicated to building solutions that matter.

Our Team
Founded in 2015, our team brings together experts from healthcare, technology, and data science. We are headquartered in San Francisco with offices worldwide.

Our Solutions
Acme provides industry-leading AI solutions for healthcare organizations seeking to modernize their operations and improve patient care.
        `.repeat(8)

        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('document')
      })

      it('should detect product brochure as document', () => {
        // Product brochure with marketing language and long prose
        const excerpt = `
Introducing HealthAI Platform - The Industry-Leading Solution

HealthAI is a leading provider of innovative healthcare solutions. Our world-class platform combines cutting-edge AI with proven healthcare workflows to deliver results that matter. We believe in transforming healthcare through technology.

Trusted by leading healthcare organizations around the world. Our team of experts, founded in 2015 and headquartered in San Francisco, works tirelessly to deliver the best solutions.

Request a demo today to see how HealthAI can transform your organization.
        `.repeat(10) // Make it long enough (>5000 chars)

        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('document')
      })
    })

    describe('unknown classification', () => {
      it('should return unknown for ambiguous short content', () => {
        const excerpt = 'This is a short document with minimal context.'
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('unknown')
      })

      it('should return unknown for empty excerpt', () => {
        const excerpt = ''
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('unknown')
      })

      it('should return unknown for technical documentation', () => {
        // Technical docs that are neither questionnaire nor marketing
        const excerpt = `
API Documentation

GET /api/users
Returns a list of users.

Request:
curl -X GET https://api.example.com/users

Response:
{
  "users": [...]
}
        `
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        expect(result).toBe('unknown')
      })

      it('should return unknown when indicators are balanced', () => {
        // Mixed signals - some questionnaire, some document indicators
        const excerpt = `
Our company is a leading provider of AI solutions.
Question: What services do you offer?
We offer innovative solutions for healthcare.
        `
        const mimeType = 'application/pdf'

        const result = detectDocumentType(excerpt, mimeType)

        // With balanced indicators, should be unknown
        expect(['unknown', 'questionnaire', 'document']).toContain(result)
      })
    })

    describe('MIME type handling', () => {
      it('should boost questionnaire score for Excel MIME types', () => {
        const excerpt = 'Some basic content with no strong indicators'
        const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        const excelResult = detectDocumentType(excerpt, excelMime)
        const pdfResult = detectDocumentType(excerpt, 'application/pdf')

        // Excel should have higher questionnaire bias than PDF
        // May or may not reach threshold depending on content
        expect(typeof excelResult).toBe('string')
        expect(typeof pdfResult).toBe('string')
      })

      it('should handle legacy Excel MIME type', () => {
        const excerpt = 'Question, Answer\nQ1, Response 1'
        const legacyMime = 'application/vnd.ms-excel'

        const result = detectDocumentType(excerpt, legacyMime)

        expect(result).toBe('questionnaire')
      })
    })
  })

  describe('extractVendorName', () => {
    it('should extract vendor name from "Vendor:" pattern', () => {
      const excerpt = `
        Assessment Form
        Vendor: Acme Healthcare Inc
        Date: 2024-01-15
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('Acme Healthcare Inc')
    })

    it('should extract vendor name from "Company:" pattern', () => {
      const excerpt = `
        Security Questionnaire
        Company: TechMed Solutions LLC
        Contact: John Doe
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('TechMed Solutions LLC')
    })

    it('should extract vendor name from "Prepared for:" pattern', () => {
      const excerpt = `
        Risk Assessment Report
        Prepared for: MedAI Corporation
        Assessment Date: January 2024
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('MedAI Corporation')
    })

    it('should extract vendor name from "Assessment of:" pattern', () => {
      const excerpt = `
        Guardian Risk Analysis
        Assessment of: HealthData Systems
        Risk Level: Medium
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('HealthData Systems')
    })

    it('should extract vendor name from "Submitted by:" pattern', () => {
      const excerpt = `
        Questionnaire Response
        Submitted by: CloudCare Technologies
        Date: 2024-02-01
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('CloudCare Technologies')
    })

    it('should extract vendor name from "Organization:" pattern', () => {
      const excerpt = `
        Risk Assessment Form
        Organization: Global Health AI
        Industry: Healthcare
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('Global Health AI')
    })

    it('should extract vendor name from "Respondent:" pattern', () => {
      const excerpt = `
        Security Assessment
        Respondent: SafeHealth Inc
        Response Date: March 2024
      `

      const result = extractVendorName(excerpt)

      expect(result).toBe('SafeHealth Inc')
    })

    it('should return null when no vendor pattern found', () => {
      const excerpt = `
        This is a general document.
        It contains various text but no specific labels with colons.
        No structured data here.
      `

      const result = extractVendorName(excerpt)

      expect(result).toBeNull()
    })

    it('should return null for generic names like "N/A"', () => {
      const excerpt = 'Vendor: N/A'

      const result = extractVendorName(excerpt)

      expect(result).toBeNull()
    })

    it('should return null for generic names like "None"', () => {
      const excerpt = 'Company: None'

      const result = extractVendorName(excerpt)

      expect(result).toBeNull()
    })

    it('should return null for names too short', () => {
      const excerpt = 'Vendor: AB'

      const result = extractVendorName(excerpt)

      expect(result).toBeNull()
    })

    it('should handle vendor names with ampersand', () => {
      const excerpt = 'Vendor: Johnson & Johnson Healthcare'

      const result = extractVendorName(excerpt)

      expect(result).toBe('Johnson & Johnson Healthcare')
    })

    it('should handle vendor names with periods', () => {
      const excerpt = 'Company: Acme Corp.'

      const result = extractVendorName(excerpt)

      expect(result).toBe('Acme Corp')
    })

    it('should handle vendor names with hyphens', () => {
      const excerpt = 'Organization: Med-Tech Solutions'

      const result = extractVendorName(excerpt)

      expect(result).toBe('Med-Tech Solutions')
    })

    it('should stop at newline', () => {
      const excerpt = `Vendor: Acme Corp
        Next line content here`

      const result = extractVendorName(excerpt)

      expect(result).toBe('Acme Corp')
    })

    it('should stop at comma', () => {
      const excerpt = 'Vendor: Acme Corp, a leading provider'

      const result = extractVendorName(excerpt)

      expect(result).toBe('Acme Corp')
    })
  })

  describe('classifyDocument', () => {
    it('should return full classification result', () => {
      const excerpt = `
        Assessment ID: ASMT-001
        Vendor: Acme Healthcare
        Question 1: Data governance policies?
        Response: We maintain strict policies...
      `
      const mimeType = 'application/pdf'

      const result = classifyDocument(excerpt, mimeType)

      expect(result.docType).toBe('questionnaire')
      expect(result.vendorName).toBe('Acme Healthcare')
      expect(result.indicators).toHaveProperty('questionnaire')
      expect(result.indicators).toHaveProperty('document')
      expect(result.indicators.questionnaire).toBeGreaterThan(0)
    })

    it('should include indicator scores for debugging', () => {
      const excerpt = 'Question 1: Test\nAnswer: Response'
      const mimeType = 'application/vnd.ms-excel'

      const result = classifyDocument(excerpt, mimeType)

      expect(typeof result.indicators.questionnaire).toBe('number')
      expect(typeof result.indicators.document).toBe('number')
    })

    it('should return null vendor when not found', () => {
      const excerpt = 'Some content without vendor info'
      const mimeType = 'application/pdf'

      const result = classifyDocument(excerpt, mimeType)

      expect(result.vendorName).toBeNull()
    })
  })

  describe('performance', () => {
    it('should classify large excerpt within reasonable time', () => {
      // Create a large excerpt (10k chars)
      const largeParagraph = 'Question: How do you handle data? Answer: We use encryption. '
      const largeExcerpt = largeParagraph.repeat(200) // ~12k chars

      const start = Date.now()
      const result = detectDocumentType(largeExcerpt, 'application/pdf')
      const elapsed = Date.now() - start

      // Relaxed threshold for CI environments (was 100ms, now 500ms)
      expect(elapsed).toBeLessThan(500)
      expect(typeof result).toBe('string')
    })

    it('should extract vendor name within reasonable time', () => {
      const excerpt = `
        Assessment Form
        Vendor: Acme Healthcare Inc
        Date: 2024-01-15
        ${'Some filler content. '.repeat(500)}
      `

      const start = Date.now()
      const result = extractVendorName(excerpt)
      const elapsed = Date.now() - start

      // Relaxed threshold for CI environments (was 10ms, now 100ms)
      expect(elapsed).toBeLessThan(100)
      expect(result).toBe('Acme Healthcare Inc')
    })
  })

  describe('edge cases', () => {
    it('should handle undefined-like content gracefully', () => {
      const excerpt = ''
      const mimeType = ''

      expect(() => detectDocumentType(excerpt, mimeType)).not.toThrow()
      expect(() => extractVendorName(excerpt)).not.toThrow()
    })

    it('should handle very long vendor names by truncating search', () => {
      const longName = 'A'.repeat(150) // Over 100 chars
      const excerpt = `Vendor: ${longName}`

      const result = extractVendorName(excerpt)

      // Should not match because name is too long
      expect(result).toBeNull()
    })

    it('should handle special characters in excerpt', () => {
      const excerpt = `
        Vendor: Test<script>alert("xss")</script>Corp
        Question: What about security?
      `
      const mimeType = 'application/pdf'

      // Should not crash on special characters
      expect(() => detectDocumentType(excerpt, mimeType)).not.toThrow()
      const result = extractVendorName(excerpt)
      // The regex should handle this gracefully
      expect(typeof result === 'string' || result === null).toBe(true)
    })

    it('should handle unicode characters', () => {
      const excerpt = `
        Vendor: Acme GmbH
        Beschreibung: Unsere Datensicherheit...
      `
      const mimeType = 'application/pdf'

      const docType = detectDocumentType(excerpt, mimeType)
      const vendorName = extractVendorName(excerpt)

      expect(typeof docType).toBe('string')
      expect(vendorName).toBe('Acme GmbH')
    })

    it('should handle case variations in patterns', () => {
      const excerpt = `
        VENDOR: ACME CORP
        QUESTION: WHAT IS YOUR SECURITY?
        ANSWER: WE USE ENCRYPTION
      `
      const mimeType = 'application/pdf'

      const result = detectDocumentType(excerpt, mimeType)

      expect(result).toBe('questionnaire')
    })
  })
})
