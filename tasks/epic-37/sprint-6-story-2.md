# Story 37.6.2: Update Scoring Types + DTOs for ISO Fields

## Description

Add ISO and confidence fields to the `DimensionScoreData` findings type in `types.ts` and the corresponding DTOs in `dtos.ts`. These fields flow into the `findings` JSONB column of `dimension_scores` -- no database migration needed since JSONB is flexible.

## Acceptance Criteria

- [ ] `DimensionScoreData.findings` type updated to include `assessmentConfidence` and `isoClauseReferences`
- [ ] `AssessmentConfidence` and `ISOClauseReference` types imported from `domain/compliance/types.ts`
- [ ] `DimensionScoreDTO.findings` updated to match
- [ ] `CreateDimensionScoreDTO.findings` updated to match
- [ ] All existing type consumers still compile (backwards compatible -- new fields are optional)
- [ ] Both files under 150 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Update types.ts

**File:** `packages/backend/src/domain/scoring/types.ts`

Add import at top:
```typescript
import { AssessmentConfidence, ISOClauseReference } from '../compliance/types.js';
```

Update `DimensionScoreData.findings`:
```typescript
export interface DimensionScoreData {
  dimension: RiskDimension
  score: number
  riskRating: RiskRating
  findings?: {
    subScores: Array<{
      name: string
      score: number
      maxScore: number
      notes: string
    }>
    keyRisks: string[]
    mitigations: string[]
    evidenceRefs: Array<{
      sectionNumber: number
      questionNumber: number
      quote: string
    }>
    // ISO enrichment (Epic 37)
    assessmentConfidence?: AssessmentConfidence
    isoClauseReferences?: ISOClauseReference[]
  }
}
```

### 2. Update dtos.ts

**File:** `packages/backend/src/domain/scoring/dtos.ts`

Add import at top:
```typescript
import { AssessmentConfidence, ISOClauseReference } from '../compliance/types.js';
```

Update `DimensionScoreDTO.findings`:
```typescript
export interface DimensionScoreDTO {
  id: string
  assessmentId: string
  batchId: string
  dimension: string
  score: number
  riskRating: RiskRating
  findings?: {
    subScores: Array<{ name: string; score: number; maxScore: number; notes: string }>
    keyRisks: string[]
    mitigations: string[]
    evidenceRefs: Array<{ sectionNumber: number; questionNumber: number; quote: string }>
    // ISO enrichment (Epic 37)
    assessmentConfidence?: AssessmentConfidence
    isoClauseReferences?: ISOClauseReference[]
  }
  createdAt: Date
}
```

Update `CreateDimensionScoreDTO.findings` similarly.

### 3. No Schema Migration Needed

The `findings` column in `dimensionScores.ts` is `jsonb('findings')` -- it stores any JSON. The TypeScript types constrain what we write, but the database column is flexible. No migration required.

## Files Touched

- `packages/backend/src/domain/scoring/types.ts` - MODIFY (add imports, add 2 optional fields to findings)
- `packages/backend/src/domain/scoring/dtos.ts` - MODIFY (add imports, add 2 optional fields to findings)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/ScoringPayloadValidator.test.ts` - Uses `DimensionScoreData` type. Existing tests should still pass since new fields are optional.
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - Uses scoring types. Should still pass.
- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - May need update if it validates type shapes.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Verify `pnpm test:unit` passes (backwards compatibility)
- [ ] No new tests needed for type changes (validated by consuming code tests)

## Definition of Done

- [ ] Types updated with ISO fields
- [ ] DTOs updated with ISO fields
- [ ] All existing tests pass (backwards compatible)
- [ ] No TypeScript errors
