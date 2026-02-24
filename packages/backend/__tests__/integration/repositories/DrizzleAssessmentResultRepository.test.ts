/**
 * Integration tests for DrizzleAssessmentResultRepository
 *
 * Tests actual database operations with test database
 */

// Jest provides describe, it, expect, beforeAll, afterAll, beforeEach globals
import { db } from '../../../src/infrastructure/database/client.js'
import { assessmentResults } from '../../../src/infrastructure/database/schema/assessmentResults.js'
import { assessments } from '../../../src/infrastructure/database/schema/assessments.js'
import { vendors } from '../../../src/infrastructure/database/schema/vendors.js'
import { users } from '../../../src/infrastructure/database/schema/users.js'
import { DrizzleAssessmentResultRepository } from '../../../src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.js'
import type { CreateAssessmentResultDTO } from '../../../src/domain/scoring/dtos.js'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'

describe('DrizzleAssessmentResultRepository (Integration)', () => {
  let repository: DrizzleAssessmentResultRepository
  let testUserId: string
  let testVendorId: string
  let testAssessmentId: string

  beforeAll(async () => {
    repository = new DrizzleAssessmentResultRepository()

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-result-${crypto.randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Test User',
        role: 'analyst',
      })
      .returning()
    testUserId = user.id

    // Create test vendor
    const [vendor] = await db
      .insert(vendors)
      .values({
        name: `Test Vendor Result ${crypto.randomUUID()}`,
        industry: 'Healthcare',
      })
      .returning()
    testVendorId = vendor.id

    // Create test assessment
    const [assessment] = await db
      .insert(assessments)
      .values({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        solutionName: 'Test Solution',
        status: 'questions_generated',
        createdBy: testUserId,
      })
      .returning()
    testAssessmentId = assessment.id
  })

  afterAll(async () => {
    // Cleanup in correct order (assessments FK to users is NO ACTION, not CASCADE)
    await db.delete(assessments).where(eq(assessments.id, testAssessmentId))
    await db.delete(vendors).where(eq(vendors.id, testVendorId))
    await db.delete(users).where(eq(users.id, testUserId))
  })

  beforeEach(async () => {
    // Clean assessment results before each test
    await db.delete(assessmentResults).where(eq(assessmentResults.assessmentId, testAssessmentId))
  })

  describe('create', () => {
    it('should create assessment result with full data', async () => {
      const batchId = crypto.randomUUID()
      const newResult: CreateAssessmentResultDTO = {
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        narrativeReport: '# Assessment Report\n\nThis vendor shows medium risk...',
        executiveSummary: 'Overall medium risk with some concerns.',
        keyFindings: ['Strong privacy controls', 'Weak incident response', 'Good data encryption'],
        disqualifyingFactors: ['No SOC 2 certification'],
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
        rawToolPayload: {
          dimensions: [{ name: 'privacy', score: 85 }],
          composite: 78,
        },
        scoringDurationMs: 15234,
      }

      const created = await repository.create(newResult)

      expect(created.id).toBeDefined()
      expect(created.assessmentId).toBe(testAssessmentId)
      expect(created.batchId).toBe(batchId)
      expect(created.compositeScore).toBe(78)
      expect(created.recommendation).toBe('conditional')
      expect(created.overallRiskRating).toBe('medium')
      expect(created.narrativeReport).toContain('Assessment Report')
      expect(created.executiveSummary).toContain('medium risk')
      expect(created.keyFindings).toHaveLength(3)
      expect(created.disqualifyingFactors).toHaveLength(1)
      expect(created.rubricVersion).toBe('guardian-v1.1')
      expect(created.modelId).toBe('claude-sonnet-4-5-20250929')
      expect(created.rawToolPayload).toBeDefined()
      expect(created.scoringDurationMs).toBe(15234)
      expect(created.scoredAt).toBeInstanceOf(Date)
    })

    it('should create assessment result with minimal data', async () => {
      const batchId = crypto.randomUUID()
      const newResult: CreateAssessmentResultDTO = {
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 92,
        recommendation: 'approve',
        overallRiskRating: 'low',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      }

      const created = await repository.create(newResult)

      expect(created.compositeScore).toBe(92)
      expect(created.recommendation).toBe('approve')
      expect(created.narrativeReport).toBeUndefined()
      expect(created.executiveSummary).toBeUndefined()
      expect(created.keyFindings).toBeUndefined()
      expect(created.disqualifyingFactors).toBeUndefined()
      expect(created.scoringDurationMs).toBeUndefined()
    })

    it('should enforce unique constraint on (assessmentId, batchId)', async () => {
      const batchId = crypto.randomUUID()

      // Create first result
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Attempt duplicate (same assessmentId and batchId)
      await expect(
        repository.create({
          assessmentId: testAssessmentId,
          batchId,
          compositeScore: 85,
          recommendation: 'approve',
          overallRiskRating: 'low',
          rubricVersion: 'guardian-v1.1',
          modelId: 'claude-sonnet-4-5-20250929',
        })
      ).rejects.toThrow()
    })

    it('should allow different batches for same assessment', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create result for batch 1
      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId1,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Create result for batch 2 (should succeed)
      await expect(
        repository.create({
          assessmentId: testAssessmentId,
          batchId: batchId2,
          compositeScore: 85,
          recommendation: 'approve',
          overallRiskRating: 'low',
          rubricVersion: 'guardian-v1.1',
          modelId: 'claude-sonnet-4-5-20250929',
        })
      ).resolves.not.toThrow()
    })
  })

  describe('findByAssessmentId', () => {
    it('should find all results for an assessment, ordered by most recent', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create result in batch 1
      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId1,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Wait briefly to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Create result in batch 2
      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId2,
        compositeScore: 85,
        recommendation: 'approve',
        overallRiskRating: 'low',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      const found = await repository.findByAssessmentId(testAssessmentId)

      expect(found).toHaveLength(2)
      // Most recent first
      expect(found[0].compositeScore).toBe(85)
      expect(found[1].compositeScore).toBe(78)
    })

    it('should return empty array when no results exist', async () => {
      const found = await repository.findByAssessmentId(crypto.randomUUID())
      expect(found).toEqual([])
    })
  })

  describe('findByBatchId', () => {
    it('should find result by batch ID', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create results in two batches
      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId1,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId2,
        compositeScore: 85,
        recommendation: 'approve',
        overallRiskRating: 'low',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      const batch1Result = await repository.findByBatchId(testAssessmentId, batchId1)
      const batch2Result = await repository.findByBatchId(testAssessmentId, batchId2)

      expect(batch1Result).not.toBeNull()
      expect(batch1Result?.compositeScore).toBe(78)

      expect(batch2Result).not.toBeNull()
      expect(batch2Result?.compositeScore).toBe(85)
    })

    it('should return null when batch has no result', async () => {
      const found = await repository.findByBatchId(testAssessmentId, crypto.randomUUID())
      expect(found).toBeNull()
    })
  })

  describe('findLatestByAssessmentId', () => {
    it('should find latest result (most recent)', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()
      const batchId3 = crypto.randomUUID()

      // Create results over time
      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId1,
        compositeScore: 70,
        recommendation: 'conditional',
        overallRiskRating: 'high',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId2,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId3,
        compositeScore: 85,
        recommendation: 'approve',
        overallRiskRating: 'low',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      const latest = await repository.findLatestByAssessmentId(testAssessmentId)

      expect(latest).not.toBeNull()
      expect(latest?.compositeScore).toBe(85)
      expect(latest?.batchId).toBe(batchId3)
      expect(latest?.recommendation).toBe('approve')
    })

    it('should return null when no results exist', async () => {
      const latest = await repository.findLatestByAssessmentId(crypto.randomUUID())
      expect(latest).toBeNull()
    })
  })

  describe('cascade deletion', () => {
    it('should delete assessment results when assessment is deleted', async () => {
      // Create a separate assessment to test cascade
      const [vendor] = await db
        .insert(vendors)
        .values({
          name: `Cascade Test Vendor ${crypto.randomUUID()}`,
          industry: 'Tech',
        })
        .returning()

      const [assessment] = await db
        .insert(assessments)
        .values({
          vendorId: vendor.id,
          assessmentType: 'quick',
          status: 'questions_generated',
          createdBy: testUserId,
        })
        .returning()

      // Create assessment result
      await repository.create({
        assessmentId: assessment.id,
        batchId: crypto.randomUUID(),
        compositeScore: 85,
        recommendation: 'approve',
        overallRiskRating: 'low',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Verify result exists
      let found = await repository.findByAssessmentId(assessment.id)
      expect(found).toHaveLength(1)

      // Delete assessment (should cascade)
      await db.delete(assessments).where(eq(assessments.id, assessment.id))

      // Verify result is deleted
      found = await repository.findByAssessmentId(assessment.id)
      expect(found).toEqual([])

      // Cleanup vendor
      await db.delete(vendors).where(eq(vendors.id, vendor.id))
    })
  })

  // ===========================================================================
  // Epic 20: Narrative Generation Concurrency Control Tests
  // ===========================================================================

  describe('updateNarrativeReport', () => {
    it('should update narrative report for existing result', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      const narrative = '# Assessment Report\n\nThis vendor has medium risk.'
      await repository.updateNarrativeReport(testAssessmentId, batchId, narrative)

      const result = await repository.findByBatchId(testAssessmentId, batchId)
      expect(result?.narrativeReport).toBe(narrative)
    })
  })

  describe('claimNarrativeGeneration', () => {
    it('should claim successfully when narrativeStatus is null', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      const claimed = await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      expect(claimed).toBe(true)

      // Verify status was updated
      const status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status?.status).toBe('generating')
      expect(status?.error).toBeNull()
    })

    it('should claim successfully when narrativeStatus is failed', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // First, fail the narrative
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      await repository.failNarrativeGeneration(testAssessmentId, batchId, 'Test error')

      // Now claim should succeed again
      const claimed = await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      expect(claimed).toBe(true)

      const status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status?.status).toBe('generating')
      expect(status?.error).toBeNull() // Error should be cleared
    })

    it('should claim successfully when existing claim is stale (> TTL)', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // First claim
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)

      // Manually set the claim time to be stale (10 minutes ago)
      const staleTime = new Date(Date.now() - 10 * 60 * 1000)
      await db
        .update(assessmentResults)
        .set({ narrativeClaimedAt: staleTime })
        .where(
          and(
            eq(assessmentResults.assessmentId, testAssessmentId),
            eq(assessmentResults.batchId, batchId)
          )
        )

      // Now claim should succeed (with 5 min TTL, 10 min old claim is stale)
      const claimed = await repository.claimNarrativeGeneration(testAssessmentId, batchId, 5 * 60 * 1000)
      expect(claimed).toBe(true)
    })

    it('should fail claim when narrativeStatus is generating and not stale', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // First claim succeeds
      const claimed1 = await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      expect(claimed1).toBe(true)

      // Second claim fails (not stale)
      const claimed2 = await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      expect(claimed2).toBe(false)
    })

    it('should fail claim when narrativeStatus is complete', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Claim and finalize
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      await repository.finalizeNarrativeGeneration(testAssessmentId, batchId, '# Report')

      // Attempt to claim again should fail
      const claimed = await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      expect(claimed).toBe(false)
    })

    it('should return false when record does not exist', async () => {
      const claimed = await repository.claimNarrativeGeneration(
        testAssessmentId,
        crypto.randomUUID()
      )
      expect(claimed).toBe(false)
    })

    it('should handle concurrent claims - only one succeeds', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Simulate concurrent claims
      const results = await Promise.all([
        repository.claimNarrativeGeneration(testAssessmentId, batchId),
        repository.claimNarrativeGeneration(testAssessmentId, batchId),
        repository.claimNarrativeGeneration(testAssessmentId, batchId),
      ])

      // Exactly one should succeed
      const successCount = results.filter((r) => r === true).length
      expect(successCount).toBe(1)

      // Status should be 'generating'
      const status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status?.status).toBe('generating')
    })
  })

  describe('finalizeNarrativeGeneration', () => {
    it('should finalize and set narrative + status', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      await repository.claimNarrativeGeneration(testAssessmentId, batchId)

      const narrative = '# Final Report\n\nDetailed analysis...'
      await repository.finalizeNarrativeGeneration(testAssessmentId, batchId, narrative)

      const result = await repository.findByBatchId(testAssessmentId, batchId)
      expect(result?.narrativeReport).toBe(narrative)
      expect(result?.narrativeStatus).toBe('complete')
      expect(result?.narrativeCompletedAt).toBeInstanceOf(Date)
      expect(result?.narrativeError).toBeUndefined()
    })

    it('should only finalize if status is generating (guard)', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Try to finalize without claiming first
      await repository.finalizeNarrativeGeneration(testAssessmentId, batchId, '# Report')

      // Should not update because status was null, not 'generating'
      const result = await repository.findByBatchId(testAssessmentId, batchId)
      expect(result?.narrativeReport).toBeUndefined()
      expect(result?.narrativeStatus).toBeUndefined()
    })

    it('should clear error on finalize', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Claim, fail, then claim again and finalize
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      await repository.failNarrativeGeneration(testAssessmentId, batchId, 'Initial error')

      // Claim again (should succeed because status is 'failed')
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      await repository.finalizeNarrativeGeneration(testAssessmentId, batchId, '# Success!')

      const result = await repository.findByBatchId(testAssessmentId, batchId)
      expect(result?.narrativeStatus).toBe('complete')
      expect(result?.narrativeError).toBeUndefined()
    })
  })

  describe('failNarrativeGeneration', () => {
    it('should mark as failed and store error', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      await repository.failNarrativeGeneration(testAssessmentId, batchId, 'LLM timeout error')

      const status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status?.status).toBe('failed')
      expect(status?.error).toBe('LLM timeout error')
    })

    it('should allow retry after failure', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // First attempt fails
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      await repository.failNarrativeGeneration(testAssessmentId, batchId, 'First error')

      // Second attempt succeeds
      const claimed = await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      expect(claimed).toBe(true)

      await repository.finalizeNarrativeGeneration(testAssessmentId, batchId, '# Success on retry')

      const result = await repository.findByBatchId(testAssessmentId, batchId)
      expect(result?.narrativeStatus).toBe('complete')
      expect(result?.narrativeReport).toBe('# Success on retry')
    })
  })

  describe('getNarrativeStatus', () => {
    it('should return null for non-existent record', async () => {
      const status = await repository.getNarrativeStatus(
        testAssessmentId,
        crypto.randomUUID()
      )
      expect(status).toBeNull()
    })

    it('should return status and error for existing record', async () => {
      const batchId = crypto.randomUUID()
      await repository.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Initially null status
      let status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status).toEqual({ status: null, error: null })

      // After claim
      await repository.claimNarrativeGeneration(testAssessmentId, batchId)
      status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status).toEqual({ status: 'generating', error: null })

      // After fail
      await repository.failNarrativeGeneration(testAssessmentId, batchId, 'Oops')
      status = await repository.getNarrativeStatus(testAssessmentId, batchId)
      expect(status).toEqual({ status: 'failed', error: 'Oops' })
    })
  })
})
