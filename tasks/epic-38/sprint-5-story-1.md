# Story 38.5.1: IScoringExcelExporter Interface + Scoring Summary Sheet

## Description

Create the `IScoringExcelExporter` interface and `ScoringExcelExporter` implementation with the first worksheet: Scoring Summary. This sheet mirrors the PDF/Word dimension table with confidence and ISO clause columns. Follows the same pattern as `IScoringPDFExporter` / `ScoringPDFExporter` and uses `ExcelJS` (already a project dependency via the existing `ExcelExporter`).

## Acceptance Criteria

- [ ] `IScoringExcelExporter` interface created in application/interfaces
- [ ] `ScoringExcelExporter` class implements the interface
- [ ] `generateExcel(data: ScoringExportData): Promise<Buffer>` method works
- [ ] Scoring Summary worksheet has header section (vendor, solution, date, score)
- [ ] Scoring Summary has dimension table with columns: Dimension | Score | Rating | Confidence | ISO Refs
- [ ] Confidence cells have conditional formatting (H=green, M=amber, L=red)
- [ ] Guardian-native dimensions show "Guardian-Specific" in ISO Refs column
- [ ] Footer row with rubric version and ISO disclaimer
- [ ] Under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create IScoringExcelExporter interface

**File:** `packages/backend/src/application/interfaces/IScoringExcelExporter.ts` (CREATE)

```typescript
import { ScoringExportData } from './IScoringPDFExporter';

export interface IScoringExcelExporter {
  generateExcel(data: ScoringExportData): Promise<Buffer>;
}
```

### 2. Create ScoringExcelExporter

**File:** `packages/backend/src/infrastructure/export/ScoringExcelExporter.ts` (CREATE)

Follow the pattern from `ExcelExporter.ts` (questionnaire exporter):

```typescript
import ExcelJS from 'exceljs';
import { IScoringExcelExporter } from '../../application/interfaces/IScoringExcelExporter';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';
import { ISO_DISCLAIMER } from '../../domain/compliance/isoMessagingTerms';

const BRAND_COLOR = 'FF7C3AED';
const CONFIDENCE_COLORS = {
  high: { bg: 'FFDCFCE7', text: 'FF166534' },
  medium: { bg: 'FFFEF3C7', text: 'FF92400E' },
  low: { bg: 'FFFEE2E2', text: 'FF991B1B' },
};

export class ScoringExcelExporter implements IScoringExcelExporter {
  async generateExcel(data: ScoringExportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Guardian AI Vendor Assessment System';
    workbook.created = new Date();

    this.addScoringSummarySheet(workbook, data);
    // ISO mapping sheet added in Story 38.5.2

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addScoringSummarySheet(workbook: ExcelJS.Workbook, data: ScoringExportData): void {
    const ws = workbook.addWorksheet('Scoring Summary', {
      properties: { defaultRowHeight: 22 },
    });

    // Header section
    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Guardian Risk Assessment - Scoring Report';
    titleCell.font = { size: 16, bold: true, color: { argb: BRAND_COLOR } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 30;

    // Metadata rows
    ws.getCell('A2').value = 'Vendor:';
    ws.getCell('B2').value = data.vendorName;
    ws.getCell('C2').value = 'Solution:';
    ws.getCell('D2').value = data.solutionName;
    ws.getCell('A3').value = 'Composite Score:';
    ws.getCell('B3').value = data.report.payload.compositeScore;
    ws.getCell('C3').value = 'Recommendation:';
    ws.getCell('D3').value = data.report.payload.recommendation.toUpperCase();
    ws.getCell('A4').value = 'Overall Risk:';
    ws.getCell('B4').value = data.report.payload.overallRiskRating.toUpperCase();
    ws.getCell('C4').value = 'Date:';
    ws.getCell('D4').value = data.generatedAt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Style metadata
    for (let row = 2; row <= 4; row++) {
      ws.getCell(`A${row}`).font = { bold: true };
      ws.getCell(`C${row}`).font = { bold: true };
    }

    // Blank row
    ws.addRow([]);

    // Column widths
    ws.columns = [
      { key: 'dimension', width: 30 },
      { key: 'score', width: 12 },
      { key: 'rating', width: 12 },
      { key: 'confidence', width: 15 },
      { key: 'isoRefs', width: 20 },
    ];

    // Table header
    const headerRow = ws.addRow(['Dimension', 'Score', 'Rating', 'Confidence', 'ISO Refs']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_COLOR } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 25;
    ws.views = [{ state: 'frozen', ySplit: headerRow.number }];

    // Data rows
    for (const d of data.report.payload.dimensionScores) {
      const isoData = data.dimensionISOData.find((iso) => iso.dimension === d.dimension);
      const label = DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension;
      const confidence = isoData?.confidence?.level?.toUpperCase() || '--';
      const isoRefs = isoData?.isGuardianNative
        ? 'Guardian-Specific'
        : isoData?.isoClauseReferences?.length
          ? `${isoData.isoClauseReferences.length} clauses`
          : '--';

      const row = ws.addRow([label, d.score, d.riskRating.toUpperCase(), confidence, isoRefs]);

      // Conditional formatting for confidence
      if (isoData?.confidence) {
        const colors = CONFIDENCE_COLORS[isoData.confidence.level];
        row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
        row.getCell(4).font = { bold: true, color: { argb: colors.text } };
      }
    }

    // Footer with disclaimer
    ws.addRow([]);
    const footerRow = ws.addRow([ISO_DISCLAIMER]);
    ws.mergeCells(`A${footerRow.number}:E${footerRow.number}`);
    footerRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
  }
}
```

### 3. Key Rules

- **Follow ExcelExporter pattern**: Same workbook creation, buffer conversion, column setup.
- **ExcelJS ARGB colors**: Prefix with `FF` for full opacity (e.g., `FF7C3AED`).
- **Frozen header row**: `ws.views` freezes the header for scrolling.
- **ISO data lookup**: Use `data.dimensionISOData.find()` by dimension key.

## Files Touched

- `packages/backend/src/application/interfaces/IScoringExcelExporter.ts` - CREATE (~8 LOC)
- `packages/backend/src/infrastructure/export/ScoringExcelExporter.ts` - CREATE (~150 LOC)

## Tests Affected

- None (new files)

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/ScoringExcelExporter.test.ts`
  - Test `generateExcel` returns a Buffer
  - Test workbook has "Scoring Summary" sheet
  - Test header contains vendor name and solution name
  - Test dimension table has 10 data rows (one per dimension)
  - Test confidence column shows "HIGH"/"MEDIUM"/"LOW" for dimensions with data
  - Test confidence column shows "--" for dimensions without data
  - Test ISO refs column shows "Guardian-Specific" for Guardian-native dimensions
  - Test ISO refs column shows clause count for mapped dimensions
  - Test footer contains ISO disclaimer text

## Definition of Done

- [ ] Interface and implementation created
- [ ] Scoring Summary sheet generates correctly
- [ ] Confidence and ISO columns populated
- [ ] All tests pass
- [ ] Under 300 LOC
- [ ] No TypeScript errors
