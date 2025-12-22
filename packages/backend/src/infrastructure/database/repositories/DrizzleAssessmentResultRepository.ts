/**
 * DrizzleAssessmentResultRepository
 *
 * Drizzle ORM implementation of IAssessmentResultRepository
 */

import { eq, and, desc } from 'drizzle-orm'
import { db } from '../client.js'
import { assessmentResults, type AssessmentResult, type NewAssessmentResult } from '../schema/assessmentResults.js'
import type { IAssessmentResultRepository } from '../../../application/interfaces/IAssessmentResultRepository.js'
import type { AssessmentResultDTO, CreateAssessmentResultDTO } from '../../../domain/scoring/dtos.js'
import type { RiskRating, Recommendation } from '../../../domain/scoring/types.js'

export class DrizzleAssessmentResultRepository implements IAssessmentResultRepository {
  /**
   * Create assessment result
   */
  async create(newResult: CreateAssessmentResultDTO): Promise<AssessmentResultDTO> {
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

    const [created] = await db.insert(assessmentResults).values(value).returning()

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
      rubricVersion: row.rubricVersion,
      modelId: row.modelId,
      rawToolPayload: row.rawToolPayload ?? undefined,
      scoredAt: row.scoredAt,
      scoringDurationMs: row.scoringDurationMs ?? undefined,
    }
  }
}
