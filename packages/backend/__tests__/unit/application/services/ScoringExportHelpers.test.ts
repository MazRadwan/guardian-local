/**
 * ScoringExportHelpers Unit Tests
 *
 * Tests the pure helper functions extracted from ScoringExportService.
 * Epic 38.1.1: Validates selectTopResponses, getSectionDimensionMapping,
 * determineSolutionType, buildFallbackNarrative, and sleep.
 */

import {
  selectTopResponses,
  getSectionDimensionMapping,
  determineSolutionType,
  buildFallbackNarrative,
  buildDimensionISOData,
  sleep,
} from '../../../../src/application/services/ScoringExportHelpers'
import { DimensionScoreData } from '../../../../src/domain/scoring/types'
import { AssessmentResultDTO, ResponseDTO } from '../../../../src/domain/scoring/dtos'

// Helper to create a ResponseDTO fixture
function makeResponse(overrides: Partial<ResponseDTO> = {}): ResponseDTO {
  return {
    id: 'resp-1',
    assessmentId: 'assess-1',
    batchId: 'batch-1',
    sectionNumber: 1,
    questionNumber: 1,
    questionText: 'Q1',
    responseText: 'Response text',
    hasVisualContent: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// Helper to create a DimensionScoreData fixture
function makeDimensionScore(overrides: Partial<DimensionScoreData> = {}): DimensionScoreData {
  return {
    dimension: 'privacy_risk',
    score: 80,
    riskRating: 'low',
    ...overrides,
  }
}

// Helper to create an AssessmentResultDTO fixture
function makeResult(overrides: Partial<AssessmentResultDTO> = {}): AssessmentResultDTO {
  return {
    id: 'result-1',
    assessmentId: 'assess-1',
    batchId: 'batch-1',
    compositeScore: 85,
    recommendation: 'approve',
    overallRiskRating: 'low',
    executiveSummary: 'Strong vendor with good security practices.',
    keyFindings: ['Finding 1', 'Finding 2'],
    disqualifyingFactors: [],
    narrativeStatus: null,
    rubricVersion: 'v1.0',
    modelId: 'claude-sonnet-4.5',
    scoredAt: new Date(),
    scoringDurationMs: 10000,
    ...overrides,
  }
}

describe('ScoringExportHelpers', () => {
  describe('selectTopResponses', () => {
    it('should use evidenceRefs when available', () => {
      const responses: ResponseDTO[] = [
        makeResponse({ id: 'r1', sectionNumber: 3, questionNumber: 1, responseText: 'Privacy answer' }),
        makeResponse({ id: 'r2', sectionNumber: 4, questionNumber: 1, responseText: 'Security answer' }),
        makeResponse({ id: 'r3', sectionNumber: 5, questionNumber: 1, responseText: 'Tech answer' }),
      ]

      const dimensionScores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'privacy_risk',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [
              { sectionNumber: 3, questionNumber: 1, quote: 'Privacy evidence' },
            ],
          },
        }),
      ]

      const result = selectTopResponses(responses, dimensionScores)

      // Should include the response matching the evidenceRef
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sectionNumber: 3, questionNumber: 1 }),
        ])
      )
    })

    it('should fall back to section mapping when no evidenceRefs', () => {
      const responses: ResponseDTO[] = [
        makeResponse({ id: 'r1', sectionNumber: 3, questionNumber: 1, responseText: 'Privacy response 1' }),
        makeResponse({ id: 'r2', sectionNumber: 3, questionNumber: 2, responseText: 'Privacy response 2' }),
        makeResponse({ id: 'r3', sectionNumber: 7, questionNumber: 1, responseText: 'Other response' }),
      ]

      const dimensionScores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'privacy_risk',
          // No findings/evidenceRefs
        }),
      ]

      const result = selectTopResponses(responses, dimensionScores)

      // Should select responses from section 3 (mapped to privacy_risk)
      const section3Responses = result.filter((r) => r.sectionNumber === 3)
      expect(section3Responses.length).toBeGreaterThan(0)
    })

    it('should fall back to even distribution when < 10 selected', () => {
      // Create responses from various sections with an unmapped dimension
      const responses: ResponseDTO[] = Array.from({ length: 20 }, (_, i) => (
        makeResponse({
          id: `r-${i}`,
          sectionNumber: (i % 5) + 1,
          questionNumber: Math.floor(i / 5) + 1,
          responseText: `Response ${i}`,
        })
      ))

      const dimensionScores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'unknown_dimension' as DimensionScoreData['dimension'],
          // No findings, no mapping for this dimension
        }),
      ]

      const result = selectTopResponses(responses, dimensionScores)

      // Should select some responses via even distribution fallback
      expect(result.length).toBeGreaterThan(0)
      // Should have responses from multiple sections
      const sections = new Set(result.map((r) => r.sectionNumber))
      expect(sections.size).toBeGreaterThan(1)
    })

    it('should truncate responses to 500 chars', () => {
      const longText = 'A'.repeat(1000)
      const responses: ResponseDTO[] = [
        makeResponse({ id: 'r1', sectionNumber: 1, questionNumber: 1, responseText: longText }),
      ]

      const dimensionScores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'clinical_risk',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [{ sectionNumber: 1, questionNumber: 1, quote: 'evidence' }],
          },
        }),
      ]

      const result = selectTopResponses(responses, dimensionScores)

      expect(result.length).toBe(1)
      expect(result[0].responseText.length).toBeLessThanOrEqual(503) // 500 + '...'
      expect(result[0].responseText.endsWith('...')).toBe(true)
    })

    it('should not append ellipsis to responses under 500 chars', () => {
      const shortText = 'Short response'
      const responses: ResponseDTO[] = [
        makeResponse({ id: 'r1', sectionNumber: 1, questionNumber: 1, responseText: shortText }),
      ]

      const dimensionScores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'clinical_risk',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [{ sectionNumber: 1, questionNumber: 1, quote: 'evidence' }],
          },
        }),
      ]

      const result = selectTopResponses(responses, dimensionScores)

      expect(result[0].responseText).toBe('Short response')
      expect(result[0].responseText.endsWith('...')).toBe(false)
    })

    it('should cap at 30 responses max', () => {
      // Create 50 responses across 10 sections
      const responses: ResponseDTO[] = Array.from({ length: 50 }, (_, i) => (
        makeResponse({
          id: `r-${i}`,
          sectionNumber: (i % 10) + 1,
          questionNumber: Math.floor(i / 10) + 1,
          responseText: `Response ${i}`,
        })
      ))

      // Use dimensions that map to many sections to maximize selection
      const dimensionScores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'clinical_risk' }),
        makeDimensionScore({ dimension: 'privacy_risk' }),
        makeDimensionScore({ dimension: 'security_risk' }),
        makeDimensionScore({ dimension: 'technical_credibility' }),
        makeDimensionScore({ dimension: 'operational_excellence' }),
        makeDimensionScore({ dimension: 'vendor_capability' }),
        makeDimensionScore({ dimension: 'ai_transparency' }),
        makeDimensionScore({ dimension: 'ethical_considerations' }),
        makeDimensionScore({ dimension: 'regulatory_compliance' }),
        makeDimensionScore({ dimension: 'sustainability' }),
      ]

      const result = selectTopResponses(responses, dimensionScores)

      expect(result.length).toBeLessThanOrEqual(30)
    })

    it('should handle empty responses', () => {
      const result = selectTopResponses([], [
        makeDimensionScore({ dimension: 'privacy_risk' }),
      ])

      expect(result).toEqual([])
    })

    it('should handle empty dimensionScores', () => {
      const responses: ResponseDTO[] = [
        makeResponse({ id: 'r1', sectionNumber: 1, questionNumber: 1 }),
      ]

      const result = selectTopResponses(responses, [])

      // With no dimension scores, strategies 1 and 2 produce nothing,
      // but strategy 3 kicks in (selected.length < 10)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('getSectionDimensionMapping', () => {
    it('should return correct section-to-dimension map', () => {
      const mapping = getSectionDimensionMapping()

      expect(mapping).toEqual({
        clinical_risk: [1, 2],
        privacy_risk: [3],
        security_risk: [4],
        technical_credibility: [5, 6],
        operational_excellence: [7],
        vendor_capability: [8],
        ai_transparency: [5],
        ethical_considerations: [9],
        regulatory_compliance: [3, 10],
        sustainability: [8],
      })
    })

    it('should include all 10 dimensions', () => {
      const mapping = getSectionDimensionMapping()
      const dimensions = Object.keys(mapping)

      expect(dimensions).toHaveLength(10)
      expect(dimensions).toContain('clinical_risk')
      expect(dimensions).toContain('privacy_risk')
      expect(dimensions).toContain('security_risk')
      expect(dimensions).toContain('technical_credibility')
      expect(dimensions).toContain('operational_excellence')
      expect(dimensions).toContain('vendor_capability')
      expect(dimensions).toContain('ai_transparency')
      expect(dimensions).toContain('ethical_considerations')
      expect(dimensions).toContain('regulatory_compliance')
      expect(dimensions).toContain('sustainability')
    })
  })

  describe('determineSolutionType', () => {
    it('should return clinical_ai for exact match', () => {
      expect(determineSolutionType('clinical_ai')).toBe('clinical_ai')
    })

    it('should return administrative_ai for exact match', () => {
      expect(determineSolutionType('administrative_ai')).toBe('administrative_ai')
    })

    it('should return patient_facing for exact match', () => {
      expect(determineSolutionType('patient_facing')).toBe('patient_facing')
    })

    it('should handle case-insensitive matching', () => {
      expect(determineSolutionType('CLINICAL_AI')).toBe('clinical_ai')
      expect(determineSolutionType('Administrative_AI')).toBe('administrative_ai')
      expect(determineSolutionType('Patient_Facing')).toBe('patient_facing')
    })

    it('should default to clinical_ai when null', () => {
      expect(determineSolutionType(null)).toBe('clinical_ai')
    })

    it('should default to clinical_ai for invalid string', () => {
      expect(determineSolutionType('Something Random')).toBe('clinical_ai')
    })

    it('should default to clinical_ai for empty string', () => {
      expect(determineSolutionType('')).toBe('clinical_ai')
    })

    it('should log a warning for invalid values', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      determineSolutionType('Invalid Type')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid solutionType "Invalid Type"')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('buildFallbackNarrative', () => {
    it('should include executiveSummary and keyFindings', () => {
      const result = makeResult({
        executiveSummary: 'This is a strong vendor.',
        keyFindings: ['Good security', 'Strong encryption'],
      })

      const narrative = buildFallbackNarrative(result)

      expect(narrative).toContain('## Executive Summary')
      expect(narrative).toContain('This is a strong vendor.')
      expect(narrative).toContain('## Key Findings')
      expect(narrative).toContain('- Good security')
      expect(narrative).toContain('- Strong encryption')
      expect(narrative).toContain('Detailed analysis was not available')
    })

    it('should handle missing executiveSummary', () => {
      const result = makeResult({
        executiveSummary: undefined,
        keyFindings: ['Finding 1'],
      })

      const narrative = buildFallbackNarrative(result)

      expect(narrative).toContain('No executive summary available.')
      expect(narrative).toContain('- Finding 1')
    })

    it('should handle missing keyFindings', () => {
      const result = makeResult({
        executiveSummary: 'Summary here.',
        keyFindings: undefined,
      })

      const narrative = buildFallbackNarrative(result)

      expect(narrative).toContain('Summary here.')
      expect(narrative).toContain('No key findings available.')
    })

    it('should handle empty keyFindings array', () => {
      const result = makeResult({
        executiveSummary: 'Summary.',
        keyFindings: [],
      })

      const narrative = buildFallbackNarrative(result)

      expect(narrative).toContain('No key findings available.')
    })

    it('should include the support contact note', () => {
      const result = makeResult()
      const narrative = buildFallbackNarrative(result)

      expect(narrative).toContain('Please contact support if this issue persists.')
    })
  })

  describe('buildDimensionISOData', () => {
    it('should extract confidence from findings', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'regulatory_compliance',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [],
            assessmentConfidence: {
              level: 'high',
              rationale: 'Strong evidence from vendor responses',
            },
          },
        }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result).toHaveLength(1)
      expect(result[0].confidence).toEqual({
        level: 'high',
        rationale: 'Strong evidence from vendor responses',
      })
    })

    it('should extract isoClauseReferences from findings', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'privacy_risk',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [],
            isoClauseReferences: [
              {
                clauseRef: 'A.6.2.6',
                title: 'Data quality management',
                framework: 'ISO/IEC 42001',
                status: 'aligned',
              },
              {
                clauseRef: 'A.8.4',
                title: 'Privacy impact assessment',
                framework: 'ISO/IEC 27701',
                status: 'partial',
              },
            ],
          },
        }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isoClauseReferences).toHaveLength(2)
      expect(result[0].isoClauseReferences[0]).toEqual({
        clauseRef: 'A.6.2.6',
        title: 'Data quality management',
        framework: 'ISO/IEC 42001',
        status: 'aligned',
      })
      expect(result[0].isoClauseReferences[1].status).toBe('partial')
    })

    it('should return confidence: null when findings missing', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'privacy_risk',
          // No findings at all
        }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].confidence).toBeNull()
    })

    it('should return empty array when isoClauseReferences missing', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'security_risk',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [],
            // No isoClauseReferences
          },
        }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isoClauseReferences).toEqual([])
    })

    it('should mark clinical_risk as guardianNative', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'clinical_risk' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isGuardianNative).toBe(true)
    })

    it('should mark vendor_capability as guardianNative', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'vendor_capability' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isGuardianNative).toBe(true)
    })

    it('should mark ethical_considerations as guardianNative', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'ethical_considerations' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isGuardianNative).toBe(true)
    })

    it('should mark sustainability as guardianNative', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'sustainability' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isGuardianNative).toBe(true)
    })

    it('should mark regulatory_compliance as NOT guardianNative', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'regulatory_compliance' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isGuardianNative).toBe(false)
    })

    it('should mark privacy_risk as NOT guardianNative', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'privacy_risk' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].isGuardianNative).toBe(false)
    })

    it('should use DIMENSION_CONFIG labels', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({ dimension: 'clinical_risk' }),
        makeDimensionScore({ dimension: 'privacy_risk' }),
        makeDimensionScore({ dimension: 'regulatory_compliance' }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].label).toBe('Clinical Risk')
      expect(result[1].label).toBe('Privacy Risk')
      expect(result[2].label).toBe('Regulatory Compliance')
    })

    it('should handle all 10 dimensions', () => {
      const allDimensions: DimensionScoreData['dimension'][] = [
        'clinical_risk',
        'privacy_risk',
        'security_risk',
        'technical_credibility',
        'operational_excellence',
        'vendor_capability',
        'ai_transparency',
        'ethical_considerations',
        'regulatory_compliance',
        'sustainability',
      ]

      const scores = allDimensions.map(d => makeDimensionScore({ dimension: d }))
      const result = buildDimensionISOData(scores)

      expect(result).toHaveLength(10)

      // Guardian native: 4 dimensions
      const nativeCount = result.filter(r => r.isGuardianNative).length
      expect(nativeCount).toBe(4)

      // Non-native: 6 dimensions
      const nonNativeCount = result.filter(r => !r.isGuardianNative).length
      expect(nonNativeCount).toBe(6)
    })

    it('should return confidence: null when findings has no assessmentConfidence', () => {
      const scores: DimensionScoreData[] = [
        makeDimensionScore({
          dimension: 'security_risk',
          findings: {
            subScores: [],
            keyRisks: ['Key risk'],
            mitigations: [],
            evidenceRefs: [],
            assessmentConfidence: undefined,
          },
        }),
      ]

      const result = buildDimensionISOData(scores)

      expect(result[0].confidence).toBeNull()
    })

    it('should handle empty dimensionScores array', () => {
      const result = buildDimensionISOData([])

      expect(result).toEqual([])
    })
  })

  describe('sleep', () => {
    it('should resolve after specified ms', async () => {
      const start = Date.now()
      await sleep(50)
      const elapsed = Date.now() - start

      // Allow some tolerance for timer imprecision
      expect(elapsed).toBeGreaterThanOrEqual(40)
      expect(elapsed).toBeLessThan(200)
    })

    it('should resolve with void', async () => {
      const result = await sleep(1)
      expect(result).toBeUndefined()
    })
  })
})
