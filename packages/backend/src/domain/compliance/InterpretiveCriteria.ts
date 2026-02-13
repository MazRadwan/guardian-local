/**
 * InterpretiveCriteria Domain Model
 *
 * Guardian's own assessment criteria for an ISO control.
 * Written in Guardian's language (not verbatim ISO text -- copyright compliance).
 * Versioned independently of the ISO standard version.
 *
 * Review workflow: draft -> approved -> deprecated
 */

import { InterpretiveCriteriaDTO, CreateInterpretiveCriteriaDTO } from './dtos.js'
import { ReviewStatus } from './types.js'

export class InterpretiveCriteria {
  private constructor(
    public readonly id: string,
    public readonly controlId: string,
    public readonly criteriaVersion: string,
    public readonly criteriaText: string,
    public readonly assessmentGuidance: string | null,
    private _reviewStatus: ReviewStatus,
    private _approvedAt: Date | null,
    private _approvedBy: string | null,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new InterpretiveCriteria domain model (defaults to 'draft' status)
   */
  static create(data: CreateInterpretiveCriteriaDTO): InterpretiveCriteria {
    if (!data.controlId || data.controlId.trim().length === 0) {
      throw new Error('Control ID is required')
    }
    if (!data.criteriaVersion || data.criteriaVersion.trim().length === 0) {
      throw new Error('Criteria version is required')
    }
    if (!data.criteriaText || data.criteriaText.trim().length === 0) {
      throw new Error('Criteria text is required')
    }
    return new InterpretiveCriteria(
      '', // ID assigned by DB
      data.controlId,
      data.criteriaVersion.trim(),
      data.criteriaText.trim(),
      data.assessmentGuidance?.trim() ?? null,
      'draft',
      null,
      null,
      new Date()
    )
  }

  /**
   * Reconstitutes an InterpretiveCriteria from persistence
   */
  static fromPersistence(dto: InterpretiveCriteriaDTO): InterpretiveCriteria {
    return new InterpretiveCriteria(
      dto.id,
      dto.controlId,
      dto.criteriaVersion,
      dto.criteriaText,
      dto.assessmentGuidance ?? null,
      dto.reviewStatus,
      dto.approvedAt ?? null,
      dto.approvedBy ?? null,
      dto.createdAt
    )
  }

  get reviewStatus(): ReviewStatus {
    return this._reviewStatus
  }

  get approvedAt(): Date | null {
    return this._approvedAt
  }

  get approvedBy(): string | null {
    return this._approvedBy
  }

  /**
   * Approves this criteria with approver identity and timestamp
   */
  approve(approvedBy: string): void {
    this._reviewStatus = 'approved'
    this._approvedAt = new Date()
    this._approvedBy = approvedBy
  }

  /**
   * Marks this criteria as deprecated
   */
  deprecate(): void {
    this._reviewStatus = 'deprecated'
  }
}
