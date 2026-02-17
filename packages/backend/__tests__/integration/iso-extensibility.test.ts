/**
 * ISO Extensibility Test (Story 37.7.2 / SC-3)
 *
 * Validates: "Adding a Tier 2 standard requires only DB seeding --
 * zero prompt file changes, zero code changes."
 *
 * Seeds a fake ISO/IEC 22989:2022 (AI Terminology) standard into the
 * compliance tables using existing repository calls, then verifies:
 * - ISOControlRetrievalService discovers the new controls
 * - Prompt builder includes the new framework's controls
 * - Existing Tier 1 data remains unaffected
 */

import { truncateAllTables, closeTestDb } from '../setup/test-db'
import { DrizzleComplianceFrameworkRepository } from '../../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository'
import { DrizzleFrameworkControlRepository } from '../../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository'
import { DrizzleInterpretiveCriteriaRepository } from '../../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository'
import { DrizzleDimensionControlMappingRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository'
import { ISOControlRetrievalService } from '../../src/application/services/ISOControlRetrievalService'
import {
  buildISOCatalogSection,
  buildISOApplicabilitySection,
} from '../../src/infrastructure/ai/prompts/scoringPrompt.iso'

describe('ISO Extensibility Test (SC-3)', () => {
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

  it('should add Tier 2 standard with zero code changes', async () => {
    // 1. Seed Tier 2 standard using existing repositories (DB only)
    const framework = await frameworkRepo.create({
      name: 'ISO/IEC 22989',
      description: 'Artificial intelligence -- Concepts and terminology',
    })

    const version = await frameworkRepo.createVersion({
      frameworkId: framework.id,
      versionLabel: '2022',
    })

    const controls = await controlRepo.createBatch([
      {
        versionId: version.id,
        clauseRef: '3.1.1',
        domain: 'Terminology',
        title: 'AI system definition',
      },
      {
        versionId: version.id,
        clauseRef: '3.2.5',
        domain: 'Terminology',
        title: 'Machine learning model lifecycle',
      },
      {
        versionId: version.id,
        clauseRef: '5.1',
        domain: 'AI concepts',
        title: 'Trustworthiness of AI systems',
      },
    ])

    // Create and approve criteria for each control
    const criteriaVersion = 'guardian-iso22989-v1.0'
    for (const control of controls) {
      const criteria = await criteriaRepo.create({
        controlId: control.id,
        criteriaVersion,
        criteriaText: `Organization demonstrates alignment with ${control.title} as defined by ISO/IEC 22989.`,
      })
      await criteriaRepo.updateReviewStatus(criteria.id, 'approved', 'test-admin')
    }

    // Map controls to dimensions
    await mappingRepo.create({ controlId: controls[0].id, dimension: 'technical_credibility' })
    await mappingRepo.create({ controlId: controls[1].id, dimension: 'technical_credibility' })
    await mappingRepo.create({ controlId: controls[2].id, dimension: 'ai_transparency' })
    await mappingRepo.create({ controlId: controls[2].id, dimension: 'ethical_considerations' })

    // 2. Verify ISOControlRetrievalService finds the new controls
    const service = new ISOControlRetrievalService(
      mappingRepo,
      criteriaRepo,
      criteriaVersion
    )

    const catalog = await service.getFullCatalog()
    expect(catalog.length).toBe(3)

    // Verify clause refs are all present
    const clauseRefs = catalog.map((c) => c.clauseRef).sort()
    expect(clauseRefs).toEqual(['3.1.1', '3.2.5', '5.1'])

    // Verify criteria text was fetched
    const allHaveCriteria = catalog.every((c) => c.criteriaText.length > 0)
    expect(allHaveCriteria).toBe(true)

    // Note: inferFramework() uses clauseRef heuristic (A. = 42001, numeric = 23894).
    // For true Tier 2 support, framework name should come from DB join. See Codex P2.

    // 3. Verify prompt builder includes the new controls
    const section = buildISOCatalogSection(catalog)
    expect(section).toContain('3.1.1')
    expect(section).toContain('AI system definition')
    expect(section).toContain('3.2.5')
    expect(section).toContain('Machine learning model lifecycle')
    expect(section).toContain('5.1')
    expect(section).toContain('Trustworthiness of AI systems')
    expect(section).toContain('ISO Standards Reference Catalog')

    // 4. Verify dimension-specific query works
    const techControls = await service.getControlsForDimension('technical_credibility')
    expect(techControls.length).toBe(2)
    const techRefs = techControls.map((c) => c.clauseRef).sort()
    expect(techRefs).toEqual(['3.1.1', '3.2.5'])

    // 5. Verify multi-dimension controls are deduped
    const multiDimControls = await service.getApplicableControls([
      'ai_transparency',
      'ethical_considerations',
    ])
    // 5.1 maps to both, but should only appear once
    const refs51 = multiDimControls.filter((c) => c.clauseRef === '5.1')
    expect(refs51).toHaveLength(1)
    // And it should have both dimensions listed
    expect(refs51[0].dimensions).toContain('ai_transparency')
    expect(refs51[0].dimensions).toContain('ethical_considerations')

    // 6. Verify applicability section formats correctly
    const appSection = buildISOApplicabilitySection(techControls, [
      'technical_credibility',
    ])
    expect(appSection).toContain('3.1.1')
    expect(appSection).toContain('AI system definition')
  })

  it('should not affect existing Tier 1 when Tier 2 is added', async () => {
    // Seed Tier 1 (ISO/IEC 42001)
    const fw1 = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
    const v1 = await frameworkRepo.createVersion({
      frameworkId: fw1.id,
      versionLabel: '2023',
    })
    const [c1] = await controlRepo.createBatch([
      {
        versionId: v1.id,
        clauseRef: 'A.6.2.6',
        domain: 'Data management',
        title: 'Data quality management for AI systems',
      },
    ])
    const crit1 = await criteriaRepo.create({
      controlId: c1.id,
      criteriaVersion: 'guardian-iso42001-v1.0',
      criteriaText: 'Tier 1 criteria for data quality.',
    })
    await criteriaRepo.updateReviewStatus(crit1.id, 'approved', 'admin')
    await mappingRepo.create({ controlId: c1.id, dimension: 'regulatory_compliance' })

    // Verify Tier 1 is retrievable before adding Tier 2
    const serviceBefore = new ISOControlRetrievalService(mappingRepo, criteriaRepo)
    const catalogBefore = await serviceBefore.getFullCatalog()
    expect(catalogBefore.length).toBe(1)
    expect(catalogBefore[0].clauseRef).toBe('A.6.2.6')

    // Add Tier 2 (ISO/IEC 22989)
    const fw2 = await frameworkRepo.create({ name: 'ISO/IEC 22989' })
    const v2 = await frameworkRepo.createVersion({
      frameworkId: fw2.id,
      versionLabel: '2022',
    })
    const [c2] = await controlRepo.createBatch([
      {
        versionId: v2.id,
        clauseRef: '3.1.1',
        domain: 'Terminology',
        title: 'AI system definition',
      },
    ])
    const crit2 = await criteriaRepo.create({
      controlId: c2.id,
      criteriaVersion: 'guardian-iso42001-v1.0',
      criteriaText: 'Tier 2 criteria for AI terminology.',
    })
    await criteriaRepo.updateReviewStatus(crit2.id, 'approved', 'admin')
    await mappingRepo.create({ controlId: c2.id, dimension: 'technical_credibility' })

    // Verify both tiers present after addition
    const serviceAfter = new ISOControlRetrievalService(mappingRepo, criteriaRepo)
    const catalogAfter = await serviceAfter.getFullCatalog()
    expect(catalogAfter.length).toBe(2)

    const refs = catalogAfter.map((c) => c.clauseRef).sort()
    expect(refs).toEqual(['3.1.1', 'A.6.2.6'])

    // Verify Tier 1 data is unchanged
    const tier1 = catalogAfter.find((c) => c.clauseRef === 'A.6.2.6')!
    expect(tier1.domain).toBe('Data management')
    expect(tier1.title).toBe('Data quality management for AI systems')
    expect(tier1.criteriaText).toBe('Tier 1 criteria for data quality.')

    // Verify dimension-specific queries still work for both tiers
    const regControls = await serviceAfter.getControlsForDimension('regulatory_compliance')
    expect(regControls.some((c) => c.clauseRef === 'A.6.2.6')).toBe(true)

    const techControls = await serviceAfter.getControlsForDimension('technical_credibility')
    expect(techControls.some((c) => c.clauseRef === '3.1.1')).toBe(true)

    // Verify prompt builder includes both tiers
    const section = buildISOCatalogSection(catalogAfter)
    expect(section).toContain('A.6.2.6')
    expect(section).toContain('3.1.1')
    expect(section).toContain('Data management')
    expect(section).toContain('Terminology')
  })

  it('should support multiple controls mapped to the same dimension from different tiers', async () => {
    // Tier 1 control
    const fw1 = await frameworkRepo.create({ name: 'ISO/IEC 42001' })
    const v1 = await frameworkRepo.createVersion({ frameworkId: fw1.id, versionLabel: '2023' })
    const [c1] = await controlRepo.createBatch([
      { versionId: v1.id, clauseRef: 'A.5.4', domain: 'Resources', title: 'AI system inventory' },
    ])
    const crit1 = await criteriaRepo.create({
      controlId: c1.id,
      criteriaVersion: 'guardian-iso42001-v1.0',
      criteriaText: 'Tier 1 inventory criteria.',
    })
    await criteriaRepo.updateReviewStatus(crit1.id, 'approved', 'admin')
    await mappingRepo.create({ controlId: c1.id, dimension: 'operational_excellence' })

    // Tier 2 control mapped to same dimension
    const fw2 = await frameworkRepo.create({ name: 'ISO/IEC 22989' })
    const v2 = await frameworkRepo.createVersion({ frameworkId: fw2.id, versionLabel: '2022' })
    const [c2] = await controlRepo.createBatch([
      { versionId: v2.id, clauseRef: '3.2.5', domain: 'Terminology', title: 'ML model lifecycle' },
    ])
    const crit2 = await criteriaRepo.create({
      controlId: c2.id,
      criteriaVersion: 'guardian-iso42001-v1.0',
      criteriaText: 'Tier 2 lifecycle criteria.',
    })
    await criteriaRepo.updateReviewStatus(crit2.id, 'approved', 'admin')
    await mappingRepo.create({ controlId: c2.id, dimension: 'operational_excellence' })

    // Verify both controls appear for the dimension
    const service = new ISOControlRetrievalService(mappingRepo, criteriaRepo)
    const opsControls = await service.getControlsForDimension('operational_excellence')

    expect(opsControls.length).toBe(2)
    const clauseRefs = opsControls.map((c) => c.clauseRef).sort()
    expect(clauseRefs).toEqual(['3.2.5', 'A.5.4'])
  })
})
