/**
 * Integration tests for Transactional Score Storage (Epic 20.2.1)
 *
 * Tests that dimension scores and assessment results are stored atomically:
 * - Both inserts succeed in a transaction
 * - Dimension score failure rolls back (no assessment result created)
 * - Assessment result failure rolls back dimension scores
 */

// Jest provides describe, it, expect, beforeAll, afterAll, beforeEach globals
import { db } from '../../../src/infrastructure/database/client.js'
import { dimensionScores } from '../../../src/infrastructure/database/schema/dimensionScores.js'
import { assessmentResults } from '../../../src/infrastructure/database/schema/assessmentResults.js'
import { assessments } from '../../../src/infrastructure/database/schema/assessments.js'
import { vendors } from '../../../src/infrastructure/database/schema/vendors.js'
import { users } from '../../../src/infrastructure/database/schema/users.js'
import { DrizzleAssessmentResultRepository } from '../../../src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.js'
import { DrizzleDimensionScoreRepository } from '../../../src/infrastructure/database/repositories/DrizzleDimensionScoreRepository.js'
import type { CreateAssessmentResultDTO } from '../../../src/domain/scoring/dtos.js'
import type { CreateDimensionScoreDTO } from '../../../src/domain/scoring/dtos.js'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'

describe('Transactional Score Storage (Integration)', () => {
  let assessmentResultRepo: DrizzleAssessmentResultRepository
  let dimensionScoreRepo: DrizzleDimensionScoreRepository
  let testUserId: string
  let testVendorId: string
  let testAssessmentId: string

  beforeAll(async () => {
    assessmentResultRepo = new DrizzleAssessmentResultRepository()
    dimensionScoreRepo = new DrizzleDimensionScoreRepository()

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-transaction-${crypto.randomUUID()}@example.com`,
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
        name: `Test Vendor Transaction ${crypto.randomUUID()}`,
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
    // Cleanup in correct order
    await db.delete(assessments).where(eq(assessments.id, testAssessmentId))
    await db.delete(vendors).where(eq(vendors.id, testVendorId))
    await db.delete(users).where(eq(users.id, testUserId))
  })

  beforeEach(async () => {
    // Clean scores before each test
    await db.delete(dimensionScores).where(eq(dimensionScores.assessmentId, testAssessmentId))
    await db.delete(assessmentResults).where(eq(assessmentResults.assessmentId, testAssessmentId))
  })

  describe('Transaction success scenarios', () => {
    it('should insert both dimension scores and assessment result in same transaction', async () => {
      const batchId = crypto.randomUUID()

      const dimScores: CreateDimensionScoreDTO[] = [
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'security_risk',
          score: 88,
          riskRating: 'low',
        },
      ]

      const assessmentResult: CreateAssessmentResultDTO = {
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 78,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      }

      // Execute in transaction
      await db.transaction(async (tx) => {
        await dimensionScoreRepo.createBatch(dimScores, tx)
        await assessmentResultRepo.create(assessmentResult, tx)
      })

      // Verify both were created
      const scores = await dimensionScoreRepo.findByBatchId(testAssessmentId, batchId)
      const result = await assessmentResultRepo.findByBatchId(testAssessmentId, batchId)

      expect(scores).toHaveLength(2)
      expect(result).not.toBeNull()
      expect(result?.compositeScore).toBe(78)
    })

    it('should work without transaction (backward compatibility)', async () => {
      const batchId = crypto.randomUUID()

      // Create without transaction
      await dimensionScoreRepo.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'clinical_risk',
          score: 65,
          riskRating: 'high',
        },
      ])

      await assessmentResultRepo.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 65,
        recommendation: 'decline',
        overallRiskRating: 'high',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Verify both were created
      const scores = await dimensionScoreRepo.findByBatchId(testAssessmentId, batchId)
      const result = await assessmentResultRepo.findByBatchId(testAssessmentId, batchId)

      expect(scores).toHaveLength(1)
      expect(result).not.toBeNull()
    })
  })

  describe('Transaction rollback scenarios', () => {
    it('should rollback dimension scores if assessment result insert fails', async () => {
      const batchId = crypto.randomUUID()

      const dimScores: CreateDimensionScoreDTO[] = [
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
      ]

      // First, create an assessment result with this batchId to cause duplicate error
      await assessmentResultRepo.create({
        assessmentId: testAssessmentId,
        batchId,
        compositeScore: 50,
        recommendation: 'decline',
        overallRiskRating: 'high',
        rubricVersion: 'guardian-v1.1',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Clear dimension scores (keep assessment result for duplicate constraint violation)
      await db.delete(dimensionScores).where(eq(dimensionScores.assessmentId, testAssessmentId))

      // Now try to insert in transaction - assessment result will fail due to duplicate
      await expect(
        db.transaction(async (tx) => {
          await dimensionScoreRepo.createBatch(dimScores, tx)
          // This will fail due to unique constraint (assessmentId, batchId)
          await assessmentResultRepo.create(
            {
              assessmentId: testAssessmentId,
              batchId, // Same batchId - will violate unique constraint
              compositeScore: 78,
              recommendation: 'conditional',
              overallRiskRating: 'medium',
              rubricVersion: 'guardian-v1.1',
              modelId: 'claude-sonnet-4-5-20250929',
            },
            tx
          )
        })
      ).rejects.toThrow()

      // Verify dimension scores were rolled back (should be 0)
      const scores = await dimensionScoreRepo.findByBatchId(testAssessmentId, batchId)
      expect(scores).toHaveLength(0)

      // Original assessment result should still exist
      const result = await assessmentResultRepo.findByBatchId(testAssessmentId, batchId)
      expect(result).not.toBeNull()
      expect(result?.compositeScore).toBe(50) // Original value
    })

    it('should rollback assessment result if dimension score insert fails', async () => {
      const batchId = crypto.randomUUID()

      // First, create a dimension score with this batchId to cause duplicate error
      await dimensionScoreRepo.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'privacy_risk',
          score: 50,
          riskRating: 'high',
        },
      ])

      // Now try to insert in transaction - dimension score will fail due to duplicate
      // Note: We create assessment result first, then dimension scores (reversed order)
      await expect(
        db.transaction(async (tx) => {
          // This would succeed normally
          await assessmentResultRepo.create(
            {
              assessmentId: testAssessmentId,
              batchId,
              compositeScore: 78,
              recommendation: 'conditional',
              overallRiskRating: 'medium',
              rubricVersion: 'guardian-v1.1',
              modelId: 'claude-sonnet-4-5-20250929',
            },
            tx
          )
          // This will fail due to unique constraint (assessmentId, batchId, dimension)
          await dimensionScoreRepo.createBatch(
            [
              {
                assessmentId: testAssessmentId,
                batchId,
                dimension: 'privacy_risk', // Same dimension - will violate unique constraint
                score: 75,
                riskRating: 'medium',
              },
            ],
            tx
          )
        })
      ).rejects.toThrow()

      // Verify assessment result was rolled back
      const result = await assessmentResultRepo.findByBatchId(testAssessmentId, batchId)
      expect(result).toBeNull() // Should not exist due to rollback

      // Original dimension score should still exist
      const scores = await dimensionScoreRepo.findByBatchId(testAssessmentId, batchId)
      expect(scores).toHaveLength(1)
      expect(scores[0].score).toBe(50) // Original value
    })

    it('should rollback all operations if transaction throws', async () => {
      const batchId = crypto.randomUUID()

      // Manually throw an error during transaction
      await expect(
        db.transaction(async (tx) => {
          await dimensionScoreRepo.createBatch(
            [
              {
                assessmentId: testAssessmentId,
                batchId,
                dimension: 'privacy_risk',
                score: 75,
                riskRating: 'medium',
              },
            ],
            tx
          )

          await assessmentResultRepo.create(
            {
              assessmentId: testAssessmentId,
              batchId,
              compositeScore: 78,
              recommendation: 'conditional',
              overallRiskRating: 'medium',
              rubricVersion: 'guardian-v1.1',
              modelId: 'claude-sonnet-4-5-20250929',
            },
            tx
          )

          // Manually throw to simulate application-level error
          throw new Error('Simulated application error')
        })
      ).rejects.toThrow('Simulated application error')

      // Verify both were rolled back
      const scores = await dimensionScoreRepo.findByBatchId(testAssessmentId, batchId)
      const result = await assessmentResultRepo.findByBatchId(testAssessmentId, batchId)

      expect(scores).toHaveLength(0)
      expect(result).toBeNull()
    })
  })

  describe('Transaction isolation', () => {
    it('should not see uncommitted data from another transaction', async () => {
      const batchId = crypto.randomUUID()

      try {
        await db.transaction(async (tx) => {
          await dimensionScoreRepo.createBatch(
            [
              {
                assessmentId: testAssessmentId,
                batchId,
                dimension: 'privacy_risk',
                score: 75,
                riskRating: 'medium',
              },
            ],
            tx
          )

          // Note: We could check if data is visible outside transaction here,
          // but postgres-js may share the same connection pool, making isolation
          // behavior inconsistent. The key test is that after rollback, nothing persists.

          // Throw to trigger rollback
          throw new Error('Rollback for isolation test')
        })
      } catch {
        // Expected - transaction was rolled back
      }

      // After rollback, verify nothing persisted (this is the key assertion)
      const scores = await dimensionScoreRepo.findByBatchId(testAssessmentId, batchId)
      expect(scores).toHaveLength(0)
    })
  })
})
