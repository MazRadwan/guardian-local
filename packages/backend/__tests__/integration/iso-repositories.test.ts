/**
 * Integration tests for ISO Compliance Repositories
 *
 * Tests all 4 repository implementations against the real test database:
 * - DrizzleComplianceFrameworkRepository (frameworks + versions)
 * - DrizzleFrameworkControlRepository (controls)
 * - DrizzleInterpretiveCriteriaRepository (criteria + approval workflow)
 * - DrizzleDimensionControlMappingRepository (mappings + joins)
 *
 * Story 37.4.5
 */

import { truncateAllTables, closeTestDb, testDb } from '../setup/test-db'
import { DrizzleComplianceFrameworkRepository } from '../../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository'
import { DrizzleFrameworkControlRepository } from '../../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository'
import { DrizzleInterpretiveCriteriaRepository } from '../../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository'
import { DrizzleDimensionControlMappingRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository'
import { complianceFrameworks } from '../../src/infrastructure/database/schema/complianceFrameworks'
import { sql } from 'drizzle-orm'

describe('ISO Compliance Repositories (Integration)', () => {
  const frameworkRepo = new DrizzleComplianceFrameworkRepository()
  const controlRepo = new DrizzleFrameworkControlRepository()
  const criteriaRepo = new DrizzleInterpretiveCriteriaRepository()
  const mappingRepo = new DrizzleDimensionControlMappingRepository()

  beforeEach(async () => {
    await truncateAllTables()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  // ─── Group 1: ComplianceFramework + Version CRUD ─────────────────────

  describe('ComplianceFrameworkRepository', () => {
    it('should create a framework and return a DTO', async () => {
      const framework = await frameworkRepo.create({
        name: 'ISO/IEC 42001',
        description: 'AI management system standard',
      })

      expect(framework.id).toBeDefined()
      expect(framework.name).toBe('ISO/IEC 42001')
      expect(framework.description).toBe('AI management system standard')
      expect(framework.createdAt).toBeInstanceOf(Date)
    })

    it('should create a framework without description', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 23894' })

      expect(framework.name).toBe('ISO/IEC 23894')
      expect(framework.description).toBeUndefined()
    })

    it('should find all frameworks', async () => {
      await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      await frameworkRepo.create({ name: 'ISO/IEC 23894' })

      const all = await frameworkRepo.findAll()

      expect(all).toHaveLength(2)
      const names = all.map((f) => f.name).sort()
      expect(names).toEqual(['ISO/IEC 23894', 'ISO/IEC 42001'])
    })

    it('should find framework by name', async () => {
      await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      const found = await frameworkRepo.findByName('ISO/IEC 42001')

      expect(found).not.toBeNull()
      expect(found!.name).toBe('ISO/IEC 42001')
    })

    it('should return null for non-existent name', async () => {
      const found = await frameworkRepo.findByName('Non-Existent')
      expect(found).toBeNull()
    })

    it('should create a version for a framework', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
        status: 'active',
        publishedAt: new Date('2023-12-01'),
      })

      expect(version.id).toBeDefined()
      expect(version.frameworkId).toBe(framework.id)
      expect(version.versionLabel).toBe('2023')
      expect(version.status).toBe('active')
      expect(version.publishedAt).toEqual(new Date('2023-12-01'))
      expect(version.createdAt).toBeInstanceOf(Date)
    })

    it('should default version status to active', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })

      expect(version.status).toBe('active')
    })

    it('should find versions by framework ID ordered by createdAt desc', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      const v1 = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2022',
      })
      // Small delay to ensure different createdAt
      await new Promise((resolve) => setTimeout(resolve, 10))
      const v2 = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })

      const versions = await frameworkRepo.findVersionsByFrameworkId(framework.id)

      expect(versions).toHaveLength(2)
      // Most recent first
      expect(versions[0].versionLabel).toBe('2023')
      expect(versions[1].versionLabel).toBe('2022')
    })

    it('should find latest version for a framework', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2022',
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })

      const latest = await frameworkRepo.findLatestVersion(framework.id)

      expect(latest).not.toBeNull()
      expect(latest!.versionLabel).toBe('2023')
    })

    it('should return null for latest version when no versions exist', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      const latest = await frameworkRepo.findLatestVersion(framework.id)

      expect(latest).toBeNull()
    })
  })

  // ─── Group 2: FrameworkControl CRUD + Batch ───────────────────────────

  describe('FrameworkControlRepository', () => {
    let versionId: string

    beforeEach(async () => {
      // Set up prerequisite: framework + version
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })
      versionId = version.id
    })

    it('should create a single control', async () => {
      const control = await controlRepo.create({
        versionId,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality management for AI systems',
      })

      expect(control.id).toBeDefined()
      expect(control.versionId).toBe(versionId)
      expect(control.clauseRef).toBe('A.6.2.6')
      expect(control.domain).toBe('Data management')
      expect(control.title).toBe('Data quality management for AI systems')
      expect(control.createdAt).toBeInstanceOf(Date)
    })

    it('should create a batch of controls', async () => {
      const controls = await controlRepo.createBatch([
        { versionId, clauseRef: 'A.6.2.6', domain: 'Data management', title: 'Data quality' },
        { versionId, clauseRef: '6.3', domain: 'Risk management', title: 'Risk assessment' },
        { versionId, clauseRef: 'A.5.4', domain: 'Resources', title: 'AI system inventory' },
      ])

      expect(controls).toHaveLength(3)
      const refs = controls.map((c) => c.clauseRef).sort()
      expect(refs).toEqual(['6.3', 'A.5.4', 'A.6.2.6'])
    })

    it('should return empty array for empty batch', async () => {
      const controls = await controlRepo.createBatch([])
      expect(controls).toEqual([])
    })

    it('should find controls by version ID', async () => {
      await controlRepo.createBatch([
        { versionId, clauseRef: 'A.6.2.6', domain: 'Data management', title: 'Data quality' },
        { versionId, clauseRef: '6.3', domain: 'Risk management', title: 'Risk assessment' },
      ])

      const found = await controlRepo.findByVersionId(versionId)

      expect(found).toHaveLength(2)
    })

    it('should return empty array for non-existent version', async () => {
      const found = await controlRepo.findByVersionId('00000000-0000-0000-0000-000000000000')
      expect(found).toEqual([])
    })

    it('should find control by clause ref', async () => {
      await controlRepo.create({
        versionId,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality management for AI systems',
      })

      const found = await controlRepo.findByClauseRef(versionId, 'A.6.2.6')

      expect(found).not.toBeNull()
      expect(found!.clauseRef).toBe('A.6.2.6')
      expect(found!.title).toBe('Data quality management for AI systems')
    })

    it('should return null for non-existent clause ref', async () => {
      const found = await controlRepo.findByClauseRef(versionId, 'X.99.99')
      expect(found).toBeNull()
    })
  })

  // ─── Group 3: InterpretiveCriteria CRUD + Approval Workflow ───────────

  describe('InterpretiveCriteriaRepository', () => {
    let controlId: string

    beforeEach(async () => {
      // Set up prerequisite: framework + version + control
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })
      const control = await controlRepo.create({
        versionId: version.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality management for AI systems',
      })
      controlId = control.id
    })

    it('should create criteria with default draft status', async () => {
      const criteria = await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Vendor must demonstrate data quality processes',
        assessmentGuidance: 'Look for documented data governance procedures',
      })

      expect(criteria.id).toBeDefined()
      expect(criteria.controlId).toBe(controlId)
      expect(criteria.criteriaVersion).toBe('guardian-iso42001-v1.0')
      expect(criteria.criteriaText).toBe('Vendor must demonstrate data quality processes')
      expect(criteria.assessmentGuidance).toBe('Look for documented data governance procedures')
      expect(criteria.reviewStatus).toBe('draft')
      expect(criteria.approvedAt).toBeUndefined()
      expect(criteria.approvedBy).toBeUndefined()
      expect(criteria.createdAt).toBeInstanceOf(Date)
    })

    it('should create criteria without assessment guidance', async () => {
      const criteria = await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Basic criteria text',
      })

      expect(criteria.assessmentGuidance).toBeUndefined()
    })

    it('should batch create criteria', async () => {
      const batch = await criteriaRepo.createBatch([
        {
          controlId,
          criteriaVersion: 'guardian-iso42001-v1.0',
          criteriaText: 'First criterion',
        },
        {
          controlId,
          criteriaVersion: 'guardian-iso42001-v1.1',
          criteriaText: 'Second criterion',
        },
      ])

      expect(batch).toHaveLength(2)
      expect(batch.every((c) => c.reviewStatus === 'draft')).toBe(true)
    })

    it('should return empty array for empty batch', async () => {
      const batch = await criteriaRepo.createBatch([])
      expect(batch).toEqual([])
    })

    it('should find criteria by control ID', async () => {
      await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Test criteria',
      })

      const found = await criteriaRepo.findByControlId(controlId)

      expect(found).toHaveLength(1)
      expect(found[0].controlId).toBe(controlId)
    })

    it('should return empty when finding approved criteria and all are draft', async () => {
      await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Draft criteria',
      })

      const approved = await criteriaRepo.findApprovedByVersion('guardian-iso42001-v1.0')

      expect(approved).toHaveLength(0)
    })

    it('should update review status to approved', async () => {
      const criteria = await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Criteria to approve',
      })

      await criteriaRepo.updateReviewStatus(criteria.id, 'approved', 'admin-user')

      const found = await criteriaRepo.findByControlId(controlId)
      const updated = found.find((c) => c.id === criteria.id)!

      expect(updated.reviewStatus).toBe('approved')
      expect(updated.approvedBy).toBe('admin-user')
      expect(updated.approvedAt).toBeInstanceOf(Date)
    })

    it('should find approved criteria by version after approval', async () => {
      const criteria = await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Approved criteria',
      })

      await criteriaRepo.updateReviewStatus(criteria.id, 'approved', 'admin-user')

      const approved = await criteriaRepo.findApprovedByVersion('guardian-iso42001-v1.0')

      expect(approved).toHaveLength(1)
      expect(approved[0].reviewStatus).toBe('approved')
      expect(approved[0].criteriaText).toBe('Approved criteria')
    })

    it('should update review status to deprecated', async () => {
      const criteria = await criteriaRepo.create({
        controlId,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Old criteria',
      })

      await criteriaRepo.updateReviewStatus(criteria.id, 'deprecated')

      const found = await criteriaRepo.findByControlId(controlId)
      const updated = found.find((c) => c.id === criteria.id)!

      expect(updated.reviewStatus).toBe('deprecated')
    })
  })

  // ─── Group 4: DimensionControlMapping CRUD + Join Queries ─────────────

  describe('DimensionControlMappingRepository', () => {
    let controlId1: string
    let controlId2: string

    beforeEach(async () => {
      // Set up prerequisite chain: framework -> version -> controls
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })
      const control1 = await controlRepo.create({
        versionId: version.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality management for AI systems',
      })
      const control2 = await controlRepo.create({
        versionId: version.id,
        clauseRef: '6.3',
        domain: 'Risk management',
        title: 'Risk assessment',
      })
      controlId1 = control1.id
      controlId2 = control2.id
    })

    it('should create a mapping with default weight', async () => {
      const mapping = await mappingRepo.create({
        controlId: controlId1,
        dimension: 'regulatory_compliance',
      })

      expect(mapping.id).toBeDefined()
      expect(mapping.controlId).toBe(controlId1)
      expect(mapping.dimension).toBe('regulatory_compliance')
      expect(mapping.relevanceWeight).toBe(1.0)
      expect(mapping.createdAt).toBeInstanceOf(Date)
    })

    it('should create a mapping with custom weight', async () => {
      const mapping = await mappingRepo.create({
        controlId: controlId1,
        dimension: 'privacy_risk',
        relevanceWeight: 0.7,
      })

      expect(mapping.relevanceWeight).toBeCloseTo(0.7)
    })

    it('should batch create mappings', async () => {
      const mappings = await mappingRepo.createBatch([
        { controlId: controlId1, dimension: 'regulatory_compliance' },
        { controlId: controlId1, dimension: 'privacy_risk', relevanceWeight: 0.8 },
        { controlId: controlId2, dimension: 'security_risk' },
      ])

      expect(mappings).toHaveLength(3)
    })

    it('should return empty array for empty batch', async () => {
      const mappings = await mappingRepo.createBatch([])
      expect(mappings).toEqual([])
    })

    it('should find mappings by dimension with joined control details', async () => {
      await mappingRepo.create({
        controlId: controlId1,
        dimension: 'regulatory_compliance',
      })
      await mappingRepo.create({
        controlId: controlId2,
        dimension: 'regulatory_compliance',
      })

      const found = await mappingRepo.findByDimension('regulatory_compliance')

      expect(found).toHaveLength(2)

      // Verify control details are included in the join
      const clauseRefs = found.map((m) => m.control.clauseRef).sort()
      expect(clauseRefs).toEqual(['6.3', 'A.6.2.6'])

      // Verify control DTO shape
      const first = found.find((m) => m.control.clauseRef === 'A.6.2.6')!
      expect(first.control.domain).toBe('Data management')
      expect(first.control.title).toBe('Data quality management for AI systems')
      expect(first.control.id).toBeDefined()
      expect(first.control.versionId).toBeDefined()
      expect(first.control.createdAt).toBeInstanceOf(Date)
    })

    it('should return empty array for non-existent dimension', async () => {
      const found = await mappingRepo.findByDimension('clinical_risk')
      expect(found).toEqual([])
    })

    it('should find all mappings with joined control details', async () => {
      await mappingRepo.create({
        controlId: controlId1,
        dimension: 'regulatory_compliance',
      })
      await mappingRepo.create({
        controlId: controlId2,
        dimension: 'security_risk',
      })

      const all = await mappingRepo.findAllMappings()

      expect(all).toHaveLength(2)
      // Verify each mapping has control details
      all.forEach((m) => {
        expect(m.control).toBeDefined()
        expect(m.control.clauseRef).toBeDefined()
        expect(m.control.title).toBeDefined()
      })
    })
  })

  // ─── Group 5: Cascade Delete Verification ─────────────────────────────

  describe('Cascade Deletes', () => {
    it('should cascade delete from framework through versions, controls, criteria, and mappings', async () => {
      // Build the full chain
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })
      const control = await controlRepo.create({
        versionId: version.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality',
      })
      await criteriaRepo.create({
        controlId: control.id,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'Test criteria',
      })
      await mappingRepo.create({
        controlId: control.id,
        dimension: 'regulatory_compliance',
      })

      // Delete the framework (should cascade)
      await testDb
        .delete(complianceFrameworks)
        .where(sql`id = ${framework.id}`)

      // Verify everything is gone
      const versions = await frameworkRepo.findVersionsByFrameworkId(framework.id)
      expect(versions).toHaveLength(0)

      const controls = await controlRepo.findByVersionId(version.id)
      expect(controls).toHaveLength(0)

      const criteria = await criteriaRepo.findByControlId(control.id)
      expect(criteria).toHaveLength(0)

      const mappings = await mappingRepo.findByDimension('regulatory_compliance')
      expect(mappings).toHaveLength(0)
    })
  })

  // ─── Group 6: Unique Constraint Enforcement ───────────────────────────

  describe('Unique Constraints', () => {
    it('should reject duplicate framework name', async () => {
      await frameworkRepo.create({ name: 'ISO/IEC 42001' })

      await expect(
        frameworkRepo.create({ name: 'ISO/IEC 42001' })
      ).rejects.toThrow()
    })

    it('should reject duplicate (version_id, clause_ref) for controls', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })

      await controlRepo.create({
        versionId: version.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality',
      })

      await expect(
        controlRepo.create({
          versionId: version.id,
          clauseRef: 'A.6.2.6',
          domain: 'Different domain',
          title: 'Different title',
        })
      ).rejects.toThrow()
    })

    it('should reject duplicate (control_id, criteria_version) for criteria', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })
      const control = await controlRepo.create({
        versionId: version.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality',
      })

      await criteriaRepo.create({
        controlId: control.id,
        criteriaVersion: 'guardian-iso42001-v1.0',
        criteriaText: 'First criteria text',
      })

      await expect(
        criteriaRepo.create({
          controlId: control.id,
          criteriaVersion: 'guardian-iso42001-v1.0',
          criteriaText: 'Different text, same version',
        })
      ).rejects.toThrow()
    })

    it('should reject duplicate (control_id, dimension) for mappings', async () => {
      const framework = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
      const version = await frameworkRepo.createVersion({
        frameworkId: framework.id,
        versionLabel: '2023',
      })
      const control = await controlRepo.create({
        versionId: version.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality',
      })

      await mappingRepo.create({
        controlId: control.id,
        dimension: 'regulatory_compliance',
      })

      await expect(
        mappingRepo.create({
          controlId: control.id,
          dimension: 'regulatory_compliance',
        })
      ).rejects.toThrow()
    })
  })
})
