/**
 * Integration tests for DrizzleAssessmentRepository
 */

import { db } from '../../src/infrastructure/database/client'
import { assessments } from '../../src/infrastructure/database/schema/assessments'
import { vendors } from '../../src/infrastructure/database/schema/vendors'
import { users } from '../../src/infrastructure/database/schema/users'
import { DrizzleAssessmentRepository } from '../../src/infrastructure/database/repositories/DrizzleAssessmentRepository'
import { Assessment } from '../../src/domain/entities/Assessment'

describe('DrizzleAssessmentRepository Integration Tests', () => {
  let repository: DrizzleAssessmentRepository
  let testVendorId: string
  let testUserId: string

  beforeAll(() => {
    repository = new DrizzleAssessmentRepository()
  })

  beforeEach(async () => {
    // Create test vendor and user for foreign key relationships
    const [vendor] = await db
      .insert(vendors)
      .values({
        name: 'Test Vendor',
        industry: 'Technology',
      })
      .returning()

    const [user] = await db
      .insert(users)
      .values({
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        name: 'Test User',
        role: 'analyst',
      })
      .returning()

    testVendorId = vendor.id
    testUserId = user.id
  })

  afterEach(async () => {
    // Clean up test data (cascade will handle assessments)
    await db.delete(assessments)
    await db.delete(vendors)
    await db.delete(users)
  })

  describe('create()', () => {
    it('should save assessment to database', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        solutionName: 'NLHS PMO Tool',
        solutionType: 'AI tool',
        createdBy: testUserId,
      })

      const created = await repository.create(assessment)

      expect(created.id).toBe(assessment.id)
      expect(created.vendorId).toBe(testVendorId)
      expect(created.assessmentType).toBe('comprehensive')
      expect(created.solutionName).toBe('NLHS PMO Tool')
      expect(created.solutionType).toBe('AI tool')
      expect(created.status).toBe('draft')
      expect(created.createdBy).toBe(testUserId)
    })

    it('should persist JSONB assessmentMetadata correctly', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
        assessmentMetadata: {
          assessorName: 'John Doe',
          stakeholders: ['Alice', 'Bob'],
          notes: 'High priority',
        },
      })

      const created = await repository.create(assessment)
      const found = await repository.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.assessmentMetadata).toEqual({
        assessorName: 'John Doe',
        stakeholders: ['Alice', 'Bob'],
        notes: 'High priority',
      })
    })

    it('should save assessment with null optional fields', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })

      const created = await repository.create(assessment)

      expect(created.solutionName).toBeNull()
      expect(created.solutionType).toBeNull()
      expect(created.assessmentMetadata).toBeNull()
    })
  })

  describe('findById()', () => {
    it('should find assessment by ID', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        createdBy: testUserId,
      })
      await repository.create(assessment)

      const found = await repository.findById(assessment.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(assessment.id)
      expect(found!.vendorId).toBe(testVendorId)
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent-id')
      expect(found).toBeNull()
    })
  })

  describe('findByVendorId()', () => {
    it('should find all assessments for a vendor', async () => {
      const assessment1 = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })
      const assessment2 = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        createdBy: testUserId,
      })

      await repository.create(assessment1)
      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.create(assessment2)

      const found = await repository.findByVendorId(testVendorId)

      expect(found).toHaveLength(2)
      // Should be ordered by creation date (newest first)
      expect(found[0].id).toBe(assessment2.id)
      expect(found[1].id).toBe(assessment1.id)
    })

    it('should return empty array for vendor with no assessments', async () => {
      const found = await repository.findByVendorId('non-existent-vendor-id')
      expect(found).toHaveLength(0)
    })
  })

  describe('findByCreatedBy()', () => {
    it('should find all assessments created by a user', async () => {
      const assessment1 = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })
      const assessment2 = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        createdBy: testUserId,
      })

      await repository.create(assessment1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.create(assessment2)

      const found = await repository.findByCreatedBy(testUserId)

      expect(found).toHaveLength(2)
      // Should be ordered by creation date (newest first)
      expect(found[0].id).toBe(assessment2.id)
      expect(found[1].id).toBe(assessment1.id)
    })

    it('should return empty array for user with no assessments', async () => {
      const found = await repository.findByCreatedBy('non-existent-user-id')
      expect(found).toHaveLength(0)
    })
  })

  describe('update()', () => {
    it('should update assessment fields', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        solutionName: 'Original Name',
        createdBy: testUserId,
      })
      await repository.create(assessment)

      assessment.updateSolutionName('Updated Name')
      assessment.updateSolutionType('Cloud platform')

      const updated = await repository.update(assessment)

      expect(updated.solutionName).toBe('Updated Name')
      expect(updated.solutionType).toBe('Cloud platform')
    })

    it('should update assessment status', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        createdBy: testUserId,
      })
      const created = await repository.create(assessment)

      expect(created.status).toBe('draft')

      assessment.markQuestionsGenerated()
      const updated = await repository.update(assessment)

      expect(updated.status).toBe('questions_generated')
    })

    it('should update assessmentMetadata', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })
      await repository.create(assessment)

      assessment.updateMetadata({
        assessorName: 'Jane Doe',
        notes: 'Updated notes',
      })

      const updated = await repository.update(assessment)

      expect(updated.assessmentMetadata).toEqual({
        assessorName: 'Jane Doe',
        notes: 'Updated notes',
      })
    })

    it('should update updatedAt timestamp', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })
      const created = await repository.create(assessment)
      const originalUpdatedAt = created.updatedAt

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10))

      assessment.updateSolutionName('New Name')
      const updated = await repository.update(assessment)

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      )
    })
  })

  describe('delete()', () => {
    it('should delete assessment from database', async () => {
      const assessment = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })
      await repository.create(assessment)

      await repository.delete(assessment.id)

      const found = await repository.findById(assessment.id)
      expect(found).toBeNull()
    })

    it('should not throw error when deleting non-existent assessment', async () => {
      await expect(
        repository.delete('non-existent-id')
      ).resolves.not.toThrow()
    })
  })

  describe('list()', () => {
    it('should list all assessments', async () => {
      const assessment1 = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'quick',
        createdBy: testUserId,
      })
      const assessment2 = Assessment.create({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        createdBy: testUserId,
      })

      await repository.create(assessment1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.create(assessment2)

      const assessments = await repository.list()

      expect(assessments).toHaveLength(2)
      // Should be ordered by creation date (newest first)
      expect(assessments[0].id).toBe(assessment2.id)
      expect(assessments[1].id).toBe(assessment1.id)
    })

    it('should respect limit parameter', async () => {
      await repository.create(
        Assessment.create({
          vendorId: testVendorId,
          assessmentType: 'quick',
          createdBy: testUserId,
        })
      )
      await repository.create(
        Assessment.create({
          vendorId: testVendorId,
          assessmentType: 'comprehensive',
          createdBy: testUserId,
        })
      )
      await repository.create(
        Assessment.create({
          vendorId: testVendorId,
          assessmentType: 'renewal',
          createdBy: testUserId,
        })
      )

      const assessments = await repository.list(2)

      expect(assessments).toHaveLength(2)
    })

    it('should respect offset parameter', async () => {
      const a1 = await repository.create(
        Assessment.create({
          vendorId: testVendorId,
          assessmentType: 'quick',
          createdBy: testUserId,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 10))
      const a2 = await repository.create(
        Assessment.create({
          vendorId: testVendorId,
          assessmentType: 'comprehensive',
          createdBy: testUserId,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.create(
        Assessment.create({
          vendorId: testVendorId,
          assessmentType: 'renewal',
          createdBy: testUserId,
        })
      )

      const assessments = await repository.list(2, 1)

      expect(assessments).toHaveLength(2)
      // Skip the newest, get the next 2
      expect(assessments[0].id).toBe(a2.id)
      expect(assessments[1].id).toBe(a1.id)
    })
  })
})
