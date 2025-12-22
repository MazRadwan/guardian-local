import { DimensionScoreDTO, CreateDimensionScoreDTO } from '../../domain/scoring/dtos'

export interface IDimensionScoreRepository {
  createBatch(scores: CreateDimensionScoreDTO[]): Promise<DimensionScoreDTO[]>
  findByAssessmentId(assessmentId: string): Promise<DimensionScoreDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<DimensionScoreDTO[]>
  findLatestByAssessmentId(assessmentId: string): Promise<DimensionScoreDTO[]>
}
