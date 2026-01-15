/**
 * DrizzleAssessmentResultRepository
 *
 * Drizzle ORM implementation of IAssessmentResultRepository
 */

import { eq, and, desc, gte, sql, or, isNull, lt } from 'drizzle-orm'
import { db, type DrizzleTransaction } from '../client.js'
import { assessmentResults, type AssessmentResult, type NewAssessmentResult, type NarrativeStatus } from '../schema/assessmentResults.js'
import type { IAssessmentResultRepository } from '../../../application/interfaces/IAssessmentResultRepository.js'
import type { AssessmentResultDTO, CreateAssessmentResultDTO, NarrativeStatusDTO } from '../../../domain/scoring/dtos.js'
import type { RiskRating, Recommendation } from '../../../domain/scoring/types.js'

/** Default TTL for stuck narrative claims: 5 minutes */
const DEFAULT_CLAIM_TTL_MS = 300000

export class DrizzleAssessmentResultRepository implements IAssessmentResultRepository {
  /**
   * Create assessment result
   * @param newResult - The assessment result data
   * @param tx - Optional transaction context for atomic operations
   */
  async create(newResult: CreateAssessmentResultDTO, tx?: DrizzleTransaction): Promise<AssessmentResultDTO> {
    const value: NewAssessmentResult = {
      assessmentId: newResult.assessmentId,
      batchId: newResult.batchId,
      compositeScore: newResult.compositeScore,
      recommendation: newResult.recommendation,
      overallRiskRating: newResult.overallRiskRating,
      narrativeReport: newResult.narrativeReport,
      executiveSummary: newResult.executiveSummary,
      keyFindings: newResult.keyFindings,
      disqualifyingFactors: newResult.disqualifyingFactors,
      rubricVersion: newResult.rubricVersion,
      modelId: newResult.modelId,
      rawToolPayload: newResult.rawToolPayload,
      scoringDurationMs: newResult.scoringDurationMs,
    }

    // Use transaction if provided, otherwise use default db
    const executor = tx ?? db
    const [created] = await executor.insert(assessmentResults).values(value).returning()

    return this.toDTO(created)
  }

  /**
   * Find all results for an assessment, ordered by most recent
   */
  async findByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO[]> {
    const rows = await db
      .select()
      .from(assessmentResults)
      .where(eq(assessmentResults.assessmentId, assessmentId))
      .orderBy(desc(assessmentResults.scoredAt))

    return rows.map(this.toDTO)
  }

  /**
   * Find result by batch ID
   */
  async findByBatchId(assessmentId: string, batchId: string): Promise<AssessmentResultDTO | null> {
    const [row] = await db
      .select()
      .from(assessmentResults)
      .where(and(eq(assessmentResults.assessmentId, assessmentId), eq(assessmentResults.batchId, batchId)))
      .limit(1)

    return row ? this.toDTO(row) : null
  }

  /**
   * Find latest result for an assessment
   */
  async findLatestByAssessmentId(assessmentId: string): Promise<AssessmentResultDTO | null> {
    const [row] = await db
      .select()
      .from(assessmentResults)
      .where(eq(assessmentResults.assessmentId, assessmentId))
      .orderBy(desc(assessmentResults.scoredAt))
      .limit(1)

    return row ? this.toDTO(row) : null
  }

