/**
 * Integration tests for Scoring Rehydration (Epic 22.1.1)
 *
 * Tests the full database flow for fetching scoring results for a conversation:
 * - Creating user, conversation, assessment, and scoring results in test DB
 * - Calling ScoringService.getResultForConversation()
 * - Verifying correct data retrieval
 * - Testing ownership checks
 * - Testing conversations without assessment links
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { testDb, closeTestDb, truncateAllTables } from '../setup/test-db.js'
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository.js'
import { DrizzleAssessmentResultRepository } from '../../src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.js'
import { DrizzleDimensionScoreRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionScoreRepository.js'
import { ScoringService } from '../../src/application/services/ScoringService.js'
import { ScoringQueryService } from '../../src/application/services/ScoringQueryService.js'
import { ScoringPayloadValidator } from '../../src/domain/scoring/ScoringPayloadValidator.js'
import { randomUUID } from 'crypto'
import * as schema from '../../src/infrastructure/database/schema/index.js'
import { eq } from 'drizzle-orm'

describe('Scoring Rehydration Integration (Epic 22.1.1)', () => {
  // Repositories
  let conversationRepo: DrizzleConversationRepository
  let assessmentResultRepo: DrizzleAssessmentResultRepository
  let dimensionScoreRepo: DrizzleDimensionScoreRepository
  let scoringService: ScoringService

  // Test data IDs
  const testUserId = randomUUID()
  const testOtherUserId = randomUUID()
  const testVendorId = randomUUID()
  const testAssessmentId = randomUUID()
  const testConversationId = randomUUID()
  const testConversationNoAssessmentId = randomUUID()
  const testBatchId = randomUUID()

  beforeAll(async () => {
    // Initialize repositories
    conversationRepo = new DrizzleConversationRepository()
    assessmentResultRepo = new DrizzleAssessmentResultRepository()
    dimensionScoreRepo = new DrizzleDimensionScoreRepository()

    // Epic 37: Create ScoringQueryService with real repos for rehydration testing
    const queryService = new ScoringQueryService(
      assessmentResultRepo,
      dimensionScoreRepo,
      conversationRepo
    )

    // Create a minimal ScoringService with only rehydration dependencies
    // Other dependencies are mocked as they're not needed for rehydration
    const validator = new ScoringPayloadValidator()
    scoringService = new ScoringService(
      assessmentResultRepo,
      {} as any, // assessmentRepo - not needed
      {} as any, // fileRepo - not needed
      {} as any, // fileStorage - not needed
      {} as any, // documentParser - not needed
      validator,
      {} as any, // storageService - not needed for rehydration
      {} as any, // llmService - not needed for rehydration
      queryService
    )
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await truncateAllTables()

    // Create test users
    await testDb.insert(schema.users).values([
      {
        id: testUserId,
        email: 'testuser@example.com',
        passwordHash: 'hash',
        name: 'Test User',
        role: 'analyst',
      },
      {
        id: testOtherUserId,
        email: 'otheruser@example.com',
        passwordHash: 'hash',
        name: 'Other User',
        role: 'analyst',
      },
    ])

    // Create test vendor
    await testDb.insert(schema.vendors).values({
      id: testVendorId,
      name: 'Test Vendor',
    })

    // Create test assessment
    await testDb.insert(schema.assessments).values({
      id: testAssessmentId,
      vendorId: testVendorId,
      solutionName: 'Test Solution',
      assessmentType: 'comprehensive',
      status: 'scored',
      createdBy: testUserId,
    })

    // Create test conversation WITH assessment link
    await testDb.insert(schema.conversations).values({
      id: testConversationId,
      userId: testUserId,
      mode: 'scoring',
      assessmentId: testAssessmentId,
      status: 'active',
    })

    // Create test conversation WITHOUT assessment link
    await testDb.insert(schema.conversations).values({
      id: testConversationNoAssessmentId,
      userId: testUserId,
      mode: 'scoring',
      assessmentId: null,
      status: 'active',
    })

    // Create test assessment result
    await testDb.insert(schema.assessmentResults).values({
      id: randomUUID(),
      assessmentId: testAssessmentId,
      batchId: testBatchId,
      compositeScore: 75,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'Test executive summary for integration test',
      keyFindings: ['Finding 1', 'Finding 2', 'Finding 3'],
      rubricVersion: '1.0',
      modelId: 'claude-3-5-sonnet-20241022',
      scoredAt: new Date(),
    })

    // Create test dimension scores
    await testDb.insert(schema.dimensionScores).values([
      {
        id: randomUUID(),
        assessmentId: testAssessmentId,
        batchId: testBatchId,
        dimension: 'clinical_risk',
        score: 80,
        riskRating: 'low',
      },
      {
        id: randomUUID(),
        assessmentId: testAssessmentId,
        batchId: testBatchId,
        dimension: 'data_governance',
        score: 70,
        riskRating: 'medium',
      },
      {
        id: randomUUID(),
        assessmentId: testAssessmentId,
        batchId: testBatchId,
        dimension: 'regulatory_compliance',
        score: 65,
        riskRating: 'medium',
      },
    ])
  })

  describe('getResultForConversation', () => {
    it('should return scoring result for conversation with linked assessment', async () => {
      const result = await scoringService.getResultForConversation(
        testConversationId,
        testUserId
      )

      expect(result).not.toBeNull()
      expect(result?.compositeScore).toBe(75)
      expect(result?.recommendation).toBe('conditional')
      expect(result?.overallRiskRating).toBe('medium')
      expect(result?.executiveSummary).toBe('Test executive summary for integration test')
      expect(result?.keyFindings).toEqual(['Finding 1', 'Finding 2', 'Finding 3'])
      expect(result?.batchId).toBe(testBatchId)
      expect(result?.assessmentId).toBe(testAssessmentId)
    })

    it('should return all dimension scores for the batch', async () => {
      const result = await scoringService.getResultForConversation(
        testConversationId,
        testUserId
      )

      expect(result).not.toBeNull()
      expect(result?.dimensionScores).toHaveLength(3)

      // Check dimension scores are mapped correctly
      const clinicalRisk = result?.dimensionScores.find(d => d.dimension === 'clinical_risk')
      expect(clinicalRisk).toEqual({
        dimension: 'clinical_risk',
        score: 80,
        riskRating: 'low',
      })

      const dataGov = result?.dimensionScores.find(d => d.dimension === 'data_governance')
      expect(dataGov).toEqual({
        dimension: 'data_governance',
        score: 70,
        riskRating: 'medium',
      })
    })

    it('should return null for conversation without assessment link', async () => {
      const result = await scoringService.getResultForConversation(
        testConversationNoAssessmentId,
        testUserId
      )

      expect(result).toBeNull()
    })

    it('should return null for non-existent conversation', async () => {
      const result = await scoringService.getResultForConversation(
        randomUUID(),
        testUserId
      )

      expect(result).toBeNull()
    })

    it('should throw UnauthorizedError for wrong user', async () => {
      await expect(
        scoringService.getResultForConversation(testConversationId, testOtherUserId)
      ).rejects.toThrow(/does not own conversation/)
    })

    it('should return latest scoring batch when multiple exist', async () => {
      // Create an older batch
      const olderBatchId = randomUUID()
      const olderDate = new Date('2024-01-01T00:00:00Z')

      await testDb.insert(schema.assessmentResults).values({
        id: randomUUID(),
        assessmentId: testAssessmentId,
        batchId: olderBatchId,
        compositeScore: 50, // Lower score
        recommendation: 'decline',
        overallRiskRating: 'high',
        executiveSummary: 'Old summary',
        rubricVersion: '1.0',
        modelId: 'claude-3-5-sonnet-20241022',
        scoredAt: olderDate,
      })

      // The default batch (with score 75) should be returned as it's newer
      const result = await scoringService.getResultForConversation(
        testConversationId,
        testUserId
      )

      expect(result).not.toBeNull()
      expect(result?.compositeScore).toBe(75) // Should be the newer score
      expect(result?.batchId).toBe(testBatchId)
    })

    it('should handle conversation with assessment but no scoring results', async () => {
      // Create a new conversation linked to an assessment without results
      const newAssessmentId = randomUUID()
      const newConversationId = randomUUID()

      await testDb.insert(schema.assessments).values({
        id: newAssessmentId,
        vendorId: testVendorId,
        solutionName: 'New Solution',
        assessmentType: 'comprehensive',
        status: 'exported', // Not scored yet
        createdBy: testUserId,
      })

      await testDb.insert(schema.conversations).values({
        id: newConversationId,
        userId: testUserId,
        mode: 'scoring',
        assessmentId: newAssessmentId,
        status: 'active',
      })

      const result = await scoringService.getResultForConversation(
        newConversationId,
        testUserId
      )

      expect(result).toBeNull()
    })
  })

  describe('conversation-assessment linkage', () => {
    it('should verify linkAssessment persists correctly', async () => {
      // Create a conversation without assessment link
      const unlinkConversationId = randomUUID()

      await testDb.insert(schema.conversations).values({
        id: unlinkConversationId,
        userId: testUserId,
        mode: 'scoring',
        assessmentId: null,
        status: 'active',
      })

      // Verify no result before linking
      let result = await scoringService.getResultForConversation(
        unlinkConversationId,
        testUserId
      )
      expect(result).toBeNull()

      // Link the assessment
      await conversationRepo.linkAssessment(unlinkConversationId, testAssessmentId)

      // Now should return results
      result = await scoringService.getResultForConversation(
        unlinkConversationId,
        testUserId
      )
      expect(result).not.toBeNull()
      expect(result?.assessmentId).toBe(testAssessmentId)
    })
  })
})
