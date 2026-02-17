/**
 * DrizzleInterpretiveCriteriaRepository
 *
 * Drizzle ORM implementation of IInterpretiveCriteriaRepository.
 * Handles the interpretive_criteria table with approval workflow support.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '../client.js'
import { interpretiveCriteria } from '../schema/interpretiveCriteria.js'
import type { IInterpretiveCriteriaRepository } from '../../../application/interfaces/IInterpretiveCriteriaRepository.js'
import type {
  InterpretiveCriteriaDTO,
  CreateInterpretiveCriteriaDTO,
} from '../../../domain/compliance/dtos.js'
import type { ReviewStatus } from '../../../domain/compliance/types.js'

export class DrizzleInterpretiveCriteriaRepository implements IInterpretiveCriteriaRepository {
  async findByControlId(controlId: string): Promise<InterpretiveCriteriaDTO[]> {
    const rows = await db
      .select()
      .from(interpretiveCriteria)
      .where(eq(interpretiveCriteria.controlId, controlId))
    return rows.map(this.toDTO)
  }

  async findApprovedByVersion(criteriaVersion: string): Promise<InterpretiveCriteriaDTO[]> {
    const rows = await db
      .select()
      .from(interpretiveCriteria)
      .where(
        and(
          eq(interpretiveCriteria.criteriaVersion, criteriaVersion),
          eq(interpretiveCriteria.reviewStatus, 'approved')
        )
      )
    return rows.map(this.toDTO)
  }

  async create(data: CreateInterpretiveCriteriaDTO): Promise<InterpretiveCriteriaDTO> {
    const [row] = await db
      .insert(interpretiveCriteria)
      .values({
        controlId: data.controlId,
        criteriaVersion: data.criteriaVersion,
        criteriaText: data.criteriaText,
        assessmentGuidance: data.assessmentGuidance,
        reviewStatus: 'draft',
      })
      .returning()
    return this.toDTO(row)
  }

  async createBatch(data: CreateInterpretiveCriteriaDTO[]): Promise<InterpretiveCriteriaDTO[]> {
    if (data.length === 0) return []
    const values = data.map((d) => ({
      controlId: d.controlId,
      criteriaVersion: d.criteriaVersion,
      criteriaText: d.criteriaText,
      assessmentGuidance: d.assessmentGuidance,
      reviewStatus: 'draft' as const,
    }))
    const rows = await db.insert(interpretiveCriteria).values(values).returning()
    return rows.map(this.toDTO)
  }

  async updateReviewStatus(
    id: string,
    status: ReviewStatus,
    approvedBy?: string
  ): Promise<void> {
    const updateData: Record<string, unknown> = { reviewStatus: status }
    if (status === 'approved' && approvedBy) {
      updateData.approvedAt = new Date()
      updateData.approvedBy = approvedBy
    }
    await db
      .update(interpretiveCriteria)
      .set(updateData)
      .where(eq(interpretiveCriteria.id, id))
  }

  private toDTO(row: typeof interpretiveCriteria.$inferSelect): InterpretiveCriteriaDTO {
    return {
      id: row.id,
      controlId: row.controlId,
      criteriaVersion: row.criteriaVersion,
      criteriaText: row.criteriaText,
      assessmentGuidance: row.assessmentGuidance ?? undefined,
      reviewStatus: row.reviewStatus as ReviewStatus,
      approvedAt: row.approvedAt ?? undefined,
      approvedBy: row.approvedBy ?? undefined,
      createdAt: row.createdAt,
    }
  }
}
