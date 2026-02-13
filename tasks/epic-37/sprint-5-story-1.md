# Story 37.5.1: Create Tier 1 Seed Script (ISO 42001 + 23894)

## Description

Create a seed script that populates the ISO compliance tables with Tier 1 data: ISO 42001:2023 (38 Annex A controls, 9 domains) and ISO 23894:2023 (supplementary risk management guidance). The script creates frameworks, versions, controls, interpretive criteria (Guardian's own language), and dimension-to-control mappings.

Per the PRD, interpretive criteria are written in Guardian's own language referencing ISO clause numbers (not verbatim ISO text). Criteria are seeded with `reviewStatus: 'draft'` to be approved via human review workflow.

## Acceptance Criteria

- [ ] Seed script created at `packages/backend/scripts/seed-iso-tier1.ts`
- [ ] Script is idempotent (can be run multiple times without duplicates)
- [ ] Creates 2 compliance frameworks: "ISO/IEC 42001" and "ISO/IEC 23894"
- [ ] Creates version entries: "2023" for each
- [ ] Creates ~38 controls for ISO 42001 (Annex A) + supplementary controls from 23894
- [ ] Creates interpretive criteria for each control (Guardian's language, `reviewStatus: 'draft'`)
- [ ] Creates dimension-control mappings (~30 controls mapped to dimensions)
- [ ] `clinical_risk` and `vendor_capability` have ZERO mappings (Guardian-native dimensions)
- [ ] Criteria version tagged as `guardian-iso42001-v1.0`
- [ ] Script can be run via `npx tsx packages/backend/scripts/seed-iso-tier1.ts`
- [ ] Under 300 LOC (data in separate constant file if needed)

## Technical Approach

### 1. Create Data Constants File

**File:** `packages/backend/scripts/data/iso42001-controls.ts`

Contains the raw control data as TypeScript constants. Example structure:

```typescript
export interface SeedControl {
  clauseRef: string;
  domain: string;
  title: string;
  criteria: string;           // Guardian's interpretive criteria
  guidance: string;           // Assessment guidance
  dimensions: string[];       // Which Guardian dimensions this maps to
  relevanceWeight?: number;   // Default 1.0
}

export const ISO_42001_CONTROLS: SeedControl[] = [
  {
    clauseRef: 'A.4.2',
    domain: 'Context of the organization',
    title: 'AI policy',
    criteria: 'Organization has established and maintains an AI policy aligned with business objectives and regulatory requirements.',
    guidance: 'Look for documented AI governance policy, executive endorsement, and regular review cadence.',
    dimensions: ['data_governance'],
    relevanceWeight: 0.8,
  },
  {
    clauseRef: 'A.6.2.6',
    domain: 'Data management',
    title: 'Data quality management for AI systems',
    criteria: 'Organization implements systematic processes for ensuring AI training and operational data meets quality, completeness, and representativeness standards.',
    guidance: 'Evaluate data quality processes, bias testing, data lineage documentation.',
    dimensions: ['data_governance', 'technical_credibility'],
  },
  // ... 36 more controls
];

export const ISO_23894_CONTROLS: SeedControl[] = [
  {
    clauseRef: '6.3',
    domain: 'Risk management',
    title: 'Risk treatment for AI systems',
    criteria: 'Organization applies systematic risk treatment processes specific to AI systems, including residual risk assessment and risk acceptance criteria.',
    guidance: 'Evaluate risk register, treatment plans, acceptance criteria, monitoring processes.',
    dimensions: ['data_governance', 'operational_excellence'],
  },
  // ... supplementary controls
];
```

### 2. Create Seed Script

**File:** `packages/backend/scripts/seed-iso-tier1.ts`

```typescript
import { DrizzleComplianceFrameworkRepository } from '../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository.js';
import { DrizzleFrameworkControlRepository } from '../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository.js';
import { DrizzleInterpretiveCriteriaRepository } from '../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository.js';
import { DrizzleDimensionControlMappingRepository } from '../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository.js';
import { ISO_42001_CONTROLS, ISO_23894_CONTROLS } from './data/iso42001-controls.js';

const CRITERIA_VERSION = 'guardian-iso42001-v1.0';

async function seedTier1() {
  const frameworkRepo = new DrizzleComplianceFrameworkRepository();
  const controlRepo = new DrizzleFrameworkControlRepository();
  const criteriaRepo = new DrizzleInterpretiveCriteriaRepository();
  const mappingRepo = new DrizzleDimensionControlMappingRepository();

  // 1. Create or find frameworks (idempotent)
  let iso42001 = await frameworkRepo.findByName('ISO/IEC 42001');
  if (!iso42001) {
    iso42001 = await frameworkRepo.create({
      name: 'ISO/IEC 42001',
      description: 'Artificial intelligence management system (AIMS)',
    });
  }

  // 2. Create version (idempotent check)
  // ... similar pattern

  // 3. Create controls in batch
  // 4. Create interpretive criteria (reviewStatus: 'draft')
  // 5. Create dimension mappings

  console.log('Tier 1 seed complete.');
}

seedTier1().catch(console.error);
```

### 3. Key Rules

- **Idempotent**: Check `findByName` before creating frameworks. Check `findByClauseRef` before creating controls. Skip if already exists.
- **Guardian-native dimensions**: `clinical_risk` and `vendor_capability` must have ZERO dimension-control mappings. These get "Guardian healthcare-specific criteria" label.
- **Criteria are DRAFT**: All criteria start as `reviewStatus: 'draft'`. Human review approves them before production use.
- **Copyright compliance**: Criteria text is written in Guardian's language, referencing clause numbers but NOT reproducing ISO verbatim text.

## Files Touched

- `packages/backend/scripts/seed-iso-tier1.ts` - CREATE (~150 LOC)
- `packages/backend/scripts/data/iso42001-controls.ts` - CREATE (~300+ LOC, data file exempt from limit)

## Tests Affected

- None (script, not production code)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/integration/seed-iso-tier1.test.ts`
  - Test seed script runs without errors on clean DB
  - Test idempotency: run twice, verify no duplicates
  - Test correct number of frameworks created (2)
  - Test correct number of controls created (~38 + supplementary)
  - Test clinical_risk has zero mappings
  - Test vendor_capability has zero mappings
  - Test data_governance has multiple mappings
  - Test criteria version is `guardian-iso42001-v1.0`
  - Test all criteria have `reviewStatus: 'draft'`

## Definition of Done

- [ ] Seed script created and runs successfully
- [ ] Idempotent (safe to re-run)
- [ ] Tier 1 data loaded correctly
- [ ] Guardian-native dimensions have no ISO mappings
- [ ] Integration tests pass
- [ ] No TypeScript errors
