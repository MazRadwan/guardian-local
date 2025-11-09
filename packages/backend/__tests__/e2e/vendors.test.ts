/**
 * E2E tests for Vendor API endpoints
 */

import request from 'supertest'
import { db } from '../../src/infrastructure/database/client'
import { vendors } from '../../src/infrastructure/database/schema/vendors'
import { users } from '../../src/infrastructure/database/schema/users'
import { User } from '../../src/domain/entities/User'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { AuthService } from '../../src/application/services/AuthService'
import { JWTProvider } from '../../src/infrastructure/auth/JWTProvider'

// Mock server setup
const BASE_URL = 'http://localhost:8000'

describe('Vendor API E2E Tests', () => {
  let authToken: string
  let testUserId: string

  beforeAll(async () => {
    // Create test user and get auth token
    const userRepo = new DrizzleUserRepository(db)
    const tokenProvider = new JWTProvider()
    const authService = new AuthService(userRepo, tokenProvider)

    const testUser = await authService.register({
      email: 'vendor-test@example.com',
      password: 'Test123!@#',
      name: 'Vendor Test User',
      role: 'analyst',
    })

    testUserId = testUser.id
    authToken = testUser.token
  })

  afterEach(async () => {
    // Clean up vendors after each test
    await db.delete(vendors)
  })

  afterAll(async () => {
    // Clean up test user
    await db.delete(users)
  })

  describe('POST /api/vendors', () => {
    it('should create a new vendor', async () => {
      const response = await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'TechFlow Solutions',
          industry: 'Healthcare IT',
          website: 'https://techflow.com',
          contactInfo: {
            primaryContact: 'John Doe',
            email: 'john@techflow.com',
            phone: '555-0123',
          },
        })

      expect(response.status).toBe(201)
      expect(response.body.name).toBe('TechFlow Solutions')
      expect(response.body.industry).toBe('Healthcare IT')
      expect(response.body.id).toBeDefined()
    })

    it('should return 400 for missing vendor name', async () => {
      const response = await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          industry: 'Tech',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Vendor name is required')
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).post('/api/vendors').send({
        name: 'Test Vendor',
      })

      expect(response.status).toBe(401)
    })

    it('should return 409 for duplicate vendor name', async () => {
      // Create first vendor
      await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'UniqueVendor' })

      // Try to create duplicate
      const response = await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'UniqueVendor' })

      expect(response.status).toBe(409)
      expect(response.body.error).toContain('already exists')
    })
  })

  describe('GET /api/vendors/:id', () => {
    it('should get vendor by ID', async () => {
      // Create vendor first
      const createResponse = await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'GetByIdVendor',
          industry: 'Finance',
        })

      const vendorId = createResponse.body.id

      // Get vendor
      const response = await request(BASE_URL)
        .get(`/api/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(vendorId)
      expect(response.body.name).toBe('GetByIdVendor')
      expect(response.body.industry).toBe('Finance')
    })

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(BASE_URL)
        .get('/api/vendors/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get('/api/vendors/some-id')

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api/vendors', () => {
    it('should list all vendors', async () => {
      // Create multiple vendors
      await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Vendor A' })

      await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Vendor B' })

      await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Vendor C' })

      // List vendors
      const response = await request(BASE_URL)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.vendors).toHaveLength(3)
      expect(response.body.count).toBe(3)
    })

    it('should respect pagination parameters', async () => {
      // Create vendors
      for (let i = 1; i <= 5; i++) {
        await request(BASE_URL)
          .post('/api/vendors')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: `Vendor ${i}` })
      }

      // Get page 1 (limit 2)
      const response = await request(BASE_URL)
        .get('/api/vendors?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.vendors).toHaveLength(2)
      expect(response.body.limit).toBe(2)
      expect(response.body.offset).toBe(0)
    })

    it('should return empty array when no vendors', async () => {
      const response = await request(BASE_URL)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.vendors).toHaveLength(0)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get('/api/vendors')

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api/vendors/:id/assessments', () => {
    it('should return vendor assessment history', async () => {
      // Create vendor
      const vendorResponse = await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'HistoryVendor' })

      const vendorId = vendorResponse.body.id

      // Create assessments for this vendor
      await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'HistoryVendor',
          assessmentType: 'quick',
        })

      await request(BASE_URL)
        .post('/api/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorName: 'HistoryVendor',
          assessmentType: 'comprehensive',
        })

      // Get vendor history
      const response = await request(BASE_URL)
        .get(`/api/vendors/${vendorId}/assessments`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.vendorId).toBe(vendorId)
      expect(response.body.vendorName).toBe('HistoryVendor')
      expect(response.body.assessments).toHaveLength(2)
      expect(response.body.count).toBe(2)
    })

    it('should return empty array for vendor with no assessments', async () => {
      // Create vendor
      const vendorResponse = await request(BASE_URL)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'NoAssessmentsVendor' })

      const vendorId = vendorResponse.body.id

      // Get history
      const response = await request(BASE_URL)
        .get(`/api/vendors/${vendorId}/assessments`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.assessments).toHaveLength(0)
      expect(response.body.count).toBe(0)
    })

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(BASE_URL)
        .get('/api/vendors/non-existent-id/assessments')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(BASE_URL).get(
        '/api/vendors/some-id/assessments'
      )

      expect(response.status).toBe(401)
    })
  })
})
