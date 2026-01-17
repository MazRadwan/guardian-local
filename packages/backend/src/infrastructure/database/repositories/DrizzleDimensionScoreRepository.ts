/**
 * DrizzleDimensionScoreRepository
 *
 * Drizzle ORM implementation of IDimensionScoreRepository
 */

import { eq, and, desc } from 'drizzle-orm'
import { db, type DrizzleTransaction } from '../client.js'
import { dimensionScores, type DimensionScore, type NewDimensionScore } from '../schema/dimensionScores.js'
import type { IDimensionScoreRepository } from '../../../application/interfaces/IDimensionScoreRepository.js'
import type { DimensionScoreDTO, CreateDimensionScoreDTO } from '../../../domain/scoring/dtos.js'
import type { RiskRating } from '../../../domain/scoring/types.js'

export class DrizzleDimensionScoreRepository implements IDimensionScoreRepository {
  /**
   * Create batch of dimension scores
   * @param newScores - The dimension scores to create
   * @param tx - Optional transaction context for atomic operations
   */
  async createBatch(newScores: CreateDimensionScoreDTO[], tx?: DrizzleTransaction): Promise<DimensionScoreDTO[]> {
    if (newScores.length === 0) {
      return []
    }

    const values: NewDimensionScore[] = newScores.map((dto) => ({
      assessmentId: dto.assessmentId,
      batchId: dto.batchId,
      dimension: dto.dimension,
      score: dto.score,
      riskRating: dto.riskRating,
      findings: dto.findings,
    }))

    // Use transaction if provided, otherwise use default db
    const executor = tx ?? db
    const created = await executor.insert(dimensionScores).values(values).returning()

    return created.map(this.toDTO)
  }

  /**
   * Find all dimension scores for an assessment
   */
  async findByAssessmentId(assessmentId: string): Promise<DimensionScoreDTO[]> {
    const rows = await db
      .select()
      .from(dimensionScores)
      .where(eq(dimensionScores.assessmentId, assessmentId))
      .orderBy(desc(dimensionScores.createdAt))

    return rows.map(this.toDTO)
  }

  /**
   * Find dimension scores by batch ID
   */
  async findByBatchId(assessmentId: string, batchId: string): Promise<DimensionScoreDTO[]> {
    const rows = await db
      .select()
      .from(dimensionScores)
      .where(and(eq(dimensionScores.assessmentId, assessmentId), eq(dimensionScores.batchId, batchId)))

    return rows.map(this.toDTO)
  }

  /**
   * Find latest dimension scores for an assessment (most recent batch)
   */
  async findLatestByAssessmentId(assessmentId: string): Promise<DimensionScoreDTO[]> {
    // First, find the most recent batchId for this assessment
    const [latestBatch] = await db
      .select({ batchId: dimensionScores.batchId })
      .from(dimensionScores)
      .where(eq(dimensionScores.assessmentId, assessmentId))
      .orderBy(desc(dimensionScores.createdAt))
      .limit(1)

    if (!latestBatch) {
      return []
    }

    // Then fetch all scores for that batch
    return this.findByBatchId(assessmentId, latestBatch.batchId)
  }

  /**
   * Convert Drizzle schema type to domain DTO
   */
  private toDTO(row: DimensionScore): DimensionScoreDTO {
    return {
      id: row.id,
      assessmentId: row.assessmentId,
      batchId: row.batchId,
      dimension: row.dimension,
      score: row.score,
      riskRating: row.riskRating as RiskRating,
      findings: row.findings ?? undefined,
      createdAt: row.createdAt,
    }
  }
}
