# Story 37.6.1: Update scoringComplete Tool Schema

## Description

Add `assessmentConfidence` and `isoClauseReferences` fields to the `scoring_complete` tool definition in `scoringComplete.ts`. These fields tell Claude what to output for ISO traceability and confidence assessment. The fields are added inside the `findings` object of each `dimensionScores` item.

## Acceptance Criteria

- [ ] `findings` property in `dimensionScores` items updated from generic `object` to a structured schema
- [ ] `findings` schema includes `assessmentConfidence` object with `level` (enum: high/medium/low) and `rationale` (string)
- [ ] `findings` schema includes `isoClauseReferences` array with `clauseRef`, `title`, `framework`, `status` fields
- [ ] `findings` schema preserves existing `subScores`, `keyRisks`, `mitigations`, `evidenceRefs` sub-properties
- [ ] `ScoringCompleteInput` TypeScript type updated to match
- [ ] Under 150 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Update Tool Schema

**File:** `packages/backend/src/domain/scoring/tools/scoringComplete.ts`

Update the `findings` property in `dimensionScores.items.properties`:

```typescript
findings: {
  type: 'object',
  description: 'Detailed findings including sub-scores, evidence, confidence, and ISO references',
  properties: {
    subScores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          score: { type: 'number' },
          maxScore: { type: 'number' },
          notes: { type: 'string' },
        },
      },
      description: 'Component sub-scores per rubric criteria',
    },
    keyRisks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key risks identified for this dimension',
    },
    mitigations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Suggested mitigations',
    },
    evidenceRefs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sectionNumber: { type: 'integer' },
          questionNumber: { type: 'integer' },
          quote: { type: 'string' },
        },
      },
      description: 'References to specific questionnaire responses',
    },
    assessmentConfidence: {
      type: 'object',
      description: 'Confidence assessment for this dimension score. REQUIRED for all dimensions.',
      properties: {
        level: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Confidence level based on evidence quality. High = specific verifiable evidence. Medium = partial evidence with gaps. Low = vague claims or contradictions.',
        },
        rationale: {
          type: 'string',
          description: 'Specific explanation citing evidence and ISO references that support this confidence level. Must be at least 20 characters.',
        },
      },
      required: ['level', 'rationale'],
    },
    isoClauseReferences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clauseRef: { type: 'string', description: 'ISO clause reference (e.g., "A.6.2.6")' },
          title: { type: 'string', description: 'Control title' },
          framework: { type: 'string', description: 'Framework name (e.g., "ISO/IEC 42001")' },
          status: {
            type: 'string',
            enum: ['aligned', 'partial', 'not_evidenced', 'not_applicable'],
            description: 'Alignment status based on vendor evidence',
          },
        },
        required: ['clauseRef', 'title', 'framework', 'status'],
      },
      description: 'ISO clause references relevant to this dimension. Empty array for Guardian-native dimensions (clinical_risk, vendor_capability, ethical_considerations, sustainability).',
    },
  },
},
```

### 2. Update TypeScript Type

Update `ScoringCompleteInput` at bottom of file:

```typescript
export type ScoringCompleteInput = {
  compositeScore: number
  recommendation: 'approve' | 'conditional' | 'decline' | 'more_info'
  overallRiskRating: 'low' | 'medium' | 'high' | 'critical'
  executiveSummary: string
  keyFindings?: string[]
  disqualifyingFactors?: string[]
  dimensionScores: Array<{
    dimension: string
    score: number
    riskRating: 'low' | 'medium' | 'high' | 'critical'
    findings?: {
      subScores?: Array<{ name: string; score: number; maxScore: number; notes: string }>
      keyRisks?: string[]
      mitigations?: string[]
      evidenceRefs?: Array<{ sectionNumber: number; questionNumber: number; quote: string }>
      assessmentConfidence?: {
        level: 'high' | 'medium' | 'low'
        rationale: string
      }
      isoClauseReferences?: Array<{
        clauseRef: string
        title: string
        framework: string
        status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable'
      }>
    }
  }>
}
```

## Files Touched

- `packages/backend/src/domain/scoring/tools/scoringComplete.ts` - MODIFY (expand findings schema, update TypeScript type)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - Tests schema/validator alignment. Will need new tests for the added fields. Existing tests should still pass since new fields are optional.
- `packages/backend/__tests__/unit/domain/scoring/ScoringPayloadValidator.test.ts` - Existing tests use payloads without findings.assessmentConfidence which should still pass (backwards compatible).

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `scoringContract.test.ts`:
  - Test: payload with assessmentConfidence passes validation
  - Test: payload with isoClauseReferences passes validation
  - Test: payload without new fields still passes (backwards compatible)
  - Test: schema includes assessmentConfidence in findings description
- [ ] Verify all existing `ScoringPayloadValidator.test.ts` tests still pass

## Definition of Done

- [ ] Tool schema updated with assessmentConfidence + isoClauseReferences
- [ ] TypeScript type matches schema
- [ ] Backwards compatible (existing payloads without new fields still valid)
- [ ] Contract tests updated and passing
- [ ] Under 150 LOC
- [ ] No TypeScript errors
