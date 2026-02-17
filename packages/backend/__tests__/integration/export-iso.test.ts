/**
 * E2E Export Integration Test - ISO-Enriched Data
 *
 * Epic 38 Sprint 8: Testing & Compliance Audit
 *
 * Verifies the full export pipeline with ISO-enriched scoring data:
 * - PDF HTML rendering (template + ISO clause references + confidence)
 * - Word export (generates valid .docx buffer)
 * - Excel export (2 sheets: Scoring Summary + ISO Control Mapping)
 *
 * NOTE: Does NOT call generatePDF() to avoid Puppeteer dependency.
 * Instead tests renderTemplate() directly for HTML content verification.
 */

import path from 'path'
import * as fs from 'fs/promises'
import ExcelJS from 'exceljs'
import { ScoringPDFExporter } from '../../src/infrastructure/export/ScoringPDFExporter'
import { ScoringWordExporter } from '../../src/infrastructure/export/ScoringWordExporter'
import { ScoringExcelExporter } from '../../src/infrastructure/export/ScoringExcelExporter'
import { ScoringExportData, DimensionExportISOData } from '../../src/application/interfaces/IScoringPDFExporter'
import { RiskDimension } from '../../src/domain/types/QuestionnaireSchema'
import { ISO_DISCLAIMER } from '../../src/domain/compliance/isoMessagingTerms'

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'src/infrastructure/export/templates/scoring-report.html'
)

const FIXED_DATE = new Date('2026-01-15T00:00:00Z')

/**
 * Build a complete ScoringExportData fixture with all 10 dimensions,
 * ISO clause references, and confidence data.
 */
function buildFullFixture(): ScoringExportData {
  const dimensions: RiskDimension[] = [
    'clinical_risk', 'privacy_risk', 'security_risk',
    'technical_credibility', 'vendor_capability', 'ai_transparency',
    'ethical_considerations', 'regulatory_compliance',
    'operational_excellence', 'sustainability',
  ]

  const guardianNativeDimensions = new Set<RiskDimension>([
    'clinical_risk', 'vendor_capability', 'ethical_considerations', 'sustainability',
  ])

  const dimensionScores = dimensions.map((dim, idx) => ({
    dimension: dim,
    score: 40 + idx * 5,
    riskRating: idx < 3 ? 'medium' as const : idx < 7 ? 'low' as const : 'high' as const,
    findings: {
      subScores: [{ name: 'Sub-1', score: 7, maxScore: 10, notes: 'Adequate' }],
      keyRisks: [`Risk in ${dim}`],
      mitigations: [`Mitigation for ${dim}`],
      evidenceRefs: [{ sectionNumber: 1, questionNumber: idx + 1, quote: 'Evidence' }],
    },
  }))

  const dimensionISOData: DimensionExportISOData[] = dimensions.map((dim) => {
    const isNative = guardianNativeDimensions.has(dim)
    if (isNative) {
      return {
        dimension: dim,
        label: labelFor(dim),
        confidence: { level: 'medium' as const, rationale: 'Guardian-specific criteria applied' },
        isoClauseReferences: [],
        isGuardianNative: true,
      }
    }

    return {
      dimension: dim,
      label: labelFor(dim),
      confidence: confidenceFor(dim),
      isoClauseReferences: clausesFor(dim),
      isGuardianNative: false,
    }
  })

  return {
    report: {
      assessmentId: 'assess-iso-e2e-001',
      batchId: 'batch-iso-e2e-001',
      payload: {
        compositeScore: 72,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        executiveSummary: 'The vendor demonstrates adequate controls with gaps in security.',
        keyFindings: [
          'Strong privacy controls aligned with ISO 42001 A.4.2',
          'Security gaps in penetration testing cadence',
          'AI transparency documentation is comprehensive',
        ],
        disqualifyingFactors: [],
        dimensionScores,
      },
      narrativeReport: '## Analysis\n\nDetailed narrative report content.',
      rubricVersion: 'guardian-v1.0',
      modelId: 'claude-sonnet-4-20250514',
      scoringDurationMs: 45000,
    },
    vendorName: 'MedTech Solutions Inc.',
    solutionName: 'ClinicalAI Pro',
    assessmentType: 'comprehensive',
    generatedAt: FIXED_DATE,
    dimensionISOData,
  }
}

