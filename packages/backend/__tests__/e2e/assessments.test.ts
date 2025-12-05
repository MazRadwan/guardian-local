/**
 * E2E tests for Assessment API endpoints
 */

import request from 'supertest'
import { db } from '../../src/infrastructure/database/client'
import { assessments } from '../../src/infrastructure/database/schema/assessments'
import { vendors } from '../../src/infrastructure/database/schema/vendors'
import { users } from '../../src/infrastructure/database/schema/users'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { AuthService } from '../../src/application/services/AuthService'
import { JWTProvider } from '../../src/infrastructure/auth/JWTProvider'

// Mock server setup
const BASE_URL = 'http://localhost:8000'

describe('Assessment API E2E Tests', () => {
  let authToken: string
  let testUserId: string

  beforeAll(async () => {
    // Create test user and get auth token
    const userRepo = new DrizzleUserRepository(db)
    const tokenProvider = new JWTProvider()
    const authService = new AuthService(userRepo, tokenProvider)

    const testUser = await authService.register({
      email: 'assessment-test@example.com',
      password: 'Test123!@#',
      name: 'Assessment Test User',
      role: 'analyst',
    })

    testUserId = testUser.id
    authToken = testUser.token
  })

  afterEach(async () => {
    // Clean up assessments and vendors after each test
    await db.delete(assessments)
    await db.delete(vendors)
  })

  afterAll(async () => {
    // Clean up test user
    await db.delete(users)
  })

  describe('POST /api/assessments', () => {
    it('should create assessment with new vendor', async () => {
      const response = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'TechFlow Solutions',
          vendorIndustry: 'Healthcare IT',
          vendorWebsite: 'https://techflow.com',
          assessmentType: 'comprehensive',
          solutionName: 'NLHS PMO Tool',
          solutionType: 'AI tool',
        })

      expect(response.status).toBe(201)
      expect(response.body.vendorName).toBe('TechFlow Solutions')
      expect(response.body.assessmentType).toBe('comprehensive')
      expect(response.body.status).toBe('draft')
      expect(response.body.assessmentId).toBeDefined()
      expect(response.body.vendorId).toBeDefined()
    })

    it('should reuse existing vendor', async () => {
      // Create first assessment (creates vendor)
      const firstResponse = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'ExistingVendor',
          assessmentType: 'quick',
        })

      const vendorId = firstResponse.body.vendorId

      // Create second assessment (should reuse vendor)
      const secondResponse = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'ExistingVendor',
          assessmentType: 'comprehensive',
        })

      expect(secondResponse.status).toBe(201)
      expect(secondResponse.body.vendorId).toBe(vendorId)
    })

    it('should return 400 for missing vendor name', async () => {
      const response = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assessmentType: 'quick',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Vendor name is required')
    })

    it('should return 400 for missing assessment type', async () => {
      const response = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'TestVendor',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Assessment type is required')
    })

    it('should return 400 for invalid assessment type', async () => {
      const response = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'TestVendor',
          assessmentType: 'invalid_type',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid assessment type')
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL)
        .post('/api/assessments')
        .send({
          vendorName: 'TestVendor',
          assessmentType: 'quick',
        })

      expect(response.status).toBe(401)
    })

    it('should save assessment metadata', async () => {
      const response = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'MetadataVendor',
          assessmentType: 'comprehensive',
          assessmentMetadata: {
            assessorName: 'John Doe',
            stakeholders: ['Alice', 'Bob'],
            notes: 'High priority assessment',
          },
        })

      expect(response.status).toBe(201)
      // Note: metadata is not returned in the create response DTO
      // but should be persisted in the database
    })
  })

  describe('GET /api/assessments/:id', () => {
    it('should get assessment by ID', async () => {
      // Create assessment first
      const createResponse = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'GetByIdVendor',
          assessmentType: 'comprehensive',
          solutionName: 'Test Solution',
        })

      const assessmentId = createResponse.body.assessmentId

      // Get assessment
      const response = await request(BASE_URL)
        .get(`/api/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(assessmentId)
      expect(response.body.assessmentType).toBe('comprehensive')
      expect(response.body.solutionName).toBe('Test Solution')
      expect(response.body.status).toBe('draft')
    })

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(BASE_URL)
        .get('/api/assessments/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get('/api/assessments/some-id')

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api/assessments', () => {
    it('should list all assessments', async () => {
      // Create multiple assessments
      await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vendorName: 'Vendor A', assessmentType: 'quick' })

      await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vendorName: 'Vendor B', assessmentType: 'comprehensive' })

      await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vendorName: 'Vendor C', assessmentType: 'category_focused' })

      // List assessments
      const response = await request(BASE_URL)
        .get('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.assessments).toHaveLength(3)
      expect(response.body.count).toBe(3)
    })

    it('should respect pagination parameters', async () => {
      // Create assessments
      for (let i = 1; i <= 5; i++) {
        await request(BASE_URL)
          .post('/api/assessments')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ vendorName: `Vendor ${i}`, assessmentType: 'quick' })
      }

      // Get page 1 (limit 2)
      const response = await request(BASE_URL)
        .get('/api/assessments?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.assessments).toHaveLength(2)
      expect(response.body.limit).toBe(2)
      expect(response.body.offset).toBe(0)
    })

    it('should return empty array when no assessments', async () => {
      const response = await request(BASE_URL)
        .get('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.assessments).toHaveLength(0)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get('/api/assessments')

      expect(response.status).toBe(401)
    })
  })

  describe('PATCH /api/assessments/:id/status', () => {
    it('should update assessment status', async () => {
      // Create assessment
      const createResponse = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'StatusUpdateVendor',
          assessmentType: 'comprehensive',
        })

      const assessmentId = createResponse.body.assessmentId

      // Update status
      const response = await request(BASE_URL)
        .patch(`/api/assessments/${assessmentId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'questions_generated' })

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('questions_generated')
      expect(response.body.id).toBe(assessmentId)
    })

    it('should return 400 for missing status', async () => {
      const response = await request(BASE_URL)
        .patch('/api/assessments/some-id/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Status is required')
    })

    it('should return 400 for invalid status', async () => {
      const response = await request(BASE_URL)
        .patch('/api/assessments/some-id/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid_status' })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid status')
    })

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(BASE_URL)
        .patch('/api/assessments/non-existent-id/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'questions_generated' })

      expect(response.status).toBe(404)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL)
        .patch('/api/assessments/some-id/status')
        .send({ status: 'exported' })

      expect(response.status).toBe(401)
    })
  })

  describe('DELETE /api/assessments/:id', () => {
    it('should delete assessment', async () => {
      // Create assessment
      const createResponse = await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'DeleteVendor',
          assessmentType: 'quick',
        })

      const assessmentId = createResponse.body.assessmentId

      // Delete assessment
      const deleteResponse = await request(BASE_URL)
        .delete(`/api/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(deleteResponse.status).toBe(204)

      // Verify deletion
      const getResponse = await request(BASE_URL)
        .get(`/api/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(getResponse.status).toBe(404)
    })

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(BASE_URL)
        .delete('/api/assessments/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).delete(
        '/api/assessments/some-id'
      )

      expect(response.status).toBe(401)
    })
  })
})
