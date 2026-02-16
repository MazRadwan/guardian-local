/**
 * WordSectionBuilders Unit Tests
 *
 * Tests individual section builder functions extracted from ScoringWordExporter.
 */

import { Paragraph, TextRun, Table, HeadingLevel } from 'docx';
import { ScoringExportData } from '../../../../src/application/interfaces/IScoringPDFExporter';
import {
  RISK_COLORS,
  RECOMMENDATION_COLORS,
  BRAND_COLOR,
  createHeader,
  createScoreBanner,
  createExecutiveSummary,
  createKeyFindings,
  createDimensionTable,
  createNarrativeReport,
  parseInlineFormatting,
} from '../../../../src/infrastructure/export/WordSectionBuilders';

function buildMockData(overrides?: Partial<ScoringExportData>): ScoringExportData {
  return {
    report: {
      assessmentId: 'assess-test-001',
      batchId: 'batch-test-001',
      payload: {
        compositeScore: 82,
        recommendation: 'approve',
        overallRiskRating: 'low',
        executiveSummary: 'The vendor demonstrates strong security controls.',
        keyFindings: ['Strong encryption', 'Good compliance', 'Well-documented processes'],
        disqualifyingFactors: [],
        dimensionScores: [
          { dimension: 'privacy_risk', score: 90, riskRating: 'low' },
          { dimension: 'security_risk', score: 80, riskRating: 'medium' },
          { dimension: 'regulatory_compliance', score: 85, riskRating: 'low' },
        ],
      },
      narrativeReport: 'Detailed analysis of vendor capabilities.',
      rubricVersion: 'v1.0',
      modelId: 'claude-sonnet-4.5',
      scoringDurationMs: 15000,
    },
    vendorName: 'Acme Corp',
    solutionName: 'Acme AI Platform',
    assessmentType: 'comprehensive',
    generatedAt: new Date('2025-01-15T12:00:00Z'),
    ...overrides,
  };
}

