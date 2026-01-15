/**
 * OrphanCleanupService
 *
 * Epic 20 Story 20.2.2: Orphaned Response Cleanup Job
 *
 * Cleans up orphaned response batches - responses that were created
 * during scoring attempts but never linked to an assessment_result
 * (typically due to failed/interrupted scoring).
 *
 * Features:
 * - Configurable retention window (env: ORPHAN_CLEANUP_RETENTION_HOURS, default 24h)
 * - Only deletes batches where ALL responses are older than retention window
 * - Logs all deletions for audit purposes
 * - Safe: never deletes responses that have a matching assessment_result
 */

import type { IResponseRepository } from '../interfaces/IResponseRepository.js'

/** Default retention window in hours */
const DEFAULT_RETENTION_HOURS = 24

/** Result of cleanup operation */
export interface CleanupResult {
  /** Total number of responses deleted across all batches */
  deletedCount: number
  /** List of batch IDs that were cleaned up */
  batchIds: string[]
}

export class OrphanCleanupService {
  constructor(private readonly responseRepo: IResponseRepository) {}

  /**
   * Clean up orphaned response batches.
   *
   * Orphaned batches are those where:
   * 1. No matching assessment_result record exists
   * 2. All responses in the batch are older than the retention window
   *
   * Race-condition safe: Each batch deletion re-verifies orphan status
   * at delete time. If an assessment_result was created between
   * findOrphanedBatches() and deleteByBatchIdIfOrphaned(), the delete
   * is safely skipped.
   *
   * @returns Result with count of deleted responses and list of batch IDs
   */
  async cleanupOrphanedResponses(): Promise<CleanupResult> {
    const retentionHours = this.getRetentionHours()

    console.log(
      `[OrphanCleanupService] Starting cleanup with ${retentionHours}h retention window`
    )

    // Find orphaned batches older than retention window
    const orphanedBatches = await this.responseRepo.findOrphanedBatches(retentionHours)

    if (orphanedBatches.length === 0) {
      console.log('[OrphanCleanupService] No orphaned responses found')
      return { deletedCount: 0, batchIds: [] }
    }

    console.log(
      `[OrphanCleanupService] Found ${orphanedBatches.length} orphaned batch(es)`
    )

    // Delete orphaned responses batch by batch
    // Each delete re-checks orphan status (race-condition safe)
    let totalDeleted = 0
    const deletedBatchIds: string[] = []

    for (const { assessmentId, batchId } of orphanedBatches) {
      const deleted = await this.responseRepo.deleteByBatchIdIfOrphaned(assessmentId, batchId)
      if (deleted > 0) {
        totalDeleted += deleted
        deletedBatchIds.push(batchId)
        console.log(
          `[OrphanCleanupService] Deleted ${deleted} response(s) for orphaned batch ${batchId} (assessment: ${assessmentId})`
        )
      } else {
        // Batch was not deleted - likely an assessment_result was created (race condition handled safely)
        console.log(
          `[OrphanCleanupService] Skipped batch ${batchId} (assessment: ${assessmentId}) - no longer orphaned`
        )
      }
    }

    console.log(
      `[OrphanCleanupService] Cleanup complete: ${totalDeleted} total response(s) deleted from ${deletedBatchIds.length} batch(es)`
    )

    return { deletedCount: totalDeleted, batchIds: deletedBatchIds }
  }

  /**
   * Get retention hours from environment or use default.
   * @returns Retention window in hours
   */
  private getRetentionHours(): number {
    const envValue = process.env.ORPHAN_CLEANUP_RETENTION_HOURS
    if (envValue) {
      const parsed = parseInt(envValue, 10)
      if (!isNaN(parsed) && parsed > 0) {
        return parsed
      }
      console.warn(
        `[OrphanCleanupService] Invalid ORPHAN_CLEANUP_RETENTION_HOURS value "${envValue}", using default ${DEFAULT_RETENTION_HOURS}`
      )
    }
    return DEFAULT_RETENTION_HOURS
  }
}
