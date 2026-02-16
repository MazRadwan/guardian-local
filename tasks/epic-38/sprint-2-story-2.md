# Story 38.2.2: ScoringExportService ISO Data Population

## Description

Update `ScoringExportService.getScoringData()` to populate the new `dimensionISOData` field in `ScoringExportData`. The ISO data (confidence + clause references) already lives in `DimensionScoreData.findings` JSONB, stored by Epic 37's scoring pipeline. This story reads those fields and maps them to the export-friendly `DimensionExportISOData[]` format.

## Acceptance Criteria

- [ ] `getScoringData()` populates `dimensionISOData` from `dimensionScoreData.findings`
- [ ] Each dimension gets its confidence level, rationale, ISO clause references
- [ ] Guardian-native dimensions (`clinical_risk`, `vendor_capability`, `ethical_considerations`, `sustainability`) marked with `isGuardianNative: true`
- [ ] Dimensions without ISO data get `confidence: null`, `isoClauseReferences: []`
- [ ] Labels sourced from `DIMENSION_CONFIG` (same as existing code)
- [ ] All existing export functionality works (PDF, Word still generate correctly)
- [ ] Under 300 LOC after changes

## Technical Approach

### 1. Add buildDimensionISOData helper to ScoringExportHelpers.ts

**File:** `packages/backend/src/application/services/ScoringExportHelpers.ts` (MODIFY)

Add a new exported function:

```typescript
import { DimensionExportISOData } from '../interfaces/IScoringPDFExporter.js';
import { DimensionScoreData } from '../../domain/scoring/types.js';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric.js';

const GUARDIAN_NATIVE_DIMENSIONS = [
  'clinical_risk',
  'vendor_capability',
  'ethical_considerations',
  'sustainability',
];

/**
 * Build export-friendly ISO data from dimension scores.
 * Extracts assessmentConfidence and isoClauseReferences from findings JSONB.
 */
export function buildDimensionISOData(
  dimensionScores: DimensionScoreData[]
): DimensionExportISOData[] {
  return dimensionScores.map((ds) => ({
    dimension: ds.dimension,
    label: DIMENSION_CONFIG[ds.dimension]?.label || ds.dimension.replace(/_/g, ' '),
    confidence: ds.findings?.assessmentConfidence ?? null,
    isoClauseReferences: ds.findings?.isoClauseReferences ?? [],
    isGuardianNative: GUARDIAN_NATIVE_DIMENSIONS.includes(ds.dimension),
  }));
}
```

### 2. Update ScoringExportService.getScoringData()

**File:** `packages/backend/src/application/services/ScoringExportService.ts` (MODIFY)

In `getScoringData()`, after building `dimensionScoreData`, add:

```typescript
import { buildDimensionISOData } from './ScoringExportHelpers.js';

// ... existing code that builds dimensionScoreData ...

// Build ISO export data from findings JSONB
const dimensionISOData = buildDimensionISOData(dimensionScoreData);

return {
  report,
  vendorName: vendor.name,
  solutionName: assessment.solutionName || 'N/A',
  assessmentType: assessment.assessmentType || 'N/A',
  generatedAt: new Date(),
  dimensionISOData,  // NEW
};
```

### 3. Key Rules

- **No new DB queries**: ISO data already exists in `findings` JSONB, populated by Epic 37 scoring pipeline. We just read what is there.
- **Null safety**: `findings?.assessmentConfidence` may be `undefined` for assessments scored before Epic 37. Use `?? null` and `?? []`.
- **Guardian-native dimensions**: Same list as `scoringPrompt.iso.ts`. These dimensions have no ISO control mappings.
- **DIMENSION_CONFIG import**: Already used in the service for labels. Reuse same import.

### 4. Update Scoring Result Response to Include Findings (Backend Data Contract)

**Problem:** The `findings` JSONB (containing ISO clause references and assessment confidence) is populated in the backend during scoring, but it never flows through to the frontend. `ScoringQueryService.getResultForConversation()` returns `dimensionScores` without `findings`. The WebSocket `scoring_complete` event handler also omits `findings` from its payload. Frontend components in Sprint 6 assume `findings` arrives in `DimensionScoreData`, but nothing delivers it.

**Fix:** Update the scoring result response layer so that `findings` data is included when dimension scores are returned via all three paths: REST rehydration, WebSocket ScoringHandler, and DocumentUploadController legacy scoring.

#### 4a. Update ScoringQueryService.getResultForConversation()

**File:** `packages/backend/src/application/services/ScoringQueryService.ts` (MODIFY)

The method is `getResultForConversation()` (not `getScoringResult`). It maps dimension scores at line ~80. Include `findings`:

```typescript
// In getResultForConversation(), when mapping dimension score rows to response:
dimensionScores: dimensionScores.map(ds => ({
  dimension: ds.dimension,
  score: ds.score,
  riskRating: ds.riskRating,
  findings: ds.findings ?? undefined,  // Include findings JSONB if present
})),
```

