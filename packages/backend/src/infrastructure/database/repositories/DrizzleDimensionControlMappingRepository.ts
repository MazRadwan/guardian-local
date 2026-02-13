/**
 * DrizzleDimensionControlMappingRepository
 *
 * Drizzle ORM implementation of IDimensionControlMappingRepository.
 * Handles dimension_control_mappings with joins to framework_controls.
 */

import { eq } from 'drizzle-orm'
import { db } from '../client.js'
import { dimensionControlMappings } from '../schema/dimensionControlMappings.js'
import { frameworkControls } from '../schema/frameworkControls.js'
import type {
  IDimensionControlMappingRepository,
  MappingWithControlDTO,
} from '../../../application/interfaces/IDimensionControlMappingRepository.js'
import type {
  DimensionControlMappingDTO,
  CreateDimensionControlMappingDTO,
  FrameworkControlDTO,
} from '../../../domain/compliance/dtos.js'
import type { RiskDimension } from '../../../domain/types/QuestionnaireSchema.js'

export class DrizzleDimensionControlMappingRepository
  implements IDimensionControlMappingRepository
{
  async findByDimension(dimension: string): Promise<MappingWithControlDTO[]> {
    const rows = await db
      .select()
      .from(dimensionControlMappings)
      .innerJoin(
        frameworkControls,
        eq(dimensionControlMappings.controlId, frameworkControls.id)
      )
      .where(eq(dimensionControlMappings.dimension, dimension))

    return rows.map((row) => this.toMappingWithControl(row))
  }

  async findAllMappings(): Promise<MappingWithControlDTO[]> {
    const rows = await db
      .select()
      .from(dimensionControlMappings)
      .innerJoin(
        frameworkControls,
        eq(dimensionControlMappings.controlId, frameworkControls.id)
      )

    return rows.map((row) => this.toMappingWithControl(row))
  }

  async create(
    data: CreateDimensionControlMappingDTO
  ): Promise<DimensionControlMappingDTO> {
    const [row] = await db
      .insert(dimensionControlMappings)
      .values({
        controlId: data.controlId,
        dimension: data.dimension,
        relevanceWeight: data.relevanceWeight ?? 1.0,
      })
      .returning()
    return this.toDTO(row)
  }

  async createBatch(
    data: CreateDimensionControlMappingDTO[]
  ): Promise<DimensionControlMappingDTO[]> {
    if (data.length === 0) return []
    const values = data.map((d) => ({
      controlId: d.controlId,
      dimension: d.dimension,
      relevanceWeight: d.relevanceWeight ?? 1.0,
    }))
    const rows = await db.insert(dimensionControlMappings).values(values).returning()
    return rows.map(this.toDTO)
  }

  private toDTO(
    row: typeof dimensionControlMappings.$inferSelect
  ): DimensionControlMappingDTO {
    return {
      id: row.id,
      controlId: row.controlId,
      dimension: row.dimension as RiskDimension,
      relevanceWeight: row.relevanceWeight,
      createdAt: row.createdAt,
    }
  }

  private toMappingWithControl(row: {
    dimension_control_mappings: typeof dimensionControlMappings.$inferSelect
    framework_controls: typeof frameworkControls.$inferSelect
  }): MappingWithControlDTO {
    const mapping = row.dimension_control_mappings
    const control = row.framework_controls
    return {
      ...this.toDTO(mapping),
      control: this.controlToDTO(control),
    }
  }

  private controlToDTO(
    row: typeof frameworkControls.$inferSelect
  ): FrameworkControlDTO {
    return {
      id: row.id,
      versionId: row.versionId,
      clauseRef: row.clauseRef,
      domain: row.domain,
      title: row.title,
      createdAt: row.createdAt,
    }
  }
}
