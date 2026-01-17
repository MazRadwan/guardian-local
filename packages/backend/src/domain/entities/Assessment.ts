/**
 * Assessment Domain Entity
 *
 * Represents an assessment instance for a vendor.
 * Contains business rules and validation logic.
 */

import { AssessmentType, AssessmentTypeValue } from '../value-objects/AssessmentType'
import { AssessmentStatus, AssessmentStatusValue } from '../value-objects/AssessmentStatus'

export interface AssessmentMetadata {
  assessorName?: string
  stakeholders?: string[]
  notes?: string
}

export interface CreateAssessmentData {
  vendorId: string
  assessmentType: AssessmentTypeValue
  solutionName?: string
  /**
   * Solution type for scoring weight selection.
   *
   * Should be one of the rubric SolutionType values:
   * - 'clinical_ai' - Clinical decision support (weights clinical_risk highest)
   * - 'administrative_ai' - Administrative/workflow tools (weights privacy_risk highest)
   * - 'patient_facing' - Patient engagement platforms (weights privacy_risk highest)
   *
   * If not set or invalid, ScoringService defaults to 'clinical_ai'.
   *
   * @see docs/design/architecture/scoring-solution-type.md
   */
  solutionType?: string
  assessmentMetadata?: AssessmentMetadata
  createdBy: string
}

export class Assessment {
  private constructor(
    public readonly id: string,
    public readonly vendorId: string,
    private _assessmentType: AssessmentType,
    private _solutionName: string | null,
    private _solutionType: string | null,
    private _status: AssessmentStatus,
    private _assessmentMetadata: AssessmentMetadata | null,
    public readonly createdAt: Date,
    private _updatedAt: Date,
    public readonly createdBy: string
  ) {}

  /**
   * Creates a new Assessment entity
   */
  static create(data: CreateAssessmentData): Assessment {
    // Validate required fields
    if (!data.vendorId || data.vendorId.trim().length === 0) {
      throw new Error('Vendor ID is required')
    }

    if (!data.createdBy || data.createdBy.trim().length === 0) {
      throw new Error('Created by user ID is required')
    }

    const assessmentType = AssessmentType.create(data.assessmentType)
    const status = AssessmentStatus.draft()
    const now = new Date()

    return new Assessment(
      crypto.randomUUID(),
      data.vendorId,
      assessmentType,
      data.solutionName || null,
      data.solutionType || null,
      status,
      data.assessmentMetadata || null,
      now,
      now,
      data.createdBy
    )
  }

  /**
   * Reconstitutes an Assessment from persistence
   */
  static fromPersistence(data: {
    id: string
    vendorId: string
    assessmentType: string
    solutionName: string | null
    solutionType: string | null
    status: string
    assessmentMetadata: AssessmentMetadata | null
    createdAt: Date
    updatedAt: Date
    createdBy: string
  }): Assessment {
    const assessmentType = AssessmentType.create(data.assessmentType)
    const status = AssessmentStatus.create(data.status)

    return new Assessment(
      data.id,
      data.vendorId,
      assessmentType,
      data.solutionName,
      data.solutionType,
      status,
      data.assessmentMetadata,
      data.createdAt,
      data.updatedAt,
      data.createdBy
    )
  }

  /**
   * Converts entity to persistence format
   */
  toPersistence(): {
    id: string
    vendorId: string
    assessmentType: AssessmentTypeValue
    solutionName: string | null
    solutionType: string | null
    status: AssessmentStatusValue
    assessmentMetadata: AssessmentMetadata | null
    createdAt: Date
    updatedAt: Date
    createdBy: string
  } {
    return {
      id: this.id,
      vendorId: this.vendorId,
      assessmentType: this._assessmentType.getValue(),
      solutionName: this._solutionName,
      solutionType: this._solutionType,
      status: this._status.getValue(),
      assessmentMetadata: this._assessmentMetadata,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      createdBy: this.createdBy,
    }
  }

  // Getters
  get assessmentType(): AssessmentTypeValue {
    return this._assessmentType.getValue()
  }

  get solutionName(): string | null {
    return this._solutionName
  }

  get solutionType(): string | null {
    return this._solutionType
  }

  get status(): AssessmentStatusValue {
    return this._status.getValue()
  }

  get assessmentMetadata(): AssessmentMetadata | null {
    return this._assessmentMetadata
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  // Business methods
  updateSolutionName(name: string | null): void {
    this._solutionName = name
    this._updatedAt = new Date()
  }

  updateSolutionType(type: string | null): void {
    this._solutionType = type
    this._updatedAt = new Date()
  }

  updateMetadata(metadata: AssessmentMetadata | null): void {
    this._assessmentMetadata = metadata
    this._updatedAt = new Date()
  }

  /**
   * Updates assessment status with validation
   * @throws Error if transition is invalid
   */
  updateStatus(newStatus: AssessmentStatusValue): void {
    const targetStatus = AssessmentStatus.create(newStatus)

    // Validate transition
    this._status.validateTransition(targetStatus)

    // Update status
    this._status = targetStatus
    this._updatedAt = new Date()
  }

  /**
   * Marks assessment as questions generated
   */
  markQuestionsGenerated(): void {
    this.updateStatus('questions_generated')
  }

  /**
   * Marks assessment as exported
   */
  markExported(): void {
    this.updateStatus('exported')
  }

  /**
   * Cancels the assessment
   */
  cancel(): void {
    this.updateStatus('cancelled')
  }

  /**
   * Checks if assessment can be modified
   */
  canBeModified(): boolean {
    return !this._status.isCancelled()
  }

  /**
   * Checks if questions can be generated
   */
  canGenerateQuestions(): boolean {
    return this._status.isDraft()
  }
}
