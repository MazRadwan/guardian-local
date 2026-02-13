/**
 * Integration test: Seed -> Retrieval Service -> Prompt Builder
 *
 * Sprint 5 exit criteria: verifies the full seed-to-prompt path works
 * end-to-end with real DB data.
 *
 * Flow: seedTier1() -> ISOControlRetrievalService -> buildISOCatalogSection/buildISOApplicabilitySection
 */

import { truncateAllTables, closeTestDb } from '../setup/test-db'
import { DrizzleComplianceFrameworkRepository } from '../../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository'
import { DrizzleFrameworkControlRepository } from '../../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository'
import { DrizzleInterpretiveCriteriaRepository } from '../../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository'
import { DrizzleDimensionControlMappingRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository'
import { seedTier1 } from '../../scripts/seed-iso-tier1'
import { ISOControlRetrievalService } from '../../src/application/services/ISOControlRetrievalService'
import { buildISOCatalogSection, buildISOApplicabilitySection } from '../../src/infrastructure/ai/prompts/scoringPrompt.iso'

describe('ISO Seed-to-Prompt Integration', () => {
  const frameworkRepo = new DrizzleComplianceFrameworkRepository()
  const controlRepo = new DrizzleFrameworkControlRepository()
  const criteriaRepo = new DrizzleInterpretiveCriteriaRepository()
  const mappingRepo = new DrizzleDimensionControlMappingRepository()

  const deps = { frameworkRepo, controlRepo, criteriaRepo, mappingRepo }
  let service: ISOControlRetrievalService

  beforeAll(async () => {
    await truncateAllTables()
    await seedTier1(deps)
    service = new ISOControlRetrievalService(mappingRepo, criteriaRepo)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it('should retrieve full catalog from seeded data', async () => {
    const catalog = await service.getFullCatalog()

    expect(catalog.length).toBeGreaterThan(10)

    // Every control should have criteria text (all approved by seed)
    const withCriteria = catalog.filter((c) => c.criteriaText.length > 0)
    expect(withCriteria.length).toBe(catalog.length)
  })

  it('should build ISO catalog section from seeded data', async () => {
    const catalog = await service.getFullCatalog()
    const section = buildISOCatalogSection(catalog)

    // Verify non-empty
    expect(section.length).toBeGreaterThan(100)

    // Verify structure
    expect(section).toContain('## ISO Standards Reference Catalog')
    expect(section).toContain('### Controls by Domain')
    expect(section).toContain('ISO-traceable')

    // Verify at least some clause refs are present
    expect(section).toContain('A.4.2')
    expect(section).toContain('A.6.2.6')
  })

  it('should retrieve applicable controls for regulatory_compliance', async () => {
    const controls = await service.getApplicableControls(['regulatory_compliance'])

    expect(controls.length).toBeGreaterThan(5)
    // All returned controls should have regulatory_compliance in their dimensions
    const allHaveRegulatory = controls.every((c) =>
      c.dimensions.includes('regulatory_compliance')
    )
    expect(allHaveRegulatory).toBe(true)
  })

  it('should return empty for Guardian-native dimension (clinical_risk)', async () => {
    const controls = await service.getControlsForDimension('clinical_risk')
    expect(controls).toHaveLength(0)
  })

  it('should build applicability section with Guardian-native note', async () => {
    const controls = await service.getApplicableControls(['regulatory_compliance'])
    const section = buildISOApplicabilitySection(controls, [
      'regulatory_compliance',
      'clinical_risk',
    ])

    expect(section).toContain('## Applicable ISO Controls')
    expect(section).toContain('clinical_risk')
    expect(section).toContain('Guardian healthcare-specific criteria')
  })

  it('should dedupe controls when retrieving for multiple overlapping dimensions', async () => {
    const controls = await service.getApplicableControls([
      'regulatory_compliance',
      'security_risk',
      'privacy_risk',
    ])

    // Verify no duplicate clause refs
    const clauseRefs = controls.map((c) => c.clauseRef)
    const uniqueRefs = new Set(clauseRefs)
    expect(clauseRefs.length).toBe(uniqueRefs.size)
  })

  it('should include both ISO 42001 and ISO 23894 controls in full catalog', async () => {
    const catalog = await service.getFullCatalog()

    const iso42001 = catalog.filter((c) => c.framework === 'ISO/IEC 42001')
    const iso23894 = catalog.filter((c) => c.framework === 'ISO/IEC 23894')

    expect(iso42001.length).toBeGreaterThan(0)
    expect(iso23894.length).toBeGreaterThan(0)
  })
})
