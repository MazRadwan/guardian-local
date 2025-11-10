/**
 * Excel Exporter Interface
 *
 * Defines contract for generating Excel (.xlsx) files from questionnaire data
 */

import { Assessment } from '../../domain/entities/Assessment'
import { Question } from '../../domain/entities/Question'
import { Vendor } from '../../domain/entities/Vendor'

export interface QuestionnaireData {
  assessment: Assessment
  vendor: Vendor
  questions: Question[]
}

export interface IExcelExporter {
  /**
   * Generates Excel spreadsheet from questionnaire data
   * @param data - Assessment, vendor, and questions data
   * @returns Buffer containing Excel (.xlsx) file
   */
  generateExcel(data: QuestionnaireData): Promise<Buffer>
}
