/**
 * ScoringWordExporter Unit Tests
 *
 * Tests Word document generation for scoring reports
 */

import { ScoringWordExporter } from '../../../../src/infrastructure/export/ScoringWordExporter'
import { ScoringExportData } from '../../../../src/application/interfaces/IScoringPDFExporter'

describe('ScoringWordExporter', () => {
  let exporter: ScoringWordExporter

  beforeEach(() => {
    exporter = new ScoringWordExporter()
  })

  it('should generate Word document with valid data', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 85,
          recommendation: 'approve',
          overallRiskRating: 'low',
          executiveSummary: 'The vendor demonstrates strong security controls.',
          keyFindings: ['Strong encryption', 'Good compliance', 'Well-documented processes'],
          disqualifyingFactors: [],
          dimensionScores: [
            {
              dimension: 'privacy_risk',
              score: 90,
              riskRating: 'low',
              findings: {
                subScores: [
                  { name: 'Encryption', score: 95, maxScore: 100, notes: 'Excellent AES-256' }
                ],
                keyRisks: ['None identified'],
                mitigations: ['N/A'],
                evidenceRefs: [{ sectionNumber: 1, questionNumber: 1, quote: 'We use AES-256' }]
              }
            },
            {
              dimension: 'security_risk',
              score: 80,
              riskRating: 'medium',
            },
            {
              dimension: 'regulatory_compliance',
              score: 85,
              riskRating: 'low',
            }
          ]
        },
        narrativeReport: 'Detailed analysis of the vendor\'s capabilities.\n\nThe vendor shows strong performance.',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 15000,
      },
      vendorName: 'Acme Corp',
      solutionName: 'Acme AI Platform',
      assessmentType: 'comprehensive',
      generatedAt: new Date('2025-01-15T12:00:00Z'),
      dimensionISOData: [],
    }

    const buffer = await exporter.generateWord(mockData)

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
    // Word documents should start with PK (zip file signature)
    expect(buffer[0]).toBe(0x50) // 'P'
    expect(buffer[1]).toBe(0x4B) // 'K'
  })

  it('should handle all recommendation types', async () => {
    const recommendations: Array<'approve' | 'conditional' | 'decline' | 'more_info'> = [
      'approve', 'conditional', 'decline', 'more_info'
    ]

    for (const rec of recommendations) {
      const mockData: ScoringExportData = {
        report: {
          assessmentId: 'assess-123',
          batchId: 'batch-456',
          payload: {
            compositeScore: 70,
            recommendation: rec,
            overallRiskRating: 'medium',
            executiveSummary: `Summary for ${rec}`,
            keyFindings: ['Finding 1', 'Finding 2'],
            disqualifyingFactors: [],
            dimensionScores: [
              { dimension: 'privacy_risk', score: 70, riskRating: 'medium' }
            ]
          },
          narrativeReport: 'Report content',
          rubricVersion: 'v1.0',
          modelId: 'claude-sonnet-4.5',
          scoringDurationMs: 5000,
        },
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        assessmentType: 'quick',
        generatedAt: new Date(),
        dimensionISOData: [],
      }

      const buffer = await exporter.generateWord(mockData)
      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }
  })

  it('should handle all risk ratings', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 65,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: 'Mixed risk profile',
          keyFindings: ['Varied risk levels'],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'privacy_risk', score: 95, riskRating: 'low' },
            { dimension: 'security_risk', score: 75, riskRating: 'medium' },
            { dimension: 'regulatory_compliance', score: 50, riskRating: 'high' },
            { dimension: 'ai_transparency', score: 25, riskRating: 'critical' },
          ]
        },
        narrativeReport: 'Report with varied risk levels',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 12000,
      },
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      assessmentType: 'comprehensive',
      generatedAt: new Date(),
      dimensionISOData: [],
    }

    const buffer = await exporter.generateWord(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('should handle empty key findings', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 80,
          recommendation: 'approve',
          overallRiskRating: 'low',
          executiveSummary: 'Good vendor',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'privacy_risk', score: 80, riskRating: 'low' }
          ]
        },
        narrativeReport: 'Report',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 8000,
      },
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      assessmentType: 'quick',
      generatedAt: new Date(),
      dimensionISOData: [],
    }

    const buffer = await exporter.generateWord(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('should handle multi-line narrative report', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 82,
          recommendation: 'approve',
          overallRiskRating: 'low',
          executiveSummary: 'Strong vendor',
          keyFindings: ['Finding 1'],
          disqualifyingFactors: [],
          dimensionScores: []
        },
        narrativeReport: 'Line 1\nLine 2\nLine 3\n\nParagraph 2',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 10000,
      },
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      assessmentType: 'comprehensive',
      generatedAt: new Date(),
      dimensionISOData: [],
    }

    const buffer = await exporter.generateWord(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('should include all dimension scores in table', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 78,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: 'Summary',
          keyFindings: ['Finding'],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'privacy_risk', score: 85, riskRating: 'low' },
            { dimension: 'security_risk', score: 78, riskRating: 'medium' },
            { dimension: 'regulatory_compliance', score: 72, riskRating: 'medium' },
            { dimension: 'ai_transparency', score: 80, riskRating: 'low' },
            { dimension: 'technical_credibility', score: 75, riskRating: 'medium' },
          ]
        },
        narrativeReport: 'Report',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 18000,
      },
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      assessmentType: 'comprehensive',
      generatedAt: new Date(),
      dimensionISOData: [],
    }

    const buffer = await exporter.generateWord(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000) // Should be substantial with table
  })
})
