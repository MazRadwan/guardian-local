import { ResponseDTO, CreateResponseDTO } from '../../domain/scoring/dtos'

/** Orphaned batch identifier - includes both keys for proper uniqueness */
export interface OrphanedBatchRef {
  assessmentId: string
  batchId: string
}

export interface IResponseRepository {
  createBatch(responses: CreateResponseDTO[]): Promise<ResponseDTO[]>
  findByAssessmentId(assessmentId: string): Promise<ResponseDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<ResponseDTO[]>
  deleteByBatchId(assessmentId: string, batchId: string): Promise<void>

  // Epic 20: Orphan cleanup methods
  /**
   * Find batches that have responses older than the retention window
   * and do NOT have a matching assessment_results record.
   * These are "orphaned" batches from failed scoring attempts.
   *
   * Returns both assessmentId and batchId for each orphan to ensure
   * correct uniqueness matching (assessment_results unique on both keys).
   *
   * @param olderThanHours - Only consider batches with ALL responses older than this many hours
   * @returns Array of orphaned batch references (assessmentId + batchId pairs)
   */
  findOrphanedBatches(olderThanHours: number): Promise<OrphanedBatchRef[]>

  /**
   * Delete all responses for a given batch, but ONLY if still orphaned.
   * This is race-condition safe - it re-checks orphan status at delete time.
   *
   * A batch is orphaned if no matching assessment_result exists for the
   * (assessmentId, batchId) pair. If an assessment_result was created
   * between findOrphanedBatches() and this call, the delete is skipped.
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID to delete
   * @returns Number of deleted responses (0 if not orphaned or not found)
   */
  deleteByBatchIdIfOrphaned(assessmentId: string, batchId: string): Promise<number>
}
