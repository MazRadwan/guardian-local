# Story 38.6.4: Update ScoringResultData Type

## Description

Update the `ScoringResultData` type in frontend `types/scoring.ts` to include `findings` data in `dimensionScores`, so the enriched dimension data flows from the API response through to `ScoreDashboard` and `DimensionScoreBar`. Currently `ScoringResultData.dimensionScores` uses the bare `DimensionScoreData` type (just dimension, score, riskRating). After Story 38.6.1, `DimensionScoreData` includes optional `findings`. This story ensures the parent `ScoringResultData` interface carries the full shape.

## Acceptance Criteria

- [ ] `ScoringResultData.dimensionScores` uses the enriched `DimensionScoreData` type (with optional findings)
- [ ] `ScoringResultCard` receives and passes findings through to `ScoreDashboard`
- [ ] `ChatMessage.tsx`'s `EmbeddedScoringResult` mapping includes `findings` when constructing `ScoringResultData` from persisted `scoring_result` component data (currently strips `findings` at line ~535-539)
- [ ] `DownloadButton` accepts an optional `batchId` prop and appends `?batchId={batchId}` to the download URL when provided (prevents batch drift -- ensures the exported report matches the displayed scoring batch)
- [ ] `ScoringResultCard` passes `result.batchId` to each `DownloadButton` instance
- [ ] Runtime changes limited to ChatMessage.tsx findings pass-through and DownloadButton.tsx batchId URL propagation
- [ ] All existing frontend tests pass

## Technical Approach

### 1. Verify types/scoring.ts

**File:** `apps/web/src/types/scoring.ts` (MODIFY)

The `ScoringResultData` interface already uses `DimensionScoreData[]`. After Story 38.6.1 enriches `DimensionScoreData` with optional `findings`, this should work automatically. Verify that:

```typescript
export interface ScoringResultData {
  compositeScore: number;
  recommendation: Recommendation;
  overallRiskRating: RiskRating;
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: DimensionScoreData[];  // This already uses the enriched type after 38.6.1
  batchId: string;
  assessmentId: string;
}
```

If `DimensionScoreData` was enriched correctly in 38.6.1, this type already carries `findings` through.

### 2. Verify ScoringResultCard passes data correctly

**File:** `apps/web/src/components/chat/ScoringResultCard.tsx` (READ-ONLY verification)

Check that `ScoringResultCard` passes `result.dimensionScores` to `ScoreDashboard`, which passes each dimension's `findings` to `DimensionScoreBar`. The data flow should be:

```
ScoringResultCard
  -> ScoreDashboard dimensionScores={result.dimensionScores}
    -> DimensionScoreBar findings={d.findings} dimension={d.dimension}
```

If the data flow is already correct (from 38.6.3 wiring), this story is just verification + test updates.

### 2b. Fix EmbeddedScoringResult findings pass-through in ChatMessage.tsx

**File:** `apps/web/src/components/chat/ChatMessage.tsx` (MODIFY)

**Problem:** When the frontend renders persisted messages, the `EmbeddedScoringResult` function (line ~528-549) maps raw `scoring_result` component data to a typed `ScoringResultData` object. The `dimensionScores.map()` at line ~535-539 only extracts `dimension`, `score`, and `riskRating`, stripping the `findings` field. Sprint 2 Story 38.2.2 ensures the backend persists `findings` in the `scoring_result` component payload, but this frontend mapping discards it.

**Fix:** Include `findings` in the `dimensionScores` mapping:

```typescript
dimensionScores: Array.isArray(data.dimensionScores)
  ? data.dimensionScores.map((d: DimensionScoreData) => ({
      dimension: d.dimension || '',
      score: typeof d.score === 'number' ? d.score : 0,
      riskRating: (d.riskRating || 'medium') as RiskRating,
      findings: d.findings,  // Pass through findings from persisted component data
    }))
  : [],
```

**Why:** Without this fix, `ScoringResultCard` receives `findings: undefined` for every dimension when rendering persisted messages, even though the data exists in the stored component payload. This breaks the ISO clause display and confidence indicators added in Sprint 6 Stories 38.6.1-38.6.3.

### 3. Fix DownloadButton batch drift

**File:** `apps/web/src/components/chat/DownloadButton.tsx` (MODIFY)

Add an optional `batchId` prop to `DownloadButtonProps` and append it as a query parameter when constructing the scoring export URL:

```typescript
export interface DownloadButtonProps {
  assessmentId: string;
  format: 'pdf' | 'word' | 'excel';
  exportType?: 'questionnaire' | 'scoring';
  batchId?: string;        // NEW: pin export to a specific scoring batch
  label?: string;
  onDownload?: () => void;
}
```

In `handleDownload`, when building the URL for `exportType === 'scoring'`:

