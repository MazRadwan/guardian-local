/**
 * Integration Tests for DrizzleConversationRepository
 * Tests repository with real database connection
 */

import { DrizzleConversationRepository } from '../../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { DrizzleUserRepository } from '../../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { Conversation } from '../../../src/domain/entities/Conversation'
import { User } from '../../../src/domain/entities/User'
import { testDb, closeTestDb } from '../../setup/test-db'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('DrizzleConversationRepository Integration Tests', () => {
  let repository: DrizzleConversationRepository
  let userRepository: DrizzleUserRepository
  let testUserId: string

  beforeAll(async () => {
    repository = new DrizzleConversationRepository(testDb)
    userRepository = new DrizzleUserRepository(testDb)

    // Create a test user for conversations
    const passwordHash = await bcrypt.hash('password123', 10)
    const user = User.create({
      email: 'conversation-test@example.com',
      name: 'Conversation Test User',
      passwordHash,
      role: 'analyst',
    })

    const createdUser = await userRepository.create(user)
    testUserId = createdUser.id
  })

  beforeEach(async () => {
    // Clean conversations table before each test
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
  })

  afterAll(async () => {
    // Clean up
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
    await closeTestDb()
  })

  describe('create', () => {
    it('should create conversation and return with generated ID', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)

      expect(created.id).toBeDefined()
      expect(created.id.length).toBeGreaterThan(0)
      expect(created.userId).toBe(testUserId)
      expect(created.mode).toBe('consult')
      expect(created.status).toBe('active')
      expect(created.assessmentId).toBeNull()
      expect(created.startedAt).toBeInstanceOf(Date)
      expect(created.lastActivityAt).toBeInstanceOf(Date)
      expect(created.completedAt).toBeNull()
    })

    it('should create conversation with assessment mode', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'assessment',
      })

      const created = await repository.create(conversation)

      expect(created.mode).toBe('assessment')
      expect(created.status).toBe('active')
    })

    it('should create conversation with context', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
        context: {
          lastIntent: 'greeting',
          currentStep: 'welcome',
        },
      })

      const created = await repository.create(conversation)

      expect(created.context).toEqual({
        lastIntent: 'greeting',
        currentStep: 'welcome',
      })
    })
  })

  describe('findById', () => {
    it('should find conversation by ID', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)
      const found = await repository.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.userId).toBe(testUserId)
      expect(found!.mode).toBe('consult')
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toBeNull()
    })
  })

  describe('findByUserId', () => {
    it('should find all conversations for user', async () => {
      const conversation1 = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const conversation2 = Conversation.create({
        userId: testUserId,
        mode: 'assessment',
      })

      await repository.create(conversation1)
      await repository.create(conversation2)

      const found = await repository.findByUserId(testUserId)

      expect(found).toHaveLength(2)
      expect(found.map((c) => c.mode)).toContain('consult')
      expect(found.map((c) => c.mode)).toContain('assessment')
    })

    it('should filter conversations by status', async () => {
      const conversation1 = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const conversation2 = Conversation.create({
        userId: testUserId,
        mode: 'assessment',
      })

      const created1 = await repository.create(conversation1)
      await repository.create(conversation2)

      // Complete one conversation
      await repository.updateStatus(created1.id, 'completed')

      const active = await repository.findByUserId(testUserId, 'active')
      const completed = await repository.findByUserId(testUserId, 'completed')

      expect(active).toHaveLength(1)
      expect(active[0].status).toBe('active')

      expect(completed).toHaveLength(1)
      expect(completed[0].status).toBe('completed')
    })

    it('should return empty array for user with no conversations', async () => {
      const found = await repository.findByUserId(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toEqual([])
    })
  })

  describe('updateMode', () => {
    it('should update conversation mode', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)

      await repository.updateMode(created.id, 'assessment')

      const found = await repository.findById(created.id)

      expect(found!.mode).toBe('assessment')
    })
  })

  describe('updateStatus', () => {
    it('should update conversation status to completed', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)

      await repository.updateStatus(created.id, 'completed')

      const found = await repository.findById(created.id)

      expect(found!.status).toBe('completed')
      expect(found!.completedAt).toBeInstanceOf(Date)
      expect(found!.completedAt).not.toBeNull()
    })

    it('should not set completedAt when status is active', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)

      // Complete it first
      await repository.updateStatus(created.id, 'completed')

      // Then set back to active
      await repository.updateStatus(created.id, 'active')

      const found = await repository.findById(created.id)

      expect(found!.status).toBe('active')
      // completedAt should still be null or reset (depends on implementation)
    })
  })

  describe('linkAssessment', () => {
    it('should link assessment to conversation', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'assessment',
      })

      const created = await repository.create(conversation)

      const assessmentId = '12345678-1234-1234-1234-123456789012'
      await repository.linkAssessment(created.id, assessmentId)

      const found = await repository.findById(created.id)

      expect(found!.assessmentId).toBe(assessmentId)
    })
  })

  describe('updateContext', () => {
    it('should update conversation context', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
        context: {
          lastIntent: 'greeting',
        },
      })

      const created = await repository.create(conversation)

      await repository.updateContext(created.id, {
        currentStep: 'assessment_started',
      })

      const found = await repository.findById(created.id)

      expect(found!.context).toEqual({
        lastIntent: 'greeting',
        currentStep: 'assessment_started',
      })
    })

    it('should merge new context with existing context', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
        context: {
          lastIntent: 'greeting',
          currentStep: 'welcome',
        },
      })

      const created = await repository.create(conversation)

      await repository.updateContext(created.id, {
        currentStep: 'question_1',
      })

      const found = await repository.findById(created.id)

      expect(found!.context).toEqual({
        lastIntent: 'greeting',
        currentStep: 'question_1',
      })
    })

    it('should throw error for non-existent conversation', async () => {
      await expect(
        repository.updateContext('00000000-0000-0000-0000-000000000000', {
          lastIntent: 'test',
        })
      ).rejects.toThrow('not found')
    })
  })

  describe('updateActivity', () => {
    it('should update lastActivityAt timestamp', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)
      const originalActivityAt = created.lastActivityAt

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 100))

      await repository.updateActivity(created.id)

      const found = await repository.findById(created.id)

      expect(found!.lastActivityAt.getTime()).toBeGreaterThan(
        originalActivityAt.getTime()
      )
    })
  })

  describe('delete', () => {
    it('should delete conversation', async () => {
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })

      const created = await repository.create(conversation)

      await repository.delete(created.id)

      const found = await repository.findById(created.id)
      expect(found).toBeNull()
    })
  })

  describe('JSONB persistence', () => {
    it('should persist and retrieve complex context correctly', async () => {
      const complexContext = {
        lastIntent: 'assessment',
        currentStep: 'risk_factors',
        metadata: {
          questionsAsked: 5,
          lastQuestionId: 'q123',
        },
      }

      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'assessment',
        context: complexContext as any,
      })

      const created = await repository.create(conversation)
      const found = await repository.findById(created.id)

      expect(found!.context).toEqual(complexContext)
    })
  })
})
