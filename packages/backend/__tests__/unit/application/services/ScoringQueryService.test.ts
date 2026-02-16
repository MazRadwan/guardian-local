/**
 * ScoringQueryService Unit Tests
 *
 * Contract tests for getResultForConversation() to verify that
 * dimension score fields (including findings) are correctly mapped
 * in the rehydration response.
 *
 * Epic 37 Sprint 2: findings field added to dimension score mapping.
 */

import { ScoringQueryService } from '../../../../src/application/services/ScoringQueryService'
import { IAssessmentResultRepository } from '../../../../src/application/interfaces/IAssessmentResultRepository'
import { IDimensionScoreRepository } from '../../../../src/application/interfaces/IDimensionScoreRepository'
import { IConversationRepository } from '../../../../src/application/interfaces/IConversationRepository'
import { Conversation } from '../../../../src/domain/entities/Conversation'
import { AssessmentResultDTO, DimensionScoreDTO } from '../../../../src/domain/scoring/dtos'

describe('ScoringQueryService', () => {
  let service: ScoringQueryService
  let mockAssessmentResultRepo: jest.Mocked<IAssessmentResultRepository>
  let mockDimensionScoreRepo: jest.Mocked<IDimensionScoreRepository>
  let mockConversationRepo: jest.Mocked<IConversationRepository>

  // Test fixtures
  const userId = 'user-123'
  const conversationId = 'conv-456'
  const assessmentId = 'assess-789'
  const batchId = 'batch-001'

  const mockConversation = Conversation.fromPersistence({
    id: conversationId,
    userId,
    mode: 'scoring',
    assessmentId,
    status: 'active',
    context: {},
    startedAt: new Date('2026-01-01'),
    lastActivityAt: new Date('2026-01-01'),
    completedAt: null,
  })

  const mockAssessmentResult: AssessmentResultDTO = {
    id: 'result-1',
    assessmentId,
    batchId,
    compositeScore: 78,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Vendor shows moderate risk with some gaps.',
    keyFindings: ['Good encryption practices', 'Missing audit trail'],
    rubricVersion: 'v1.0',
    modelId: 'claude-sonnet-4.5',
    scoredAt: new Date('2026-01-01'),
    scoringDurationMs: 12000,
  }

  const findingsWithISO = {
    subScores: [
      { name: 'Data Encryption', score: 85, maxScore: 100, notes: 'AES-256 in transit and at rest' },
      { name: 'Access Control', score: 70, maxScore: 100, notes: 'RBAC implemented, MFA partial' },
    ],
    keyRisks: ['No MFA enforcement for admin accounts'],
    mitigations: ['RBAC with least-privilege model'],
    evidenceRefs: [
      { sectionNumber: 4, questionNumber: 2, quote: 'We use AES-256 encryption' },
    ],
    assessmentConfidence: {
      level: 'high' as const,
      rationale: 'Strong evidence from vendor documentation and Section 4 responses.',
    },
    isoClauseReferences: [
      {
        clauseRef: 'A.8.1',
        title: 'Technology security management',
        framework: 'ISO/IEC 42001',
        status: 'aligned' as const,
      },
      {
        clauseRef: 'A.6.2.6',
        title: 'Data quality management for AI systems',
        framework: 'ISO/IEC 42001',
        status: 'partial' as const,
      },
    ],
  }

  const dimensionScoresWithFindings: DimensionScoreDTO[] = [
    {
      id: 'dim-1',
      assessmentId,
      batchId,
      dimension: 'privacy_risk',
      score: 82,
      riskRating: 'medium',
      findings: findingsWithISO,
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'dim-2',
      assessmentId,
      batchId,
      dimension: 'security_risk',
      score: 90,
      riskRating: 'low',
      findings: {
        subScores: [{ name: 'Penetration Testing', score: 92, maxScore: 100, notes: 'Annual pentest' }],
        keyRisks: [],
        mitigations: ['SOC 2 Type II certified'],
        evidenceRefs: [],
      },
      createdAt: new Date('2026-01-01'),
    },
  ]

  const dimensionScoresWithoutFindings: DimensionScoreDTO[] = [
    {
      id: 'dim-3',
      assessmentId,
      batchId,
      dimension: 'clinical_risk',
      score: 65,
      riskRating: 'high',
      // findings intentionally omitted (pre-Epic-37 data)
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'dim-4',
      assessmentId,
      batchId,
      dimension: 'vendor_capability',
      score: 75,
      riskRating: 'medium',
      findings: undefined,
      createdAt: new Date('2026-01-01'),
    },
  ]

  beforeEach(() => {
    mockAssessmentResultRepo = {
      create: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      findLatestByAssessmentId: jest.fn(),
      updateNarrativeReport: jest.fn(),
      countTodayForAssessment: jest.fn(),
      findRecentByFileHash: jest.fn(),
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

    mockConversationRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      updateMode: jest.fn(),
      updateStatus: jest.fn(),
      linkAssessment: jest.fn(),
      updateContext: jest.fn(),
      updateActivity: jest.fn(),
      delete: jest.fn(),
      updateTitle: jest.fn(),
    } as jest.Mocked<IConversationRepository>

    service = new ScoringQueryService(
      mockAssessmentResultRepo,
      mockDimensionScoreRepo,
      mockConversationRepo
    )
  })

  describe('getResultForConversation', () => {
    describe('findings field contract', () => {
      it('should include findings in each dimension score when findings data exists', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(mockAssessmentResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionScoresWithFindings)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        expect(result!.dimensionScores).toHaveLength(2)

        // First dimension: full findings with ISO enrichment
        const privacyDim = result!.dimensionScores[0]
        expect(privacyDim.findings).toBeDefined()
        expect(privacyDim.findings!.subScores).toHaveLength(2)
        expect(privacyDim.findings!.keyRisks).toEqual(['No MFA enforcement for admin accounts'])
        expect(privacyDim.findings!.mitigations).toEqual(['RBAC with least-privilege model'])
        expect(privacyDim.findings!.evidenceRefs).toHaveLength(1)
        expect(privacyDim.findings!.assessmentConfidence).toEqual({
          level: 'high',
          rationale: 'Strong evidence from vendor documentation and Section 4 responses.',
        })
        expect(privacyDim.findings!.isoClauseReferences).toHaveLength(2)
        expect(privacyDim.findings!.isoClauseReferences![0]).toEqual({
          clauseRef: 'A.8.1',
          title: 'Technology security management',
          framework: 'ISO/IEC 42001',
          status: 'aligned',
        })

        // Second dimension: findings without ISO enrichment
        const securityDim = result!.dimensionScores[1]
        expect(securityDim.findings).toBeDefined()
        expect(securityDim.findings!.subScores).toHaveLength(1)
        expect(securityDim.findings!.assessmentConfidence).toBeUndefined()
        expect(securityDim.findings!.isoClauseReferences).toBeUndefined()
      })

      it('should return findings as undefined when findings is null/missing (pre-Epic-37 backward compat)', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(mockAssessmentResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionScoresWithoutFindings)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        expect(result!.dimensionScores).toHaveLength(2)

        // Both dimensions should have findings === undefined (not null)
        for (const ds of result!.dimensionScores) {
          expect(ds.findings).toBeUndefined()
          // Verify it is strictly undefined, not null
          expect('findings' in ds).toBe(true)
          expect(ds.findings === undefined).toBe(true)
        }
      })

      it('should handle mixed findings (some dimensions with, some without)', async () => {
        const mixedScores: DimensionScoreDTO[] = [
          dimensionScoresWithFindings[0],   // has findings with ISO
          dimensionScoresWithoutFindings[0], // no findings
        ]

        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(mockAssessmentResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(mixedScores)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        expect(result!.dimensionScores[0].findings).toBeDefined()
        expect(result!.dimensionScores[0].findings!.assessmentConfidence).toBeDefined()
        expect(result!.dimensionScores[1].findings).toBeUndefined()
      })
    })

    describe('dimension score field completeness', () => {
      it('should include all expected fields (dimension, score, riskRating, findings) in each score', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(mockAssessmentResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionScoresWithFindings)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        for (const ds of result!.dimensionScores) {
          expect(ds).toHaveProperty('dimension')
          expect(ds).toHaveProperty('score')
          expect(ds).toHaveProperty('riskRating')
          expect(ds).toHaveProperty('findings')
          // Verify types
          expect(typeof ds.dimension).toBe('string')
          expect(typeof ds.score).toBe('number')
          expect(typeof ds.riskRating).toBe('string')
        }
      })

      it('should not include extra fields beyond dimension, score, riskRating, and findings', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(mockAssessmentResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionScoresWithFindings)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        for (const ds of result!.dimensionScores) {
          const keys = Object.keys(ds)
          expect(keys.sort()).toEqual(['dimension', 'findings', 'riskRating', 'score'].sort())
        }
      })
    })

    describe('top-level result shape', () => {
      it('should return correct top-level fields from assessment result', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(mockAssessmentResult)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue(dimensionScoresWithFindings)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        expect(result!.compositeScore).toBe(78)
        expect(result!.recommendation).toBe('conditional')
        expect(result!.overallRiskRating).toBe('medium')
        expect(result!.executiveSummary).toBe('Vendor shows moderate risk with some gaps.')
        expect(result!.keyFindings).toEqual(['Good encryption practices', 'Missing audit trail'])
        expect(result!.batchId).toBe(batchId)
        expect(result!.assessmentId).toBe(assessmentId)
      })

      it('should default executiveSummary to empty string when undefined', async () => {
        const resultNoSummary = { ...mockAssessmentResult, executiveSummary: undefined }

        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(resultNoSummary)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue([])

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        expect(result!.executiveSummary).toBe('')
      })

      it('should default keyFindings to empty array when undefined', async () => {
        const resultNoFindings = { ...mockAssessmentResult, keyFindings: undefined }

        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(resultNoFindings)
        mockDimensionScoreRepo.findByBatchId.mockResolvedValue([])

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).not.toBeNull()
        expect(result!.keyFindings).toEqual([])
      })
    })

    describe('null/error paths', () => {
      it('should return null when conversation not found', async () => {
        mockConversationRepo.findById.mockResolvedValue(null)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).toBeNull()
      })

      it('should throw UnauthorizedError when user does not own conversation', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)

        await expect(
          service.getResultForConversation(conversationId, 'other-user')
        ).rejects.toThrow('does not own conversation')
      })

      it('should return null when conversation has no assessmentId', async () => {
        const noAssessmentConv = Conversation.fromPersistence({
          id: conversationId,
          userId,
          mode: 'consult',
          assessmentId: null,
          status: 'active',
          context: {},
          startedAt: new Date(),
          lastActivityAt: new Date(),
          completedAt: null,
        })

        mockConversationRepo.findById.mockResolvedValue(noAssessmentConv)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).toBeNull()
      })

      it('should return null when no assessment result found', async () => {
        mockConversationRepo.findById.mockResolvedValue(mockConversation)
        mockAssessmentResultRepo.findLatestByAssessmentId.mockResolvedValue(null)

        const result = await service.getResultForConversation(conversationId, userId)

        expect(result).toBeNull()
      })

      it('should throw when conversationRepo is not configured', async () => {
        const serviceNoConvRepo = new ScoringQueryService(
          mockAssessmentResultRepo,
          mockDimensionScoreRepo
          // no conversationRepo
        )

        await expect(
          serviceNoConvRepo.getResultForConversation(conversationId, userId)
        ).rejects.toThrow('ConversationRepository not configured for rehydration')
      })
    })
  })
})
