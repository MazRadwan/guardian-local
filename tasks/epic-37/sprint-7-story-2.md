# Story 37.7.2: Extensibility Test (Fake Tier 2 Standard)

## Description

Validate SC-3: "Adding a Tier 2 standard requires only DB seeding -- zero prompt file changes, zero code changes." This test seeds a fake ISO 22989:2022 (Terminology) standard into the compliance tables and verifies that the `ISOControlRetrievalService` picks it up and the prompt builder includes it -- all without modifying any source code.

## Acceptance Criteria

- [ ] Integration test seeds ISO 22989 (fake Tier 2) with only repository calls
- [ ] Zero code file changes -- only DB inserts
- [ ] `ISOControlRetrievalService.getFullCatalog()` returns the new controls alongside existing Tier 1
- [ ] `ISOControlRetrievalService.getControlsForDimension()` returns Tier 2 controls for mapped dimensions
- [ ] `buildISOCatalogSection()` includes the new framework's controls
- [ ] Test cleans up after itself (truncate)

## Technical Approach

**File:** `packages/backend/__tests__/integration/iso-extensibility.test.ts`

```typescript
import { truncateAllTables, closeTestDb } from '../setup/test-db';
import { DrizzleComplianceFrameworkRepository } from '../../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository';
import { DrizzleFrameworkControlRepository } from '../../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository';
import { DrizzleInterpretiveCriteriaRepository } from '../../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository';
import { DrizzleDimensionControlMappingRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository';
import { ISOControlRetrievalService } from '../../src/application/services/ISOControlRetrievalService';
import { buildISOCatalogSection } from '../../src/infrastructure/ai/prompts/scoringPrompt.iso';

describe('ISO Extensibility Test (SC-3)', () => {
  const frameworkRepo = new DrizzleComplianceFrameworkRepository();
  const controlRepo = new DrizzleFrameworkControlRepository();
  const criteriaRepo = new DrizzleInterpretiveCriteriaRepository();
  const mappingRepo = new DrizzleDimensionControlMappingRepository();

  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('should add Tier 2 standard with zero code changes', async () => {
    // 1. Seed Tier 2 standard (DB only, no code changes)
    const framework = await frameworkRepo.create({
      name: 'ISO/IEC 22989',
      description: 'AI terminology',
    });
    const version = await frameworkRepo.createVersion({
      frameworkId: framework.id,
      versionLabel: '2022',
    });
    const control = (await controlRepo.createBatch([
      {
        versionId: version.id,
        clauseRef: '3.1.1',
        domain: 'Terminology',
        title: 'AI system definition',
      },
    ]))[0];

    // Create approved criteria (same criteria version for simplicity)
    await criteriaRepo.create({
      controlId: control.id,
      criteriaVersion: 'guardian-iso22989-v1.0',
      criteriaText: 'Organization uses consistent AI terminology aligned with international standards.',
      reviewStatus: 'approved',
    });

    // Map to dimension
    await mappingRepo.create({
      controlId: control.id,
      dimension: 'technical_credibility',
    });

    // 2. Verify retrieval service finds the new controls
    const service = new ISOControlRetrievalService(
      mappingRepo,
      criteriaRepo,
      'guardian-iso22989-v1.0'
    );

    const catalog = await service.getFullCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.some(c => c.clauseRef === '3.1.1')).toBe(true);
    expect(catalog.some(c => c.framework === 'ISO/IEC 23894')).toBe(true);

    // 3. Verify prompt builder includes the new controls
    const section = buildISOCatalogSection(catalog);
    expect(section).toContain('3.1.1');
    expect(section).toContain('AI system definition');

    // 4. Verify dimension-specific query
    const techControls = await service.getControlsForDimension('technical_credibility');
    expect(techControls.some(c => c.clauseRef === '3.1.1')).toBe(true);
  });

  it('should not affect existing Tier 1 when Tier 2 is added', async () => {
    // Seed Tier 1 first
    const fw1 = await frameworkRepo.create({ name: 'ISO/IEC 42001' });
    const v1 = await frameworkRepo.createVersion({ frameworkId: fw1.id, versionLabel: '2023' });
    const c1 = (await controlRepo.createBatch([
      { versionId: v1.id, clauseRef: 'A.6.2.6', domain: 'Data', title: 'Data quality' },
    ]))[0];
    await criteriaRepo.create({
      controlId: c1.id,
      criteriaVersion: 'guardian-iso42001-v1.0',
      criteriaText: 'Test criteria',
      reviewStatus: 'approved',
    });
    await mappingRepo.create({ controlId: c1.id, dimension: 'regulatory_compliance' });

    // Add Tier 2
    const fw2 = await frameworkRepo.create({ name: 'ISO/IEC 22989' });
    const v2 = await frameworkRepo.createVersion({ frameworkId: fw2.id, versionLabel: '2022' });
    const c2 = (await controlRepo.createBatch([
      { versionId: v2.id, clauseRef: '3.1.1', domain: 'Terminology', title: 'AI definition' },
    ]))[0];
    await criteriaRepo.create({
      controlId: c2.id,
      criteriaVersion: 'guardian-iso42001-v1.0',
      criteriaText: 'Tier 2 criteria',
      reviewStatus: 'approved',
    });
    await mappingRepo.create({ controlId: c2.id, dimension: 'regulatory_compliance' });

    // Verify both tiers present
    const service = new ISOControlRetrievalService(mappingRepo, criteriaRepo);
    const allControls = await service.getFullCatalog();
    expect(allControls.some(c => c.clauseRef === 'A.6.2.6')).toBe(true);
    expect(allControls.some(c => c.clauseRef === '3.1.1')).toBe(true);
  });
});
```

## Files Touched

- `packages/backend/__tests__/integration/iso-extensibility.test.ts` - CREATE (~120+ LOC)

## Tests Affected

- None (new test file)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story. Tests described above.

## Definition of Done

- [ ] Extensibility test passes
- [ ] Zero code changes required to add Tier 2
- [ ] Service and prompt builder automatically include new standard
- [ ] Existing Tier 1 data unaffected
- [ ] `pnpm test:integration` passes
