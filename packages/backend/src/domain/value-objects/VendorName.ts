/**
 * VendorName Value Object
 *
 * Encapsulates vendor name validation rules
 */

export class VendorName {
  private readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /**
   * Creates a VendorName from a string
   * @throws Error if validation fails
   */
  static create(value: string): VendorName {
    // Validation: name cannot be empty
    if (!value || value.trim().length === 0) {
      throw new Error('Vendor name cannot be empty')
    }

    // Validation: name cannot exceed 255 characters
    if (value.length > 255) {
      throw new Error('Vendor name cannot exceed 255 characters')
    }

    // Validation: name should contain meaningful characters
    if (!/[a-zA-Z0-9]/.test(value)) {
      throw new Error('Vendor name must contain at least one alphanumeric character')
    }

    return new VendorName(value.trim())
  }

  getValue(): string {
    return this.value
  }

  equals(other: VendorName): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
