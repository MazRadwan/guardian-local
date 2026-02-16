/**
 * WordISOBuilders Unit Tests
 *
 * Tests the ISO Standards Alignment section builder for Word exports.
 */

import { Paragraph, Table } from 'docx';
import { DimensionExportISOData, ScoringExportData } from '../../../../src/application/interfaces/IScoringPDFExporter';
import { createISOAlignmentSection } from '../../../../src/infrastructure/export/WordISOBuilders';

function buildMockData(dimensionISOData: DimensionExportISOData[]): ScoringExportData {
  return {
    report: {
      assessmentId: 'assess-test-001',
      batchId: 'batch-test-001',
      payload: {
        compositeScore: 82,
        recommendation: 'approve',
        overallRiskRating: 'low',
        executiveSummary: 'Summary',
        keyFindings: ['Finding 1'],
        disqualifyingFactors: [],
        dimensionScores: [
          { dimension: 'privacy_risk', score: 90, riskRating: 'low' },
          { dimension: 'security_risk', score: 80, riskRating: 'medium' },
        ],
      },
      narrativeReport: 'Report content.',
      rubricVersion: 'v1.0',
      modelId: 'claude-sonnet-4.5',
      scoringDurationMs: 15000,
    },
    vendorName: 'Acme Corp',
    solutionName: 'Acme AI Platform',
    assessmentType: 'comprehensive',
    generatedAt: new Date('2025-01-15T12:00:00Z'),
    dimensionISOData,
  };
}

describe('WordISOBuilders', () => {
  describe('createISOAlignmentSection', () => {
    it('should return empty array when no ISO clauses exist', () => {
      const data = buildMockData([]);
      const result = createISOAlignmentSection(data);

      expect(result).toEqual([]);
    });

    it('should return empty array when dimensions have no clause references', () => {
      const data = buildMockData([
        {
          dimension: 'clinical_risk',
          label: 'Clinical Risk',
          confidence: null,
          isoClauseReferences: [],
          isGuardianNative: true,
        },
      ]);
      const result = createISOAlignmentSection(data);

      expect(result).toEqual([]);
    });

    it('should return heading and table when clauses exist', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: { level: 'high', rationale: 'Strong' },
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'aligned' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);

      expect(result.length).toBeGreaterThan(0);
      const json = JSON.stringify(result);
      expect(json).toContain('ISO Standards Alignment');
      expect(json).toContain('A.6.2.6');
      expect(json).toContain('Data quality management');
    });

    it('should deduplicate same clause from multiple dimensions', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: { level: 'high', rationale: 'Strong' },
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'aligned' },
          ],
          isGuardianNative: false,
        },
        {
          dimension: 'security_risk',
          label: 'Security Risk',
          confidence: { level: 'medium', rationale: 'OK' },
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'partial' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      // Should have both dimension labels in the dimensions column (comma-separated)
      expect(json).toContain('Privacy Risk, Security Risk');

      // Should produce exactly one Table (one framework group), not two
      const tables = result.filter((el) => el instanceof Table);
      expect(tables.length).toBe(1);
    });

    it('should keep worst-case status during deduplication', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'aligned' },
          ],
          isGuardianNative: false,
        },
        {
          dimension: 'security_risk',
          label: 'Security Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'not_evidenced' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      // Worst case is not_evidenced, should be displayed
      expect(json).toContain('NOT EVIDENCED');
    });

    it('should sort clauses by clauseRef within a framework', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'B.2.1', title: 'Second clause', framework: 'ISO/IEC 42001', status: 'aligned' },
            { clauseRef: 'A.6.2.6', title: 'First clause', framework: 'ISO/IEC 42001', status: 'partial' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      const firstIdx = json.indexOf('A.6.2.6');
      const secondIdx = json.indexOf('B.2.1');
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('should list all referencing dimensions for a clause', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.8.1', title: 'Risk treatment', framework: 'ISO/IEC 23894', status: 'aligned' },
          ],
          isGuardianNative: false,
        },
        {
          dimension: 'security_risk',
          label: 'Security Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.8.1', title: 'Risk treatment', framework: 'ISO/IEC 23894', status: 'aligned' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      expect(json).toContain('Privacy Risk, Security Risk');
    });

    it('should group clauses by framework', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
            { clauseRef: 'A.8.1', title: 'Risk treatment', framework: 'ISO/IEC 23894', status: 'partial' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      expect(json).toContain('ISO/IEC 42001');
      expect(json).toContain('ISO/IEC 23894');
    });

    it('should include page break before the section', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);

      // First element should be a page break paragraph
      expect(result[0]).toBeInstanceOf(Paragraph);
    });

    it('should show status with correct color coding', () => {
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
            { clauseRef: 'A.6.2.7', title: 'Data provenance', framework: 'ISO/IEC 42001', status: 'partial' },
            { clauseRef: 'A.6.2.8', title: 'Data governance', framework: 'ISO/IEC 42001', status: 'not_evidenced' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      expect(json).toContain('ALIGNED');
      expect(json).toContain('PARTIAL');
      expect(json).toContain('NOT EVIDENCED');
    });

    it('should dedup by framework::clauseRef not just clauseRef', () => {
      // Same clauseRef in different frameworks should NOT be deduped
      const data = buildMockData([
        {
          dimension: 'privacy_risk',
          label: 'Privacy Risk',
          confidence: null,
          isoClauseReferences: [
            { clauseRef: 'A.4.2', title: 'Control 42001', framework: 'ISO/IEC 42001', status: 'aligned' },
            { clauseRef: 'A.4.2', title: 'Control 23894', framework: 'ISO/IEC 23894', status: 'partial' },
          ],
          isGuardianNative: false,
        },
      ]);
      const result = createISOAlignmentSection(data);
      const json = JSON.stringify(result);

      expect(json).toContain('Control 42001');
      expect(json).toContain('Control 23894');
    });
  });
});
