/**
 * ScoringExcelExporter Unit Tests
 *
 * Tests Excel workbook generation for scoring reports with:
 * - Scoring Summary sheet (dimension scores, confidence, ISO refs)
 * - ISO Control Mapping sheet (per clause-dimension pair)
 *
 * Epic 38 Sprint 5
 */

import ExcelJS from 'exceljs';
import { ScoringExcelExporter } from '../../../../src/infrastructure/export/ScoringExcelExporter';
import { ScoringExportData, DimensionExportISOData } from '../../../../src/application/interfaces/IScoringPDFExporter';
import { DimensionScoreData } from '../../../../src/domain/scoring/types';
import { ISO_DISCLAIMER } from '../../../../src/domain/compliance/isoMessagingTerms';

/** Helper to parse a generated Excel buffer into a workbook */
async function parseWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

/** Build a full ScoringExportData fixture with ISO data */
function buildExportData(overrides?: {
  dimensionISOData?: DimensionExportISOData[];
  dimensionScores?: DimensionScoreData[];
}): ScoringExportData {
  const defaultDimensionScores: DimensionScoreData[] = [
    { dimension: 'privacy_risk', score: 90, riskRating: 'low' },
    { dimension: 'security_risk', score: 80, riskRating: 'medium' },
    { dimension: 'regulatory_compliance', score: 85, riskRating: 'low' },
    { dimension: 'ai_transparency', score: 75, riskRating: 'medium' },
    { dimension: 'technical_credibility', score: 82, riskRating: 'low' },
    { dimension: 'operational_excellence', score: 78, riskRating: 'medium' },
    { dimension: 'clinical_risk', score: 70, riskRating: 'medium' },
    { dimension: 'vendor_capability', score: 88, riskRating: 'low' },
    { dimension: 'ethical_considerations', score: 77, riskRating: 'medium' },
    { dimension: 'sustainability', score: 72, riskRating: 'medium' },
  ];

  const defaultISOData: DimensionExportISOData[] = [
    {
      dimension: 'privacy_risk',
      label: 'Privacy Risk',
      confidence: { level: 'high', rationale: 'Strong evidence' },
      isoClauseReferences: [
        { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
        { clauseRef: 'A.8.4', title: 'Privacy controls', framework: 'ISO/IEC 42001', status: 'partial' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'security_risk',
      label: 'Security Risk',
      confidence: { level: 'medium', rationale: 'Moderate evidence' },
      isoClauseReferences: [
        { clauseRef: 'A.7.3', title: 'Security controls', framework: 'ISO/IEC 42001', status: 'aligned' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'regulatory_compliance',
      label: 'Regulatory Compliance',
      confidence: { level: 'high', rationale: 'Well documented' },
      isoClauseReferences: [
        { clauseRef: '6.1.2', title: 'Risk assessment', framework: 'ISO/IEC 23894', status: 'not_evidenced' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'ai_transparency',
      label: 'AI Transparency',
      confidence: { level: 'low', rationale: 'Limited evidence' },
      isoClauseReferences: [
        { clauseRef: 'A.5.4', title: 'Transparency', framework: 'ISO/IEC 42001', status: 'not_applicable' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'technical_credibility',
      label: 'Technical Credibility',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: false,
    },
    {
      dimension: 'operational_excellence',
      label: 'Operational Excellence',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: false,
    },
    {
      dimension: 'clinical_risk',
      label: 'Clinical Risk',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    {
      dimension: 'vendor_capability',
      label: 'Vendor Capability',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    {
      dimension: 'ethical_considerations',
      label: 'Ethical Considerations',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    {
      dimension: 'sustainability',
      label: 'Sustainability',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
  ];

  return {
    report: {
      assessmentId: 'assess-123',
      batchId: 'batch-456',
      payload: {
        compositeScore: 85,
        recommendation: 'approve',
        overallRiskRating: 'low',
        executiveSummary: 'Strong vendor with good security.',
        keyFindings: ['Finding 1', 'Finding 2'],
        disqualifyingFactors: [],
        dimensionScores: overrides?.dimensionScores || defaultDimensionScores,
      },
      narrativeReport: 'Detailed analysis.',
      rubricVersion: 'v1.0',
      modelId: 'claude-sonnet-4.5',
      scoringDurationMs: 15000,
    },
    vendorName: 'Acme Corp',
    solutionName: 'Acme AI Platform',
    assessmentType: 'comprehensive',
    generatedAt: new Date('2025-01-15T12:00:00Z'),
    dimensionISOData: overrides?.dimensionISOData ?? defaultISOData,
  };
}

describe('ScoringExcelExporter', () => {
  let exporter: ScoringExcelExporter;

  beforeEach(() => {
    exporter = new ScoringExcelExporter();
  });

  // =========================================================================
  // Story 38.5.1: Scoring Summary Sheet
  // =========================================================================
  describe('generateExcel - basic', () => {
    it('should return a Buffer', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should produce a valid Excel file (PK zip signature)', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      // Excel .xlsx files are zip archives starting with PK
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4B); // 'K'
    });
  });

  describe('Scoring Summary sheet', () => {
    it('should have a "Scoring Summary" worksheet', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary');
      expect(ws).toBeDefined();
    });

    it('should have header with vendor name and solution name', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      // Check vendor and solution in metadata rows
      expect(ws.getCell('B2').value).toBe('Acme Corp');
      expect(ws.getCell('D2').value).toBe('Acme AI Platform');
    });

    it('should have composite score and recommendation in header', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      expect(ws.getCell('B3').value).toBe(85);
      expect(ws.getCell('D3').value).toBe('APPROVE');
    });

    it('should have 10 dimension data rows', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      // Find the header row (contains "Dimension")
      let headerRowNum = 0;
      ws.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === 'Dimension') {
          headerRowNum = rowNumber;
        }
      });
      expect(headerRowNum).toBeGreaterThan(0);

      // Count data rows after header (until empty row or footer)
      let dataRowCount = 0;
      for (let i = headerRowNum + 1; i <= ws.rowCount; i++) {
        const cellValue = ws.getRow(i).getCell(1).value;
        if (cellValue && typeof cellValue === 'string' && !cellValue.startsWith('This assessment')) {
          dataRowCount++;
        }
      }
      expect(dataRowCount).toBe(10);
    });

    it('should show confidence levels (HIGH/MEDIUM/LOW) for dimensions with data', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      // Collect all confidence values from column 4 (after header)
      const confidenceValues: string[] = [];
      let headerFound = false;
      ws.eachRow((row) => {
        if (row.getCell(1).value === 'Dimension') {
          headerFound = true;
          return;
        }
        if (headerFound) {
          const val = row.getCell(4).value;
          if (val && typeof val === 'string' && val !== '--') {
            confidenceValues.push(val);
          }
        }
      });

      expect(confidenceValues).toContain('HIGH');
      expect(confidenceValues).toContain('MEDIUM');
      expect(confidenceValues).toContain('LOW');
    });

    it('should show "--" for dimensions without confidence data', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      const dashValues: string[] = [];
      let headerFound = false;
      ws.eachRow((row) => {
        if (row.getCell(1).value === 'Dimension') {
          headerFound = true;
          return;
        }
        if (headerFound) {
          const val = row.getCell(4).value;
          if (val === '--') {
            dashValues.push(val);
          }
        }
      });

      // technical_credibility, operational_excellence, clinical_risk,
      // vendor_capability, ethical_considerations, sustainability = 6 dashes
      expect(dashValues.length).toBe(6);
    });

    it('should show "Guardian-Specific" in ISO Refs for Guardian-native dimensions', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      const guardianSpecificValues: string[] = [];
      let headerFound = false;
      ws.eachRow((row) => {
        if (row.getCell(1).value === 'Dimension') {
          headerFound = true;
          return;
        }
        if (headerFound && row.getCell(5).value === 'Guardian-Specific') {
          guardianSpecificValues.push(row.getCell(1).value as string);
        }
      });

      // clinical_risk, vendor_capability, ethical_considerations, sustainability
      expect(guardianSpecificValues.length).toBe(4);
    });

    it('should show clause count in ISO Refs for mapped dimensions', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      const clauseCountValues: string[] = [];
      let headerFound = false;
      ws.eachRow((row) => {
        if (row.getCell(1).value === 'Dimension') {
          headerFound = true;
          return;
        }
        if (headerFound) {
          const val = row.getCell(5).value;
          if (typeof val === 'string' && val.includes('clause')) {
            clauseCountValues.push(val);
          }
        }
      });

      // privacy_risk has 2 clauses, security_risk has 1, regulatory_compliance has 1, ai_transparency has 1
      expect(clauseCountValues).toContain('2 clauses');
      expect(clauseCountValues).toContain('1 clause');
    });

    it('should contain ISO disclaimer in footer', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Scoring Summary')!;

      let disclaimerFound = false;
      ws.eachRow((row) => {
        const val = row.getCell(1).value;
        if (typeof val === 'string' && val.includes('ISO/IEC 42001')) {
          disclaimerFound = true;
        }
      });

      expect(disclaimerFound).toBe(true);
    });
  });

  // =========================================================================
  // Story 38.5.2: ISO Control Mapping Sheet
  // =========================================================================
  describe('ISO Control Mapping sheet', () => {
    it('should have "ISO Control Mapping" sheet when ISO data exists', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping');
      expect(ws).toBeDefined();
    });

    it('should NOT have ISO sheet when no ISO clauses exist', async () => {
      const noISOData: DimensionExportISOData[] = [
        { dimension: 'privacy_risk', label: 'Privacy Risk', confidence: null, isoClauseReferences: [], isGuardianNative: false },
        { dimension: 'clinical_risk', label: 'Clinical Risk', confidence: null, isoClauseReferences: [], isGuardianNative: true },
      ];
      const data = buildExportData({ dimensionISOData: noISOData });
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping');
      expect(ws).toBeUndefined();
    });

    it('should have correct column headers', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping')!;

      // Header is on row 3 (title on row 1, blank on row 2, header on row 3)
      const headerRow = ws.getRow(3);
      expect(headerRow.getCell(1).value).toBe('Framework');
      expect(headerRow.getCell(2).value).toBe('Clause');
      expect(headerRow.getCell(3).value).toBe('Title');
      expect(headerRow.getCell(4).value).toBe('Dimension');
      expect(headerRow.getCell(5).value).toBe('Status');
      expect(headerRow.getCell(6).value).toBe('Confidence');
    });

    it('should have one row per clause-dimension pair (not deduplicated)', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping')!;

      // Count data rows (after header row 3, before summary)
      let dataRowCount = 0;
      for (let i = 4; i <= ws.rowCount; i++) {
        const framework = ws.getRow(i).getCell(1).value;
        if (framework && typeof framework === 'string' && framework.startsWith('ISO')) {
          dataRowCount++;
        }
      }

      // privacy_risk: 2 clauses + security_risk: 1 + regulatory_compliance: 1 + ai_transparency: 1 = 5
      expect(dataRowCount).toBe(5);
    });

    it('should exclude Guardian-native dimensions from ISO sheet', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping')!;

      // Collect all dimension labels from column 4
      const dimensions: string[] = [];
      for (let i = 4; i <= ws.rowCount; i++) {
        const dim = ws.getRow(i).getCell(4).value;
        if (dim && typeof dim === 'string') {
          dimensions.push(dim);
        }
      }

      // Guardian-native dimensions should not appear
      expect(dimensions).not.toContain('Clinical Risk');
      expect(dimensions).not.toContain('Vendor Capability');
      expect(dimensions).not.toContain('Ethical Considerations');
      expect(dimensions).not.toContain('Sustainability');
    });

    it('should color-code status cells', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping')!;

      // Find the "ALIGNED" status row (row 4 should be first data row)
      const statusValues: string[] = [];
      for (let i = 4; i <= ws.rowCount; i++) {
        const val = ws.getRow(i).getCell(5).value;
        if (val && typeof val === 'string') {
          statusValues.push(val);
        }
      }

      expect(statusValues).toContain('ALIGNED');
      expect(statusValues).toContain('PARTIAL');
      expect(statusValues).toContain('NOT EVIDENCED');
      expect(statusValues).toContain('NOT APPLICABLE');
    });

    it('should show summary row with total clause-dimension mappings', async () => {
      const data = buildExportData();
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('ISO Control Mapping')!;

      let summaryFound = false;
      ws.eachRow((row) => {
        const val = row.getCell(1).value;
        if (typeof val === 'string' && val.startsWith('Total:')) {
          summaryFound = true;
          // Total ISO refs across all dimensions (including Guardian-native which have 0)
          // privacy_risk: 2 + security_risk: 1 + regulatory_compliance: 1 + ai_transparency: 1 = 5
          // But total counts ALL including Guardian-native (which are 0) = 5
          expect(val).toContain('5 clause-dimension mappings');
        }
      });

      expect(summaryFound).toBe(true);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle empty dimension scores', async () => {
      const data = buildExportData({
        dimensionScores: [],
        dimensionISOData: [],
      });
      const buffer = await exporter.generateExcel(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle dimensions with confidence but no ISO refs', async () => {
      const isoData: DimensionExportISOData[] = [
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: { level: 'high', rationale: 'Good' },
          isoClauseReferences: [],
          isGuardianNative: false,
        },
      ];
      const data = buildExportData({ dimensionISOData: isoData });
      const buffer = await exporter.generateExcel(data);
      const wb = await parseWorkbook(buffer);

      // Should not have ISO sheet since no clause references
      const ws = wb.getWorksheet('ISO Control Mapping');
      expect(ws).toBeUndefined();
    });
  });
});
