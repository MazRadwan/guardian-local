/**
 * Integration tests for DrizzleResponseRepository
 *
 * Tests actual database operations with test database
 */

// Jest provides describe, it, expect, beforeAll, afterAll, beforeEach globals
import { db } from '../../../src/infrastructure/database/client.js'
import { responses } from '../../../src/infrastructure/database/schema/responses.js'
import { assessments } from '../../../src/infrastructure/database/schema/assessments.js'
import { vendors } from '../../../src/infrastructure/database/schema/vendors.js'
import { users } from '../../../src/infrastructure/database/schema/users.js'
import { files } from '../../../src/infrastructure/database/schema/files.js'
import { conversations } from '../../../src/infrastructure/database/schema/conversations.js'
import { DrizzleResponseRepository } from '../../../src/infrastructure/database/repositories/DrizzleResponseRepository.js'
import type { CreateResponseDTO } from '../../../src/domain/scoring/dtos.js'
import { eq } from 'drizzle-orm'
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
    // Cleanup (cascade will handle children)
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
})
