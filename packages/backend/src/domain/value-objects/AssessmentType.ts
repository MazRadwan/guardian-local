/**
 * AssessmentType Value Object
 *
 * Represents the type of assessment being conducted
 */

export type AssessmentTypeValue = 'quick' | 'comprehensive' | 'category_focused'

export class AssessmentType {
  private static readonly VALID_TYPES: AssessmentTypeValue[] = [
    'quick',
    'comprehensive',
    'category_focused',
  ]

  private constructor(private readonly value: AssessmentTypeValue) {}

  static create(value: string): AssessmentType {
    if (!this.VALID_TYPES.includes(value as AssessmentTypeValue)) {
      throw new Error(
        `Invalid assessment type: ${value}. Must be one of: ${this.VALID_TYPES.join(', ')}`
      )
    }

    return new AssessmentType(value as AssessmentTypeValue)
  }

  static quick(): AssessmentType {
    return new AssessmentType('quick')
  }

  static comprehensive(): AssessmentType {
    return new AssessmentType('comprehensive')
  }

  static categoryFocused(): AssessmentType {
    return new AssessmentType('category_focused')
  }

  getValue(): AssessmentTypeValue {
    return this.value
  }

  isQuick(): boolean {
    return this.value === 'quick'
  }

  isComprehensive(): boolean {
    return this.value === 'comprehensive'
  }

  isCategoryFocused(): boolean {
    return this.value === 'category_focused'
  }

  equals(other: AssessmentType): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
