import { AssessmentResultDTO, CreateAssessmentResultDTO } from '../../domain/scoring/dtos'

export interface IAssessmentResultRepository {
  create(result: CreateAssessmentResultDTO): Promise<AssessmentResultDTO>
  findByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<AssessmentResultDTO | null>
  findLatestByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO | null>

  /**
   * Epic 15 Story 5a.4: Rate limiting
   * Count scoring attempts for an assessment within the last 24 hours
   */
  countTodayForAssessment(assessmentId: string): Promise<number>

  /**
   * Epic 15 Story 5a.4: De-duplication
   * Find recent scoring by file hash within specified hours window
   */
  findRecentByFileHash(fileHash: string, hoursWindow: number): Promise<AssessmentResultDTO | null>
}
