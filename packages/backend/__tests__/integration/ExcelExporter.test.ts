/**
 * Excel Exporter Integration Tests
 *
 * Tests Excel (.xlsx) generation functionality
 */

import { ExcelExporter } from '../../src/infrastructure/export/ExcelExporter'
import { Assessment } from '../../src/domain/entities/Assessment'
import { Vendor } from '../../src/domain/entities/Vendor'
import { Question } from '../../src/domain/entities/Question'
import ExcelJS from 'exceljs'

describe('ExcelExporter Integration Tests', () => {
  let excelExporter: ExcelExporter

  beforeEach(() => {
    excelExporter = new ExcelExporter()
  })

  describe('generateExcel', () => {
    it('should generate a valid Excel (.xlsx) file', async () => {
      const vendor = Vendor.create({
        name: 'Excel Test Vendor',
        industry: 'Healthcare',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Health Analytics AI',
        solutionType: 'Healthcare Platform',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy Compliance',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'How do you ensure HIPAA compliance?',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Security',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'What encryption methods do you use?',
          questionType: 'text',
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Verify it's a buffer
      expect(Buffer.isBuffer(excelBuffer)).toBe(true)
      expect(excelBuffer.length).toBeGreaterThan(0)

      // Verify it's a valid .xlsx file (ZIP format with PK header)
      const header = excelBuffer.slice(0, 2).toString()
      expect(header).toBe('PK') // .xlsx files are ZIP archives
    })

    it('should include all questions as rows in Excel', async () => {
      const vendor = Vendor.create({
        name: 'Multi-Question Vendor',
        industry: 'Finance',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Trading AI',
        solutionType: 'Financial Platform',
        createdBy: 'test-user-id',
      })

      const questions = Array.from({ length: 20 }, (_, i) =>
        Question.create({
          assessmentId: assessment.id,
          sectionName: `Section ${Math.floor(i / 5) + 1}`,
          sectionNumber: Math.floor(i / 5) + 1,
          questionNumber: (i % 5) + 1,
          questionText: `Question ${i + 1}: What is your policy on ${i + 1}?`,
          questionType: 'text',
        })
      )

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse the Excel file to verify content
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      expect(worksheet).toBeDefined()
      if (!worksheet) throw new Error('Worksheet not found')

      // Should have header row + metadata rows + questions + footer
      // Header (2 rows) + Metadata (2 rows) + Blank (1) + Table Header (1) + Questions (20) + Blank + Footer (2)
      const rowCount = worksheet.rowCount
      expect(rowCount).toBeGreaterThan(20)
    })

    it('should have correct column headers', async () => {
      const vendor = Vendor.create({
        name: 'Header Test Vendor',
        industry: 'Technology',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Tech Platform',
        solutionType: 'SaaS',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Compliance',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Are you compliant?',
          questionType: 'text',
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse Excel to verify columns
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      if (!worksheet) throw new Error('Worksheet not found')

      // Find the header row (should contain "Section", "Question #", "Question Text", "Response")
      let headerRow: ExcelJS.Row | undefined
      worksheet.eachRow((row, rowNumber) => {
        const firstCell = row.getCell(1).value
        if (firstCell === 'Section' && !headerRow) {
          headerRow = row
        }
      })

      expect(headerRow).toBeDefined()
      expect(headerRow?.getCell(1).value).toBe('Section')
      expect(headerRow?.getCell(2).value).toBe('Question #')
      expect(headerRow?.getCell(3).value).toBe('Question Text')
      expect(headerRow?.getCell(4).value).toBe('Response')
    })

    it('should color-code sections', async () => {
      const vendor = Vendor.create({
        name: 'Color Test Vendor',
        industry: 'Education',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'EdTech AI',
        solutionType: 'Learning Platform',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Question 1',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Question 2',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Section 2',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Question 3',
          questionType: 'text',
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse Excel to verify colors
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      expect(worksheet).toBeDefined()
      if (!worksheet) throw new Error('Worksheet not found')

      // Verify that rows have fill colors (section color-coding)
      let coloredRows = 0
      worksheet.eachRow((row, rowNumber) => {
        const cell = row.getCell(1)
        if (cell.fill && (cell.fill as ExcelJS.FillPattern).fgColor) {
          coloredRows++
        }
      })

      // Should have at least the question rows colored
      expect(coloredRows).toBeGreaterThan(0)
    })

    it('should include "All fields are required" note in header', async () => {
      const vendor = Vendor.create({
        name: 'Metadata Vendor',
        industry: 'Retail',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Retail AI',
        solutionType: 'Inventory Management',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Operations',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'How do you manage inventory?',
          questionType: 'text',
          questionMetadata: {
            required: true,
            helpText: 'Describe your inventory management system',
          },
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse Excel to verify the required note in header
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      if (!worksheet) throw new Error('Worksheet not found')

      // Check for "All fields are required" note in header area (row 7)
      const requiredNote = worksheet.getCell('A7').value
      expect(requiredNote).toBe('Note: All fields are required.')
    })

    it('should freeze header row', async () => {
      const vendor = Vendor.create({
        name: 'Freeze Test Vendor',
        industry: 'Manufacturing',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Manufacturing AI',
        solutionType: 'Automation Platform',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Quality',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'What quality controls do you have?',
          questionType: 'text',
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse Excel to verify frozen rows
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      if (!worksheet) throw new Error('Worksheet not found')

      // Check for frozen panes
      const views = worksheet.views
      expect(views).toBeDefined()
      expect(views.length).toBeGreaterThan(0)
      expect(views[0].state).toBe('frozen')
    })

    it('should include assessmentId in Excel metadata', async () => {
      const vendor = Vendor.create({
        name: 'Assessment ID Test Vendor',
        industry: 'Healthcare',
      })

      const assessment = Assessment.create({
        vendorId: vendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'Health Platform',
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: assessment.id,
          sectionName: 'Privacy',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test privacy question',
          questionType: 'text',
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse Excel to verify assessmentId is in metadata
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      if (!worksheet) throw new Error('Worksheet not found')

      // Check row 3 for "GUARDIAN Assessment ID:"
      const assessmentIdLabel = worksheet.getCell('A3').value
      expect(assessmentIdLabel).toBe('GUARDIAN Assessment ID:')

      // Check row 3 column B for the actual assessment ID
      const assessmentIdValue = worksheet.getCell('B3').value
      expect(assessmentIdValue).toBe(assessment.id)

      // Verify styling - should have Courier New font and gray background
      const assessmentIdCell = worksheet.getCell('B3')
      expect(assessmentIdCell.font?.name).toBe('Courier New')
      expect(assessmentIdCell.fill).toBeDefined()
      const fill = assessmentIdCell.fill as ExcelJS.FillPattern
      expect(fill.fgColor?.argb).toBe('FFF3F4F6')
    })

    it('should handle special characters in assessmentId in Excel', async () => {
      const vendor = Vendor.create({
        name: 'Special Char Test Vendor',
        industry: 'Technology',
      })

      // Create assessment with special characters in ID
      const testAssessmentId = 'test-id-<>&"\''
      const assessment = Assessment.fromPersistence({
        id: testAssessmentId,
        vendorId: vendor.id,
        assessmentType: 'quick',
        solutionName: 'Test',
        solutionType: 'Tool',
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user-id',
      })

      const questions = [
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Test',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question',
          questionType: 'text',
        }),
      ]

      const excelBuffer = await excelExporter.generateExcel({
        assessment,
        vendor,
        questions,
      })

      // Parse Excel to verify assessmentId with special characters
      const workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(excelBuffer)

      const worksheet = workbook.getWorksheet('Assessment Questionnaire')
      if (!worksheet) throw new Error('Worksheet not found')

      // Verify the assessment ID is correctly stored (ExcelJS handles escaping)
      const assessmentIdValue = worksheet.getCell('B3').value
      expect(assessmentIdValue).toBe(testAssessmentId)
    })
  })
})
