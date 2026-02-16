# Story 38.8.1: E2E Export Integration Test

## Description

Create an integration test that verifies the full export pipeline: construct scoring data with ISO enrichment -> export to PDF/Word/Excel -> verify the output buffers contain ISO-related content. This test uses real service instances (not mocks) to verify the full chain works.

## Acceptance Criteria

- [ ] Integration test creates a `ScoringExportData` fixture with ISO clause references and confidence data
- [ ] Test calls `renderTemplate()` for HTML verification, `generateWord()`, and `generateExcel()` with the fixture
- [ ] HTML output from `renderTemplate()` contains ISO clause text, confidence badges, disclaimer
- [ ] Test does NOT call `generatePDF()` directly (which invokes Puppeteer and is slow/environment-dependent)
- [ ] Word output buffer is a valid DOCX (parseable by docx library)
- [ ] Excel output buffer is a valid XLSX with 2 sheets (Scoring Summary + ISO Control Mapping)
- [ ] All exports handle Guardian-native dimensions correctly (no ISO mapping shown)
- [ ] Test runs in under 10 seconds. Puppeteer-based PDF generation is excluded from this test. Test HTML rendering and Word/Excel buffer generation only.

## Technical Approach

### 1. Create integration test

**File:** `packages/backend/__tests__/integration/export-iso.test.ts` (CREATE)

```typescript
import { ScoringExportData, DimensionExportISOData } from '../../src/application/interfaces/IScoringPDFExporter';
import { ScoringPDFExporter } from '../../src/infrastructure/export/ScoringPDFExporter';
import { ScoringWordExporter } from '../../src/infrastructure/export/ScoringWordExporter';
import { ScoringExcelExporter } from '../../src/infrastructure/export/ScoringExcelExporter';
import * as path from 'path';

describe('Export ISO Integration', () => {
  const templatePath = path.join(__dirname, '../../src/infrastructure/export/templates/scoring-report.html');

  const mockISOData: DimensionExportISOData[] = [
    {
      dimension: 'regulatory_compliance',
      label: 'Regulatory Compliance',
      confidence: { level: 'high', rationale: 'Strong documentation and evidence' },
      isoClauseReferences: [
        { clauseRef: 'A.4.2', title: 'AI policy', framework: 'ISO/IEC 42001', status: 'aligned' },
        { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'partial' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'clinical_risk',
      label: 'Clinical Risk',
      confidence: { level: 'medium', rationale: 'Some evidence gaps' },
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    // ... remaining 8 dimensions ...
  ];

  const mockExportData: ScoringExportData = {
    report: {
      assessmentId: 'test-assessment-id',
      batchId: 'test-batch-id',
      payload: {
        compositeScore: 72,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        executiveSummary: 'Test executive summary.',
        keyFindings: ['Finding 1', 'Finding 2'],
        disqualifyingFactors: [],
        dimensionScores: [
          { dimension: 'regulatory_compliance', score: 78, riskRating: 'medium' },
          { dimension: 'clinical_risk', score: 35, riskRating: 'medium' },
          // ... remaining dimensions ...
        ],
      },
      narrativeReport: '## Dimension Analysis\n\nDetailed analysis...',
      rubricVersion: 'guardian-v1.0',
      modelId: 'claude-sonnet-4-20250514',
      scoringDurationMs: 12000,
    },
    vendorName: 'Test Vendor',
    solutionName: 'Test Solution',
    assessmentType: 'standard',
    generatedAt: new Date('2026-01-15'),
    dimensionISOData: mockISOData,
  };

  describe('PDF HTML Rendering', () => {
    it('should render HTML template with ISO alignment section', async () => {
      const exporter = new ScoringPDFExporter(templatePath);
      // Test renderTemplate for HTML output - do NOT call generatePDF() (Puppeteer)
      // renderTemplate signature: renderTemplate(template: string, data: ScoringExportData)
      const fs = require('fs');
      const template = fs.readFileSync(templatePath, 'utf-8');
      const html = (exporter as any).renderTemplate(template, mockExportData);
      expect(html).toContain('ISO');
      expect(html).toContain('A.4.2');
      expect(html).toContain('confidence');
    });
  });

  describe('Word Export', () => {
    it('should generate Word with ISO data', async () => {
      const exporter = new ScoringWordExporter();
      const buffer = await exporter.generateWord(mockExportData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Excel Export', () => {
    it('should generate Excel with 2 sheets', async () => {
      const exporter = new ScoringExcelExporter();
      const buffer = await exporter.generateExcel(mockExportData);
      expect(buffer).toBeInstanceOf(Buffer);

      // Parse the buffer back to verify structure
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      expect(workbook.worksheets.length).toBe(2);
      expect(workbook.getWorksheet('Scoring Summary')).toBeDefined();
      expect(workbook.getWorksheet('ISO Control Mapping')).toBeDefined();
    });
  });
});
```

### 2. Key Rules

- **Do NOT call `generatePDF()` directly**: It invokes Puppeteer, which is slow and environment-dependent. Instead, test `renderTemplate()` for HTML output verification, and `generateWord()` / `generateExcel()` for buffer-based verification.
- **Parse Excel back**: Use ExcelJS to load the generated buffer and verify sheet structure. This proves the Excel is valid.
- **Fixture completeness**: Include all 10 dimensions in the fixture, with a mix of Guardian-native and ISO-mapped dimensions.
- **Speed target**: Under 10 seconds. No Puppeteer invocation in this test.

## Files Touched

- `packages/backend/__tests__/integration/export-iso.test.ts` - CREATE (~200 LOC, test file exempt from 300 LOC limit)

## Tests Affected

- None (new test file)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] This IS the test file. See acceptance criteria above.

## Definition of Done

- [ ] Integration test covers PDF, Word, Excel export with ISO data
- [ ] Test verifies ISO content in output
- [ ] Test verifies Guardian-native handling
- [ ] Test passes in under 10 seconds
- [ ] No TypeScript errors
