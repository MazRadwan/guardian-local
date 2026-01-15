/**
 * ScoringExportService Unit Tests
 *
 * Tests export service orchestration logic for scoring reports.
 *
 * Epic 20: Extended with narrative generation tests.
 */

import { ScoringExportService } from '../../../../src/application/services/ScoringExportService'
import { IAssessmentRepository } from '../../../../src/application/interfaces/IAssessmentRepository'
import { IAssessmentResultRepository } from '../../../../src/application/interfaces/IAssessmentResultRepository'
import { IDimensionScoreRepository } from '../../../../src/application/interfaces/IDimensionScoreRepository'
import { IResponseRepository } from '../../../../src/application/interfaces/IResponseRepository'
import { IScoringPDFExporter } from '../../../../src/application/interfaces/IScoringPDFExporter'
import { IScoringWordExporter } from '../../../../src/application/interfaces/IScoringWordExporter'
import { IExportNarrativeGenerator } from '../../../../src/application/interfaces/IExportNarrativeGenerator'
import { Assessment } from '../../../../src/domain/entities/Assessment'
import { Vendor } from '../../../../src/domain/entities/Vendor'
import { AssessmentResultDTO, DimensionScoreDTO, ResponseDTO } from '../../../../src/domain/scoring/dtos'

describe('ScoringExportService', () => {
  let service: ScoringExportService
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>
  let mockResultRepo: jest.Mocked<IAssessmentResultRepository>
  let mockDimensionScoreRepo: jest.Mocked<IDimensionScoreRepository>
  let mockResponseRepo: jest.Mocked<IResponseRepository>
  let mockPDFExporter: jest.Mocked<IScoringPDFExporter>
  let mockWordExporter: jest.Mocked<IScoringWordExporter>
  let mockNarrativeGenerator: jest.Mocked<IExportNarrativeGenerator>

  // Test fixtures
  const mockAssessment = Assessment.create({
    vendorId: 'vendor-1',
    assessmentType: 'comprehensive',
    solutionName: 'Test Solution',
    solutionType: 'AI Tool',
    createdBy: 'user-1',
  })

  const mockVendor = Vendor.create({
    name: 'Test Vendor',
    industry: 'Healthcare',
  })

  const mockResult: AssessmentResultDTO = {
    id: 'result-1',
    assessmentId: 'assess-1',
    batchId: 'batch-1',
    compositeScore: 85,
    recommendation: 'approve',
    overallRiskRating: 'low',
    narrativeReport: '',
    executiveSummary: 'Strong vendor with good security practices.',
    keyFindings: ['Finding 1', 'Finding 2'],
    disqualifyingFactors: [],
    narrativeStatus: null,
    rubricVersion: 'v1.0',
    modelId: 'claude-sonnet-4.5',
    scoredAt: new Date(),
    scoringDurationMs: 10000,
  }

  const mockDimensionScores: DimensionScoreDTO[] = [
    {
      id: 'dim-1',
      assessmentId: 'assess-1',
      batchId: 'batch-1',
      dimension: 'privacy_risk',
      score: 90,
      riskRating: 'low',
      findings: {
        subScores: [{ name: 'Encryption', score: 95, maxScore: 100, notes: 'Strong' }],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [{ sectionNumber: 3, questionNumber: 1, quote: 'Evidence quote' }],
      },
      createdAt: new Date(),
    },
    {
      id: 'dim-2',
      assessmentId: 'assess-1',
      batchId: 'batch-1',
      dimension: 'security_risk',
      score: 80,
      riskRating: 'medium',
      createdAt: new Date(),
    },
  ]

  const mockResponses: ResponseDTO[] = [
    {
      id: 'resp-1',
      assessmentId: 'assess-1',
      batchId: 'batch-1',
      sectionNumber: 3,
      questionNumber: 1,
      questionText: 'Privacy question',
      responseText: 'Privacy response',
      hasVisualContent: false,
      createdAt: new Date(),
    },
    {
      id: 'resp-2',
      assessmentId: 'assess-1',
      batchId: 'batch-1',
      sectionNumber: 4,
      questionNumber: 1,
      questionText: 'Security question',
      responseText: 'Security response',
      hasVisualContent: false,
      createdAt: new Date(),
    },
  ]

  beforeEach(() => {
    mockAssessmentRepo = {
      findById: jest.fn(),
      // Story 20.3.4: Combined lookup used by ScoringExportService
      findByIdWithVendor: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      findByVendorId: jest.fn(),
      list: jest.fn(),
      findByCreatedBy: jest.fn(),
      getVendor: jest.fn(),
      hasExportedAssessments: jest.fn(),
    } as jest.Mocked<IAssessmentRepository>

    mockResultRepo = {
      create: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      findLatestByAssessmentId: jest.fn(),
      updateNarrativeReport: jest.fn(),
      countTodayForAssessment: jest.fn(),
      findRecentByFileHash: jest.fn(),
      // Epic 20: Narrative generation concurrency control
      claimNarrativeGeneration: jest.fn(),
      finalizeNarrativeGeneration: jest.fn(),
      failNarrativeGeneration: jest.fn(),
      getNarrativeStatus: jest.fn(),
    } as jest.Mocked<IAssessmentResultRepository>

    mockDimensionScoreRepo = {
      createBatch: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      findLatestByAssessmentId: jest.fn(),
    } as jest.Mocked<IDimensionScoreRepository>

    mockResponseRepo = {
      createBatch: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      deleteByBatchId: jest.fn(),
      // Epic 20: Orphan cleanup methods
      findOrphanedBatches: jest.fn().mockResolvedValue([]),
      deleteByBatchIdIfOrphaned: jest.fn().mockResolvedValue(0),
    } as jest.Mocked<IResponseRepository>

    mockPDFExporter = {
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
    } as jest.Mocked<IScoringPDFExporter>

    mockWordExporter = {
      generateWord: jest.fn().mockResolvedValue(Buffer.from('Word content')),
    } as jest.Mocked<IScoringWordExporter>

    mockNarrativeGenerator = {
      generateNarrative: jest.fn().mockResolvedValue('# Generated Narrative\n\nDetailed analysis...'),
    } as jest.Mocked<IExportNarrativeGenerator>

    service = new ScoringExportService(
      mockAssessmentRepo,
      mockResultRepo,
      mockDimensionScoreRepo,
      mockResponseRepo,
      mockPDFExporter,
      mockWordExporter,
      mockNarrativeGenerator
    )
  })

  describe('exportToPDF', () => {
    it('should throw error if assessment not found', async () => {
      // Story 20.3.4: Now using findByIdWithVendor
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue(null)

      await expect(service.exportToPDF('non-existent-id')).rejects.toThrow(
        'Assessment not found: non-existent-id'
      )
    })

    it('should throw error if no scoring results found', async () => {
      // Story 20.3.4: Combined lookup
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
        assessment: mockAssessment,
        vendor: mockVendor,
      })
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(null)

      await expect(service.exportToPDF('assess-1')).rejects.toThrow(
        'No scoring results found for assessment: assess-1'
      )
    })

    it('should throw error if specific batch not found', async () => {
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
        assessment: mockAssessment,
        vendor: mockVendor,
      })
      mockResultRepo.findByBatchId.mockResolvedValue(null)

      await expect(service.exportToPDF('assess-1', 'batch-999')).rejects.toThrow(
        'Scoring result not found for batch: batch-999'
      )
    })

    it('should throw error if no dimension scores found', async () => {
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
        assessment: mockAssessment,
        vendor: mockVendor,
      })
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue([])

      await expect(service.exportToPDF('assess-1')).rejects.toThrow(
        'No dimension scores found for batch: batch-1'
      )
    })

    it('should export PDF with latest results when no batchId provided', async () => {
      const resultWithNarrative = {
        ...mockResult,
        narrativeStatus: 'complete' as const,
        narrativeReport: 'Existing narrative',
      }

      // Story 20.3.4: Combined lookup
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
        assessment: mockAssessment,
        vendor: mockVendor,
      })
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithNarrative)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToPDF('assess-1')

      // Story 20.3.4: Now calls findByIdWithVendor instead of findById + getVendor
      expect(mockAssessmentRepo.findByIdWithVendor).toHaveBeenCalledWith('assess-1')
      expect(mockResultRepo.findLatestByAssessmentId).toHaveBeenCalledWith('assess-1')
      expect(mockDimensionScoreRepo.findByBatchId).toHaveBeenCalledWith('assess-1', 'batch-1')
      expect(mockPDFExporter.generatePDF).toHaveBeenCalled()
      expect(buffer).toBeInstanceOf(Buffer)
    })

    it('should export PDF with specific batch when batchId provided', async () => {
      const resultWithNarrative = {
        ...mockResult,
        batchId: 'batch-specific',
        narrativeStatus: 'complete' as const,
        narrativeReport: 'Existing narrative',
      }

      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
        assessment: mockAssessment,
        vendor: mockVendor,
      })
      mockResultRepo.findByBatchId.mockResolvedValue(resultWithNarrative)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToPDF('assess-1', 'batch-specific')

      expect(mockResultRepo.findByBatchId).toHaveBeenCalledWith('assess-1', 'batch-specific')
      expect(buffer).toBeInstanceOf(Buffer)
    })
  })

  describe('exportToWord', () => {
    it('should throw error if assessment not found', async () => {
      // Story 20.3.4: Now using findByIdWithVendor
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue(null)

      await expect(service.exportToWord('non-existent-id')).rejects.toThrow(
        'Assessment not found: non-existent-id'
      )
    })

    it('should export Word document with valid data', async () => {
      const resultWithNarrative = {
        ...mockResult,
        narrativeStatus: 'complete' as const,
        narrativeReport: 'Existing narrative',
      }

      // Story 20.3.4: Combined lookup
      mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
        assessment: mockAssessment,
        vendor: mockVendor,
      })
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithNarrative)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToWord('assess-1')

      // Story 20.3.4: Now calls findByIdWithVendor
      expect(mockAssessmentRepo.findByIdWithVendor).toHaveBeenCalledWith('assess-1')
      expect(mockWordExporter.generateWord).toHaveBeenCalled()
      expect(buffer).toBeInstanceOf(Buffer)
    })
  })

  describe('Narrative Generation', () => {
    describe('ensureNarrative', () => {
      it('should skip LLM when narrative already exists and status is complete', async () => {
        const resultWithNarrative: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: 'complete',
          narrativeReport: 'Existing detailed narrative',
        }

        // Story 20.3.4: Combined lookup
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

        await service.exportToPDF('assess-1')

        // Should NOT call narrative generator
        expect(mockNarrativeGenerator.generateNarrative).not.toHaveBeenCalled()
        // Should NOT try to claim
        expect(mockResultRepo.claimNarrativeGeneration).not.toHaveBeenCalled()

        // PDF should include existing narrative
        expect(mockPDFExporter.generatePDF).toHaveBeenCalledWith(
          expect.objectContaining({
            report: expect.objectContaining({
              narrativeReport: 'Existing detailed narrative',
            }),
          })
        )
      })

      // GPT Review Fix: Test that existing narrativeReport with null status is treated as complete
      it('should skip LLM when narrative exists but status is null (legacy/pre-migration data)', async () => {
        const resultWithNarrativeNullStatus: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: null,
          narrativeReport: 'Existing narrative from scoring',
        }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithNarrativeNullStatus)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

        await service.exportToPDF('assess-1')

        // Should NOT call narrative generator (existing narrative is reused)
        expect(mockNarrativeGenerator.generateNarrative).not.toHaveBeenCalled()
        // Should NOT try to claim
        expect(mockResultRepo.claimNarrativeGeneration).not.toHaveBeenCalled()

        // PDF should include existing narrative
        expect(mockPDFExporter.generatePDF).toHaveBeenCalledWith(
          expect.objectContaining({
            report: expect.objectContaining({
              narrativeReport: 'Existing narrative from scoring',
            }),
          })
        )
      })

      it('should generate narrative when narrative_report is null', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        // Should claim and generate
        expect(mockResultRepo.claimNarrativeGeneration).toHaveBeenCalledWith(
          'assess-1',
          'batch-1',
          300000
        )
        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalled()
        expect(mockResultRepo.finalizeNarrativeGeneration).toHaveBeenCalledWith(
          'assess-1',
          'batch-1',
          '# Generated Narrative\n\nDetailed analysis...',
          300000
        )
      })

      it('should generate narrative when narrative_report is empty string', async () => {
        const resultWithEmptyNarrative = { ...mockResult, narrativeReport: '' }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithEmptyNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalled()
      })

      it('should persist generated narrative to repository', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)
        mockNarrativeGenerator.generateNarrative.mockResolvedValue('New generated narrative')

        await service.exportToPDF('assess-1')

        expect(mockResultRepo.finalizeNarrativeGeneration).toHaveBeenCalledWith(
          'assess-1',
          'batch-1',
          'New generated narrative',
          300000
        )
      })

      it('should use fallback on LLM error - export succeeds', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)
        mockNarrativeGenerator.generateNarrative.mockRejectedValue(new Error('LLM API error'))

        // Should NOT throw - export should succeed with fallback
        const buffer = await service.exportToPDF('assess-1')

        expect(buffer).toBeInstanceOf(Buffer)
        expect(mockResultRepo.failNarrativeGeneration).toHaveBeenCalledWith(
          'assess-1',
          'batch-1',
          'LLM API error',
          300000
        )
      })

      it('should include warning message in fallback narrative', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)
        mockNarrativeGenerator.generateNarrative.mockRejectedValue(new Error('LLM error'))

        await service.exportToPDF('assess-1')

        // Check that fallback narrative includes warning
        expect(mockPDFExporter.generatePDF).toHaveBeenCalledWith(
          expect.objectContaining({
            report: expect.objectContaining({
              narrativeReport: expect.stringContaining('Detailed analysis was not available'),
            }),
          })
        )
      })

      it('should wait for narrative when claim fails due to another process', async () => {
        const resultGenerating = {
          ...mockResult,
          narrativeStatus: 'generating' as const,
        }
        const resultComplete = {
          ...mockResult,
          narrativeStatus: 'complete' as const,
          narrativeReport: 'Generated by other process',
        }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultGenerating)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(false) // Claim fails

        // First call returns generating, second returns complete
        mockResultRepo.findByBatchId
          .mockResolvedValueOnce(resultGenerating)
          .mockResolvedValueOnce(resultComplete)

        await service.exportToPDF('assess-1')

        // Should NOT generate ourselves
        expect(mockNarrativeGenerator.generateNarrative).not.toHaveBeenCalled()

        // Should use the narrative from other process
        expect(mockPDFExporter.generatePDF).toHaveBeenCalledWith(
          expect.objectContaining({
            report: expect.objectContaining({
              narrativeReport: 'Generated by other process',
            }),
          })
        )
      })
    })

    describe('Evidence Selection', () => {
      it('should use findings.evidenceRefs when available', async () => {
        const dimensionWithEvidence: DimensionScoreDTO[] = [
          {
            ...mockDimensionScores[0],
            findings: {
              subScores: [],
              keyRisks: [],
              mitigations: [],
              evidenceRefs: [
                { sectionNumber: 3, questionNumber: 1, quote: 'Privacy evidence' },
              ],
            },
          },
        ]

        // Story 20.3.4: Combined lookup
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionWithEvidence)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        // Should use the response matching evidenceRef
        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            responses: expect.arrayContaining([
              expect.objectContaining({
                sectionNumber: 3,
                questionNumber: 1,
              }),
            ]),
          })
        )
      })

      it('should fall back to section mapping when no evidenceRefs', async () => {
        const dimensionWithoutEvidence: DimensionScoreDTO[] = [
          {
            ...mockDimensionScores[0],
            findings: undefined,
          },
        ]

        // Responses that match section mapping for privacy_risk (section 3)
        const responsesWithSections: ResponseDTO[] = [
          {
            id: 'resp-3-1',
            assessmentId: 'assess-1',
            batchId: 'batch-1',
            sectionNumber: 3,
            questionNumber: 1,
            questionText: 'Privacy Q1',
            responseText: 'Privacy response 1',
            hasVisualContent: false,
            createdAt: new Date(),
          },
          {
            id: 'resp-3-2',
            assessmentId: 'assess-1',
            batchId: 'batch-1',
            sectionNumber: 3,
            questionNumber: 2,
            questionText: 'Privacy Q2',
            responseText: 'Privacy response 2',
            hasVisualContent: false,
            createdAt: new Date(),
          },
        ]

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionWithoutEvidence)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(responsesWithSections)

        await service.exportToPDF('assess-1')

        // Should select responses from section 3 (mapped to privacy_risk)
        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            responses: expect.arrayContaining([
              expect.objectContaining({ sectionNumber: 3 }),
            ]),
          })
        )
      })

      it('should fall back to even distribution when section mapping insufficient', async () => {
        const dimensionWithUnmappedType: DimensionScoreDTO[] = [
          {
            ...mockDimensionScores[0],
            dimension: 'unknown_dimension' as DimensionScoreDTO['dimension'], // No mapping
            findings: undefined,
          },
        ]

        // Responses from various sections
        const manyResponses: ResponseDTO[] = Array.from({ length: 20 }, (_, i) => ({
          id: `resp-${i}`,
          assessmentId: 'assess-1',
          batchId: 'batch-1',
          sectionNumber: (i % 5) + 1,
          questionNumber: Math.floor(i / 5) + 1,
          questionText: `Q${i}`,
          responseText: `Response ${i}`,
          hasVisualContent: false,
          createdAt: new Date(),
        }))

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionWithUnmappedType)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(manyResponses)

        await service.exportToPDF('assess-1')

        // Should select some responses even without mapping
        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            responses: expect.any(Array),
          })
        )
        const call = mockNarrativeGenerator.generateNarrative.mock.calls[0][0]
        expect(call.responses.length).toBeGreaterThan(0)
      })

      it('should truncate responses to 500 chars', async () => {
        const longResponse: ResponseDTO[] = [
          {
            id: 'resp-long',
            assessmentId: 'assess-1',
            batchId: 'batch-1',
            sectionNumber: 3,
            questionNumber: 1,
            questionText: 'Long question',
            responseText: 'A'.repeat(1000), // 1000 chars
            hasVisualContent: false,
            createdAt: new Date(),
          },
        ]

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(longResponse)

        await service.exportToPDF('assess-1')

        // Response should be truncated to 500 + '...'
        const call = mockNarrativeGenerator.generateNarrative.mock.calls[0][0]
        expect(call.responses[0].responseText.length).toBeLessThanOrEqual(503) // 500 + '...'
        expect(call.responses[0].responseText.endsWith('...')).toBe(true)
      })

      it('should limit to 30 responses max', async () => {
        // Create 50 responses
        const manyResponses: ResponseDTO[] = Array.from({ length: 50 }, (_, i) => ({
          id: `resp-${i}`,
          assessmentId: 'assess-1',
          batchId: 'batch-1',
          sectionNumber: (i % 10) + 1,
          questionNumber: Math.floor(i / 10) + 1,
          questionText: `Q${i}`,
          responseText: `Response ${i}`,
          hasVisualContent: false,
          createdAt: new Date(),
        }))

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: mockAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(manyResponses)

        await service.exportToPDF('assess-1')

        const call = mockNarrativeGenerator.generateNarrative.mock.calls[0][0]
        expect(call.responses.length).toBeLessThanOrEqual(30)
      })
    })

    describe('Solution Type Determination', () => {
      // P2 Fix: Tests updated to use exact rubric types instead of keyword matching
      // This aligns with ScoringService which only accepts exact rubric values
      it('should accept exact rubric type clinical_ai', async () => {
        const clinicalAssessment = Assessment.create({
          vendorId: 'vendor-1',
          assessmentType: 'comprehensive',
          solutionName: 'Clinical AI',
          solutionType: 'clinical_ai', // Exact rubric type
          createdBy: 'user-1',
        })

        const resultWithNarrative: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: null,
        }

        // Story 20.3.4: Combined lookup
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: clinicalAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })

      it('should accept exact rubric type patient_facing', async () => {
        const patientAssessment = Assessment.create({
          vendorId: 'vendor-1',
          assessmentType: 'comprehensive',
          solutionName: 'Patient Portal',
          solutionType: 'patient_facing', // Exact rubric type
          createdBy: 'user-1',
        })

        const resultWithNarrative: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: null,
        }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: patientAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultWithNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'patient_facing',
          })
        )
      })

      // GPT Review Fix: Default to clinical_ai (aligned with ScoringService.determineSolutionType)
      it('should default to clinical_ai for truly unknown solution types (aligned with ScoringService)', async () => {
        const unknownTypeAssessment = Assessment.create({
          vendorId: 'vendor-1',
          assessmentType: 'comprehensive',
          solutionName: 'Mystery Tool',
          solutionType: 'Something Completely Random', // Truly unknown type - no keywords match
          createdBy: 'user-1',
        })

        const resultNoNarrative: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: null,
          narrativeReport: '', // Empty = needs generation
        }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: unknownTypeAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultNoNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        // GPT Review Fix: Should default to clinical_ai to match ScoringService
        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })

      it('should accept exact rubric type administrative_ai', async () => {
        const adminAssessment = Assessment.create({
          vendorId: 'vendor-1',
          assessmentType: 'comprehensive',
          solutionName: 'Admin Tool',
          solutionType: 'administrative_ai', // Exact rubric type
          createdBy: 'user-1',
        })

        const resultNoNarrative: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: null,
          narrativeReport: '', // Empty = needs generation
        }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: adminAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultNoNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'administrative_ai',
          })
        )
      })

      // P2 Fix: Non-rubric values should default to clinical_ai
      // Keyword heuristics removed to align with ScoringService
      it('should default to clinical_ai for non-rubric values like "Workflow Automation"', async () => {
        const legacyAssessment = Assessment.create({
          vendorId: 'vendor-1',
          assessmentType: 'comprehensive',
          solutionName: 'Legacy Tool',
          solutionType: 'Workflow Automation', // Not an exact rubric type
          createdBy: 'user-1',
        })

        const resultNoNarrative: AssessmentResultDTO = {
          ...mockResult,
          narrativeStatus: null,
          narrativeReport: '',
        }

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: legacyAssessment,
          vendor: mockVendor,
        })
        mockResultRepo.findLatestByAssessmentId.mockResolvedValue(resultNoNarrative)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)
        mockResultRepo.claimNarrativeGeneration.mockResolvedValue(true)
        mockResponseRepo.findByBatchId.mockResolvedValue(mockResponses)

        await service.exportToPDF('assess-1')

        // Non-rubric values default to clinical_ai (consistent with ScoringService)
        expect(mockNarrativeGenerator.generateNarrative).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })
    })
  })
})
