# Story 38.4.1: Word Dimension Table ISO Columns

## Description

Add confidence badge and ISO clause count columns to the Word dimension scores table. Currently the table has 3 columns: Dimension | Score | Rating. After this story: Dimension | Score | Rating | Confidence | ISO Refs. The `createDimensionTable` function in `WordSectionBuilders.ts` is updated to accept and render the enriched `ScoringExportData`.

## Acceptance Criteria

- [ ] Dimension table has 2 new columns: "Confidence" and "ISO Refs"
- [ ] Confidence column shows H/M/L text with colored shading (green/amber/red)
- [ ] ISO Refs column shows clause count text (e.g., "3 clauses")
- [ ] Guardian-native dimensions show "--" in ISO Refs column
- [ ] Dimensions without confidence data show "--" in Confidence column
- [ ] Table width accommodates 5 columns cleanly
- [ ] Under 300 LOC for modified file
- [ ] `ScoringWordExporter.createHeader()` uses `data.generatedAt` (not `new Date()`) for document date

## Technical Approach

### 1. Update createDimensionTable in WordSectionBuilders.ts

**File:** `packages/backend/src/infrastructure/export/WordSectionBuilders.ts` (MODIFY)

The function currently takes `ScoringExportData` which now includes `dimensionISOData`. Update the table:

```typescript
import { DimensionExportISOData } from '../../application/interfaces/IScoringPDFExporter';

export function createDimensionTable(data: ScoringExportData): (Paragraph | Table)[] {
  const { dimensionScores } = data.report.payload;

  // Update header row with new columns
  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Dimension', 'Score', 'Rating', 'Confidence', 'ISO Refs'].map((text) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22 })],
          alignment: AlignmentType.CENTER,
        })],
        shading: { type: ShadingType.CLEAR, fill: BRAND_COLOR },
        verticalAlign: 'center',
      })
    ),
  });

  const dataRows = dimensionScores.map((d, index) => {
    const riskColors = RISK_COLORS[d.riskRating as keyof typeof RISK_COLORS] || RISK_COLORS.medium;
    const isEven = index % 2 === 0;

    // Find ISO data for this dimension
    const isoData = data.dimensionISOData.find((iso) => iso.dimension === d.dimension);

    // Confidence cell
    const confidenceCell = buildConfidenceCell(isoData, isEven);

    // ISO refs cell
    const isoRefCell = buildISORefCell(isoData, isEven);

    return new TableRow({
      children: [
        // Dimension name cell (existing)
        new TableCell({ /* existing label cell */ }),
        // Score cell (existing)
        new TableCell({ /* existing score cell */ }),
        // Rating cell (existing)
        new TableCell({ /* existing rating cell */ }),
        // Confidence cell (NEW)
        confidenceCell,
        // ISO refs cell (NEW)
        isoRefCell,
      ],
    });
  });

  // ... return heading + table ...
}

// Helper: build confidence table cell
function buildConfidenceCell(
  isoData: DimensionExportISOData | undefined,
  isEven: boolean
): TableCell {
  const CONFIDENCE_COLORS = {
    high: { background: 'DCFCE7', text: '166534' },
    medium: { background: 'FEF3C7', text: '92400E' },
    low: { background: 'FEE2E2', text: '991B1B' },
  };

  if (!isoData?.confidence) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: '--', size: 20, color: '9CA3AF', italics: true })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
    });
  }

  const colors = CONFIDENCE_COLORS[isoData.confidence.level];
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text: isoData.confidence.level.toUpperCase(),
        bold: true,
        size: 20,
        color: colors.text,
      })],
      alignment: AlignmentType.CENTER,
    })],
    shading: { type: ShadingType.CLEAR, fill: colors.background },
  });
}

// Helper: build ISO ref count cell
function buildISORefCell(
  isoData: DimensionExportISOData | undefined,
  isEven: boolean
): TableCell {
  if (!isoData || isoData.isGuardianNative || isoData.isoClauseReferences.length === 0) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: '--', size: 20, color: '9CA3AF', italics: true })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
    });
  }

  const count = isoData.isoClauseReferences.length;
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text: `${count} clause${count !== 1 ? 's' : ''}`,
        size: 20,
        color: '6B7280',
      })],
      alignment: AlignmentType.CENTER,
    })],
    shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
  });
}
```

### 2. Fix Word Exporter Date Usage (Determinism Bug)

**REQUIRED:** While modifying Word export files in this sprint, fix the existing bug in `ScoringWordExporter.ts` `createHeader()` method (line ~147). The current code uses `new Date()` for the document date:

```typescript
// WRONG - breaks snapshot determinism
new TextRun({ text: new Date().toLocaleDateString('en-US', { ... }), size: 24 }),
```

This must use `data.generatedAt` (the deterministic date from the export data) instead:

```typescript
// CORRECT - uses deterministic date from export data
new TextRun({ text: data.generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), size: 24 }),
```

**Why this matters:** Using `new Date()` means the document date changes every time it is generated, breaking snapshot tests and producing inconsistent exports. `data.generatedAt` is set once when the export is initiated and remains stable.

### 3. Key Rules

- **Same visual language as PDF**: Green for High confidence, amber for Medium, red for Low. Matches PDF badges from Story 38.3.1.
- **`data.dimensionISOData` lookup**: Use `find()` by dimension key. This array is populated by Story 38.2.2.
- **Table width**: `docx` Table with `width: { size: 100, type: WidthType.PERCENTAGE }` stretches to fill. 5 columns will auto-distribute.
- **LOC concern**: The existing `createDimensionTable` is ~70 LOC (lines 247-315). Adding helpers keeps it reasonable. If `WordSectionBuilders.ts` exceeds 300 LOC with ISO additions, extract ISO-specific helpers to a separate `WordISOBuilders.ts` in Sprint 4's last story.
- **Date determinism**: All date rendering in Word export MUST use `data.generatedAt`, never `new Date()`. This applies to headers, footers, and any other date display.

## Files Touched

- `packages/backend/src/infrastructure/export/WordSectionBuilders.ts` - MODIFY (update createDimensionTable, add helper functions)
- `packages/backend/src/infrastructure/export/ScoringWordExporter.ts` - MODIFY (fix `new Date()` to `data.generatedAt` in createHeader)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/export/ScoringWordExporter.test.ts` - Fixture needs `dimensionISOData`
- `packages/backend/__tests__/unit/infrastructure/export/WordSectionBuilders.test.ts` - Update dimension table assertions

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/WordSectionBuilders.test.ts` (extend)
  - Test `createDimensionTable` includes 5 header columns
  - Test confidence cell shows "HIGH" for high confidence dimension
  - Test confidence cell shows "--" for dimension without confidence
  - Test ISO ref cell shows clause count for mapped dimension
  - Test ISO ref cell shows "--" for Guardian-native dimension
  - Test `buildConfidenceCell` returns correct shading colors

## Definition of Done

- [ ] Word dimension table has Confidence and ISO Refs columns
- [ ] Confidence shown with colored text
- [ ] ISO clause counts display correctly
- [ ] Word header uses `data.generatedAt` for date (not `new Date()`)
- [ ] All tests pass
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
