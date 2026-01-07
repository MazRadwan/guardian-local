/**
 * DrizzleResponseRepository
 *
 * Drizzle ORM implementation of IResponseRepository
 */

import { eq, and, asc } from 'drizzle-orm'
import { db } from '../client.js'
import { responses, type Response, type NewResponse } from '../schema/responses.js'
import type { IResponseRepository } from '../../../application/interfaces/IResponseRepository.js'
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
