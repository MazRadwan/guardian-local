/**
 * DimensionControlMapping Domain Model
 *
 * Maps an ISO control to a Guardian risk dimension.
 * One control can map to multiple dimensions (via separate mapping rows).
 * relevanceWeight indicates how strongly the control relates to the dimension.
 */

import { DimensionControlMappingDTO, CreateDimensionControlMappingDTO } from './dtos.js'
import { RiskDimension } from '../types/QuestionnaireSchema.js'

export class DimensionControlMapping {
  private constructor(
    public readonly id: string,
    public readonly controlId: string,
    public readonly dimension: RiskDimension,
    public readonly relevanceWeight: number,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new DimensionControlMapping domain model
   */
  static create(data: CreateDimensionControlMappingDTO): DimensionControlMapping {
    if (!data.controlId || data.controlId.trim().length === 0) {
      throw new Error('Control ID is required')
    }
    if (!data.dimension || data.dimension.trim().length === 0) {
      throw new Error('Dimension is required')
    }
    const weight = data.relevanceWeight ?? 1.0
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error('Relevance weight must be between 0.0 and 1.0')
    }
    return new DimensionControlMapping(
      '', // ID assigned by DB
      data.controlId,
      data.dimension,
      weight,
      new Date()
    )
  }

  /**
   * Reconstitutes a DimensionControlMapping from persistence
   */
  static fromPersistence(dto: DimensionControlMappingDTO): DimensionControlMapping {
    return new DimensionControlMapping(
      dto.id,
      dto.controlId,
      dto.dimension,
      dto.relevanceWeight,
      dto.createdAt
    )
  }
}
