/**
 * IComplianceFrameworkRepository
 *
 * Repository interface for compliance_frameworks and framework_versions tables.
 * Combined because versions always belong to a framework.
 */

import type {
  ComplianceFrameworkDTO,
  CreateComplianceFrameworkDTO,
  FrameworkVersionDTO,
  CreateFrameworkVersionDTO,
} from '../../domain/compliance/dtos.js'

export interface IComplianceFrameworkRepository {
  findAll(): Promise<ComplianceFrameworkDTO[]>
  findByName(name: string): Promise<ComplianceFrameworkDTO | null>
  create(data: CreateComplianceFrameworkDTO): Promise<ComplianceFrameworkDTO>

  // Version operations
  createVersion(data: CreateFrameworkVersionDTO): Promise<FrameworkVersionDTO>
  findVersionsByFrameworkId(frameworkId: string): Promise<FrameworkVersionDTO[]>
  findLatestVersion(frameworkId: string): Promise<FrameworkVersionDTO | null>
}
