/**
 * DrizzleResponseRepository
 *
 * Drizzle ORM implementation of IResponseRepository
 */

import { eq, and, asc, sql, lt, isNull } from 'drizzle-orm'
import { db } from '../client.js'
import { responses, type Response, type NewResponse } from '../schema/responses.js'
import { assessmentResults } from '../schema/assessmentResults.js'
import type { IResponseRepository, OrphanedBatchRef } from '../../../application/interfaces/IResponseRepository.js'
import type { ResponseDTO, CreateResponseDTO } from '../../../domain/scoring/dtos.js'

export class DrizzleResponseRepository implements IResponseRepository {
  /**
   * Create batch of responses
   */
  async createBatch(newResponses: CreateResponseDTO[]): Promise<ResponseDTO[]> {
    if (newResponses.length === 0) {
      return []
    }

    const values: NewResponse[] = newResponses.map((dto) => ({
      assessmentId: dto.assessmentId,
      batchId: dto.batchId,
      fileId: dto.fileId,
      sectionNumber: dto.sectionNumber,
      questionNumber: dto.questionNumber,
      questionText: dto.questionText,
      responseText: dto.responseText,
      confidence: dto.confidence,
      hasVisualContent: dto.hasVisualContent ?? false,
      visualContentDescription: dto.visualContentDescription,
    }))

    const created = await db.insert(responses).values(values).returning()

    return created.map(this.toDTO)
  }

  /**
   * Find all responses for an assessment, ordered by position
   */
  async findByAssessmentId(assessmentId: string): Promise<ResponseDTO[]> {
    const rows = await db
      .select()
      .from(responses)
      .where(eq(responses.assessmentId, assessmentId))
      .orderBy(asc(responses.sectionNumber), asc(responses.questionNumber))

    return rows.map(this.toDTO)
  }

  /**
   * Find responses by batch ID
   */
  async findByBatchId(assessmentId: string, batchId: string): Promise<ResponseDTO[]> {
    const rows = await db
      .select()
      .from(responses)
      .where(and(eq(responses.assessmentId, assessmentId), eq(responses.batchId, batchId)))
      .orderBy(asc(responses.sectionNumber), asc(responses.questionNumber))

    return rows.map(this.toDTO)
  }

  /**
   * Delete responses by batch ID
   */
  async deleteByBatchId(assessmentId: string, batchId: string): Promise<void> {
    await db
      .delete(responses)
      .where(and(eq(responses.assessmentId, assessmentId), eq(responses.batchId, batchId)))
  }

  // ============================================================================
  // Epic 20: Orphan Cleanup Methods
  // ============================================================================

  /**
   * Find batches that have responses older than the retention window
   * and do NOT have a matching assessment_results record.
   *
   * Uses LEFT JOIN to find batches without matching assessment_results.
   * Joins on BOTH assessment_id AND batch_id to match the uniqueness
   * constraint on assessment_results.
   *
   * The retention window ensures we don't delete batches where scoring
   * is still in progress.
   *
   * @param olderThanHours - Only consider batches with ALL responses older than this many hours
   * @returns Array of orphaned batch references (assessmentId + batchId pairs)
   */
  async findOrphanedBatches(olderThanHours: number): Promise<OrphanedBatchRef[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
    // Convert to ISO string for raw SQL query (postgres-js doesn't handle Date in sql``)
    const cutoffStr = cutoff.toISOString()

    // Find distinct (assessment_id, batch_id) pairs where:
    // 1. All responses in the batch are older than cutoff
    // 2. No matching assessment_results record exists (matching on BOTH keys)
    const result = await db.execute<{ assessment_id: string; batch_id: string }>(sql`
      SELECT DISTINCT r.assessment_id, r.batch_id
      FROM responses r
      LEFT JOIN assessment_results ar
        ON r.assessment_id = ar.assessment_id
        AND r.batch_id = ar.batch_id
      WHERE ar.id IS NULL
      AND r.created_at < ${cutoffStr}::timestamp
      AND NOT EXISTS (
        SELECT 1 FROM responses r2
        WHERE r2.assessment_id = r.assessment_id
        AND r2.batch_id = r.batch_id
        AND r2.created_at >= ${cutoffStr}::timestamp
      )
    `)

    // db.execute returns a RowList which is an array-like object
    return Array.from(result).map((row) => ({
      assessmentId: row.assessment_id,
      batchId: row.batch_id,
    }))
  }

  /**
   * Delete all responses for a given batch, but ONLY if still orphaned.
   * This is race-condition safe - it re-checks orphan status at delete time.
   *
   * Uses a subquery to verify no matching assessment_result exists before
   * deleting. If an assessment_result was created between findOrphanedBatches()
   * and this call, zero rows are deleted.
   *
   * @param assessmentId - The assessment ID
   * @param batchId - The batch ID to delete
   * @returns Number of deleted responses (0 if not orphaned or not found)
   */
  async deleteByBatchIdIfOrphaned(assessmentId: string, batchId: string): Promise<number> {
    // Use raw SQL to perform atomic delete with orphan check
    // This deletes responses ONLY if no matching assessment_result exists
    const result = await db.execute<{ id: string }>(sql`
      DELETE FROM responses r
      WHERE r.assessment_id = ${assessmentId}
      AND r.batch_id = ${batchId}
      AND NOT EXISTS (
        SELECT 1 FROM assessment_results ar
        WHERE ar.assessment_id = r.assessment_id
        AND ar.batch_id = r.batch_id
      )
      RETURNING r.id
    `)

    return Array.from(result).length
  }

  /**
   * Convert Drizzle schema type to domain DTO
   */
  private toDTO(row: Response): ResponseDTO {
    return {
      id: row.id,
      assessmentId: row.assessmentId,
      batchId: row.batchId,
      fileId: row.fileId ?? undefined,
      sectionNumber: row.sectionNumber,
      questionNumber: row.questionNumber,
      questionText: row.questionText,
      responseText: row.responseText,
      confidence: row.confidence ?? undefined,
      hasVisualContent: row.hasVisualContent ?? false,
      visualContentDescription: row.visualContentDescription ?? undefined,
      createdAt: row.createdAt,
    }
  }
}
