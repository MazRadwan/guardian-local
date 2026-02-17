/**
 * FrameworkControl Domain Model
 *
 * Represents a single ISO control (e.g., "A.6.2.6 - Data quality management").
 * Immutable per standard version -- controls do not change once seeded.
 */

import { FrameworkControlDTO, CreateFrameworkControlDTO } from './dtos.js'

export class FrameworkControl {
  private constructor(
    public readonly id: string,
    public readonly versionId: string,
    public readonly clauseRef: string,
    public readonly domain: string,
    public readonly title: string,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new FrameworkControl domain model
   */
  static create(data: CreateFrameworkControlDTO): FrameworkControl {
    if (!data.versionId || data.versionId.trim().length === 0) {
      throw new Error('Version ID is required')
    }
    if (!data.clauseRef || data.clauseRef.trim().length === 0) {
      throw new Error('Clause reference is required')
    }
    if (!data.domain || data.domain.trim().length === 0) {
      throw new Error('Domain is required')
    }
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('Title is required')
    }
    return new FrameworkControl(
      '', // ID assigned by DB
      data.versionId,
      data.clauseRef.trim(),
      data.domain.trim(),
      data.title.trim(),
      new Date()
    )
  }

  /**
   * Reconstitutes a FrameworkControl from persistence
   */
  static fromPersistence(dto: FrameworkControlDTO): FrameworkControl {
    return new FrameworkControl(
      dto.id,
      dto.versionId,
      dto.clauseRef,
      dto.domain,
      dto.title,
      dto.createdAt
    )
  }
}
