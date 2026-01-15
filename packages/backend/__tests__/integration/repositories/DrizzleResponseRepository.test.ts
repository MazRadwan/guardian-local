/**
 * Integration tests for DrizzleResponseRepository
 *
 * Tests actual database operations with test database
 */

// Jest provides describe, it, expect, beforeAll, afterAll, beforeEach globals
import { db } from '../../../src/infrastructure/database/client.js'
import { responses } from '../../../src/infrastructure/database/schema/responses.js'
import { assessments } from '../../../src/infrastructure/database/schema/assessments.js'
import { assessmentResults } from '../../../src/infrastructure/database/schema/assessmentResults.js'
import { vendors } from '../../../src/infrastructure/database/schema/vendors.js'
import { users } from '../../../src/infrastructure/database/schema/users.js'
import { files } from '../../../src/infrastructure/database/schema/files.js'
import { conversations } from '../../../src/infrastructure/database/schema/conversations.js'
import { DrizzleResponseRepository } from '../../../src/infrastructure/database/repositories/DrizzleResponseRepository.js'
import type { CreateResponseDTO } from '../../../src/domain/scoring/dtos.js'
import { eq, sql } from 'drizzle-orm'
import crypto from 'crypto'

describe('DrizzleResponseRepository (Integration)', () => {
  let repository: DrizzleResponseRepository
  let testUserId: string
  let testVendorId: string
  let testAssessmentId: string
  let testConversationId: string
  let testFileId: string
  let testBatchId: string

  beforeAll(async () => {
    repository = new DrizzleResponseRepository()

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-response-${crypto.randomUUID()}@example.com`,
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
        name: `Test Vendor Response ${crypto.randomUUID()}`,
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

    // Create test conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: testUserId,
        mode: 'assessment',
        assessmentId: testAssessmentId,
        status: 'active',
      })
      .returning()
    testConversationId = conversation.id

    // Create test file
    const [file] = await db
      .insert(files)
      .values({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-response.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/tmp/test-response.pdf',
      })
      .returning()
    testFileId = file.id

    testBatchId = crypto.randomUUID()
  })

  afterAll(async () => {
    // Cleanup in correct order (assessments/conversations FK to users is NO ACTION, not CASCADE)
    await db.delete(conversations).where(eq(conversations.id, testConversationId))
    await db.delete(assessments).where(eq(assessments.id, testAssessmentId))
    await db.delete(vendors).where(eq(vendors.id, testVendorId))
    await db.delete(users).where(eq(users.id, testUserId))
  })

  beforeEach(async () => {
    // Clean responses before each test
    await db.delete(responses).where(eq(responses.assessmentId, testAssessmentId))
    testBatchId = crypto.randomUUID() // Fresh batch ID for each test
  })

  describe('createBatch', () => {
    it('should create batch of responses', async () => {
      const newResponses: CreateResponseDTO[] = [
        {
          assessmentId: testAssessmentId,
          batchId: testBatchId,
          fileId: testFileId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Question 1',
          responseText: 'Answer 1',
          confidence: 0.95,
          hasVisualContent: false,
        },
        {
          assessmentId: testAssessmentId,
          batchId: testBatchId,
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Question 2',
          responseText: 'Answer 2',
          confidence: 0.87,
          hasVisualContent: true,
          visualContentDescription: 'Chart showing data trends',
        },
      ]

      const created = await repository.createBatch(newResponses)

      expect(created).toHaveLength(2)
      expect(created[0].assessmentId).toBe(testAssessmentId)
      expect(created[0].batchId).toBe(testBatchId)
      expect(created[0].questionText).toBe('Question 1')
      expect(created[0].responseText).toBe('Answer 1')
      expect(created[0].confidence).toBe(0.95)
      expect(created[0].hasVisualContent).toBe(false)

      expect(created[1].hasVisualContent).toBe(true)
      expect(created[1].visualContentDescription).toBe('Chart showing data trends')
    })

    it('should return empty array for empty input', async () => {
      const created = await repository.createBatch([])
      expect(created).toEqual([])
    })

    it('should handle responses without fileId', async () => {
      const newResponses: CreateResponseDTO[] = [
        {
          assessmentId: testAssessmentId,
          batchId: testBatchId,
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Q2.1',
          responseText: 'A2.1',
        },
      ]

      const created = await repository.createBatch(newResponses)

      expect(created).toHaveLength(1)
      expect(created[0].fileId).toBeUndefined()
    })
  })

  describe('findByAssessmentId', () => {
    it('should find all responses for an assessment, ordered by position', async () => {
      // Create responses in non-sequential order
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: testBatchId,
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Q2.1',
          responseText: 'A2.1',
        },
        {
          assessmentId: testAssessmentId,
          batchId: testBatchId,
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Q1.2',
          responseText: 'A1.2',
        },
        {
          assessmentId: testAssessmentId,
          batchId: testBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Q1.1',
          responseText: 'A1.1',
        },
      ])

      const found = await repository.findByAssessmentId(testAssessmentId)

      expect(found).toHaveLength(3)
      // Should be ordered by section, then question
      expect(found[0].questionText).toBe('Q1.1')
      expect(found[1].questionText).toBe('Q1.2')
      expect(found[2].questionText).toBe('Q2.1')
    })

    it('should return empty array when no responses exist', async () => {
      const found = await repository.findByAssessmentId(crypto.randomUUID())
      expect(found).toEqual([])
    })
  })

  describe('findByBatchId', () => {
    it('should find responses by batch ID', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create responses in two batches
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Batch 1 Q1',
          responseText: 'Batch 1 A1',
        },
        {
          assessmentId: testAssessmentId,
          batchId: batchId2,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Batch 2 Q1',
          responseText: 'Batch 2 A1',
        },
      ])

      const batch1Responses = await repository.findByBatchId(testAssessmentId, batchId1)
      const batch2Responses = await repository.findByBatchId(testAssessmentId, batchId2)

      expect(batch1Responses).toHaveLength(1)
      expect(batch1Responses[0].responseText).toBe('Batch 1 A1')

      expect(batch2Responses).toHaveLength(1)
      expect(batch2Responses[0].responseText).toBe('Batch 2 A1')
    })

    it('should return empty array when batch has no responses', async () => {
      const found = await repository.findByBatchId(testAssessmentId, crypto.randomUUID())
      expect(found).toEqual([])
    })
  })

  describe('deleteByBatchId', () => {
    it('should delete responses by batch ID', async () => {
      const batchId1 = crypto.randomUUID()
      const batchId2 = crypto.randomUUID()

      // Create responses in two batches
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batchId1,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Batch 1 Q1',
          responseText: 'Batch 1 A1',
        },
        {
          assessmentId: testAssessmentId,
          batchId: batchId2,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Batch 2 Q1',
          responseText: 'Batch 2 A1',
        },
      ])

      // Delete batch 1
      await repository.deleteByBatchId(testAssessmentId, batchId1)

      // Verify batch 1 is gone, batch 2 remains
      const batch1Responses = await repository.findByBatchId(testAssessmentId, batchId1)
      const batch2Responses = await repository.findByBatchId(testAssessmentId, batchId2)

      expect(batch1Responses).toEqual([])
      expect(batch2Responses).toHaveLength(1)
    })

    it('should not throw when deleting non-existent batch', async () => {
      await expect(
        repository.deleteByBatchId(testAssessmentId, crypto.randomUUID())
      ).resolves.not.toThrow()
    })
  })

  describe('cascade deletion', () => {
    it('should delete responses when assessment is deleted', async () => {
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

      // Create responses
      await repository.createBatch([
        {
          assessmentId: assessment.id,
          batchId: crypto.randomUUID(),
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Q1',
          responseText: 'A1',
        },
      ])

      // Verify responses exist
      let found = await repository.findByAssessmentId(assessment.id)
      expect(found).toHaveLength(1)

      // Delete assessment (should cascade)
      await db.delete(assessments).where(eq(assessments.id, assessment.id))

      // Verify responses are deleted
      found = await repository.findByAssessmentId(assessment.id)
      expect(found).toEqual([])

      // Cleanup vendor
      await db.delete(vendors).where(eq(vendors.id, vendor.id))
    })
  })

  // ===========================================================================
  // Epic 20: Orphan Cleanup Methods
  // ===========================================================================

  describe('findOrphanedBatches', () => {
    it('should find batches without matching assessment_results', async () => {
      const orphanBatchId = crypto.randomUUID()

      // Create responses without assessment result (orphan)
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: orphanBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Orphan Q1',
          responseText: 'Orphan A1',
        },
      ])

      // Make responses appear old by directly updating created_at
      await db.execute(sql`
        UPDATE responses
        SET created_at = NOW() - INTERVAL '48 hours'
        WHERE batch_id = ${orphanBatchId}
      `)

      // Find orphaned batches (24h retention)
      const orphanedBatches = await repository.findOrphanedBatches(24)

      // Should include an entry with matching assessmentId and batchId
      const found = orphanedBatches.find(
        (ref) => ref.assessmentId === testAssessmentId && ref.batchId === orphanBatchId
      )
      expect(found).toBeDefined()
    })

    it('should NOT find batches with matching assessment_results', async () => {
      const linkedBatchId = crypto.randomUUID()

      // Create responses
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: linkedBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Linked Q1',
          responseText: 'Linked A1',
        },
      ])

      // Create matching assessment result
      await db.insert(assessmentResults).values({
        assessmentId: testAssessmentId,
        batchId: linkedBatchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.0',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Make responses appear old
      await db.execute(sql`
        UPDATE responses
        SET created_at = NOW() - INTERVAL '48 hours'
        WHERE batch_id = ${linkedBatchId}
      `)

      // Find orphaned batches
      const orphanedBatches = await repository.findOrphanedBatches(24)

      // Should NOT include the linked batch
      const found = orphanedBatches.find(
        (ref) => ref.batchId === linkedBatchId
      )
      expect(found).toBeUndefined()
    })

    it('should respect retention window (not delete recent orphans)', async () => {
      const recentOrphanBatchId = crypto.randomUUID()

      // Create recent responses without assessment result
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: recentOrphanBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Recent Q1',
          responseText: 'Recent A1',
        },
      ])

      // These responses are created NOW, so within 24h retention
      const orphanedBatches = await repository.findOrphanedBatches(24)

      // Should NOT include the recent orphan (scoring might still be in progress)
      const found = orphanedBatches.find(
        (ref) => ref.batchId === recentOrphanBatchId
      )
      expect(found).toBeUndefined()
    })

    it('should handle mixed batches - some old, some new', async () => {
      const oldOrphanBatchId = crypto.randomUUID()
      const newOrphanBatchId = crypto.randomUUID()

      // Create old orphan
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: oldOrphanBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Old Q1',
          responseText: 'Old A1',
        },
      ])

      // Make old orphan appear old
      await db.execute(sql`
        UPDATE responses
        SET created_at = NOW() - INTERVAL '48 hours'
        WHERE batch_id = ${oldOrphanBatchId}
      `)

      // Create new orphan (recent)
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: newOrphanBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'New Q1',
          responseText: 'New A1',
        },
      ])

      const orphanedBatches = await repository.findOrphanedBatches(24)

      // Should include old orphan, not new orphan
      const foundOld = orphanedBatches.find(
        (ref) => ref.batchId === oldOrphanBatchId
      )
      const foundNew = orphanedBatches.find(
        (ref) => ref.batchId === newOrphanBatchId
      )
      expect(foundOld).toBeDefined()
      expect(foundNew).toBeUndefined()
    })

    it('should return empty array when no orphans exist', async () => {
      const linkedBatchId = crypto.randomUUID()

      // Create responses with matching assessment result
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: linkedBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Q1',
          responseText: 'A1',
        },
      ])

      await db.insert(assessmentResults).values({
        assessmentId: testAssessmentId,
        batchId: linkedBatchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.0',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // All responses are either linked or recent
      // Clear any previously created orphans from this test assessment
      await db.execute(sql`
        DELETE FROM responses
        WHERE assessment_id = ${testAssessmentId}
        AND batch_id != ${linkedBatchId}
      `)

      // Find orphaned batches for this specific test
      const orphanedBatches = await repository.findOrphanedBatches(24)

      // The linked batch should not be in orphans
      const found = orphanedBatches.find(
        (ref) => ref.batchId === linkedBatchId
      )
      expect(found).toBeUndefined()
    })
  })

  describe('deleteByBatchIdIfOrphaned', () => {
    it('should delete all orphaned responses for a batch and return count', async () => {
      const orphanBatchId = crypto.randomUUID()

      // Create multiple responses in the batch (no assessment_result = orphaned)
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: orphanBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Q1',
          responseText: 'A1',
        },
        {
          assessmentId: testAssessmentId,
          batchId: orphanBatchId,
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Q2',
          responseText: 'A2',
        },
        {
          assessmentId: testAssessmentId,
          batchId: orphanBatchId,
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Q3',
          responseText: 'A3',
        },
      ])

      // Verify responses exist
      let found = await repository.findByBatchId(testAssessmentId, orphanBatchId)
      expect(found).toHaveLength(3)

      // Delete (using both assessmentId and batchId)
      const deletedCount = await repository.deleteByBatchIdIfOrphaned(testAssessmentId, orphanBatchId)
      expect(deletedCount).toBe(3)

      // Verify deleted
      found = await repository.findByBatchId(testAssessmentId, orphanBatchId)
      expect(found).toHaveLength(0)
    })

    it('should return 0 when batch does not exist', async () => {
      const nonExistentBatchId = crypto.randomUUID()
      const deletedCount = await repository.deleteByBatchIdIfOrphaned(testAssessmentId, nonExistentBatchId)
      expect(deletedCount).toBe(0)
    })

    it('should NOT delete when batch has matching assessment_result (race-safe)', async () => {
      const linkedBatchId = crypto.randomUUID()

      // Create responses
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: linkedBatchId,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Linked Q1',
          responseText: 'Linked A1',
        },
      ])

      // Create matching assessment result (batch is not orphaned)
      await db.insert(assessmentResults).values({
        assessmentId: testAssessmentId,
        batchId: linkedBatchId,
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        rubricVersion: 'guardian-v1.0',
        modelId: 'claude-sonnet-4-5-20250929',
      })

      // Try to delete - should return 0 (race-safe check)
      const deletedCount = await repository.deleteByBatchIdIfOrphaned(testAssessmentId, linkedBatchId)
      expect(deletedCount).toBe(0)

      // Verify responses still exist
      const found = await repository.findByBatchId(testAssessmentId, linkedBatchId)
      expect(found).toHaveLength(1)
    })

    it('should only delete specified batch, leaving others intact', async () => {
      const batch1Id = crypto.randomUUID()
      const batch2Id = crypto.randomUUID()

      // Create responses in two batches (both orphaned)
      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batch1Id,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Batch1 Q1',
          responseText: 'Batch1 A1',
        },
      ])

      await repository.createBatch([
        {
          assessmentId: testAssessmentId,
          batchId: batch2Id,
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Batch2 Q1',
          responseText: 'Batch2 A1',
        },
      ])

      // Delete batch1
      const deletedCount = await repository.deleteByBatchIdIfOrphaned(testAssessmentId, batch1Id)
      expect(deletedCount).toBe(1)

      // Verify batch1 is gone, batch2 remains
      const batch1Responses = await repository.findByBatchId(testAssessmentId, batch1Id)
      const batch2Responses = await repository.findByBatchId(testAssessmentId, batch2Id)

      expect(batch1Responses).toHaveLength(0)
      expect(batch2Responses).toHaveLength(1)
    })
  })
})
