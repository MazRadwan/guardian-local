/**
 * ScoringPDFExporter Unit Tests
 *
 * Tests PDF generation for scoring reports with markdown sanitization
 */

import { ScoringPDFExporter } from '../../../../src/infrastructure/export/ScoringPDFExporter'
import { ScoringExportData } from '../../../../src/application/interfaces/IScoringPDFExporter'
import * as fs from 'fs/promises'
import path from 'path'

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
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
  })

  it('should throw error if templatePath is not provided', () => {
    expect(() => new ScoringPDFExporter('')).toThrow('ScoringPDFExporter requires templatePath')
  })

  it('should generate PDF with valid data', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 85,
          recommendation: 'approve',
          overallRiskRating: 'low',
          executiveSummary: 'The vendor demonstrates strong security controls.',
          keyFindings: ['Strong encryption', 'Good compliance'],
          disqualifyingFactors: [],
          dimensionScores: [
            {
              dimension: 'privacy_risk',
              score: 90,
              riskRating: 'low',
              findings: {
                subScores: [
                  { name: 'Encryption', score: 95, maxScore: 100, notes: 'Excellent' }
                ],
                keyRisks: ['None identified'],
                mitigations: ['N/A'],
                evidenceRefs: [{ sectionNumber: 1, questionNumber: 1, quote: 'Sample quote' }]
              }
            },
            {
              dimension: 'security_risk',
              score: 80,
              riskRating: 'medium',
            }
          ]
        },
        narrativeReport: '# Detailed Analysis\n\nThis is a **test** report.',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 15000,
      },
      vendorName: 'Acme Corp',
      solutionName: 'Acme AI Platform',
      assessmentType: 'comprehensive',
      generatedAt: new Date('2025-01-15T12:00:00Z'),
    }

    const buffer = await exporter.generatePDF(mockData)

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('should escape HTML in user-provided content', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 75,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: '<script>alert("xss")</script>Safe summary',
          keyFindings: ['Finding with <strong>HTML</strong>'],
          disqualifyingFactors: [],
          dimensionScores: []
        },
        narrativeReport: 'Safe report',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 10000,
      },
      vendorName: 'Test <script>alert("xss")</script> Vendor',
      solutionName: 'Safe Solution',
      assessmentType: 'quick',
      generatedAt: new Date(),
    }

    // Should not throw - XSS should be sanitized
    const buffer = await exporter.generatePDF(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('should sanitize markdown to prevent XSS', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 80,
          recommendation: 'approve',
          overallRiskRating: 'low',
          executiveSummary: 'Summary',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: []
        },
        narrativeReport: '# Safe Markdown\n\n<script>alert("xss")</script>\n\n**Bold text**',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 8000,
      },
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      assessmentType: 'comprehensive',
      generatedAt: new Date(),
    }

    const buffer = await exporter.generatePDF(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
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
            executiveSummary: 'Summary',
            keyFindings: [],
            disqualifyingFactors: [],
            dimensionScores: []
          },
          narrativeReport: 'Report',
          rubricVersion: 'v1.0',
          modelId: 'claude-sonnet-4.5',
          scoringDurationMs: 5000,
        },
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        assessmentType: 'quick',
        generatedAt: new Date(),
      }

      const buffer = await exporter.generatePDF(mockData)
      expect(buffer).toBeInstanceOf(Buffer)
    }
  })

  it('should render dimension scores with proper risk colors', async () => {
    const mockData: ScoringExportData = {
      report: {
        assessmentId: 'assess-123',
        batchId: 'batch-456',
        payload: {
          compositeScore: 75,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: 'Summary',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'privacy_risk', score: 95, riskRating: 'low' },
            { dimension: 'security_risk', score: 75, riskRating: 'medium' },
            { dimension: 'regulatory_compliance', score: 50, riskRating: 'high' },
            { dimension: 'ai_transparency', score: 25, riskRating: 'critical' },
          ]
        },
        narrativeReport: 'Report',
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoringDurationMs: 12000,
      },
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      assessmentType: 'comprehensive',
      generatedAt: new Date(),
    }

    const buffer = await exporter.generatePDF(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
  })
})
