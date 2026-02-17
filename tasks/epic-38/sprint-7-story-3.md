# Story 38.7.3: Excel Download Button in ScoringResultCard

## Description

Add an Excel download button to the export actions section of `ScoringResultCard`. The existing `DownloadButton` component already supports `format: 'excel'` and the backend Excel route is wired in Sprint 5 (Story 38.5.3). This story just adds the button to the UI.

## Acceptance Criteria

- [ ] Excel download button appears next to PDF and Word buttons
- [ ] Button uses `format="excel"` and `exportType="scoring"`
- [ ] Button label is "Export Excel"
- [ ] Button triggers download from `/api/export/scoring/:assessmentId/excel`
- [ ] Under 300 LOC for ScoringResultCard.tsx

## Technical Approach

### 1. Update ScoringResultCard.tsx

**File:** `apps/web/src/components/chat/ScoringResultCard.tsx` (MODIFY)

Add a third `DownloadButton` in the export actions section:

```tsx
{/* Export Actions */}
<div className="px-6 py-4 bg-gray-50 flex gap-3">
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
  <DownloadButton
    assessmentId={result.assessmentId}
    batchId={result.batchId}
    format="excel"
    exportType="scoring"
    label="Export Excel"
  />
</div>
```

### 2. Key Rules

- **Minimal change**: ~8 lines added. `DownloadButton` already handles `format: 'excel'` (it builds the URL as `/api/export/scoring/:assessmentId/excel` and sets `.xlsx` extension in fallback filename).
- **No changes to DownloadButton.tsx**: The component already supports `'excel'` in its `format` prop type and URL building logic. Verified in the audit.
- **batchId required**: All `DownloadButton` instances MUST pass `batchId={result.batchId}` to prevent batch drift (export matches displayed scoring batch). This was established in Story 38.6.4 for PDF and Word buttons; the Excel button must be consistent.
- **LOC check**: ScoringResultCard.tsx is ~257 LOC after Sprint 7 Story 1 additions. Adding ~8 lines keeps it under 300 LOC.

## Files Touched

- `apps/web/src/components/chat/ScoringResultCard.tsx` - MODIFY (add 5 lines for Excel DownloadButton)

## Tests Affected

- `apps/web/src/components/chat/__tests__/ScoringResultCard.test.tsx` - Need assertion for Excel button
- `apps/web/src/components/chat/__tests__/ChatInterface.downloads.test.tsx` - May need update for new button

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/components/chat/__tests__/ScoringResultCard.test.tsx` (extend)
  - Test Excel download button renders
  - Test Excel button has correct format prop
  - Test all 3 export buttons (PDF, Word, Excel) are present

## QA Verification (Frontend Story)

**Route:** `/chat` (need a scored assessment)
**Wait For:** `[data-testid="scoring-result-card"]`

**Steps:**
1. action: verify_exists, selector: `[data-testid="download-pdf"]`
2. action: verify_exists, selector: `[data-testid="download-word"]`
3. action: verify_exists, selector: `[data-testid="download-excel"]`

**Screenshot:** `qa-38.7.3.png`

## Definition of Done

- [ ] Excel download button visible in ScoringResultCard
- [ ] Button triggers correct API endpoint
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] Browser QA passed
