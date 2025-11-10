/**
 * E2E tests for Export API endpoints
 */

import request from 'supertest'
import { db } from '../../src/infrastructure/database/client'
import { vendors } from '../../src/infrastructure/database/schema/vendors'
import { assessments } from '../../src/infrastructure/database/schema/assessments'
import { questions } from '../../src/infrastructure/database/schema/questions'
import { users } from '../../src/infrastructure/database/schema/users'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { AuthService } from '../../src/application/services/AuthService'
import { JWTProvider } from '../../src/infrastructure/auth/JWTProvider'

const BASE_URL = 'http://localhost:8000'

describe('Export API E2E Tests', () => {
  let authToken: string
  let testUserId: string
  let testAssessmentId: string
  let testVendorId: string

  beforeAll(async () => {
    // Create test user and get auth token
    const userRepo = new DrizzleUserRepository(db)
    const tokenProvider = new JWTProvider()
    const authService = new AuthService(userRepo, tokenProvider)

    const testUser = await authService.register({
      email: 'export-test@example.com',
      password: 'Test123!@#',
      name: 'Export Test User',
      role: 'analyst',
    })

    testUserId = testUser.id
    authToken = testUser.token

    // Create test vendor
    const vendorResponse = await request(BASE_URL)
      .post('/api/vendors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Export Test Vendor',
        industry: 'Healthcare',
      })

    testVendorId = vendorResponse.body.id

    // Create test assessment
    const assessmentResponse = await request(BASE_URL)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        vendorName: 'Export Test Vendor',
        assessmentType: 'quick',
      })

    testAssessmentId = assessmentResponse.body.id

    // Generate questions for the assessment
    await request(BASE_URL)
      .post(`/api/assessments/${testAssessmentId}/questions/generate`)
      .set('Authorization', `Bearer ${authToken}`)
  })

  afterAll(async () => {
    // Clean up test data
    await db.delete(questions)
    await db.delete(assessments)
    await db.delete(vendors)
    await db.delete(users)
  })

  describe('GET /api/assessments/:id/export/pdf', () => {
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get(
        `/api/assessments/${testAssessmentId}/export/pdf`
      )

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('authorization')
    })

    it('should return 401 for invalid token', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/pdf`)
        .set('Authorization', 'Bearer invalid-token-here')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })

    it('should return 401 for malformed authorization header', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/pdf`)
        .set('Authorization', 'NotBearer token')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid authorization header format')
    })

    it('should export PDF with valid authentication', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/pdf`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('application/pdf')
      expect(response.headers['content-disposition']).toContain('attachment')
      expect(response.headers['content-disposition']).toContain('.pdf')
    })

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(BASE_URL)
        .get('/api/assessments/non-existent-id/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })
  })

  describe('GET /api/assessments/:id/export/word', () => {
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get(
        `/api/assessments/${testAssessmentId}/export/word`
      )

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('authorization')
    })

    it('should export Word document with valid authentication', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/word`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      expect(response.headers['content-disposition']).toContain('attachment')
      expect(response.headers['content-disposition']).toContain('.docx')
    })

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(BASE_URL)
        .get('/api/assessments/non-existent-id/export/word')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })
  })

  describe('GET /api/assessments/:id/export/excel', () => {
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get(
        `/api/assessments/${testAssessmentId}/export/excel`
      )

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('authorization')
    })

    it('should export Excel spreadsheet with valid authentication', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/excel`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      expect(response.headers['content-disposition']).toContain('attachment')
      expect(response.headers['content-disposition']).toContain('.xlsx')
    })

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(BASE_URL)
        .get('/api/assessments/non-existent-id/export/excel')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })
  })

  describe('Export file naming', () => {
    it('should include vendor name in PDF filename', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/pdf`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      const disposition = response.headers['content-disposition']
      expect(disposition).toContain('Export_Test_Vendor')
    })

    it('should include vendor name in Word filename', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/word`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      const disposition = response.headers['content-disposition']
      expect(disposition).toContain('Export_Test_Vendor')
    })

    it('should include vendor name in Excel filename', async () => {
      const response = await request(BASE_URL)
        .get(`/api/assessments/${testAssessmentId}/export/excel`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      const disposition = response.headers['content-disposition']
      expect(disposition).toContain('Export_Test_Vendor')
    })
  })
})