function labelFor(dim: RiskDimension): string {
  const labels: Record<RiskDimension, string> = {
    clinical_risk: 'Clinical Risk',
    privacy_risk: 'Privacy Risk',
    security_risk: 'Security Risk',
    technical_credibility: 'Technical Credibility',
    vendor_capability: 'Vendor Capability',
    ai_transparency: 'AI Transparency',
    ethical_considerations: 'Ethical Considerations',
    regulatory_compliance: 'Regulatory Compliance',
    operational_excellence: 'Operational Excellence',
    sustainability: 'Sustainability',
  }
  return labels[dim]
}

function confidenceFor(dim: RiskDimension): { level: 'high' | 'medium' | 'low'; rationale: string } {
  const map: Partial<Record<RiskDimension, { level: 'high' | 'medium' | 'low'; rationale: string }>> = {
    privacy_risk: { level: 'high', rationale: 'Comprehensive privacy documentation reviewed' },
    security_risk: { level: 'low', rationale: 'Limited penetration test evidence provided' },
    technical_credibility: { level: 'medium', rationale: 'Architecture docs partially reviewed' },
    ai_transparency: { level: 'high', rationale: 'Model cards and documentation present' },
    regulatory_compliance: { level: 'medium', rationale: 'Some regulatory gaps identified' },
    operational_excellence: { level: 'high', rationale: 'Strong SLA and uptime evidence' },
  }
  return map[dim] ?? { level: 'medium', rationale: 'Standard assessment' }
}

function clausesFor(dim: RiskDimension): Array<{ clauseRef: string; title: string; framework: string; status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable' }> {
  const map: Partial<Record<RiskDimension, Array<{ clauseRef: string; title: string; framework: string; status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable' }>>> = {
    privacy_risk: [
      { clauseRef: 'A.4.2', title: 'Data quality management for AI systems', framework: 'ISO/IEC 42001', status: 'aligned' },
      { clauseRef: 'A.8.4', title: 'Privacy impact assessment', framework: 'ISO/IEC 42001', status: 'aligned' },
    ],
    security_risk: [
      { clauseRef: 'A.5.2', title: 'Information security policies', framework: 'ISO/IEC 27001', status: 'partial' },
      { clauseRef: 'A.8.1', title: 'Technology vulnerability management', framework: 'ISO/IEC 27001', status: 'not_evidenced' },
    ],
    technical_credibility: [
      { clauseRef: 'A.6.2.6', title: 'AI system lifecycle processes', framework: 'ISO/IEC 42001', status: 'partial' },
    ],
    ai_transparency: [
      { clauseRef: 'A.5.4', title: 'Documentation of AI system objectives', framework: 'ISO/IEC 42001', status: 'aligned' },
      { clauseRef: 'A.10.3', title: 'Communicating AI decisions', framework: 'ISO/IEC 42001', status: 'not_applicable' },
    ],
    regulatory_compliance: [
      { clauseRef: 'A.4.4', title: 'AI-specific legal requirements', framework: 'ISO/IEC 42001', status: 'partial' },
    ],
    operational_excellence: [
      { clauseRef: 'A.7.3', title: 'Competence for AI systems', framework: 'ISO/IEC 42001', status: 'aligned' },
      { clauseRef: 'A.8.2', title: 'Operational planning and control', framework: 'ISO/IEC 27001', status: 'aligned' },
    ],
  }
  return map[dim] ?? []
}

