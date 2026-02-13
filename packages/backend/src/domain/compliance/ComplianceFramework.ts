/**
 * ComplianceFramework Domain Entity
 *
 * Represents an ISO compliance framework (e.g., "ISO/IEC 42001").
 * Follows the Assessment.ts factory method pattern.
 */

import { ComplianceFrameworkDTO, CreateComplianceFrameworkDTO } from './dtos.js'

export class ComplianceFramework {
  private constructor(
    public readonly id: string,
    private _name: string,
    private _description: string | null,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new ComplianceFramework entity
   */
  static create(data: CreateComplianceFrameworkDTO): ComplianceFramework {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Framework name is required')
    }
    return new ComplianceFramework(
      '', // ID assigned by DB
      data.name.trim(),
      data.description?.trim() ?? null,
      new Date()
    )
  }

  /**
   * Reconstitutes a ComplianceFramework from persistence
   */
  static fromPersistence(dto: ComplianceFrameworkDTO): ComplianceFramework {
    return new ComplianceFramework(
      dto.id,
      dto.name,
      dto.description ?? null,
      dto.createdAt
    )
  }

  get name(): string {
    return this._name
  }

  get description(): string | null {
    return this._description
  }
}
