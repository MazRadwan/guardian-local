/**
 * Word Exporter Interface
 *
 * Defines contract for generating Word (.docx) files from questionnaire data
 */

import { Assessment } from '../../domain/entities/Assessment'
import { Question } from '../../domain/entities/Question'
import { Vendor } from '../../domain/entities/Vendor'

export interface QuestionnaireData {
  assessment: Assessment
  vendor: Vendor
  questions: Question[]
}

export interface IWordExporter {
  /**
   * Generates Word document from questionnaire data
   * @param data - Assessment, vendor, and questions data
   * @returns Buffer containing Word (.docx) file
   */
  generateWord(data: QuestionnaireData): Promise<Buffer>
}
