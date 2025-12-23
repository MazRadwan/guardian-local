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
import { eq } from 'drizzle-orm'
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
        rubricVersion: 'guardian-v1.0',
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
      expect(created.rubricVersion).toBe('guardian-v1.0')
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
        rubricVersion: 'guardian-v1.0',
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
        rubricVersion: 'guardian-v1.0',
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
          rubricVersion: 'guardian-v1.0',
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
        rubricVersion: 'guardian-v1.0',
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
        rubricVersion: 'guardian-v1.0',
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
        rubricVersion: 'guardian-v1.0',
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
        rubricVersion: 'guardian-v1.0',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      await repository.create({
        assessmentId: testAssessmentId,
        batchId: batchId2,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.0',
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
        rubricVersion: 'guardian-v1.0',
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
})
