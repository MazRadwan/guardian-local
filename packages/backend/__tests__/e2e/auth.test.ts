/**
 * E2E Tests for Auth API Endpoints
 * Tests complete HTTP flow with real database
 */

import express, { Express } from 'express'
import request from 'supertest'
import { db } from '../../src/infrastructure/database/client'
import { users } from '../../src/infrastructure/database/schema'
import { sql } from 'drizzle-orm'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { JWTProvider } from '../../src/infrastructure/auth/JWTProvider'
import { AuthService } from '../../src/application/services/AuthService'
import { AuthController } from '../../src/infrastructure/http/controllers/AuthController'
import { createAuthRoutes } from '../../src/infrastructure/http/routes/auth.routes'
import { errorHandler } from '../../src/infrastructure/http/middleware/error.middleware'

describe('Auth API E2E Tests', () => {
  let app: Express
  let authService: AuthService

  beforeAll(() => {
    // Setup Express app
    app = express()
    app.use(express.json())

    // Setup dependencies
    const userRepository = new DrizzleUserRepository()
    const tokenProvider = new JWTProvider('test-secret', '4h')
    authService = new AuthService(userRepository, tokenProvider)

    // Setup routes
    const authController = new AuthController(authService)
    app.use('/api/auth', createAuthRoutes(authController))

    // Error handler
    app.use(errorHandler)
  })

  beforeEach(async () => {
    // Clean database before each test
    await db.execute(sql`TRUNCATE TABLE users CASCADE`)
  })

  afterAll(async () => {
    // Clean up after all tests
    await db.execute(sql`TRUNCATE TABLE users CASCADE`)
  })

  describe('POST /api/auth/register', () => {
    it('should register new user and return 201', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'analyst',
      })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
        role: 'analyst',
      })
      expect(response.body.data.user.id).toBeDefined()
      expect(response.body.data.token).toBeDefined()
    })

    it('should default role to analyst', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      })

      expect(response.status).toBe(201)
      expect(response.body.data.user.role).toBe('analyst')
    })

    it('should return 400 for duplicate email', async () => {
      // Create first user
      await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      })

      // Try to create duplicate
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password456',
        name: 'Another User',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('already exists')
    })

    it('should return 400 for invalid email format', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })

    it('should return 400 for missing required fields', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        // missing password and name
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })

    it('should return 400 for weak password (too short)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'pass12',
        name: 'Test User',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('8 characters') })
      )
    })

    it('should return 400 for password without letters', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: '12345678',
        name: 'Test User',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('letter') })
      )
    })

    it('should return 400 for password without numbers', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password',
        name: 'Test User',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('number') })
      )
    })

    it('should return 400 for invalid role', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'invalid',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create test user
      await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      })
    })

    it('should login with valid credentials and return 200', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
      })
      expect(response.body.data.token).toBeDefined()
    })

    it('should be case-insensitive for email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      })

      expect(response.status).toBe(200)
      expect(response.body.data.user.email).toBe('test@example.com')
    })

    it('should return 401 for invalid email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'password123',
      })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid email or password')
    })

    it('should return 401 for invalid password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'wrongpassword',
      })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid email or password')
    })

    it('should return 400 for missing email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        password: 'password123',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })

    it('should return 400 for missing password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
      })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })
  })

  describe('Protected endpoint with auth middleware', () => {
    let validToken: string

    beforeEach(async () => {
      // Register and get token
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      })

      validToken = response.body.data.token
    })

    // Note: We'll test this more thoroughly when we have actual protected routes
    // For now, we verify the token is generated correctly
    it('should generate valid JWT token', () => {
      expect(validToken).toBeDefined()
      expect(typeof validToken).toBe('string')
      expect(validToken.split('.')).toHaveLength(3) // JWT has 3 parts
    })
  })
})
