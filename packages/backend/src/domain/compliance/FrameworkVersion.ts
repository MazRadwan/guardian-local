/**
 * FrameworkVersion Domain Entity
 *
 * Represents a specific version of an ISO compliance framework.
 * A framework can have multiple versions (e.g., "2023", "2025").
 * Follows the Assessment.ts factory method pattern.
 */

import { FrameworkVersionDTO, CreateFrameworkVersionDTO } from './dtos.js'
import { FrameworkStatus } from './types.js'

export class FrameworkVersion {
  private constructor(
    public readonly id: string,
    public readonly frameworkId: string,
    private _versionLabel: string,
    private _status: FrameworkStatus,
    private _publishedAt: Date | null,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new FrameworkVersion entity
   */
  static create(data: CreateFrameworkVersionDTO): FrameworkVersion {
    if (!data.frameworkId || data.frameworkId.trim().length === 0) {
      throw new Error('Framework ID is required')
    }
    if (!data.versionLabel || data.versionLabel.trim().length === 0) {
      throw new Error('Version label is required')
    }
    return new FrameworkVersion(
      '', // ID assigned by DB
      data.frameworkId,
      data.versionLabel.trim(),
      data.status ?? 'active',
      data.publishedAt ?? null,
      new Date()
    )
  }

  /**
   * Reconstitutes a FrameworkVersion from persistence
   */
  static fromPersistence(dto: FrameworkVersionDTO): FrameworkVersion {
    return new FrameworkVersion(
      dto.id,
      dto.frameworkId,
      dto.versionLabel,
      dto.status,
      dto.publishedAt ?? null,
      dto.createdAt
    )
  }

  get versionLabel(): string {
    return this._versionLabel
  }

  get status(): FrameworkStatus {
    return this._status
  }

  get publishedAt(): Date | null {
    return this._publishedAt
  }

  /**
   * Marks this version as deprecated
   */
  deprecate(): void {
    this._status = 'deprecated'
  }
}
