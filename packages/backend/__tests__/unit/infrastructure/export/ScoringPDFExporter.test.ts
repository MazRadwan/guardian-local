/**
 * ScoringPDFExporter Unit Tests
 *
 * Tests PDF generation for scoring reports with markdown sanitization,
 * ISO confidence badges, ISO alignment section, Guardian-native labels,
 * and ISO disclaimer.
 */

import { ScoringPDFExporter } from '../../../../src/infrastructure/export/ScoringPDFExporter'
import { DimensionExportISOData, ScoringExportData } from '../../../../src/application/interfaces/IScoringPDFExporter'
import { findProhibitedTerms, ISO_DISCLAIMER } from '../../../../src/domain/compliance/isoMessagingTerms'
import path from 'path'

// Capture rendered HTML for content assertions
let capturedHtml = ''
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockImplementation((html: string) => {
        capturedHtml = html
        return Promise.resolve()
      }),
      pdf: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}))

describe('ScoringPDFExporter', () => {
  let exporter: ScoringPDFExporter
  const templatePath = path.join(__dirname, '../../../../src/infrastructure/export/templates/scoring-report.html')

  beforeEach(() => {
    exporter = new ScoringPDFExporter(templatePath)
    capturedHtml = ''
  })

  // Helper: base mock data factory
  function makeBaseData(overrides?: Partial<ScoringExportData>): ScoringExportData {
    return {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 85,
          recommendation: 'approve',
          overallRiskRating: 'low',
          executiveSummary: 'Vendor demonstrates strong controls.',
          keyFindings: ['Strong encryption', 'Good compliance'],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'privacy_risk', score: 90, riskRating: 'low' },
            { dimension: 'security_risk', score: 80, riskRating: 'medium' },
            { dimension: 'regulatory_compliance', score: 70, riskRating: 'medium' },
            { dimension: 'clinical_risk', score: 60, riskRating: 'high' },
          ],
        },
        narrativeReport: '# Analysis\n\nDetailed report.',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 15000,
      },
      vendorName: 'Acme Corp',
      solutionName: 'Acme AI Platform',
      assessmentType: 'comprehensive',
      generatedAt: new Date('2025-01-15T12:00:00Z'),
      dimensionISOData: [],
      ...overrides,
    }
  }

  // Helper: build dimension ISO data with common patterns
  function makeISOData(): DimensionExportISOData[] {
    return [
      {
        dimension: 'privacy_risk',
        label: 'Privacy Risk',
        confidence: { level: 'high', rationale: 'Strong evidence from vendor docs' },
        isoClauseReferences: [
          { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'aligned' },
          { clauseRef: 'A.8.4', title: 'Privacy impact assessment', framework: 'ISO/IEC 42001', status: 'partial' },
        ],
        isGuardianNative: false,
      },
      {
        dimension: 'security_risk',
        label: 'Security Risk',
        confidence: { level: 'medium', rationale: 'Some gaps in evidence' },
        isoClauseReferences: [
          { clauseRef: '6.3.1', title: 'Risk identification', framework: 'ISO/IEC 23894', status: 'aligned' },
          { clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'aligned' },
          { clauseRef: '6.4.1', title: 'Risk treatment', framework: 'ISO/IEC 23894', status: 'not_applicable' },
        ],
        isGuardianNative: false,
      },
      {
        dimension: 'regulatory_compliance',
        label: 'Regulatory Compliance',
        confidence: { level: 'low', rationale: 'Limited documentation' },
        isoClauseReferences: [
          { clauseRef: '6.3.2', title: 'Risk analysis', framework: 'ISO/IEC 23894', status: 'not_evidenced' },
        ],
        isGuardianNative: false,
      },
      {
        dimension: 'clinical_risk',
        label: 'Clinical Risk',
        confidence: null,
        isoClauseReferences: [],
        isGuardianNative: true,
      },
    ]
  }

  it('should throw error if templatePath is not provided', () => {
    expect(() => new ScoringPDFExporter('')).toThrow('ScoringPDFExporter requires templatePath')
  })

  it('should generate PDF with valid data', async () => {
    const buffer = await exporter.generatePDF(makeBaseData())
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('should escape HTML in user-provided content', async () => {
    const data = makeBaseData({
      vendorName: 'Test <script>alert("xss")</script> Vendor',
    })
    data.report.payload.executiveSummary = '<script>alert("xss")</script>Safe summary'

    const buffer = await exporter.generatePDF(data)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(capturedHtml).not.toContain('<script>')
  })

  it('should sanitize markdown to prevent XSS', async () => {
    const data = makeBaseData()
    data.report.narrativeReport = '# Safe\n\n<script>alert("xss")</script>\n\n**Bold**'

    // Should not throw - XSS should be sanitized by DOMPurify
    const buffer = await exporter.generatePDF(data)
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('should handle all recommendation types', async () => {
    const recommendations: Array<'approve' | 'conditional' | 'decline' | 'more_info'> = [
      'approve', 'conditional', 'decline', 'more_info',
    ]
    for (const rec of recommendations) {
      const data = makeBaseData()
      data.report.payload.recommendation = rec
      const buffer = await exporter.generatePDF(data)
      expect(buffer).toBeInstanceOf(Buffer)
    }
  })

  it('should render dimension scores with proper risk colors', async () => {
    const data = makeBaseData()
    data.report.payload.dimensionScores = [
      { dimension: 'privacy_risk', score: 95, riskRating: 'low' },
      { dimension: 'security_risk', score: 75, riskRating: 'medium' },
      { dimension: 'regulatory_compliance', score: 50, riskRating: 'high' },
      { dimension: 'ai_transparency', score: 25, riskRating: 'critical' },
    ]

    await exporter.generatePDF(data)
    expect(capturedHtml).toContain('risk-badge low')
    expect(capturedHtml).toContain('risk-badge medium')
    expect(capturedHtml).toContain('risk-badge high')
    expect(capturedHtml).toContain('risk-badge critical')
  })

  // ========== Story 38.3.1: Confidence Badges + ISO Refs Columns ==========

  describe('Dimension table ISO columns (38.3.1)', () => {
    it('should include confidence badge HTML for dimensions with confidence', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('confidence-badge high')
      expect(capturedHtml).toContain('>HIGH</span>')
      expect(capturedHtml).toContain('confidence-badge medium')
      expect(capturedHtml).toContain('>MEDIUM</span>')
      expect(capturedHtml).toContain('confidence-badge low')
      expect(capturedHtml).toContain('>LOW</span>')

      // Table column headers must be present
      expect(capturedHtml).toContain('<th>Confidence</th>')
      expect(capturedHtml).toContain('<th>ISO Refs</th>')
    })

    it('should show "--" for dimensions without confidence data', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // clinical_risk has confidence: null
      expect(capturedHtml).toContain('class="no-data">--</span>')
    })

    it('should include ISO clause count for mapped dimensions', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // privacy_risk has 2 clauses
      expect(capturedHtml).toContain('iso-ref-count">2 clauses</span>')
      // security_risk has 3 clauses
      expect(capturedHtml).toContain('iso-ref-count">3 clauses</span>')
      // regulatory_compliance has 1 clause
      expect(capturedHtml).toContain('iso-ref-count">1 clause</span>')
    })

    it('should show "--" for Guardian-native dimensions in ISO Refs column', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // clinical_risk is Guardian-native, so ISO Refs should be "--"
      // We verify the no-data pattern appears (used by both confidence null AND guardian-native ISO refs)
      const noDataCount = (capturedHtml.match(/class="no-data">--<\/span>/g) || []).length
      // clinical_risk has null confidence (1 no-data) and is guardian-native (1 no-data) = 2 from clinical_risk
      expect(noDataCount).toBeGreaterThanOrEqual(2)
    })

    it('should contain confidence-badge CSS class in output', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('.confidence-badge')
    })

    it('should show "--" for all dimensions when dimensionISOData is empty', async () => {
      const data = makeBaseData({ dimensionISOData: [] })
      await exporter.generatePDF(data)

      // 4 dimensions x 2 columns (confidence + ISO refs) = 8 no-data spans
      const noDataCount = (capturedHtml.match(/class="no-data">--<\/span>/g) || []).length
      expect(noDataCount).toBe(8)
    })
  })

  // ========== Story 38.3.2: ISO Alignment Section ==========

  describe('ISO Alignment section (38.3.2)', () => {
    it('should render ISO alignment section when ISO clauses exist', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('ISO Standards Alignment')
      expect(capturedHtml).toContain('iso-alignment-table')
      expect(capturedHtml).toContain('section page-break')
    })

    it('should not render ISO alignment section when no ISO clauses exist', async () => {
      const data = makeBaseData({ dimensionISOData: [] })
      await exporter.generatePDF(data)

      // The heading only appears when buildISOAlignmentSection returns content
      expect(capturedHtml).not.toContain('<h2>ISO Standards Alignment</h2>')
    })

    it('should not render ISO alignment section when only Guardian-native dimensions exist', async () => {
      const guardianOnlyData: DimensionExportISOData[] = [
        {
          dimension: 'clinical_risk',
          label: 'Clinical Risk',
          confidence: null,
          isoClauseReferences: [],
          isGuardianNative: true,
        },
      ]
      const data = makeBaseData({ dimensionISOData: guardianOnlyData })
      await exporter.generatePDF(data)

      expect(capturedHtml).not.toContain('<h2>ISO Standards Alignment</h2>')
    })

    it('should group clauses by framework', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('ISO/IEC 42001')
      expect(capturedHtml).toContain('ISO/IEC 23894')
    })

    it('should display correct status badges with CSS classes', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('iso-status aligned')
      expect(capturedHtml).toContain('iso-status partial')
      expect(capturedHtml).toContain('iso-status not_evidenced')
      expect(capturedHtml).toContain('iso-status not_applicable')
    })

    it('should deduplicate: same clause from multiple dimensions listed once', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // A.6.2.6 appears in both privacy_risk and security_risk under ISO/IEC 42001
      // It should appear only once in the alignment table
      const clauseMatches = capturedHtml.match(/A\.6\.2\.6/g) || []
      // Once in the alignment table row (inside <strong>), may also appear in clause count context
      // The important thing: only 1 row for this clause
      const rowMatches = capturedHtml.match(/<strong>A\.6\.2\.6<\/strong>/g) || []
      expect(rowMatches.length).toBe(1)
    })

    it('should list all referencing dimensions for a deduplicated clause', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // A.6.2.6 is referenced by both Privacy Risk and Security Risk
      // They should both appear in the dimensions column of that row
      expect(capturedHtml).toContain('Privacy Risk, Security Risk')
    })

    it('should keep worst-case status when same clause appears in multiple dimensions', async () => {
      // A.6.2.6 appears in privacy_risk as "aligned" and security_risk as "aligned"
      // Override security_risk to have "partial" for A.6.2.6 to test worst-case dedup
      const isoData = makeISOData()
      // Set security_risk's A.6.2.6 to "partial"
      isoData[1].isoClauseReferences[1] = {
        clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'partial',
      }
      const data = makeBaseData({ dimensionISOData: isoData })
      await exporter.generatePDF(data)

      // The deduplicated row for A.6.2.6 should show "partial" (worse than "aligned")
      const rowMatch = capturedHtml.match(/<strong>A\.6\.2\.6<\/strong>[\s\S]*?<\/tr>/)
      expect(rowMatch).not.toBeNull()
      expect(rowMatch![0]).toContain('iso-status partial')
      expect(rowMatch![0]).not.toContain('iso-status aligned')
    })

    it('should keep not_evidenced over aligned in worst-case dedup', async () => {
      const isoData = makeISOData()
      // Set security_risk's A.6.2.6 to "not_evidenced" (privacy_risk has "aligned")
      isoData[1].isoClauseReferences[1] = {
        clauseRef: 'A.6.2.6', title: 'Data quality management', framework: 'ISO/IEC 42001', status: 'not_evidenced',
      }
      const data = makeBaseData({ dimensionISOData: isoData })
      await exporter.generatePDF(data)

      const rowMatch = capturedHtml.match(/<strong>A\.6\.2\.6<\/strong>[\s\S]*?<\/tr>/)
      expect(rowMatch).not.toBeNull()
      expect(rowMatch![0]).toContain('iso-status not_evidenced')
      expect(rowMatch![0]).not.toContain('iso-status aligned')
    })

    it('should sort clauses within each framework', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // ISO/IEC 23894 has 6.3.1 and 6.3.2 -- 6.3.1 should come first
      const idx1 = capturedHtml.indexOf('6.3.1')
      const idx2 = capturedHtml.indexOf('6.3.2')
      expect(idx1).toBeLessThan(idx2)
    })
  })

  // ========== Story 38.3.3: Guardian-Native Labels + ISO Disclaimer ==========

  describe('Guardian-native labels and ISO disclaimer (38.3.3)', () => {
    it('should add "Guardian Healthcare-Specific" label to Guardian-native dimensions', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('guardian-native-label')
      expect(capturedHtml).toContain('Guardian Healthcare-Specific')
    })

    it('should not add Guardian label to non-Guardian-native dimensions', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // Privacy Risk is not guardian-native; its label should not have the span
      // Find the privacy_risk row area and check it does not have guardian-native-label
      const privacyIdx = capturedHtml.indexOf('Privacy Risk')
      const nextTr = capturedHtml.indexOf('</tr>', privacyIdx)
      const privacyRow = capturedHtml.substring(privacyIdx, nextTr)
      expect(privacyRow).not.toContain('guardian-native-label')
    })

    it('should include ISO disclaimer text in footer', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('iso-disclaimer')
      // The disclaimer should be HTML-escaped, so check for the content
      expect(capturedHtml).toContain('This assessment is informed by ISO')
      expect(capturedHtml).toContain('not ISO certification')
    })

    it('should include disclaimer even when no ISO data exists', async () => {
      const data = makeBaseData({ dimensionISOData: [] })
      await exporter.generatePDF(data)

      expect(capturedHtml).toContain('iso-disclaimer')
      expect(capturedHtml).toContain('This assessment is informed by ISO')
    })

    it('should pass prohibited terms check on ISO_DISCLAIMER', () => {
      const violations = findProhibitedTerms(ISO_DISCLAIMER)
      expect(violations).toHaveLength(0)
    })

    it('should render Guardian-native label as HTML span beneath dimension name', async () => {
      const data = makeBaseData({ dimensionISOData: makeISOData() })
      await exporter.generatePDF(data)

      // The label should be: "Clinical Risk<span class="guardian-native-label">Guardian Healthcare-Specific</span>"
      expect(capturedHtml).toContain(
        'Clinical Risk<span class="guardian-native-label">Guardian Healthcare-Specific</span>'
      )
    })
  })
})
