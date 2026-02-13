/**
 * Tier 1 ISO Seed Script
 *
 * Seeds ISO 42001:2023 and ISO 23894:2023 compliance data.
 * IDEMPOTENT: safe to run multiple times without creating duplicates.
 *
 * Usage: npx tsx packages/backend/scripts/seed-iso-tier1.ts
 *
 * Creates:
 * - 2 compliance frameworks (ISO/IEC 42001, ISO/IEC 23894)
 * - 1 version per framework ("2023")
 * - ~44 controls (38 from 42001 + 6 from 23894)
 * - Interpretive criteria for each control (reviewStatus: 'approved')
 * - Dimension-control mappings (Guardian-native dimensions excluded)
 */

import { config } from 'dotenv'
config()

import { DrizzleComplianceFrameworkRepository } from '../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository.js'
import { DrizzleFrameworkControlRepository } from '../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository.js'
import { DrizzleInterpretiveCriteriaRepository } from '../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository.js'
import { DrizzleDimensionControlMappingRepository } from '../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository.js'
import { ISO_42001_CONTROLS, ISO_23894_CONTROLS, type SeedControl } from './data/iso42001-controls.js'
import type { RiskDimension } from '../src/domain/types/QuestionnaireSchema.js'

const CRITERIA_VERSION = 'guardian-iso42001-v1.0'

interface SeedDeps {
  frameworkRepo: DrizzleComplianceFrameworkRepository
  controlRepo: DrizzleFrameworkControlRepository
  criteriaRepo: DrizzleInterpretiveCriteriaRepository
  mappingRepo: DrizzleDimensionControlMappingRepository
}

async function ensureFrameworkAndVersion(
  deps: SeedDeps,
  name: string,
  description: string
): Promise<string> {
  let framework = await deps.frameworkRepo.findByName(name)
  if (!framework) {
    framework = await deps.frameworkRepo.create({ name, description })
    console.log(`  Created framework: ${name} (${framework.id})`)
  } else {
    console.log(`  Found existing framework: ${name} (${framework.id})`)
  }

  const versions = await deps.frameworkRepo.findVersionsByFrameworkId(framework.id)
  const existing2023 = versions.find((v) => v.versionLabel === '2023')
  if (existing2023) {
    console.log(`  Found existing version: 2023 (${existing2023.id})`)
    return existing2023.id
  }

  const version = await deps.frameworkRepo.createVersion({
    frameworkId: framework.id,
    versionLabel: '2023',
    status: 'active',
    publishedAt: new Date('2023-12-01'),
  })
  console.log(`  Created version: 2023 (${version.id})`)
  return version.id
}

async function seedControls(
  deps: SeedDeps,
  versionId: string,
  controls: SeedControl[]
): Promise<Map<string, string>> {
  const clauseToId = new Map<string, string>()

  for (const ctrl of controls) {
    const existing = await deps.controlRepo.findByClauseRef(versionId, ctrl.clauseRef)
    if (existing) {
      clauseToId.set(ctrl.clauseRef, existing.id)
      continue
    }
    const created = await deps.controlRepo.create({
      versionId,
      clauseRef: ctrl.clauseRef,
      domain: ctrl.domain,
      title: ctrl.title,
    })
    clauseToId.set(ctrl.clauseRef, created.id)
  }

  return clauseToId
}

async function seedCriteriaAndMappings(
  deps: SeedDeps,
  controls: SeedControl[],
  clauseToId: Map<string, string>
): Promise<{ criteriaCount: number; mappingCount: number }> {
  let criteriaCount = 0
  let mappingCount = 0

  // Check ALL criteria (any review status) to avoid unique constraint violations on re-runs
  const allControlIds = [...clauseToId.values()]
  const existingCriteriaControlIds = new Set<string>()
  for (const controlId of allControlIds) {
    const criteria = await deps.criteriaRepo.findByControlId(controlId)
    if (criteria.some((c) => c.criteriaVersion === CRITERIA_VERSION)) {
      existingCriteriaControlIds.add(controlId)
    }
  }

  const existingMappings = await deps.mappingRepo.findAllMappings()
  const existingMappingKeys = new Set(
    existingMappings.map((m) => `${m.controlId}:${m.dimension}`)
  )

  for (const ctrl of controls) {
    const controlId = clauseToId.get(ctrl.clauseRef)
    if (!controlId) continue

    // Seed interpretive criteria (idempotent)
    if (!existingCriteriaControlIds.has(controlId)) {
      const created = await deps.criteriaRepo.create({
        controlId,
        criteriaVersion: CRITERIA_VERSION,
        criteriaText: ctrl.criteria,
        assessmentGuidance: ctrl.guidance,
      })
      // Approve the criteria (seed data is curated)
      await deps.criteriaRepo.updateReviewStatus(created.id, 'approved', 'seed-script')
      criteriaCount++
    }

    // Seed dimension mappings (idempotent)
    for (const dim of ctrl.dimensions) {
      const key = `${controlId}:${dim}`
      if (!existingMappingKeys.has(key)) {
        await deps.mappingRepo.create({
          controlId,
          dimension: dim as RiskDimension,
          relevanceWeight: ctrl.relevanceWeight ?? 1.0,
        })
        mappingCount++
        existingMappingKeys.add(key)
      }
    }
  }

  return { criteriaCount, mappingCount }
}

export async function seedTier1(deps?: SeedDeps): Promise<void> {
  const d: SeedDeps = deps ?? {
    frameworkRepo: new DrizzleComplianceFrameworkRepository(),
    controlRepo: new DrizzleFrameworkControlRepository(),
    criteriaRepo: new DrizzleInterpretiveCriteriaRepository(),
    mappingRepo: new DrizzleDimensionControlMappingRepository(),
  }

  console.log('[Seed] Starting Tier 1 ISO seed...')

  // 1. Frameworks + versions
  console.log('[Seed] Ensuring frameworks...')
  const iso42001VersionId = await ensureFrameworkAndVersion(
    d,
    'ISO/IEC 42001',
    'Artificial intelligence management system (AIMS)'
  )
  const iso23894VersionId = await ensureFrameworkAndVersion(
    d,
    'ISO/IEC 23894',
    'AI risk management guidance'
  )

  // 2. Controls
  console.log('[Seed] Seeding ISO 42001 controls...')
  const map42001 = await seedControls(d, iso42001VersionId, ISO_42001_CONTROLS)
  console.log(`  ${map42001.size} ISO 42001 controls`)

  console.log('[Seed] Seeding ISO 23894 controls...')
  const map23894 = await seedControls(d, iso23894VersionId, ISO_23894_CONTROLS)
  console.log(`  ${map23894.size} ISO 23894 controls`)

  // 3. Criteria + mappings
  console.log('[Seed] Seeding criteria and mappings...')
  const r1 = await seedCriteriaAndMappings(d, ISO_42001_CONTROLS, map42001)
  const r2 = await seedCriteriaAndMappings(d, ISO_23894_CONTROLS, map23894)

  console.log(`[Seed] Complete.`)
  console.log(`  Frameworks: 2`)
  console.log(`  Controls: ${map42001.size + map23894.size}`)
  console.log(`  Criteria created: ${r1.criteriaCount + r2.criteriaCount}`)
  console.log(`  Mappings created: ${r1.mappingCount + r2.mappingCount}`)
  console.log(`  Criteria version: ${CRITERIA_VERSION}`)
}

// Run directly
const isDirectRun = process.argv[1]?.includes('seed-iso-tier1')
if (isDirectRun) {
  seedTier1()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Error:', err)
      process.exit(1)
    })
}
