/**
 * IFrameworkControlRepository
 *
 * Repository interface for the framework_controls table.
 * Includes batch insert for seed script efficiency.
 */

import type {
  FrameworkControlDTO,
  CreateFrameworkControlDTO,
} from '../../domain/compliance/dtos.js'

export interface IFrameworkControlRepository {
  findByVersionId(versionId: string): Promise<FrameworkControlDTO[]>
  findByClauseRef(versionId: string, clauseRef: string): Promise<FrameworkControlDTO | null>
  create(data: CreateFrameworkControlDTO): Promise<FrameworkControlDTO>
  createBatch(data: CreateFrameworkControlDTO[]): Promise<FrameworkControlDTO[]>
}
