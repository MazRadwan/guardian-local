import { AssessmentResultDTO, CreateAssessmentResultDTO } from '../../domain/scoring/dtos'

export interface IAssessmentResultRepository {
  create(result: CreateAssessmentResultDTO): Promise<AssessmentResultDTO>
  findByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<AssessmentResultDTO | null>
  findLatestByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO | null>
}
