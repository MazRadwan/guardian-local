/**
 * DrizzleFrameworkControlRepository
 *
 * Drizzle ORM implementation of IFrameworkControlRepository.
 * Handles the framework_controls table.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '../client.js'
import { frameworkControls } from '../schema/frameworkControls.js'
import type { IFrameworkControlRepository } from '../../../application/interfaces/IFrameworkControlRepository.js'
import type {
  FrameworkControlDTO,
  CreateFrameworkControlDTO,
} from '../../../domain/compliance/dtos.js'

export class DrizzleFrameworkControlRepository implements IFrameworkControlRepository {
  async findByVersionId(versionId: string): Promise<FrameworkControlDTO[]> {
    const rows = await db
      .select()
      .from(frameworkControls)
      .where(eq(frameworkControls.versionId, versionId))
    return rows.map(this.toDTO)
  }

  async findByClauseRef(
    versionId: string,
    clauseRef: string
  ): Promise<FrameworkControlDTO | null> {
    const [row] = await db
      .select()
      .from(frameworkControls)
      .where(and(eq(frameworkControls.versionId, versionId), eq(frameworkControls.clauseRef, clauseRef)))
      .limit(1)
    return row ? this.toDTO(row) : null
  }

  async create(data: CreateFrameworkControlDTO): Promise<FrameworkControlDTO> {
    const [row] = await db
      .insert(frameworkControls)
      .values({
        versionId: data.versionId,
        clauseRef: data.clauseRef,
        domain: data.domain,
        title: data.title,
      })
      .returning()
    return this.toDTO(row)
  }

  async createBatch(data: CreateFrameworkControlDTO[]): Promise<FrameworkControlDTO[]> {
    if (data.length === 0) return []
    const values = data.map((d) => ({
      versionId: d.versionId,
      clauseRef: d.clauseRef,
      domain: d.domain,
      title: d.title,
    }))
    const rows = await db.insert(frameworkControls).values(values).returning()
    return rows.map(this.toDTO)
  }

  private toDTO(row: typeof frameworkControls.$inferSelect): FrameworkControlDTO {
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
