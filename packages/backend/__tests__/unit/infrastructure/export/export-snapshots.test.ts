/**
 * Export Snapshot Tests for Template Stability
 *
 * Story 38.8.2: Captures current export output for regression detection.
 * Uses deterministic fixture data to prevent snapshot drift.
 *
 * To update snapshots: npx jest --updateSnapshot
 */

import * as fs from 'fs/promises'
import path from 'path'
import { ScoringPDFExporter } from '../../../../src/infrastructure/export/ScoringPDFExporter'
import { ScoringWordExporter } from '../../../../src/infrastructure/export/ScoringWordExporter'
import { DimensionExportISOData, ScoringExportData } from '../../../../src/application/interfaces/IScoringPDFExporter'

// Mock Puppeteer (ScoringPDFExporter imports it at module level)
jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}))

/**
 * Deterministic fixture: all values are fixed to prevent snapshot drift.
 * Covers all 10 dimensions, a mix of Guardian-native and ISO-mapped,
 * and at least 1 ISO clause reference.
 */
function buildDeterministicFixture(): ScoringExportData {
  const dimensionISOData: DimensionExportISOData[] = [
    {
      dimension: 'clinical_risk',
      label: 'Clinical Risk',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    {
      dimension: 'privacy_risk',
      label: 'Privacy Risk',
      confidence: { level: 'high', rationale: 'Strong evidence from vendor documentation' },
      isoClauseReferences: [
        { clauseRef: 'A.8.4', title: 'Privacy impact assessment', framework: 'ISO/IEC 42001', status: 'aligned' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'security_risk',
      label: 'Security Risk',
      confidence: { level: 'medium', rationale: 'Some gaps in evidence' },
      isoClauseReferences: [
        { clauseRef: '6.3.1', title: 'Risk identification', framework: 'ISO/IEC 23894', status: 'aligned' },
        { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'partial' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'technical_credibility',
      label: 'Technical Credibility',
      confidence: { level: 'high', rationale: 'Detailed technical documentation provided' },
      isoClauseReferences: [
        { clauseRef: '6.4.1', title: 'Risk treatment', framework: 'ISO/IEC 23894', status: 'not_applicable' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'vendor_capability',
      label: 'Vendor Capability',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    {
      dimension: 'ai_transparency',
      label: 'AI Transparency',
      confidence: { level: 'low', rationale: 'Limited transparency documentation' },
      isoClauseReferences: [
        { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'aligned' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'ethical_considerations',
      label: 'Ethical Considerations',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
    {
      dimension: 'regulatory_compliance',
      label: 'Regulatory Compliance',
      confidence: { level: 'medium', rationale: 'Partial regulatory documentation' },
      isoClauseReferences: [
        { clauseRef: '6.3.2', title: 'Risk analysis', framework: 'ISO/IEC 23894', status: 'not_evidenced' },
      ],
      isGuardianNative: false,
    },
    {
      dimension: 'operational_excellence',
      label: 'Operational Excellence',
      confidence: { level: 'high', rationale: 'Comprehensive operational procedures' },
      isoClauseReferences: [],
      isGuardianNative: false,
    },
    {
      dimension: 'sustainability',
      label: 'Sustainability',
      confidence: null,
      isoClauseReferences: [],
      isGuardianNative: true,
    },
  ]

  return {
    report: {
      assessmentId: 'snapshot-assessment-001',
      batchId: 'snapshot-batch-001',
      payload: {
        compositeScore: 76,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        executiveSummary: 'The vendor demonstrates adequate controls across most dimensions with some areas requiring improvement.',
        keyFindings: [
          'Strong privacy controls with documented impact assessments',
          'Security posture is adequate but gaps exist in penetration testing',
          'Clinical risk management lacks formal validation protocols',
        ],
        disqualifyingFactors: [],
        dimensionScores: [
          { dimension: 'clinical_risk', score: 55, riskRating: 'high' },
          { dimension: 'privacy_risk', score: 88, riskRating: 'low' },
          { dimension: 'security_risk', score: 72, riskRating: 'medium' },
          { dimension: 'technical_credibility', score: 80, riskRating: 'low' },
          { dimension: 'vendor_capability', score: 75, riskRating: 'medium' },
          { dimension: 'ai_transparency', score: 60, riskRating: 'high' },
          { dimension: 'ethical_considerations', score: 70, riskRating: 'medium' },
          { dimension: 'regulatory_compliance', score: 65, riskRating: 'medium' },
          { dimension: 'operational_excellence', score: 82, riskRating: 'low' },
          { dimension: 'sustainability', score: 68, riskRating: 'medium' },
        ],
      },
      narrativeReport: '# Assessment Overview\n\nThis vendor was evaluated across all 10 Guardian dimensions.\n\n## Key Strengths\n\n- **Privacy controls** are well-documented\n- Technical architecture is sound',
      rubricVersion: 'guardian-v1.0',
      modelId: 'claude-sonnet-4.5',
      scoringDurationMs: 18500,
    },
    vendorName: 'Snapshot Test Corp',
    solutionName: 'Snapshot AI Platform',
    assessmentType: 'comprehensive',
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    dimensionISOData,
  }
}

describe('Export Snapshot Tests (38.8.2)', () => {
  const templatePath = path.join(
    __dirname,
    '../../../../src/infrastructure/export/templates/scoring-report.html',
  )

  describe('HTML Template Snapshot', () => {
    it('should match the rendered HTML snapshot', async () => {
      const exporter = new ScoringPDFExporter(templatePath)
      const template = await fs.readFile(templatePath, 'utf-8')
      const fixture = buildDeterministicFixture()

      // renderTemplate is private; access via any cast
      const html = (exporter as any).renderTemplate(template, fixture)

      expect(html).toMatchSnapshot()
    })
  })

  describe('Word Document Structural Assertions', () => {
    it('should produce a valid Word buffer of substantial size', async () => {
      const exporter = new ScoringWordExporter()
      const fixture = buildDeterministicFixture()

      const buffer = await exporter.generateWord(fixture)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(5000)
      // Word documents are zip files (PK header)
      expect(buffer[0]).toBe(0x50) // 'P'
      expect(buffer[1]).toBe(0x4B) // 'K'
    })

    it('should have a buffer length within expected range', async () => {
      const exporter = new ScoringWordExporter()
      const fixture = buildDeterministicFixture()

      const buffer = await exporter.generateWord(fixture)

      // A comprehensive report with 10 dimensions and ISO data
      // should produce a document between 5KB and 200KB
      expect(buffer.length).toBeGreaterThan(5000)
      expect(buffer.length).toBeLessThan(200_000)
    })
  })

  describe('Fixture Data Contract Snapshot', () => {
    it('should match the deterministic fixture JSON structure', () => {
      const fixture = buildDeterministicFixture()

      // Snapshot the fixture itself to catch changes to the data contract.
      // generatedAt is a Date object; JSON.stringify serializes it as ISO string.
      expect(JSON.stringify(fixture, null, 2)).toMatchSnapshot()
    })
  })
})
