import { DimensionScoreDTO, CreateDimensionScoreDTO } from '../../domain/scoring/dtos'

export interface IDimensionScoreRepository {
  /**
   * Create batch of dimension scores.
   * @param scores - The dimension scores to create
   * @param tx - Optional transaction context for atomic operations
   */
  createBatch(scores: CreateDimensionScoreDTO[], tx?: unknown): Promise<DimensionScoreDTO[]>
  findByAssessmentId(assessmentId: string): Promise<DimensionScoreDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<DimensionScoreDTO[]>
  findLatestByAssessmentId(assessmentId: string): Promise<DimensionScoreDTO[]>
}
