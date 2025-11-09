/**
 * Drizzle Assessment Repository
 *
 * Implements IAssessmentRepository using Drizzle ORM
 */

import { eq, desc } from 'drizzle-orm'
import { db } from '../client'
import { assessments } from '../schema/assessments'
import { IAssessmentRepository } from '../../../application/interfaces/IAssessmentRepository'
import { Assessment } from '../../../domain/entities/Assessment'

export class DrizzleAssessmentRepository implements IAssessmentRepository {
  async create(assessment: Assessment): Promise<Assessment> {
    const persistence = assessment.toPersistence()

    const [created] = await db
      .insert(assessments)
      .values({
        vendorId: persistence.vendorId,
        assessmentType: persistence.assessmentType,
        solutionName: persistence.solutionName,
        solutionType: persistence.solutionType,
        status: persistence.status,
        assessmentMetadata: persistence.assessmentMetadata,
        createdBy: persistence.createdBy,
      })
      .returning()

    return Assessment.fromPersistence({
      id: created.id,
      vendorId: created.vendorId,
      assessmentType: created.assessmentType,
      solutionName: created.solutionName,
      solutionType: created.solutionType,
      status: created.status,
      assessmentMetadata: created.assessmentMetadata,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      createdBy: created.createdBy,
    })
  }

  async findById(id: string): Promise<Assessment | null> {
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id))
      .limit(1)

    if (!assessment) {
      return null
    }

    return Assessment.fromPersistence({
      id: assessment.id,
      vendorId: assessment.vendorId,
      assessmentType: assessment.assessmentType,
      solutionName: assessment.solutionName,
      solutionType: assessment.solutionType,
      status: assessment.status,
      assessmentMetadata: assessment.assessmentMetadata,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt,
      createdBy: assessment.createdBy,
    })
  }

  async findByVendorId(vendorId: string): Promise<Assessment[]> {
    const results = await db
      .select()
      .from(assessments)
      .where(eq(assessments.vendorId, vendorId))
      .orderBy(desc(assessments.createdAt))

    return results.map((assessment) =>
      Assessment.fromPersistence({
        id: assessment.id,
        vendorId: assessment.vendorId,
        assessmentType: assessment.assessmentType,
        solutionName: assessment.solutionName,
        solutionType: assessment.solutionType,
        status: assessment.status,
        assessmentMetadata: assessment.assessmentMetadata,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        createdBy: assessment.createdBy,
      })
    )
  }

  async findByCreatedBy(userId: string): Promise<Assessment[]> {
    const results = await db
      .select()
      .from(assessments)
      .where(eq(assessments.createdBy, userId))
      .orderBy(desc(assessments.createdAt))

    return results.map((assessment) =>
      Assessment.fromPersistence({
        id: assessment.id,
        vendorId: assessment.vendorId,
        assessmentType: assessment.assessmentType,
        solutionName: assessment.solutionName,
        solutionType: assessment.solutionType,
        status: assessment.status,
        assessmentMetadata: assessment.assessmentMetadata,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        createdBy: assessment.createdBy,
      })
    )
  }

  async update(assessment: Assessment): Promise<Assessment> {
    const persistence = assessment.toPersistence()

    const [updated] = await db
      .update(assessments)
      .set({
        assessmentType: persistence.assessmentType as 'quick' | 'comprehensive' | 'renewal',
        solutionName: persistence.solutionName,
        solutionType: persistence.solutionType,
        status: persistence.status as 'draft' | 'questions_generated' | 'exported' | 'cancelled',
        assessmentMetadata: persistence.assessmentMetadata,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, persistence.id))
      .returning()

    return Assessment.fromPersistence({
      id: updated.id,
      vendorId: updated.vendorId,
      assessmentType: updated.assessmentType,
      solutionName: updated.solutionName,
      solutionType: updated.solutionType,
      status: updated.status,
      assessmentMetadata: updated.assessmentMetadata,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
    })
  }

  async updateStatus(
    id: string,
    status: 'draft' | 'questions_generated' | 'exported' | 'cancelled'
  ): Promise<void> {
    await db
      .update(assessments)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, id))
  }

  async delete(id: string): Promise<void> {
    await db.delete(assessments).where(eq(assessments.id, id))
  }

  async list(limit: number = 50, offset: number = 0): Promise<Assessment[]> {
    const results = await db
      .select()
      .from(assessments)
      .orderBy(desc(assessments.createdAt))
      .limit(limit)
      .offset(offset)

    return results.map((assessment) =>
      Assessment.fromPersistence({
        id: assessment.id,
        vendorId: assessment.vendorId,
        assessmentType: assessment.assessmentType,
        solutionName: assessment.solutionName,
        solutionType: assessment.solutionType,
        status: assessment.status,
        assessmentMetadata: assessment.assessmentMetadata,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        createdBy: assessment.createdBy,
      })
    )
  }
}
