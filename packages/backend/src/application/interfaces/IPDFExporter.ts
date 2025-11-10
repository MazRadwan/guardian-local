/**
 * PDF Exporter Interface
 *
 * Defines contract for generating PDF files from questionnaire data
 */

import { Assessment } from '../../domain/entities/Assessment'
import { Question } from '../../domain/entities/Question'
import { Vendor } from '../../domain/entities/Vendor'

export interface QuestionnaireData {
  assessment: Assessment
  vendor: Vendor
  questions: Question[]
}

export interface IPDFExporter {
  /**
   * Generates PDF from questionnaire data
   * @param data - Assessment, vendor, and questions data
   * @returns Buffer containing PDF file
   */
  generatePDF(data: QuestionnaireData): Promise<Buffer>
}