#### 4b. Update WebSocket ScoringHandler.triggerScoringOnSend()

**File:** `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` (MODIFY)

The event name is `scoring_complete` (underscore, not hyphen). The `dimensionScores` mapping at line ~241 strips `findings`. Include it:

```typescript
// In triggerScoringOnSend(), when building resultData for scoring_complete:
dimensionScores: scoringResult.report.payload.dimensionScores.map(ds => ({
  dimension: ds.dimension,
  score: ds.score,
  riskRating: ds.riskRating,
  findings: ds.findings ?? undefined,  // Include findings for frontend ISO display
})),
```

#### 4c. Update DocumentUploadController.runScoring() (Legacy Path)

**File:** `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` (MODIFY)

**IMPORTANT:** This is an additional scoring data path not previously covered. `DocumentUploadController.runScoring()` (line ~757) also emits `scoring_complete` via `chatNamespace` with `dimensionScores` that strip `findings`. It also persists a `scoring_result` component in the message content with the same stripped data.

Both the `resultData` (line ~759) and the `scoringComponent.data` (line ~790) must include `findings`:

```typescript
// In runScoring(), when building resultData:
dimensionScores: scoringResult.report.payload.dimensionScores.map(ds => ({
  dimension: ds.dimension,
  score: ds.score,
  riskRating: ds.riskRating,
  findings: ds.findings ?? undefined,  // Include findings for frontend ISO display
})),
```

**Note:** `DocumentUploadController` is a legacy scoring path (marked `@deprecated` for the parse methods, but `runScoring()` is still callable). The primary scoring path is `ScoringHandler.triggerScoringOnSend()` (trigger-on-send pattern from Epic 18). Both paths must be updated for consistency.

**Why this matters:** Without this fix, Sprint 6 frontend stories (38.6.1 through 38.6.4) add types and components that expect `findings` in `DimensionScoreData`, but the data never arrives from the backend. This creates a silent data contract gap where the frontend types are correct but always receive `undefined` for `findings`.

## Files Touched

- `packages/backend/src/application/services/ScoringExportHelpers.ts` - MODIFY (add `buildDimensionISOData` function, ~20 LOC)
- `packages/backend/src/application/services/ScoringExportService.ts` - MODIFY (add import, add 2 lines to populate `dimensionISOData`)
- `packages/backend/src/application/services/ScoringQueryService.ts` - MODIFY (include `findings` in `getResultForConversation()` dimension score mapping)
- `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` - MODIFY (include `findings` in `scoring_complete` WebSocket payload)
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` - MODIFY (include `findings` in `runScoring()` resultData and scoring_complete payload)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` - Assertions on `getScoringData` return shape need `dimensionISOData` checks
- `packages/backend/__tests__/unit/application/services/ScoringQueryService.test.ts` - Verify `getResultForConversation` includes `findings` in dimension scores
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Verify `scoring_complete` event includes `findings`
- `packages/backend/__tests__/unit/infrastructure/http/controllers/DocumentUploadController.test.ts` - Verify `runScoring` scoring_complete payload includes `findings`

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ScoringExportHelpers.test.ts` (extend existing)
  - Test `buildDimensionISOData` extracts confidence from findings
  - Test `buildDimensionISOData` extracts isoClauseReferences from findings
  - Test `buildDimensionISOData` returns `confidence: null` when findings missing
  - Test `buildDimensionISOData` returns empty array when isoClauseReferences missing
  - Test `buildDimensionISOData` marks clinical_risk as guardianNative
  - Test `buildDimensionISOData` marks vendor_capability as guardianNative
  - Test `buildDimensionISOData` marks regulatory_compliance as NOT guardianNative
  - Test `buildDimensionISOData` uses DIMENSION_CONFIG labels
- [ ] `packages/backend/__tests__/unit/application/services/ScoringQueryService.test.ts` (extend)
  - Test `getResultForConversation` returns `findings` field in each dimension score when present
  - Test `getResultForConversation` returns `findings: undefined` when findings is null/missing (pre-Epic-37)
- [ ] `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` (extend)
  - Test `scoring_complete` event payload includes `findings` in dimensionScores
- [ ] `packages/backend/__tests__/unit/infrastructure/http/controllers/DocumentUploadController.test.ts` (extend)
  - Test `runScoring` scoring_complete payload includes `findings` in dimensionScores

## Definition of Done

- [ ] `getScoringData()` populates `dimensionISOData`
- [ ] `ScoringQueryService.getResultForConversation()` includes `findings` in dimension scores response
- [ ] WebSocket `scoring_complete` event includes `findings` in dimension scores payload (ScoringHandler)
- [ ] `DocumentUploadController.runScoring()` scoring_complete payload includes `findings` in dimensionScores
- [ ] Guardian-native dimensions correctly flagged
- [ ] Null-safe for pre-Epic-37 assessments
- [ ] All existing export tests pass
- [ ] New helper tests pass
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