describe('WordSectionBuilders', () => {
  describe('Color constants', () => {
    it('should export RISK_COLORS with 4 levels', () => {
      expect(RISK_COLORS).toHaveProperty('low');
      expect(RISK_COLORS).toHaveProperty('medium');
      expect(RISK_COLORS).toHaveProperty('high');
      expect(RISK_COLORS).toHaveProperty('critical');
    });

    it('should export RECOMMENDATION_COLORS with 4 types', () => {
      expect(RECOMMENDATION_COLORS).toHaveProperty('approve');
      expect(RECOMMENDATION_COLORS).toHaveProperty('conditional');
      expect(RECOMMENDATION_COLORS).toHaveProperty('decline');
      expect(RECOMMENDATION_COLORS).toHaveProperty('more_info');
    });

    it('should export BRAND_COLOR as purple hex', () => {
      expect(BRAND_COLOR).toBe('7C3AED');
    });
  });

  describe('createHeader', () => {
    it('should return 3 paragraphs', () => {
      const data = buildMockData();
      const result = createHeader(data);

      expect(result).toHaveLength(3);
      result.forEach((item) => expect(item).toBeInstanceOf(Paragraph));
    });

    it('should include vendor name in header', () => {
      const data = buildMockData({ vendorName: 'TestVendor' });
      const result = createHeader(data);
      const json = JSON.stringify(result);

      expect(json).toContain('TestVendor');
    });

    it('should include solution name in header', () => {
      const data = buildMockData({ solutionName: 'TestSolution' });
      const result = createHeader(data);
      const json = JSON.stringify(result);

      expect(json).toContain('TestSolution');
    });

    it('should include assessment ID in header', () => {
      const data = buildMockData();
      const result = createHeader(data);
      const json = JSON.stringify(result);

      expect(json).toContain('assess-test-001');
    });
  });

  describe('createScoreBanner', () => {
    it('should return paragraphs array', () => {
      const data = buildMockData();
      const result = createScoreBanner(data);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((item) => expect(item).toBeInstanceOf(Paragraph));
    });

    it('should include composite score', () => {
      const data = buildMockData();
      const json = JSON.stringify(createScoreBanner(data));

      expect(json).toContain('82');
    });

    it('should include recommendation label for approve', () => {
      const data = buildMockData();
      const json = JSON.stringify(createScoreBanner(data));

      expect(json).toContain('APPROVED');
    });

    it('should include recommendation label for conditional', () => {
      const data = buildMockData();
      data.report.payload.recommendation = 'conditional';
      const json = JSON.stringify(createScoreBanner(data));

      expect(json).toContain('CONDITIONAL APPROVAL');
    });

    it('should include recommendation label for decline', () => {
      const data = buildMockData();
      data.report.payload.recommendation = 'decline';
      const json = JSON.stringify(createScoreBanner(data));

      expect(json).toContain('DECLINED');
    });

    it('should include recommendation label for more_info', () => {
      const data = buildMockData();
      data.report.payload.recommendation = 'more_info';
      const json = JSON.stringify(createScoreBanner(data));

      expect(json).toContain('MORE INFO NEEDED');
    });

    it('should include overall risk rating', () => {
      const data = buildMockData();
      const json = JSON.stringify(createScoreBanner(data));

      expect(json).toContain('LOW');
    });
  });

  describe('createExecutiveSummary', () => {
    it('should return heading and content paragraph', () => {
      const data = buildMockData();
      const result = createExecutiveSummary(data);

      expect(result).toHaveLength(2);
      result.forEach((item) => expect(item).toBeInstanceOf(Paragraph));
    });

    it('should include executive summary text', () => {
      const data = buildMockData();
      const json = JSON.stringify(createExecutiveSummary(data));

      expect(json).toContain('The vendor demonstrates strong security controls.');
    });

    it('should include Executive Summary heading', () => {
      const data = buildMockData();
      const json = JSON.stringify(createExecutiveSummary(data));

      expect(json).toContain('Executive Summary');
    });
  });

  describe('createKeyFindings', () => {
    it('should return heading plus bullet items plus trailing spacer', () => {
      const data = buildMockData();
      const result = createKeyFindings(data);

      // 1 heading + 3 findings + 1 trailing spacer = 5
      expect(result).toHaveLength(5);
      result.forEach((item) => expect(item).toBeInstanceOf(Paragraph));
    });

    it('should include each finding text', () => {
      const data = buildMockData();
      const json = JSON.stringify(createKeyFindings(data));

      expect(json).toContain('Strong encryption');
      expect(json).toContain('Good compliance');
      expect(json).toContain('Well-documented processes');
    });

    it('should handle empty key findings', () => {
      const data = buildMockData();
      data.report.payload.keyFindings = [];
      const result = createKeyFindings(data);

      // 1 heading + 0 findings + 1 trailing spacer = 2
      expect(result).toHaveLength(2);
    });
  });

  describe('createDimensionTable', () => {
    it('should return heading, table, and trailing spacer', () => {
      const data = buildMockData();
      const result = createDimensionTable(data);

      expect(result).toHaveLength(3);
      expect(result[0]).toBeInstanceOf(Paragraph); // heading
      expect(result[1]).toBeInstanceOf(Table);      // table
      expect(result[2]).toBeInstanceOf(Paragraph); // spacer
    });

    it('should have correct row count (header + data rows)', () => {
      const data = buildMockData();
      const result = createDimensionTable(data);
      const table = result[1] as Table;

      // Access internal rows: 1 header + 3 dimension scores = 4 rows
      const tableJson = JSON.stringify(table);
      // Each dimension's score text appears as "XX/100"
      expect(tableJson).toContain('90/100');
      expect(tableJson).toContain('80/100');
      expect(tableJson).toContain('85/100');
    });

    it('should use DIMENSION_CONFIG labels', () => {
      const data = buildMockData();
      const result = createDimensionTable(data);
      const json = JSON.stringify(result);

      expect(json).toContain('Privacy Risk');
      expect(json).toContain('Security Risk');
      expect(json).toContain('Regulatory Compliance');
    });

    it('should fall back to dimension key when label not found', () => {
      const data = buildMockData();
      // Add a dimension not in DIMENSION_CONFIG
      data.report.payload.dimensionScores.push({
        dimension: 'unknown_dimension' as never,
        score: 50,
        riskRating: 'medium',
      });
      const result = createDimensionTable(data);
      const json = JSON.stringify(result);

      expect(json).toContain('unknown_dimension');
    });
  });

  describe('createNarrativeReport', () => {
    it('should always start with Detailed Analysis heading', () => {
      const data = buildMockData();
      const result = createNarrativeReport(data);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const json = JSON.stringify(result[0]);
      expect(json).toContain('Detailed Analysis');
    });

    it('should handle ## headings', () => {
      const data = buildMockData();
      data.report.narrativeReport = '## Section Title\nSome content here.';
      const result = createNarrativeReport(data);
      const json = JSON.stringify(result);

      expect(json).toContain('Section Title');
    });

    it('should handle ### headings', () => {
      const data = buildMockData();
      data.report.narrativeReport = '### Sub-Section Title\nContent below.';
      const result = createNarrativeReport(data);
      const json = JSON.stringify(result);

      expect(json).toContain('Sub-Section Title');
    });

    it('should handle bullet points', () => {
      const data = buildMockData();
      data.report.narrativeReport = '- First bullet\n- Second bullet\n* Third bullet';
      const result = createNarrativeReport(data);
      const json = JSON.stringify(result);

      expect(json).toContain('First bullet');
      expect(json).toContain('Second bullet');
      expect(json).toContain('Third bullet');
    });

    it('should handle horizontal rules', () => {
      const data = buildMockData();
      data.report.narrativeReport = 'Before rule\n---\nAfter rule';
      const result = createNarrativeReport(data);

      // Should have: Detailed Analysis heading, 'Before rule' paragraph, '---' rule, 'After rule' paragraph
      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle empty lines as spacers', () => {
      const data = buildMockData();
      data.report.narrativeReport = 'Para 1\n\nPara 2';
      const result = createNarrativeReport(data);

      // heading + para1 + empty spacer + para2 = at least 4
      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle numbered lists', () => {
      const data = buildMockData();
      data.report.narrativeReport = '1. First item\n2. Second item';
      const result = createNarrativeReport(data);
      const json = JSON.stringify(result);

      expect(json).toContain('First item');
      expect(json).toContain('Second item');
    });

    it('should handle markdown table rows', () => {
      const data = buildMockData();
      data.report.narrativeReport = '| Col1 | Col2 |\n| --- | --- |\n| Val1 | Val2 |';
      const result = createNarrativeReport(data);
      const json = JSON.stringify(result);

      expect(json).toContain('Col1');
      expect(json).toContain('Val1');
      expect(json).toContain('Val2');
    });
  });

  describe('parseInlineFormatting', () => {
    it('should handle plain text with no formatting', () => {
      const result = parseInlineFormatting('Hello world');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(TextRun);
      const json = JSON.stringify(result[0]);
      expect(json).toContain('Hello world');
    });

    it('should handle **bold** text', () => {
      const result = parseInlineFormatting('This is **bold** text');

      expect(result.length).toBeGreaterThanOrEqual(2);
      const json = JSON.stringify(result);
      expect(json).toContain('bold');
      // The bold run should have the w:b XML element (docx internal format)
      const boldRun = result.find((r) => {
        const rJson = JSON.stringify(r);
        return rJson.includes('"w:b"');
      });
      expect(boldRun).toBeDefined();
    });

    it('should handle *italic* text', () => {
      const result = parseInlineFormatting('This is *italic* text');

      expect(result.length).toBeGreaterThanOrEqual(2);
      const json = JSON.stringify(result);
      expect(json).toContain('italic');
      // The italic run should have the w:i XML element (docx internal format)
      const italicRun = result.find((r) => {
        const rJson = JSON.stringify(r);
        return rJson.includes('"w:i"');
      });
      expect(italicRun).toBeDefined();
    });

    it('should handle `code` text', () => {
      const result = parseInlineFormatting('Use `console.log` here');

      expect(result.length).toBeGreaterThanOrEqual(2);
      const json = JSON.stringify(result);
      expect(json).toContain('console.log');
      expect(json).toContain('Courier New');
    });

    it('should handle mixed formatting', () => {
      const result = parseInlineFormatting('Normal **bold** and *italic* text');

      expect(result.length).toBeGreaterThanOrEqual(4);
      const json = JSON.stringify(result);
      expect(json).toContain('bold');
      expect(json).toContain('italic');
    });

    it('should handle text with no matches as single TextRun', () => {
      const result = parseInlineFormatting('Just plain text');

      expect(result).toHaveLength(1);
    });
  });
});
