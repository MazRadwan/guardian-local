/**
 * Export Controller
 *
 * Handles HTTP requests for exporting assessment questionnaires
 * in multiple formats (PDF, Word, Excel)
 */

import { Request, Response, NextFunction } from 'express'
import { ExportService } from '../../../application/services/ExportService'
import { IAssessmentRepository } from '../../../application/interfaces/IAssessmentRepository'
import { buildContentDisposition } from './DocumentUploadController.js'

export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly assessmentRepository: IAssessmentRepository
  ) {}

  /**
   * Exports assessment to PDF
   * GET /api/assessments/:id/export/pdf
   */
  exportToPDF = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      // Generate PDF
      const pdfBuffer = await this.exportService.exportToPDF(id)

      // Update assessment status to 'exported' on first download
      await this.updateStatusIfNeeded(id)

      // Get assessment for filename
      const assessment = await this.assessmentRepository.findById(id)
      const filename = this.generateFilename(
        assessment?.vendorId || 'assessment',
        'pdf'
      )

      // Set headers for file download (sanitized to prevent header injection)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', buildContentDisposition(filename))
      res.setHeader('Content-Length', pdfBuffer.length)

      // Send file
      res.send(pdfBuffer)
    } catch (error) {
      next(error)
    }
  }

  /**
   * Exports assessment to Word
   * GET /api/assessments/:id/export/word
   */
  exportToWord = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      // Generate Word document
      const wordBuffer = await this.exportService.exportToWord(id)

      // Update assessment status to 'exported' on first download
      await this.updateStatusIfNeeded(id)

      // Get assessment for filename
      const assessment = await this.assessmentRepository.findById(id)
      const filename = this.generateFilename(
        assessment?.vendorId || 'assessment',
        'docx'
      )

      // Set headers for file download (sanitized to prevent header injection)
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      res.setHeader('Content-Disposition', buildContentDisposition(filename))
      res.setHeader('Content-Length', wordBuffer.length)

      // Send file
      res.send(wordBuffer)
    } catch (error) {
      next(error)
    }
  }

  /**
   * Exports assessment to Excel
   * GET /api/assessments/:id/export/excel
   */
  exportToExcel = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params

      // Generate Excel spreadsheet
      const excelBuffer = await this.exportService.exportToExcel(id)

      // Update assessment status to 'exported' on first download
      await this.updateStatusIfNeeded(id)

      // Get assessment for filename
      const assessment = await this.assessmentRepository.findById(id)
      const filename = this.generateFilename(
        assessment?.vendorId || 'assessment',
        'xlsx'
      )

      // Set headers for file download (sanitized to prevent header injection)
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', buildContentDisposition(filename))
      res.setHeader('Content-Length', excelBuffer.length)

      // Send file
      res.send(excelBuffer)
    } catch (error) {
      next(error)
    }
  }

  /**
   * Updates assessment status to 'exported' if it's currently 'questions_generated'
   */
  private async updateStatusIfNeeded(assessmentId: string): Promise<void> {
    try {
      const assessment = await this.assessmentRepository.findById(assessmentId)
      if (assessment && assessment.status === 'questions_generated') {
        assessment.updateStatus('exported')
        await this.assessmentRepository.update(assessment)
      }
    } catch (error) {
      // Log error but don't fail the export
      console.error('Failed to update assessment status:', error)
    }
  }

  /**
   * Generates filename for download
   */
  private generateFilename(vendorId: string, extension: string): string {
    const timestamp = new Date().toISOString().split('T')[0]
    return `assessment-${vendorId}-${timestamp}.${extension}`
  }
}
