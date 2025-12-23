/**
 * Integration tests for DrizzleDimensionScoreRepository
 *
 * Tests actual database operations with test database
 */

// Jest provides describe, it, expect, beforeAll, afterAll, beforeEach globals
import { db } from '../../../src/infrastructure/database/client.js'
import { dimensionScores } from '../../../src/infrastructure/database/schema/dimensionScores.js'
import { assessments } from '../../../src/infrastructure/database/schema/assessments.js'
import { vendors } from '../../../src/infrastructure/database/schema/vendors.js'
import { users } from '../../../src/infrastructure/database/schema/users.js'
import { DrizzleDimensionScoreRepository } from '../../../src/infrastructure/database/repositories/DrizzleDimensionScoreRepository.js'
import type { CreateDimensionScoreDTO } from '../../../src/domain/scoring/dtos.js'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

describe('DrizzleDimensionScoreRepository (Integration)', () => {
  let repository: DrizzleDimensionScoreRepository
  let testUserId: string
  let testVendorId: string
  let testAssessmentId: string

  beforeAll(async () => {
    repository = new DrizzleDimensionScoreRepository()

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-dimension-${crypto.randomUUID()}@example.com`,
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
        name: `Test Vendor Dimension ${crypto.randomUUID()}`,
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
    // Clean dimension scores before each test
    await db.delete(dimensionScores).where(eq(dimensionScores.assessmentId, testAssessmentId))
  })

  describe('createBatch', () => {
    it('should create batch of dimension scores', async () => {
      const batchId = crypto.randomUUID()
      const newScores: CreateDimensionScoreDTO[] = [
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
          findings: {
            subScores: [
              { name: 'Data Encryption', score: 8, maxScore: 10, notes: 'Strong encryption' },
              { name: 'Access Controls', score: 7, maxScore: 10, notes: 'Good controls' },
            ],
            keyRisks: ['Potential data exposure', 'Third-party sharing'],
            mitigations: ['Implement end-to-end encryption', 'Review vendor contracts'],
            evidenceRefs: [
              { sectionNumber: 3, questionNumber: 5, quote: 'We use AES-256 encryption' },
            ],
          },
        },
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'security_risk',
          score: 88,
          riskRating: 'low',
        },
      ]

      const created = await repository.createBatch(newScores)

      expect(created).toHaveLength(2)
      expect(created[0].assessmentId).toBe(testAssessmentId)
      expect(created[0].batchId).toBe(batchId)
      expect(created[0].dimension).toBe('privacy_risk')
      expect(created[0].score).toBe(75)
      expect(created[0].riskRating).toBe('medium')
      expect(created[0].findings).toBeDefined()
      expect(created[0].findings?.subScores).toHaveLength(2)
      expect(created[0].findings?.keyRisks).toHaveLength(2)

      expect(created[1].dimension).toBe('security_risk')
      expect(created[1].score).toBe(88)
      expect(created[1].findings).toBeUndefined()
    })

    it('should return empty array for empty input', async () => {
      const created = await repository.createBatch([])
      expect(created).toEqual([])
    })

    it('should enforce unique constraint on (assessmentId, batchId, dimension)', async () => {
      const batchId = crypto.randomUUID()

      // Create first score
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
      ])

      // Attempt duplicate (same assessmentId, batchId, dimension)
      await expect(
        repository.createBatch([
          {
            assessmentId: testAssessmentId,
            batchId,
            dimension: 'privacy_risk',
            score: 80,
            riskRating: 'high',
          },
        ])
      ).rejects.toThrow()
    })

    it('should allow same dimension in different batches', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create same dimension in batch 1
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
      ])

      // Create same dimension in batch 2 (should succeed)
      await expect(
        repository.createBatch([
          {
            assessmentId: testAssessmentId,
            batchId: batchId2,
            dimension: 'privacy_risk',
            score: 80,
            riskRating: 'high',
          },
        ])
      ).resolves.not.toThrow()
    })
  })

  describe('findByAssessmentId', () => {
    it('should find all dimension scores for an assessment, ordered by most recent', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create scores in batch 1
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
      ])

      // Wait briefly to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Create scores in batch 2
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId2,
          dimension: 'security_risk',
          score: 88,
          riskRating: 'low',
        },
      ])

      const found = await repository.findByAssessmentId(testAssessmentId)

      expect(found).toHaveLength(2)
      // Most recent first
      expect(found[0].dimension).toBe('security_risk')
      expect(found[1].dimension).toBe('privacy_risk')
    })

    it('should return empty array when no scores exist', async () => {
      const found = await repository.findByAssessmentId(crypto.randomUUID())
      expect(found).toEqual([])
    })
  })

  describe('findByBatchId', () => {
    it('should find dimension scores by batch ID', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create scores in two batches
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          dimension: 'security_risk',
          score: 88,
          riskRating: 'low',
        },
      ])

      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId2,
          dimension: 'clinical_risk',
          score: 65,
          riskRating: 'high',
        },
      ])

      const batch1Scores = await repository.findByBatchId(testAssessmentId, batchId1)
      const batch2Scores = await repository.findByBatchId(testAssessmentId, batchId2)

      expect(batch1Scores).toHaveLength(2)
      expect(batch2Scores).toHaveLength(1)
      expect(batch2Scores[0].dimension).toBe('clinical_risk')
    })

    it('should return empty array when batch has no scores', async () => {
      const found = await repository.findByBatchId(testAssessmentId, crypto.randomUUID())
      expect(found).toEqual([])
    })
  })

  describe('findLatestByAssessmentId', () => {
    it('should find latest dimension scores (most recent batch)', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create scores in batch 1 (older)
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          dimension: 'security_risk',
          score: 80,
          riskRating: 'medium',
        },
      ])

      // Wait briefly to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Create scores in batch 2 (newer)
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId2,
          dimension: 'privacy_risk',
          score: 85,
          riskRating: 'low',
        },
        {
          assessmentId: testAssessmentId,
          batchId: batchId2,
          dimension: 'clinical_risk',
          score: 65,
          riskRating: 'high',
        },
      ])

      const latest = await repository.findLatestByAssessmentId(testAssessmentId)

      expect(latest).toHaveLength(2)
      // Should only return batch 2 scores
      expect(latest.every((score) => score.batchId === batchId2)).toBe(true)
      expect(latest.some((score) => score.dimension === 'privacy_risk')).toBe(true)
      expect(latest.some((score) => score.dimension === 'clinical_risk')).toBe(true)
      expect(latest.some((score) => score.dimension === 'security_risk')).toBe(false)
    })

    it('should return empty array when no scores exist', async () => {
      const latest = await repository.findLatestByAssessmentId(crypto.randomUUID())
      expect(latest).toEqual([])
    })
  })

  describe('cascade deletion', () => {
    it('should delete dimension scores when assessment is deleted', async () => {
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

      // Create dimension scores
      await repository.createBatch([
        {
          assessmentId: assessment.id,
          batchId: crypto.randomUUID(),
          dimension: 'privacy_risk',
          score: 75,
          riskRating: 'medium',
        },
      ])

      // Verify scores exist
      let found = await repository.findByAssessmentId(assessment.id)
      expect(found).toHaveLength(1)

      // Delete assessment (should cascade)
      await db.delete(assessments).where(eq(assessments.id, assessment.id))

      // Verify scores are deleted
      found = await repository.findByAssessmentId(assessment.id)
      expect(found).toEqual([])

      // Cleanup vendor
      await db.delete(vendors).where(eq(vendors.id, vendor.id))
    })
  })
})