```typescript
let url = exportType === 'scoring'
  ? `${apiUrl}/api/export/scoring/${assessmentId}/${format}`
  : `${apiUrl}/api/assessments/${assessmentId}/export/${format}`;

// Append batchId to prevent batch drift (export matches displayed results)
if (batchId && exportType === 'scoring') {
  url += `?batchId=${encodeURIComponent(batchId)}`;
}
```

**Why:** Without `batchId`, the backend returns the latest batch. If the user is viewing an older batch's results, the export silently returns different data.

**File:** `apps/web/src/components/chat/ScoringResultCard.tsx` (MODIFY)

Pass `batchId` from `result` to each `DownloadButton`:

```tsx
<DownloadButton
  assessmentId={result.assessmentId}
  batchId={result.batchId}
  format="pdf"
  exportType="scoring"
  label="Export PDF"
/>
<DownloadButton
  assessmentId={result.assessmentId}
  batchId={result.batchId}
  format="word"
  exportType="scoring"
  label="Export Word"
/>
```

### 4. Add websocket type alignment

**File:** `apps/web/src/lib/websocket.ts` (READ to check `ScoringCompletePayload` shape)

The `fetchScoringResult()` returns `ScoringCompletePayload['result']`. Verify this type includes `dimensionScores` with `findings` in the WebSocket payload type. If the WebSocket type does not include `findings`, update it:

```typescript
// In websocket.ts or wherever ScoringCompletePayload is defined
interface ScoringCompletePayload {
  result: {
    // ... existing fields ...
    dimensionScores: DimensionScoreData[];  // Should use enriched type
  };
}
```

### 5. Key Rules

- **Minimal runtime changes**: ChatMessage.tsx adds `findings` pass-through in the `EmbeddedScoringResult` mapping, and DownloadButton.tsx appends `batchId` to the export URL. These are small behavioral changes (not type-only) required to prevent data loss on rehydration and batch drift on export.
- **Verify before changing**: Read the actual files first. If the types are already correct (after 38.6.1), this story may be just verification + test fixture updates.
- **WebSocket alignment**: The scoring result also comes via WebSocket events. Ensure both REST and WebSocket paths use the enriched type.

## Files Touched

- `apps/web/src/types/scoring.ts` - VERIFY (may need no changes if 38.6.1 was sufficient)
- `apps/web/src/lib/websocket.ts` - VERIFY/MODIFY (ensure ScoringCompletePayload includes enriched DimensionScoreData)
- `apps/web/src/components/chat/ChatMessage.tsx` - MODIFY (fix `EmbeddedScoringResult` to pass `findings` through in `dimensionScores` mapping)
- `apps/web/src/components/chat/DownloadButton.tsx` - MODIFY (add optional `batchId` prop, append to URL)
- `apps/web/src/components/chat/ScoringResultCard.tsx` - MODIFY (pass `result.batchId` to DownloadButton)

## Tests Affected

- `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx` - Test that `EmbeddedScoringResult` passes `findings` from persisted component data through to `ScoringResultCard`
- `apps/web/src/components/chat/__tests__/ScoringResultCard.test.tsx` - Fixture data may need `findings` field; verify `batchId` passed to DownloadButton
- `apps/web/src/components/chat/__tests__/DownloadButton.test.tsx` - Test that `batchId` prop appends query param to scoring export URL
- `apps/web/src/lib/api/__tests__/scoring.test.ts` - Response fixture may need updates

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] Verify all existing frontend tests pass with enriched types
- [ ] `apps/web/src/types/__tests__/scoring.types.test.ts` (optional type guard test)
  - Test `DimensionScoreData` with findings compiles correctly
  - Test `DimensionScoreData` without findings compiles correctly (backward compat)
- [ ] `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx` (extend)
  - Test `EmbeddedScoringResult` includes `findings` in mapped `dimensionScores` when present in persisted data
  - Test `EmbeddedScoringResult` handles missing `findings` gracefully (pre-Epic-37 persisted messages)
- [ ] `apps/web/src/components/chat/__tests__/DownloadButton.test.tsx` (extend)
  - Test scoring export URL includes `?batchId=...` when `batchId` prop provided
  - Test scoring export URL has no query param when `batchId` prop omitted
  - Test questionnaire export URL is unaffected by `batchId` prop

## Definition of Done

- [ ] Frontend types carry ISO/confidence data end-to-end
- [ ] `ChatMessage.tsx` `EmbeddedScoringResult` passes `findings` through from persisted component data (no data loss on rehydration)
- [ ] WebSocket and REST paths aligned on type shape
- [ ] DownloadButton passes `batchId` to export URL (no batch drift)
- [ ] ScoringResultCard passes `result.batchId` to all DownloadButton instances
- [ ] All existing tests pass
- [ ] No TypeScript errors