describe('ISO Export Pipeline Integration', () => {
  const fixture = buildFullFixture()

  describe('PDF HTML Rendering', () => {
    let html: string

    beforeAll(async () => {
      const template = await fs.readFile(TEMPLATE_PATH, 'utf-8')
      const exporter = new ScoringPDFExporter(TEMPLATE_PATH)
      html = (exporter as any).renderTemplate(template, fixture)
    })

    it('should contain ISO clause references in rendered HTML', () => {
      expect(html).toContain('A.4.2')
      expect(html).toContain('A.5.2')
      expect(html).toContain('A.6.2.6')
      expect(html).toContain('A.8.1')
    })

    it('should contain confidence badges', () => {
      expect(html).toContain('confidence-badge high')
      expect(html).toContain('confidence-badge low')
      expect(html).toContain('confidence-badge medium')
    })

    it('should contain ISO disclaimer text', () => {
      expect(html).toContain('informed by ISO/IEC 42001')
      expect(html).toContain('not ISO certification')
    })

    it('should mark Guardian-native dimensions correctly', () => {
      expect(html).toContain('Guardian Healthcare-Specific')
      // Guardian-native dimensions should have "--" for ISO refs
      expect(html).toContain('class="no-data"')
    })

    it('should contain both frameworks in ISO alignment section', () => {
      expect(html).toContain('ISO/IEC 42001')
      expect(html).toContain('ISO/IEC 27001')
    })

    it('should contain all four ISO status types', () => {
      expect(html).toContain('ALIGNED')
      expect(html).toContain('PARTIAL')
      expect(html).toContain('NOT EVIDENCED')
      expect(html).toContain('NOT APPLICABLE')
    })

    it('should render ISO ref counts for mapped dimensions', () => {
      // privacy_risk has 2 clauses
      expect(html).toContain('2 clauses')
      // technical_credibility has 1 clause
      expect(html).toContain('1 clause')
    })
  })

  describe('Word Export', () => {
    it('should generate a valid Word buffer with ISO data', async () => {
      const exporter = new ScoringWordExporter()
      const buffer = await exporter.generateWord(fixture)

      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(0)
      // .docx files are ZIP archives starting with PK
      const header = buffer.subarray(0, 2).toString()
      expect(header).toBe('PK')
    })

    it('should produce a buffer of reasonable size for 10-dimension report', async () => {
      const exporter = new ScoringWordExporter()
      const buffer = await exporter.generateWord(fixture)

      // A full 10-dimension report with ISO sections should be substantial
      expect(buffer.length).toBeGreaterThan(5000)
    })
  })

  describe('Excel Export', () => {
    let workbook: ExcelJS.Workbook

    beforeAll(async () => {
      const exporter = new ScoringExcelExporter()
      const buffer = await exporter.generateExcel(fixture)
      workbook = new ExcelJS.Workbook()
      // @ts-expect-error - Node.js 22 Buffer type incompatible with ExcelJS types
      await workbook.xlsx.load(buffer)
    })

    it('should return a valid Excel buffer', async () => {
      const exporter = new ScoringExcelExporter()
      const buffer = await exporter.generateExcel(fixture)

      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(0)
    })

    it('should have Scoring Summary sheet', () => {
      const sheet = workbook.getWorksheet('Scoring Summary')
      expect(sheet).toBeDefined()
    })

    it('should have ISO Control Mapping sheet', () => {
      const sheet = workbook.getWorksheet('ISO Control Mapping')
      expect(sheet).toBeDefined()
    })

    it('should have dimension rows in Scoring Summary', () => {
      const sheet = workbook.getWorksheet('Scoring Summary')!
      let foundPrivacy = false
      let foundClinical = false
      sheet.eachRow((row) => {
        const cellValue = row.getCell(1).value?.toString() ?? ''
        if (cellValue === 'Privacy Risk') foundPrivacy = true
        if (cellValue === 'Clinical Risk') foundClinical = true
      })
      expect(foundPrivacy).toBe(true)
      expect(foundClinical).toBe(true)
    })

    it('should have clause data in ISO Control Mapping sheet', () => {
      const sheet = workbook.getWorksheet('ISO Control Mapping')!
      let foundClause = false
      let foundFramework = false
      sheet.eachRow((row) => {
        const cellValue = row.getCell(2).value?.toString() ?? ''
        if (cellValue === 'A.4.2') foundClause = true
        const framework = row.getCell(1).value?.toString() ?? ''
        if (framework === 'ISO/IEC 42001') foundFramework = true
      })
      expect(foundClause).toBe(true)
      expect(foundFramework).toBe(true)
    })

    it('should not include Guardian-native dimensions in ISO Control Mapping', () => {
      const sheet = workbook.getWorksheet('ISO Control Mapping')!
      const guardianNativeLabels = ['Clinical Risk', 'Vendor Capability', 'Ethical Considerations', 'Sustainability']
      sheet.eachRow((row) => {
        const dimLabel = row.getCell(4).value?.toString() ?? ''
        for (const nativeLabel of guardianNativeLabels) {
          expect(dimLabel).not.toBe(nativeLabel)
        }
      })
    })

    it('should have ISO disclaimer in Scoring Summary footer', () => {
      const sheet = workbook.getWorksheet('Scoring Summary')!
      let foundDisclaimer = false
      sheet.eachRow((row) => {
        const cellValue = row.getCell(1).value?.toString() ?? ''
        if (cellValue.includes('informed by ISO/IEC 42001')) {
          foundDisclaimer = true
        }
      })
      expect(foundDisclaimer).toBe(true)
    })

    it('should have frozen header rows', () => {
      const summarySheet = workbook.getWorksheet('Scoring Summary')!
      expect(summarySheet.views.length).toBeGreaterThan(0)
      expect(summarySheet.views[0].state).toBe('frozen')

      const isoSheet = workbook.getWorksheet('ISO Control Mapping')!
      expect(isoSheet.views.length).toBeGreaterThan(0)
      expect(isoSheet.views[0].state).toBe('frozen')
    })
  })
})
