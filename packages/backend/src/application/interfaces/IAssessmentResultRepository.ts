import { AssessmentResultDTO, CreateAssessmentResultDTO, NarrativeStatusDTO } from '../../domain/scoring/dtos'

export interface IAssessmentResultRepository {
  /**
   * Create assessment result.
   * @param result - The assessment result data
   * @param tx - Optional transaction context for atomic operations
   */
  create(result: CreateAssessmentResultDTO, tx?: unknown): Promise<AssessmentResultDTO>
  findByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO[]>
  findByBatchId(assessmentId: string, batchId: string): Promise<AssessmentResultDTO | null>
  findLatestByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO | null>
  updateNarrativeReport(assessmentId: string, batchId: string, narrativeReport: string): Promise<void>

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

  // Epic 20: Narrative generation concurrency control

  /**
   * Atomically claim narrative generation if not already claimed/complete.
   * Prevents double LLM calls under concurrent requests.
   *
   * Claim succeeds when:
   * - narrativeStatus is null (never started)
   * - narrativeStatus is 'failed' (previous attempt failed)
   * - narrativeStatus is 'generating' but claim is stale (> TTL, stuck process recovery)
   *
   * Claim fails when:
   * - narrativeStatus is 'generating' and claim is not stale
   * - narrativeStatus is 'complete'
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID
   * @param ttlMs - Time-to-live for stuck claims in milliseconds (default 5 min = 300000ms)
   * @returns true if claim succeeded, false if another process has it
   */
  claimNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    ttlMs?: number
  ): Promise<boolean>

  /**
   * Finalize successful narrative generation.
   * Sets status to 'complete' and stores narrative.
   *
   * Guards against race conditions:
   * - Only succeeds if status is 'generating' AND claim is not stale
   * - This prevents a stale worker from overwriting a newer claim's result
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID
   * @param narrativeReport - The generated narrative markdown
   * @param ttlMs - Time-to-live for claim validity (default 5 min)
   */
  finalizeNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    narrativeReport: string,
    ttlMs?: number
  ): Promise<void>

  /**
   * Mark narrative generation as failed.
   * Sets status to 'failed' and stores error message.
   * This allows the claim to be retried by subsequent requests.
   *
   * Guards against race conditions:
   * - Only succeeds if status is 'generating' AND claim is not stale
   * - This prevents a stale worker from clobbering a newer claim's status
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID
   * @param error - The error message to store
   * @param ttlMs - Time-to-live for claim validity (default 5 min)
   */
  failNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    error: string,
    ttlMs?: number
  ): Promise<void>

  /**
   * Get the current narrative status for a result.
   * Useful for checking status without attempting claim.
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID
   * @returns The narrative status or null if record doesn't exist
   */
  getNarrativeStatus(
    assessmentId: string,
    batchId: string
  ): Promise<{ status: NarrativeStatusDTO; error: string | null } | null>
}
