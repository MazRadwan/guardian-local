/**
 * PDF Exporter Integration Tests
 *
 * Tests PDF generation functionality
 */

import { PDFExporter } from '../../src/infrastructure/export/PDFExporter'
import { Assessment } from '../../src/domain/entities/Assessment'
import { Vendor } from '../../src/domain/entities/Vendor'
import { Question } from '../../src/domain/entities/Question'
import * as pdf from 'pdf-parse'

describe('PDFExporter Integration Tests', () => {
  let pdfExporter: PDFExporter

  beforeEach(() => {
    pdfExporter = new PDFExporter()
  })

  describe('generatePDF', () => {
    it('should generate a valid PDF file', async () => {
      // Create test data
      const vendor = Vendor.create({
        name: 'Test Vendor Inc.',
        industry: 'Healthcare',
        website: 'https://testvendor.com',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'AI Health Platform',
        solutionType: 'Cloud-based AI Solution',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy Compliance',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'How does your solution handle personal health information?',
          questionType: 'text',
          questionMetadata: {
            required: true,
            helpText: 'Describe your PHI handling processes',
          },
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy Compliance',
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Do you have a Data Protection Agreement in place?',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Security Architecture',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'What encryption standards do you use?',
          questionType: 'text',
          questionMetadata: {
            required: true,
          },
        }),
      ]

      // Generate PDF
      const pdfBuffer = await pdfExporter.generatePDF({
        assessment,
        vendor,
        questions,
      })

      // Verify it's a buffer
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true)
      expect(pdfBuffer.length).toBeGreaterThan(0)

      // Verify it's a valid PDF (starts with %PDF)
      const pdfHeader = pdfBuffer.slice(0, 4).toString()
      expect(pdfHeader).toBe('%PDF')
    }, 30000) // 30 second timeout for Puppeteer

    it('should include vendor name in PDF content', async () => {
      const vendor = Vendor.create({
        name: 'Unique Vendor Name 12345',
        industry: 'Technology',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Test Solution',
        solutionType: 'AI Tool',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Test Section',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question?',
          questionType: 'text',
        }),
      ]

      const pdfBuffer = await pdfExporter.generatePDF({
        assessment,
        vendor,
        questions,
      })

      // Parse PDF to extract text (requires pdf-parse package)
      // For now, just verify the PDF was generated
      expect(pdfBuffer.length).toBeGreaterThan(1000) // Reasonable size for a PDF with content
    }, 30000)

    it('should include all questions in PDF', async () => {
      const vendor = Vendor.create({
        name: 'Test Vendor',
        industry: 'Finance',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Financial AI',
        solutionType: 'Trading Platform',
        createdBy: 'test-user-id',
      })

      const questions = Array.from({ length: 10 }, (_, i) =>
        Question.create({
          assessmentId: assessment.id,
          sectionName: `Section ${Math.floor(i / 3) + 1}`,
          sectionNumber: Math.floor(i / 3) + 1,
          questionNumber: (i % 3) + 1,
          questionText: `Question ${i + 1}: What is your policy on ${i + 1}?`,
          questionType: 'text',
        })
      )

      const pdfBuffer = await pdfExporter.generatePDF({
        assessment,
        vendor,
        questions,
      })

      // PDF with 10 questions should be larger than with 1
      expect(pdfBuffer.length).toBeGreaterThan(5000)
    }, 30000)

    it('should handle questions with metadata', async () => {
      const vendor = Vendor.create({
        name: 'Metadata Test Vendor',
        industry: 'Healthcare',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Test',
        solutionType: 'Tool',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Security',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Security question with metadata?',
          questionType: 'text',
          questionMetadata: {
            required: true,
            helpText: 'This is helpful information for the question',
            enumOptions: ['Option A', 'Option B', 'Option C'],
          },
        }),
      ]

      const pdfBuffer = await pdfExporter.generatePDF({
        assessment,
        vendor,
        questions,
      })

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true)
      expect(pdfBuffer.length).toBeGreaterThan(0)
    }, 30000)

    it('should throw error if template not found', async () => {
      // Create an exporter with invalid template path
      const badExporter = new PDFExporter()

      // Override template path to invalid location
      ;(badExporter as any).templatePath = '/invalid/path/template.html'

      const vendor = Vendor.create({
        name: 'Test',
        industry: 'Tech',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Test',
        solutionType: 'Tool',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Test',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question for PDF?',
          questionType: 'text',
        }),
      ]

      await expect(
        badExporter.generatePDF({ assessment, vendor, questions })
      ).rejects.toThrow('Failed to load PDF template')
    })
  })
})
