/**
 * IInterpretiveCriteriaRepository
 *
 * Repository interface for the interpretive_criteria table.
 * Supports the human review/approval workflow.
 */

import type {
  InterpretiveCriteriaDTO,
  CreateInterpretiveCriteriaDTO,
} from '../../domain/compliance/dtos.js'
import type { ReviewStatus } from '../../domain/compliance/types.js'

export interface IInterpretiveCriteriaRepository {
  findByControlId(controlId: string): Promise<InterpretiveCriteriaDTO[]>
  findApprovedByVersion(criteriaVersion: string): Promise<InterpretiveCriteriaDTO[]>
  create(data: CreateInterpretiveCriteriaDTO): Promise<InterpretiveCriteriaDTO>
  createBatch(data: CreateInterpretiveCriteriaDTO[]): Promise<InterpretiveCriteriaDTO[]>
  updateReviewStatus(id: string, status: ReviewStatus, approvedBy?: string): Promise<void>
}
