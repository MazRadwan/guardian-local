/**
 * ScoringExportService Unit Tests
 *
 * Tests export service orchestration logic for scoring reports
 */

import { ScoringExportService } from '../../../../src/application/services/ScoringExportService'
import { IAssessmentRepository } from '../../../../src/application/interfaces/IAssessmentRepository'
import { IAssessmentResultRepository } from '../../../../src/application/interfaces/IAssessmentResultRepository'
import { IDimensionScoreRepository } from '../../../../src/application/interfaces/IDimensionScoreRepository'
import { IScoringPDFExporter } from '../../../../src/application/interfaces/IScoringPDFExporter'
import { IScoringWordExporter } from '../../../../src/application/interfaces/IScoringWordExporter'
import { Assessment } from '../../../../src/domain/entities/Assessment'
import { Vendor } from '../../../../src/domain/entities/Vendor'
import { AssessmentResultDTO } from '../../../../src/domain/scoring/dtos'
import { DimensionScoreDTO } from '../../../../src/domain/scoring/dtos'

describe('ScoringExportService', () => {
  let service: ScoringExportService
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>
  let mockResultRepo: jest.Mocked<IAssessmentResultRepository>
  let mockDimensionScoreRepo: jest.Mocked<IDimensionScoreRepository>
  let mockPDFExporter: jest.Mocked<IScoringPDFExporter>
  let mockWordExporter: jest.Mocked<IScoringWordExporter>

  beforeEach(() => {
    mockAssessmentRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      findByVendorId: jest.fn(),
      list: jest.fn(),
      findByCreatedBy: jest.fn(),
      getVendor: jest.fn(),
    } as jest.Mocked<IAssessmentRepository>

    mockResultRepo = {
      create: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      findLatestByAssessmentId: jest.fn(),
    } as jest.Mocked<IAssessmentResultRepository>

    mockDimensionScoreRepo = {
      createBatch: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      findLatestByAssessmentId: jest.fn(),
    } as jest.Mocked<IDimensionScoreRepository>

    mockPDFExporter = {
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
    } as jest.Mocked<IScoringPDFExporter>

    mockWordExporter = {
      generateWord: jest.fn().mockResolvedValue(Buffer.from('Word content')),
    } as jest.Mocked<IScoringWordExporter>

    service = new ScoringExportService(
      mockAssessmentRepo,
      mockResultRepo,
      mockDimensionScoreRepo,
      mockPDFExporter,
      mockWordExporter
    )
  })

  describe('exportToPDF', () => {
    it('should throw error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null)

      await expect(
        service.exportToPDF('non-existent-id')
      ).rejects.toThrow('Assessment not found: non-existent-id')
    })

    it('should throw error if no scoring results found', async () => {
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

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(null)

      await expect(
        service.exportToPDF('assess-1')
      ).rejects.toThrow('No scoring results found for assessment: assess-1')
    })

    it('should throw error if specific batch not found', async () => {
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

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findByBatchId.mockResolvedValue(null)

      await expect(
        service.exportToPDF('assess-1', 'batch-999')
      ).rejects.toThrow('Scoring result not found for batch: batch-999')
    })

    it('should throw error if no dimension scores found', async () => {
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
        narrativeReport: 'Report',
        executiveSummary: 'Summary',
        keyFindings: ['Finding 1'],
        disqualifyingFactors: [],
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoredAt: new Date(),
        scoringDurationMs: 10000,
      }

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue([])

      await expect(
        service.exportToPDF('assess-1')
      ).rejects.toThrow('No dimension scores found for batch: batch-1')
    })

    it('should export PDF with latest results when no batchId provided', async () => {
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
        narrativeReport: 'Detailed report',
        executiveSummary: 'Executive summary',
        keyFindings: ['Finding 1', 'Finding 2'],
        disqualifyingFactors: [],
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoredAt: new Date(),
        scoringDurationMs: 12000,
      }

      const mockDimensionScores: DimensionScoreDTO[] = [
        {
          id: 'dim-1',
          assessmentId: 'assess-1',
          batchId: 'batch-1',
          dimension: 'privacy_risk',
          score: 90,
          riskRating: 'low',
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
        }
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToPDF('assess-1')

      expect(mockAssessmentRepo.findById).toHaveBeenCalledWith('assess-1')
      expect(mockAssessmentRepo.getVendor).toHaveBeenCalledWith('assess-1')
      expect(mockResultRepo.findLatestByAssessmentId).toHaveBeenCalledWith('assess-1')
      expect(mockDimensionScoreRepo.findByBatchId).toHaveBeenCalledWith('assess-1', 'batch-1')
      expect(mockPDFExporter.generatePDF).toHaveBeenCalled()
      expect(buffer).toBeInstanceOf(Buffer)
    })

    it('should export PDF with specific batch when batchId provided', async () => {
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
        batchId: 'batch-specific',
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        narrativeReport: 'Report',
        executiveSummary: 'Summary',
        keyFindings: ['Finding'],
        disqualifyingFactors: [],
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoredAt: new Date(),
        scoringDurationMs: 8000,
      }

      const mockDimensionScores: DimensionScoreDTO[] = [
        {
          id: 'dim-1',
          assessmentId: 'assess-1',
          batchId: 'batch-specific',
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
          createdAt: new Date(),
        }
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findByBatchId.mockResolvedValue(mockResult)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToPDF('assess-1', 'batch-specific')

      expect(mockResultRepo.findByBatchId).toHaveBeenCalledWith('assess-1', 'batch-specific')
      expect(buffer).toBeInstanceOf(Buffer)
    })
  })

  describe('exportToWord', () => {
    it('should throw error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null)

      await expect(
        service.exportToWord('non-existent-id')
      ).rejects.toThrow('Assessment not found: non-existent-id')
    })

    it('should export Word document with valid data', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'comprehensive',
        solutionName: 'Test Solution',
        solutionType: 'AI Tool',
        createdBy: 'user-1',
      })

      const mockVendor = Vendor.create({
        name: 'Test Vendor',
        industry: 'Finance',
      })

      const mockResult: AssessmentResultDTO = {
        id: 'result-1',
        assessmentId: 'assess-1',
        batchId: 'batch-1',
        compositeScore: 88,
        recommendation: 'approve',
        overallRiskRating: 'low',
        narrativeReport: 'Detailed analysis',
        executiveSummary: 'Strong vendor',
        keyFindings: ['Excellent security', 'Good compliance'],
        disqualifyingFactors: [],
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoredAt: new Date(),
        scoringDurationMs: 15000,
      }

      const mockDimensionScores: DimensionScoreDTO[] = [
        {
          id: 'dim-1',
          assessmentId: 'assess-1',
          batchId: 'batch-1',
          dimension: 'privacy_risk',
          score: 92,
          riskRating: 'low',
          findings: {
            subScores: [{ name: 'Encryption', score: 95, maxScore: 100, notes: 'Strong' }],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: []
          },
          createdAt: new Date(),
        },
        {
          id: 'dim-2',
          assessmentId: 'assess-1',
          batchId: 'batch-1',
          dimension: 'security_risk',
          score: 85,
          riskRating: 'low',
          createdAt: new Date(),
        }
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findLatestByAssessmentId.mockResolvedValue(mockResult)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToWord('assess-1')

      expect(mockAssessmentRepo.findById).toHaveBeenCalledWith('assess-1')
      expect(mockWordExporter.generateWord).toHaveBeenCalled()
      expect(buffer).toBeInstanceOf(Buffer)
    })

    it('should use specific batch when batchId provided', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'quick',
        solutionName: 'Quick Solution',
        solutionType: 'SaaS',
        createdBy: 'user-1',
      })

      const mockVendor = Vendor.create({
        name: 'Quick Vendor',
        industry: 'Technology',
      })

      const mockResult: AssessmentResultDTO = {
        id: 'result-2',
        assessmentId: 'assess-2',
        batchId: 'batch-xyz',
        compositeScore: 70,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        narrativeReport: 'Report',
        executiveSummary: 'Summary',
        keyFindings: [],
        disqualifyingFactors: [],
        rubricVersion: 'v1.0',
        modelId: 'claude-sonnet-4.5',
        scoredAt: new Date(),
        scoringDurationMs: 5000,
      }

      const mockDimensionScores: DimensionScoreDTO[] = [
        {
          id: 'dim-3',
          assessmentId: 'assess-2',
          batchId: 'batch-xyz',
          dimension: 'regulatory_compliance',
          score: 70,
          riskRating: 'medium',
          createdAt: new Date(),
        }
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockAssessmentRepo.getVendor.mockResolvedValue(mockVendor)
      mockResultRepo.findByBatchId.mockResolvedValue(mockResult)
      mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mockDimensionScores)

      const buffer = await service.exportToWord('assess-2', 'batch-xyz')

      expect(mockResultRepo.findByBatchId).toHaveBeenCalledWith('assess-2', 'batch-xyz')
      expect(buffer).toBeInstanceOf(Buffer)
    })
  })
})
