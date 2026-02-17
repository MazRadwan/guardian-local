# Story 38.6.1: Frontend Scoring Types Enrichment

## Description

Add ISO clause references and assessment confidence fields to the frontend `DimensionScoreData` type. The backend already returns these fields in `dimensionScores[].findings` JSONB (Epic 37). The frontend type needs to mirror the backend shape so TypeScript recognizes the data.

## Acceptance Criteria

- [ ] `DimensionScoreData` in `apps/web/src/types/scoring.ts` extended with `findings` field
- [ ] `findings` includes `assessmentConfidence` (level + rationale)
- [ ] `findings` includes `isoClauseReferences` array
- [ ] Types match backend `domain/scoring/types.ts` and `domain/compliance/types.ts`
- [ ] All existing components compile without errors
- [ ] No behavioral changes (type-only)

## Technical Approach

### 1. Update types/scoring.ts

**File:** `apps/web/src/types/scoring.ts` (MODIFY)

Add ISO-related types and extend `DimensionScoreData`:

```typescript
// ISO enrichment types (mirrors backend domain/compliance/types.ts)
export type AssessmentConfidenceLevel = 'high' | 'medium' | 'low';

export interface AssessmentConfidence {
  level: AssessmentConfidenceLevel;
  rationale: string;
}

export interface ISOClauseReference {
  clauseRef: string;
  title: string;
  framework: string;
  status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable';
}

export interface DimensionScoreData {
  dimension: string;
  score: number;
  riskRating: RiskRating;
  findings?: {
    subScores?: Array<{
      name: string;
      score: number;
      maxScore: number;
      notes: string;
    }>;
    keyRisks?: string[];
    mitigations?: string[];
    evidenceRefs?: Array<{
      sectionNumber: number;
      questionNumber: number;
      quote: string;
    }>;
    // ISO enrichment (Epic 37/38)
    assessmentConfidence?: AssessmentConfidence;
    isoClauseReferences?: ISOClauseReference[];
  };
}
```

### 2. Key Rules

- **Optional fields**: All ISO fields are optional (`?`) for backward compatibility with pre-Epic-37 data.
- **Mirror backend types**: The type shapes match `packages/backend/src/domain/scoring/types.ts` and `packages/backend/src/domain/compliance/types.ts`. Do not deviate.
- **No runtime changes**: This is a type-only change. Existing components that use `DimensionScoreData` will continue to work because `findings` is optional.
- **`findings` includes existing fields too**: The backend `DimensionScoreData.findings` already has `subScores`, `keyRisks`, `mitigations`, `evidenceRefs`. Add them to the frontend type even though they are not yet displayed (future-proofing).
- **Backend data source dependency**: This story's types will only be populated at runtime if the backend actually sends `findings` in its responses. Story 38.2.2 (Section 4) updates `ScoringQueryService.getResultForConversation()` and the WebSocket `scoring_complete` handler to include `findings` in dimension scores. Without that backend change, these frontend types will always receive `undefined` for the ISO fields.

## Files Touched

- `apps/web/src/types/scoring.ts` - MODIFY (add ~30 LOC of type definitions)

## Tests Affected

- No existing tests should break (additive type change with optional fields)

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] No test file needed (type-only change, TypeScript compiler validates)
- [ ] Verify compilation: `pnpm --filter @guardian/web build` or `tsc --noEmit`

## Definition of Done

- [ ] ISO/confidence types added to `types/scoring.ts`
- [ ] Types match backend shape
- [ ] All existing components compile
- [ ] No TypeScript errors
