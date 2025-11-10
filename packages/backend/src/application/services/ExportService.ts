/**
 * Export Service
 *
 * Orchestrates export workflows - retrieves assessment data and generates
 * exports in multiple formats (PDF, Word, Excel)
 */

import { IAssessmentRepository } from '../interfaces/IAssessmentRepository'
import { IQuestionRepository } from '../interfaces/IQuestionRepository'
import { IVendorRepository } from '../interfaces/IVendorRepository'
import { IExportService } from '../interfaces/IExportService'
import { IPDFExporter } from '../interfaces/IPDFExporter'
import { IWordExporter } from '../interfaces/IWordExporter'
import { IExcelExporter } from '../interfaces/IExcelExporter'

export class ExportService implements IExportService {
  constructor(
    private readonly assessmentRepository: IAssessmentRepository,
    private readonly questionRepository: IQuestionRepository,
    private readonly vendorRepository: IVendorRepository,
    private readonly pdfExporter: IPDFExporter,
    private readonly wordExporter: IWordExporter,
    private readonly excelExporter: IExcelExporter
  ) {}

  /**
   * Exports assessment questionnaire to PDF format
   */
  async exportToPDF(assessmentId: string): Promise<Buffer> {
    const data = await this.getAssessmentData(assessmentId)
    return this.pdfExporter.generatePDF(data)
  }

  /**
   * Exports assessment questionnaire to Word format
   */
  async exportToWord(assessmentId: string): Promise<Buffer> {
    const data = await this.getAssessmentData(assessmentId)
    return this.wordExporter.generateWord(data)
  }

  /**
   * Exports assessment questionnaire to Excel format
   */
  async exportToExcel(assessmentId: string): Promise<Buffer> {
    const data = await this.getAssessmentData(assessmentId)
    return this.excelExporter.generateExcel(data)
  }

  /**
   * Retrieves assessment data needed for export
   * Validates that assessment exists and has questions
   */
  private async getAssessmentData(assessmentId: string) {
    // Get assessment
    const assessment = await this.assessmentRepository.findById(assessmentId)
    if (!assessment) {
      throw new Error(`Assessment not found: ${assessmentId}`)
    }

    // Get vendor
    const vendor = await this.vendorRepository.findById(assessment.vendorId)
    if (!vendor) {
      throw new Error(
        `Vendor not found for assessment: ${assessment.vendorId}`
      )
    }

    // Get questions
    const questions = await this.questionRepository.findByAssessmentId(
      assessmentId
    )
    if (questions.length === 0) {
      throw new Error(
        `No questions found for assessment: ${assessmentId}. Generate questions before exporting.`
      )
    }

    return {
      assessment,
      vendor,
      questions,
    }
  }
}
