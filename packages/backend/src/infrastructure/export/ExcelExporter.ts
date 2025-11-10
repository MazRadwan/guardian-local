/**
 * Excel Exporter
 *
 * Generates Excel (.xlsx) files from assessment questionnaires using ExcelJS
 */

import ExcelJS from 'exceljs'
import {
  IExcelExporter,
  QuestionnaireData,
} from '../../application/interfaces/IExcelExporter'
import { Question } from '../../domain/entities/Question'

export class ExcelExporter implements IExcelExporter {
  /**
   * Generates Excel spreadsheet from questionnaire data
   */
  async generateExcel(data: QuestionnaireData): Promise<Buffer> {
    const { assessment, vendor, questions } = data

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Guardian AI Vendor Assessment System'
    workbook.created = new Date()

    // Add questionnaire worksheet
    const worksheet = workbook.addWorksheet('Assessment Questionnaire', {
      properties: { defaultRowHeight: 20 },
    })

    // Add header
    this.addHeader(worksheet, vendor, assessment, questions.length)

    // Add questions table
    this.addQuestionsTable(worksheet, questions)

    // Convert to buffer
    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  /**
   * Adds header section to worksheet
   */
  private addHeader(
    worksheet: ExcelJS.Worksheet,
    vendor: Vendor,
    assessment: Assessment,
    totalQuestions: number
  ): void {
    // Title
    worksheet.mergeCells('A1:D1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = 'AI Vendor Assessment Questionnaire'
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1E40AF' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.getRow(1).height = 30

    // Vendor name
    worksheet.mergeCells('A2:D2')
    const vendorCell = worksheet.getCell('A2')
    vendorCell.value = vendor.name
    vendorCell.font = { size: 14, bold: true }
    vendorCell.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.getRow(2).height = 25

    // Metadata
    worksheet.getCell('A3').value = 'Assessment Type:'
    worksheet.getCell('B3').value = assessment.assessmentType
    worksheet.getCell('C3').value = 'Solution:'
    worksheet.getCell('D3').value = assessment.solutionName || 'N/A'

    worksheet.getCell('A4').value = 'Created:'
    worksheet.getCell('B4').value = new Date(assessment.createdAt).toLocaleDateString()
    worksheet.getCell('C4').value = 'Total Questions:'
    worksheet.getCell('D4').value = totalQuestions

    // Style metadata
    for (let row = 3; row <= 4; row++) {
      worksheet.getCell(`A${row}`).font = { bold: true }
      worksheet.getCell(`C${row}`).font = { bold: true }
    }

    // Add blank row
    worksheet.addRow([])
  }

  /**
   * Adds questions table to worksheet
   */
  private addQuestionsTable(
    worksheet: ExcelJS.Worksheet,
    questions: Question[]
  ): void {
    // Set column widths
    worksheet.columns = [
      { key: 'section', width: 25 },
      { key: 'questionNumber', width: 15 },
      { key: 'questionText', width: 60 },
      { key: 'response', width: 40 },
    ]

    // Add table header
    const headerRow = worksheet.addRow([
      'Section',
      'Question #',
      'Question Text',
      'Response',
    ])

    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    headerRow.alignment = { vertical: 'middle', wrapText: true }
    headerRow.height = 25

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }]

    // Group questions by section for color coding
    const sections = this.groupQuestionsBySection(questions)

    // Section colors (alternating for readability)
    const sectionColors = [
      'FFF1F5F9', // Light blue-gray
      'FFFEF3C7', // Light yellow
      'FFDCFCE7', // Light green
      'FFFCE7F3', // Light pink
      'FFE0E7FF', // Light indigo
      'FFFEF9C3', // Light amber
      'FFD1FAE5', // Light emerald
      'FFFED7AA', // Light orange
    ]

    // Add questions
    let currentRow = headerRow.number + 1
    sections.forEach((section, sectionIndex) => {
      const sectionColor = sectionColors[sectionIndex % sectionColors.length]

      section.questions.forEach((question) => {
        const questionRow = worksheet.addRow({
          section: section.sectionName,
          questionNumber: `${section.sectionNumber}.${question.questionNumber}`,
          questionText: question.questionText,
          response: '',
        })

        // Style row
        questionRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: sectionColor },
        }
        questionRow.alignment = { vertical: 'top', wrapText: true }
        questionRow.height = 40

        // Add metadata as comment if present
        const metadata = question.questionMetadata || {}
        if (metadata.helpText || metadata.required) {
          const comments: string[] = []
          if (metadata.helpText) {
            comments.push(`Help: ${metadata.helpText}`)
          }
          if (metadata.required) {
            comments.push('* Required')
          }

          const questionCell = worksheet.getCell(`C${currentRow}`)
          questionCell.note = comments.join('\n')
        }

        currentRow++
      })
    })

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber >= headerRow.number) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          }
        })
      }
    })

    // Add footer
    worksheet.addRow([])
    const footerRow = worksheet.addRow([
      'Generated by Guardian AI Vendor Assessment System - © 2025',
    ])
    worksheet.mergeCells(
      `A${footerRow.number}:D${footerRow.number}`
    )
    footerRow.getCell(1).alignment = { horizontal: 'center' }
    footerRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } }
  }

  /**
   * Groups questions by section
   */
  private groupQuestionsBySection(
    questions: Question[]
  ): Array<{
    sectionNumber: number
    sectionName: string
    questions: Question[]
  }> {
    const sectionsMap = new Map<
      number,
      {
        sectionNumber: number
        sectionName: string
        questions: Question[]
      }
    >()

    // Sort questions by section and question number
    const sortedQuestions = [...questions].sort((a, b) => {
      if (a.sectionNumber !== b.sectionNumber) {
        return a.sectionNumber - b.sectionNumber
      }
      return a.questionNumber - b.questionNumber
    })

    for (const question of sortedQuestions) {
      if (!sectionsMap.has(question.sectionNumber)) {
        sectionsMap.set(question.sectionNumber, {
          sectionNumber: question.sectionNumber,
          sectionName: question.sectionName,
          questions: [],
        })
      }
      sectionsMap.get(question.sectionNumber)!.questions.push(question)
    }

    return Array.from(sectionsMap.values())
  }
}
