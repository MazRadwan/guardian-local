/**
 * Integration tests for Tier 1 ISO Seed Script
 *
 * Tests the seed script against the real test database:
 * - Runs without errors on clean DB
 * - Idempotent (safe to re-run)
 * - Creates correct number of frameworks, controls, criteria, mappings
 * - Guardian-native dimensions have zero mappings
 *
 * Story 37.5.1
 */

import { truncateAllTables, closeTestDb } from '../setup/test-db'
import { DrizzleComplianceFrameworkRepository } from '../../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository'
import { DrizzleFrameworkControlRepository } from '../../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository'
import { DrizzleInterpretiveCriteriaRepository } from '../../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository'
import { DrizzleDimensionControlMappingRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository'
import { seedTier1 } from '../../scripts/seed-iso-tier1'
import { ISO_42001_CONTROLS, ISO_23894_CONTROLS } from '../../scripts/data/iso42001-controls'

describe('Seed ISO Tier 1 (Integration)', () => {
  const frameworkRepo = new DrizzleComplianceFrameworkRepository()
  const controlRepo = new DrizzleFrameworkControlRepository()
  const criteriaRepo = new DrizzleInterpretiveCriteriaRepository()
  const mappingRepo = new DrizzleDimensionControlMappingRepository()

  const deps = { frameworkRepo, controlRepo, criteriaRepo, mappingRepo }

  beforeEach(async () => {
    await truncateAllTables()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it('should run seed script without errors on clean DB', async () => {
    await expect(seedTier1(deps)).resolves.not.toThrow()
  })

  it('should be idempotent (run twice, no duplicates)', async () => {
    await seedTier1(deps)
    await seedTier1(deps) // Second run should not throw

    const frameworks = await frameworkRepo.findAll()
    expect(frameworks).toHaveLength(2) // Still only 2
  })

  it('should create exactly 2 compliance frameworks', async () => {
    await seedTier1(deps)

    const frameworks = await frameworkRepo.findAll()
    expect(frameworks).toHaveLength(2)

    const names = frameworks.map((f) => f.name).sort()
    expect(names).toEqual(['ISO/IEC 23894', 'ISO/IEC 42001'])
  })

  it('should create correct number of controls', async () => {
    await seedTier1(deps)

    const iso42001 = await frameworkRepo.findByName('ISO/IEC 42001')
    const iso23894 = await frameworkRepo.findByName('ISO/IEC 23894')
    expect(iso42001).not.toBeNull()
    expect(iso23894).not.toBeNull()

    const version42001 = await frameworkRepo.findLatestVersion(iso42001!.id)
    const version23894 = await frameworkRepo.findLatestVersion(iso23894!.id)
    expect(version42001).not.toBeNull()
    expect(version23894).not.toBeNull()

    const controls42001 = await controlRepo.findByVersionId(version42001!.id)
    const controls23894 = await controlRepo.findByVersionId(version23894!.id)

    expect(controls42001).toHaveLength(ISO_42001_CONTROLS.length)
    expect(controls23894).toHaveLength(ISO_23894_CONTROLS.length)
  })

  it('should have zero mappings for clinical_risk', async () => {
    await seedTier1(deps)

    const mappings = await mappingRepo.findByDimension('clinical_risk')
    expect(mappings).toHaveLength(0)
  })

  it('should have zero mappings for vendor_capability', async () => {
    await seedTier1(deps)

    const mappings = await mappingRepo.findByDimension('vendor_capability')
    expect(mappings).toHaveLength(0)
  })

  it('should have zero mappings for ethical_considerations', async () => {
    await seedTier1(deps)

    const mappings = await mappingRepo.findByDimension('ethical_considerations')
    expect(mappings).toHaveLength(0)
  })

  it('should have zero mappings for sustainability', async () => {
    await seedTier1(deps)

    const mappings = await mappingRepo.findByDimension('sustainability')
    expect(mappings).toHaveLength(0)
  })

  it('should have multiple mappings for regulatory_compliance', async () => {
    await seedTier1(deps)

    const mappings = await mappingRepo.findByDimension('regulatory_compliance')
    expect(mappings.length).toBeGreaterThan(5)
  })

  it('should tag all criteria with version guardian-iso42001-v1.0', async () => {
    await seedTier1(deps)

    const criteria = await criteriaRepo.findApprovedByVersion('guardian-iso42001-v1.0')
    expect(criteria.length).toBeGreaterThan(0)

    // All should have correct version
    expect(criteria.every((c) => c.criteriaVersion === 'guardian-iso42001-v1.0')).toBe(true)
  })

  it('should have all criteria with reviewStatus approved', async () => {
    await seedTier1(deps)

    const criteria = await criteriaRepo.findApprovedByVersion('guardian-iso42001-v1.0')
    expect(criteria.length).toBeGreaterThan(0)

    expect(criteria.every((c) => c.reviewStatus === 'approved')).toBe(true)
  })
})
