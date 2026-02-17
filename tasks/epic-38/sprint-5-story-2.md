# Story 38.5.2: ISO Control Mapping Sheet

## Description

Add a second worksheet "ISO Control Mapping" to the `ScoringExcelExporter`. This sheet provides a detailed breakdown of all ISO clause references across dimensions -- a reference table assessors can use to drill into specific ISO traceability. Each row is one clause-dimension pair with alignment status.

## Acceptance Criteria

- [ ] New "ISO Control Mapping" worksheet added to workbook
- [ ] Columns: Framework | Clause | Title | Dimension | Status | Confidence
- [ ] One row per clause-dimension pair (not deduplicated -- shows per-dimension status)
- [ ] Status cells color-coded (Aligned=green, Partial=amber, Not Evidenced=red)
- [ ] Guardian-native dimensions excluded from this sheet (no ISO mappings)
- [ ] Sheet only created if at least 1 ISO clause reference exists
- [ ] Under 300 LOC per file

## Technical Approach

### 1. Add ISO mapping sheet method to ScoringExcelExporter

**File:** `packages/backend/src/infrastructure/export/ScoringExcelExporter.ts` (MODIFY)

```typescript
// Call in generateExcel():
if (data.dimensionISOData.some(d => d.isoClauseReferences.length > 0)) {
  this.addISOControlMappingSheet(workbook, data);
}

private addISOControlMappingSheet(workbook: ExcelJS.Workbook, data: ScoringExportData): void {
  const ws = workbook.addWorksheet('ISO Control Mapping', {
    properties: { defaultRowHeight: 20 },
  });

  // Title
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ISO Control Mapping - Assessment Traceability';
  titleCell.font = { size: 14, bold: true, color: { argb: 'FF374151' } };
  ws.getRow(1).height = 28;

  // Column widths
  ws.columns = [
    { key: 'framework', width: 18 },
    { key: 'clause', width: 12 },
    { key: 'title', width: 40 },
    { key: 'dimension', width: 25 },
    { key: 'status', width: 18 },
    { key: 'confidence', width: 15 },
  ];

  // Header
  ws.addRow([]);
  const headerRow = ws.addRow(['Framework', 'Clause', 'Title', 'Dimension', 'Status', 'Confidence']);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  headerRow.height = 25;
  ws.views = [{ state: 'frozen', ySplit: headerRow.number }];

  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    aligned: { bg: 'FFDCFCE7', text: 'FF166534' },
    partial: { bg: 'FFFEF3C7', text: 'FF92400E' },
    not_evidenced: { bg: 'FFFEE2E2', text: 'FF991B1B' },
    not_applicable: { bg: 'FFF3F4F6', text: 'FF6B7280' },
  };

  // Data rows: one per clause-dimension pair
  for (const dim of data.dimensionISOData) {
    if (dim.isGuardianNative) continue;  // Skip Guardian-native dimensions

    for (const ref of dim.isoClauseReferences) {
      const row = ws.addRow([
        ref.framework,
        ref.clauseRef,
        ref.title,
        dim.label,
        ref.status.replace(/_/g, ' ').toUpperCase(),
        dim.confidence?.level?.toUpperCase() || '--',
      ]);

      // Color-code status cell
      const statusColors = STATUS_COLORS[ref.status];
      if (statusColors) {
        row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.bg } };
        row.getCell(5).font = { bold: true, color: { argb: statusColors.text } };
      }
    }
  }

  // Summary row
  ws.addRow([]);
  const totalClauses = data.dimensionISOData.reduce((sum, d) => sum + d.isoClauseReferences.length, 0);
  const summaryRow = ws.addRow([`Total: ${totalClauses} clause-dimension mappings`]);
  ws.mergeCells(`A${summaryRow.number}:F${summaryRow.number}`);
  summaryRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
}
```

### 2. Key Rules

- **Not deduplicated**: Unlike the PDF/Word ISO alignment section, this sheet shows one row per clause-dimension pair. This gives assessors the full mapping detail in a filterable spreadsheet.
- **Skip Guardian-native**: Dimensions without ISO mapping are excluded entirely.
- **Conditional sheet creation**: Only add the sheet if at least one dimension has ISO clause references.
- **LOC management**: The method is ~60 LOC. Total file should stay under 300 LOC with both sheets.

## Files Touched

- `packages/backend/src/infrastructure/export/ScoringExcelExporter.ts` - MODIFY (add addISOControlMappingSheet method)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/export/ScoringExcelExporter.test.ts` - Add ISO sheet tests

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/ScoringExcelExporter.test.ts` (extend)
  - Test workbook has "ISO Control Mapping" sheet when ISO data exists
  - Test workbook does NOT have ISO sheet when no ISO clauses exist
  - Test ISO sheet has correct column headers
  - Test ISO sheet rows match clause-dimension pair count
  - Test Guardian-native dimensions excluded from ISO sheet
  - Test status cells have color formatting
  - Test summary row shows total count

## Definition of Done

- [ ] ISO Control Mapping sheet generates correctly
- [ ] Per-clause-per-dimension rows with status colors
- [ ] Guardian-native dimensions excluded
- [ ] All tests pass
- [ ] Under 300 LOC
- [ ] No TypeScript errors
