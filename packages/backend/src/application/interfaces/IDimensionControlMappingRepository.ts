/**
 * IDimensionControlMappingRepository
 *
 * Repository interface for the dimension_control_mappings table.
 * Critical for ISOControlRetrievalService: "which ISO controls apply to a given dimension?"
 */

import type {
  DimensionControlMappingDTO,
  CreateDimensionControlMappingDTO,
  FrameworkControlDTO,
} from '../../domain/compliance/dtos.js'

/**
 * Extended mapping that includes joined control details
 */
export interface MappingWithControlDTO extends DimensionControlMappingDTO {
  control: FrameworkControlDTO
}

export interface IDimensionControlMappingRepository {
  findByDimension(dimension: string): Promise<MappingWithControlDTO[]>
  findByDimensions(dimensions: string[]): Promise<MappingWithControlDTO[]>
  findAllMappings(): Promise<MappingWithControlDTO[]>
  create(data: CreateDimensionControlMappingDTO): Promise<DimensionControlMappingDTO>
  createBatch(data: CreateDimensionControlMappingDTO[]): Promise<DimensionControlMappingDTO[]>
}
