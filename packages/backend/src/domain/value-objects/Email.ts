/**
 * Email Value Object
 *
 * Domain Layer - Pure TypeScript, ZERO dependencies
 * Encapsulates email validation logic
 */

export class Email {
  private readonly value: string

  private constructor(email: string) {
    this.value = email
  }

  /**
   * Create Email value object with validation
   * @param email - Email string to validate
   * @returns Email instance
   * @throws Error if email format is invalid
   */
  static create(email: string): Email {
    if (!email || email.trim().length === 0) {
      throw new Error('Email cannot be empty')
    }

    const trimmedEmail = email.trim().toLowerCase()

    // RFC 5322 simplified regex for email validation
    const emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

    if (!emailRegex.test(trimmedEmail)) {
      throw new Error('Invalid email format')
    }

    return new Email(trimmedEmail)
  }

  /**
   * Get email value
   */
  getValue(): string {
    return this.value
  }

  /**
   * Compare two Email objects for equality
   */
  equals(other: Email): boolean {
    return this.value === other.value
  }

  /**
   * String representation
   */
  toString(): string {
    return this.value
  }
}
