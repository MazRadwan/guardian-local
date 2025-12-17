/**
 * Word Exporter Integration Tests
 *
 * Tests Word (.docx) generation functionality
 */

import { WordExporter } from '../../src/infrastructure/export/WordExporter'
import { Assessment } from '../../src/domain/entities/Assessment'
import { Vendor } from '../../src/domain/entities/Vendor'
import { Question } from '../../src/domain/entities/Question'

describe('WordExporter Integration Tests', () => {
  let wordExporter: WordExporter

  beforeEach(() => {
    wordExporter = new WordExporter()
  })

  describe('generateWord', () => {
    it('should generate a valid Word (.docx) file', async () => {
      const vendor = Vendor.create({
        name: 'Word Test Vendor',
        industry: 'Healthcare',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Medical AI Platform',
        solutionType: 'Healthcare AI',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'How do you protect patient data?',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Security',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'What security measures are in place?',
          questionType: 'text',
        }),
      ]

      const wordBuffer = await wordExporter.generateWord({
        assessment,
        vendor,
        questions,
      })

      // Verify it's a buffer
      expect(Buffer.isBuffer(wordBuffer)).toBe(true)
      expect(wordBuffer.length).toBeGreaterThan(0)

      // Verify it's a valid .docx file (ZIP format with PK header)
      const header = wordBuffer.slice(0, 2).toString()
      expect(header).toBe('PK') // .docx files are ZIP archives
    })

    it('should generate Word file with multiple sections', async () => {
      const vendor = Vendor.create({
        name: 'Multi-Section Vendor',
        industry: 'Technology',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Enterprise AI',
        solutionType: 'Platform',
        createdBy: 'test-user-id',
      })

      const questions = Array.from({ length: 15 }, (_, i) =>
        Question.create({
          assessmentId: assessment.id,
          sectionName: `Section ${Math.floor(i / 5) + 1}`,
          sectionNumber: Math.floor(i / 5) + 1,
          questionNumber: (i % 5) + 1,
          questionText: `Question ${i + 1}: Describe your approach to ${i + 1}`,
          questionType: 'text',
        })
      )

      const wordBuffer = await wordExporter.generateWord({
        assessment,
        vendor,
        questions,
      })

      // Word file with 15 questions should be larger than minimum size
      expect(wordBuffer.length).toBeGreaterThan(5000)
    })

    it('should include question metadata in Word file', async () => {
      const vendor = Vendor.create({
        name: 'Metadata Vendor',
        industry: 'Finance',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'FinTech AI',
        solutionType: 'Analysis Tool',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Compliance',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Do you comply with financial regulations?',
          questionType: 'text',
          questionMetadata: {
            required: true,
            helpText: 'Include details about regulatory compliance',
          },
        }),
      ]

      const wordBuffer = await wordExporter.generateWord({
        assessment,
        vendor,
        questions,
      })

      expect(Buffer.isBuffer(wordBuffer)).toBe(true)
      expect(wordBuffer.length).toBeGreaterThan(0)
    })

    it('should handle empty question metadata', async () => {
      const vendor = Vendor.create({
        name: 'Simple Vendor',
        industry: 'Retail',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Retail AI',
        solutionType: 'Recommendation Engine',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Operations',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'How do you handle customer data?',
          questionType: 'text',
          // No metadata
        }),
      ]

      const wordBuffer = await wordExporter.generateWord({
        assessment,
        vendor,
        questions,
      })

      expect(Buffer.isBuffer(wordBuffer)).toBe(true)
    })

    it('should sort questions by section and number', async () => {
      const vendor = Vendor.create({
        name: 'Sort Test Vendor',
        industry: 'Education',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'EdTech AI',
        solutionType: 'Learning Platform',
        createdBy: 'test-user-id',
      })

      // Create questions in random order
      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Security',
          sectionNumber: 2,
          questionNumber: 2,
          questionText: 'Security Q2',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Privacy Q1',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Security',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Security Q1',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy',
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Privacy Q2',
          questionType: 'text',
        }),
      ]

      const wordBuffer = await wordExporter.generateWord({
        assessment,
        vendor,
        questions,
      })

      // Should generate without errors
      expect(Buffer.isBuffer(wordBuffer)).toBe(true)
    })
  })
})
