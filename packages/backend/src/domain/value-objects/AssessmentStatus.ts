/**
 * AssessmentStatus Value Object
 *
 * Represents the current status of an assessment with transition validation
 */

export type AssessmentStatusValue =
  | 'draft'
  | 'questions_generated'
  | 'exported'
  | 'scored'
  | 'cancelled'

export class AssessmentStatus {
  private static readonly VALID_STATUSES: AssessmentStatusValue[] = [
    'draft',
    'questions_generated',
    'exported',
    'scored',
    'cancelled',
  ]

  // Define valid status transitions
  private static readonly VALID_TRANSITIONS: Record<
    AssessmentStatusValue,
    AssessmentStatusValue[]
  > = {
    draft: ['questions_generated', 'cancelled'],
    questions_generated: ['exported', 'cancelled'],
    exported: ['scored', 'cancelled'], // Can score after export, or cancel
    scored: ['cancelled'], // Can still cancel after scoring
    cancelled: [], // Terminal state - no transitions allowed
  }

  private constructor(private readonly value: AssessmentStatusValue) {}

  static create(value: string): AssessmentStatus {
    if (!this.VALID_STATUSES.includes(value as AssessmentStatusValue)) {
      throw new Error(
        `Invalid assessment status: ${value}. Must be one of: ${this.VALID_STATUSES.join(', ')}`
      )
    }

    return new AssessmentStatus(value as AssessmentStatusValue)
  }

  static draft(): AssessmentStatus {
    return new AssessmentStatus('draft')
  }

  static questionsGenerated(): AssessmentStatus {
    return new AssessmentStatus('questions_generated')
  }

  static exported(): AssessmentStatus {
    return new AssessmentStatus('exported')
  }

  static scored(): AssessmentStatus {
    return new AssessmentStatus('scored')
  }

  static cancelled(): AssessmentStatus {
    return new AssessmentStatus('cancelled')
  }

  getValue(): AssessmentStatusValue {
    return this.value
  }

  /**
   * Validates if a transition to the target status is allowed
   */
  canTransitionTo(targetStatus: AssessmentStatus): boolean {
    const allowedTransitions = AssessmentStatus.VALID_TRANSITIONS[this.value]
    return allowedTransitions.includes(targetStatus.value)
  }

  /**
   * Validates transition and throws error if invalid
   */
  validateTransition(targetStatus: AssessmentStatus): void {
    if (!this.canTransitionTo(targetStatus)) {
      throw new Error(
        `Invalid status transition: Cannot move from '${this.value}' to '${targetStatus.value}'`
      )
    }
  }

  isDraft(): boolean {
    return this.value === 'draft'
  }

  isQuestionsGenerated(): boolean {
    return this.value === 'questions_generated'
  }

  isExported(): boolean {
    return this.value === 'exported'
  }

  isScored(): boolean {
    return this.value === 'scored'
  }

  isCancelled(): boolean {
    return this.value === 'cancelled'
  }

  isTerminal(): boolean {
    return this.value === 'cancelled'
  }

  equals(other: AssessmentStatus): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