  /**
   * Epic 15 Story 5a.4: Rate limiting
   * Count scoring attempts for an assessment within the last 24 hours
   */
  async countTodayForAssessment(assessmentId: string): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          gte(assessmentResults.scoredAt, oneDayAgo)
        )
      )

    return result[0]?.count ?? 0
  }

  /**
   * Epic 15 Story 5a.4: De-duplication
   * Find recent scoring by file hash within specified hours window
   *
   * Note: File hash tracking is not yet implemented in the schema.
   * This method is a placeholder for future implementation.
   * For MVP, it always returns null (no duplicate detected).
   */
  async findRecentByFileHash(fileHash: string, hoursWindow: number): Promise<AssessmentResultDTO | null> {
    // TODO: Implement when file hash column is added to schema
    // For now, return null (no duplicate detection)
    return null
  }

  /**
   * Update narrative report for a result
   * Simple update without concurrency control (use claimNarrativeGeneration for concurrency-safe updates)
   */
  async updateNarrativeReport(assessmentId: string, batchId: string, narrativeReport: string): Promise<void> {
    await db
      .update(assessmentResults)
      .set({ narrativeReport })
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.batchId, batchId)
        )
      )
  }

  // ============================================================================
  // Epic 20: Narrative Generation Concurrency Control
  // ============================================================================

  /**
   * Atomically claim narrative generation if not already claimed/complete.
   * Uses UPDATE...RETURNING pattern for atomic claim acquisition.
   *
   * Claim succeeds when:
   * - narrativeStatus is null (never started)
   * - narrativeStatus is 'failed' (previous attempt failed, can retry)
   * - narrativeStatus is 'generating' but claim is stale (> TTL, stuck process recovery)
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID
   * @param ttlMs - Time-to-live for stuck claims (default 5 min)
   * @returns true if claim succeeded, false if another process has it or already complete
   */
  async claimNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    ttlMs: number = DEFAULT_CLAIM_TTL_MS
  ): Promise<boolean> {
    const staleThreshold = new Date(Date.now() - ttlMs)
    const now = new Date()

    // Atomic claim: UPDATE...RETURNING only returns rows if WHERE matched
    const result = await db
      .update(assessmentResults)
      .set({
        narrativeStatus: 'generating',
        narrativeClaimedAt: now,
        narrativeError: null, // Clear any previous error
      })
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.batchId, batchId),
          or(
            // Never started
            isNull(assessmentResults.narrativeStatus),
            // Previous attempt failed (can retry)
            eq(assessmentResults.narrativeStatus, 'failed'),
            // Stuck claim recovery: claim is generating but stale (process died)
            and(
              eq(assessmentResults.narrativeStatus, 'generating'),
              lt(assessmentResults.narrativeClaimedAt, staleThreshold)
            )
          )
        )
      )
      .returning({ id: assessmentResults.id })

    return result.length > 0
  }

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
  async finalizeNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    narrativeReport: string,
    ttlMs: number = DEFAULT_CLAIM_TTL_MS
  ): Promise<void> {
    const staleThreshold = new Date(Date.now() - ttlMs)

    await db
      .update(assessmentResults)
      .set({
        narrativeReport,
        narrativeStatus: 'complete',
        narrativeCompletedAt: new Date(),
        narrativeError: null,
      })
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.batchId, batchId),
          // Guard 1: only finalize if we have the claim
          eq(assessmentResults.narrativeStatus, 'generating'),
          // Guard 2: only finalize if claim is not stale (prevents stale worker overwrites)
          gte(assessmentResults.narrativeClaimedAt, staleThreshold)
        )
      )
  }

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
  async failNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    error: string,
    ttlMs: number = DEFAULT_CLAIM_TTL_MS
  ): Promise<void> {
    const staleThreshold = new Date(Date.now() - ttlMs)

    await db
      .update(assessmentResults)
      .set({
        narrativeStatus: 'failed',
        narrativeError: error,
      })
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.batchId, batchId),
          // Guard 1: only fail if we have the claim
          eq(assessmentResults.narrativeStatus, 'generating'),
          // Guard 2: only fail if claim is not stale (prevents stale worker clobbering)
          gte(assessmentResults.narrativeClaimedAt, staleThreshold)
        )
      )
  }

  /**
   * Get the current narrative status for a result.
   * Useful for checking status without attempting claim.
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID
   * @returns The narrative status and error, or null if record doesn't exist
   */
  async getNarrativeStatus(
    assessmentId: string,
    batchId: string
  ): Promise<{ status: NarrativeStatus | null; error: string | null } | null> {
    const [row] = await db
      .select({
        narrativeStatus: assessmentResults.narrativeStatus,
        narrativeError: assessmentResults.narrativeError,
      })
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.batchId, batchId)
        )
      )
      .limit(1)

    if (!row) {
      return null
    }

    return {
      status: row.narrativeStatus,
      error: row.narrativeError,
    }
  }

  /**
   * Convert Drizzle schema type to domain DTO
   */
  private toDTO(row: AssessmentResult): AssessmentResultDTO {
    return {
      id: row.id,
      assessmentId: row.assessmentId,
      batchId: row.batchId,
      compositeScore: row.compositeScore,
      recommendation: row.recommendation as Recommendation,
      overallRiskRating: row.overallRiskRating as RiskRating,
      narrativeReport: row.narrativeReport ?? undefined,
      executiveSummary: row.executiveSummary ?? undefined,
      keyFindings: row.keyFindings ?? undefined,
      disqualifyingFactors: row.disqualifyingFactors ?? undefined,
      // Narrative status fields (Epic 20)
      narrativeStatus: (row.narrativeStatus as NarrativeStatusDTO) ?? undefined,
      narrativeClaimedAt: row.narrativeClaimedAt ?? undefined,
      narrativeCompletedAt: row.narrativeCompletedAt ?? undefined,
      narrativeError: row.narrativeError ?? undefined,
      rubricVersion: row.rubricVersion,
      modelId: row.modelId,
      rawToolPayload: row.rawToolPayload ?? undefined,
      scoredAt: row.scoredAt,
      scoringDurationMs: row.scoringDurationMs ?? undefined,
    }
  }
}
