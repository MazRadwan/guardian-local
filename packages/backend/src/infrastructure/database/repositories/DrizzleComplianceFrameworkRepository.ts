/**
 * DrizzleComplianceFrameworkRepository
 *
 * Drizzle ORM implementation of IComplianceFrameworkRepository.
 * Handles both compliance_frameworks and framework_versions tables.
 */

import { eq, desc } from 'drizzle-orm'
import { db } from '../client.js'
import { complianceFrameworks } from '../schema/complianceFrameworks.js'
import { frameworkVersions } from '../schema/frameworkVersions.js'
import type { IComplianceFrameworkRepository } from '../../../application/interfaces/IComplianceFrameworkRepository.js'
import type {
  ComplianceFrameworkDTO,
  CreateComplianceFrameworkDTO,
  FrameworkVersionDTO,
  CreateFrameworkVersionDTO,
} from '../../../domain/compliance/dtos.js'
import type { FrameworkStatus } from '../../../domain/compliance/types.js'

export class DrizzleComplianceFrameworkRepository implements IComplianceFrameworkRepository {
  async findAll(): Promise<ComplianceFrameworkDTO[]> {
    const rows = await db.select().from(complianceFrameworks)
    return rows.map(this.toDTO)
  }

  async findByName(name: string): Promise<ComplianceFrameworkDTO | null> {
    const [row] = await db
      .select()
      .from(complianceFrameworks)
      .where(eq(complianceFrameworks.name, name))
      .limit(1)
    return row ? this.toDTO(row) : null
  }

  async create(data: CreateComplianceFrameworkDTO): Promise<ComplianceFrameworkDTO> {
    const [row] = await db
      .insert(complianceFrameworks)
      .values({
        name: data.name,
        description: data.description,
      })
      .returning()
    return this.toDTO(row)
  }

  async createVersion(data: CreateFrameworkVersionDTO): Promise<FrameworkVersionDTO> {
    const [row] = await db
      .insert(frameworkVersions)
      .values({
        frameworkId: data.frameworkId,
        versionLabel: data.versionLabel,
        status: data.status ?? 'active',
        publishedAt: data.publishedAt,
      })
      .returning()
    return this.versionToDTO(row)
  }

  async findVersionsByFrameworkId(frameworkId: string): Promise<FrameworkVersionDTO[]> {
    const rows = await db
      .select()
      .from(frameworkVersions)
      .where(eq(frameworkVersions.frameworkId, frameworkId))
      .orderBy(desc(frameworkVersions.createdAt))
    return rows.map(this.versionToDTO)
  }

  async findLatestVersion(frameworkId: string): Promise<FrameworkVersionDTO | null> {
    const [row] = await db
      .select()
      .from(frameworkVersions)
      .where(eq(frameworkVersions.frameworkId, frameworkId))
      .orderBy(desc(frameworkVersions.createdAt))
      .limit(1)
    return row ? this.versionToDTO(row) : null
  }

  private toDTO(row: typeof complianceFrameworks.$inferSelect): ComplianceFrameworkDTO {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
    }
  }

  private versionToDTO(row: typeof frameworkVersions.$inferSelect): FrameworkVersionDTO {
    return {
      id: row.id,
      frameworkId: row.frameworkId,
      versionLabel: row.versionLabel,
      status: row.status as FrameworkStatus,
      publishedAt: row.publishedAt ?? undefined,
      createdAt: row.createdAt,
    }
  }
}
