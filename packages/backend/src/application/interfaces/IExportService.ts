/**
 * Export Service Interface
 *
 * Defines contract for export service that generates assessment questionnaires
 * in multiple formats (PDF, Word, Excel)
 */

export interface IExportService {
  /**
   * Exports assessment questionnaire to PDF format
   * Uses Puppeteer to render HTML template to PDF
   *
   * @param assessmentId - Assessment ID to export
   * @returns PDF file as Buffer
   * @throws Error if assessment not found or has no questions
   */
  exportToPDF(assessmentId: string): Promise<Buffer>

  /**
   * Exports assessment questionnaire to Word (.docx) format
   * Uses docx library to create formatted document
   *
   * @param assessmentId - Assessment ID to export
   * @returns Word file as Buffer
   * @throws Error if assessment not found or has no questions
   */
  exportToWord(assessmentId: string): Promise<Buffer>

  /**
   * Exports assessment questionnaire to Excel (.xlsx) format
   * Uses ExcelJS to create spreadsheet with questions
   *
   * @param assessmentId - Assessment ID to export
   * @returns Excel file as Buffer
   * @throws Error if assessment not found or has no questions
   */
  exportToExcel(assessmentId: string): Promise<Buffer>
}
