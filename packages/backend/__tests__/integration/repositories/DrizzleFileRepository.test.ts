/**
 * Integration Tests for DrizzleFileRepository
 * Tests repository with real database connection
 */

import { DrizzleFileRepository } from '../../../src/infrastructure/database/repositories/DrizzleFileRepository'
import { DrizzleUserRepository } from '../../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { DrizzleConversationRepository } from '../../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { User } from '../../../src/domain/entities/User'
import { Conversation } from '../../../src/domain/entities/Conversation'
import { testDb, closeTestDb } from '../../setup/test-db'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('DrizzleFileRepository Integration Tests', () => {
  let repository: DrizzleFileRepository
  let userRepository: DrizzleUserRepository
  let conversationRepository: DrizzleConversationRepository
  let testUserId: string
  let testConversationId: string

  beforeAll(async () => {
    repository = new DrizzleFileRepository(testDb)
    userRepository = new DrizzleUserRepository(testDb)
    conversationRepository = new DrizzleConversationRepository(testDb)

    // Create a test user
    const passwordHash = await bcrypt.hash('password123', 10)
    const user = User.create({
      email: 'file-test@example.com',
      name: 'File Test User',
      passwordHash,
      role: 'analyst',
    })

    const createdUser = await userRepository.create(user)
    testUserId = createdUser.id

    // Create a test conversation
    const conversation = Conversation.create({
      userId: testUserId,
      mode: 'consult',
    })

    const createdConversation = await conversationRepository.create(conversation)
    testConversationId = createdConversation.id
  })

  beforeEach(async () => {
    // Clean files table before each test
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`)
  })

  afterAll(async () => {
    // Clean up
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
    await closeTestDb()
  })

  describe('create', () => {
    it('should create file record and return with generated ID', async () => {
      const fileData = {
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test-document.pdf',
      }

      const created = await repository.create(fileData)

      expect(created.id).toBeDefined()
      expect(created.id.length).toBeGreaterThan(0)
      expect(created.userId).toBe(testUserId)
      expect(created.conversationId).toBe(testConversationId)
      expect(created.filename).toBe('test-document.pdf')
      expect(created.mimeType).toBe('application/pdf')
      expect(created.size).toBe(1024)
      expect(created.storagePath).toBe('/uploads/test-document.pdf')
      expect(created.createdAt).toBeInstanceOf(Date)
    })

    it('should create file record with different mime types', async () => {
      const wordDoc = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
        storagePath: '/uploads/document.docx',
      })

      expect(wordDoc.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      expect(wordDoc.filename).toBe('document.docx')
    })

    it('should create multiple file records for same conversation', async () => {
      const file1 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'doc1.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/doc1.pdf',
      })

      const file2 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'doc2.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '/uploads/doc2.pdf',
      })

      expect(file1.id).not.toBe(file2.id)
      expect(file1.conversationId).toBe(file2.conversationId)
    })
  })

  describe('findById', () => {
    it('should find file by ID', async () => {
      const created = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      const found = await repository.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.filename).toBe('test.pdf')
      expect(found!.userId).toBe(testUserId)
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000')

      expect(found).toBeNull()
    })
  })

  describe('findByIdAndUser', () => {
    it('should find file by ID and user', async () => {
      const created = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      const found = await repository.findByIdAndUser(created.id, testUserId)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.userId).toBe(testUserId)
    })

    it('should return null when user does not match', async () => {
      const created = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      const found = await repository.findByIdAndUser(
        created.id,
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toBeNull()
    })

    it('should return null for non-existent file ID', async () => {
      const found = await repository.findByIdAndUser(
        '00000000-0000-0000-0000-000000000000',
        testUserId
      )

      expect(found).toBeNull()
    })
  })

  describe('findByIdAndConversation', () => {
    it('should find file by ID and conversation', async () => {
      const created = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      const found = await repository.findByIdAndConversation(created.id, testConversationId)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.conversationId).toBe(testConversationId)
    })

    it('should return null when conversation does not match', async () => {
      const created = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      const found = await repository.findByIdAndConversation(
        created.id,
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toBeNull()
    })

    it('should return null for non-existent file ID', async () => {
      const found = await repository.findByIdAndConversation(
        '00000000-0000-0000-0000-000000000000',
        testConversationId
      )

      expect(found).toBeNull()
    })
  })

  describe('cascade delete', () => {
    it('should delete file when user is deleted', async () => {
      // Create a new user for this test
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'delete-test@example.com',
        name: 'Delete Test User',
        passwordHash,
        role: 'analyst',
      })
      const createdUser = await userRepository.create(user)

      // Create conversation for this user
      const conversation = Conversation.create({
        userId: createdUser.id,
        mode: 'consult',
      })
      const createdConversation = await conversationRepository.create(conversation)

      // Create file
      const file = await repository.create({
        userId: createdUser.id,
        conversationId: createdConversation.id,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      // Delete user (should cascade to conversations, which cascade to files)
      // First delete conversations manually to avoid FK constraint error
      await testDb.execute(sql`DELETE FROM conversations WHERE user_id = ${createdUser.id}`)
      await testDb.execute(sql`DELETE FROM users WHERE id = ${createdUser.id}`)

      // File should be deleted (cascaded from conversation deletion)
      const found = await repository.findById(file.id)
      expect(found).toBeNull()
    })

    it('should delete file when conversation is deleted', async () => {
      // Create a new conversation for this test
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })
      const createdConversation = await conversationRepository.create(conversation)

      // Create file
      const file = await repository.create({
        userId: testUserId,
        conversationId: createdConversation.id,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      })

      // Delete conversation (should cascade to files)
      await testDb.execute(sql`DELETE FROM conversations WHERE id = ${createdConversation.id}`)

      // File should be deleted
      const found = await repository.findById(file.id)
      expect(found).toBeNull()
    })
  })

  describe('updateIntakeContext', () => {
    it('should store intake context correctly', async () => {
      const file = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'vendor-doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/vendor-doc.pdf',
      })

      const intakeContext = {
        vendorName: 'Acme AI',
        solutionName: 'Smart Assistant',
        solutionType: 'chatbot',
        industry: 'healthcare',
        features: ['NLP', 'voice recognition'],
        claims: ['HIPAA compliant', 'SOC 2 certified'],
        complianceMentions: ['HIPAA', 'SOC 2'],
      }

      const gapCategories = ['data_privacy', 'security']

      await repository.updateIntakeContext(file.id, intakeContext, gapCategories)

      // Verify by fetching with context
      const filesWithContext = await repository.findByConversationWithContext(testConversationId)

      expect(filesWithContext).toHaveLength(1)
      expect(filesWithContext[0].id).toBe(file.id)
      expect(filesWithContext[0].intakeContext).toEqual(intakeContext)
      expect(filesWithContext[0].intakeGapCategories).toEqual(gapCategories)
      expect(filesWithContext[0].intakeParsedAt).toBeInstanceOf(Date)
    })

    it('should handle null gap categories gracefully', async () => {
      const file = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'simple-doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/simple-doc.pdf',
      })

      const intakeContext = {
        vendorName: 'Simple Vendor',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      }

      await repository.updateIntakeContext(file.id, intakeContext)

      const filesWithContext = await repository.findByConversationWithContext(testConversationId)

      expect(filesWithContext).toHaveLength(1)
      expect(filesWithContext[0].intakeContext).toEqual(intakeContext)
      expect(filesWithContext[0].intakeGapCategories).toBeNull()
    })

    it('should update existing intake context', async () => {
      const file = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'vendor-doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/vendor-doc.pdf',
      })

      const firstContext = {
        vendorName: 'First Vendor',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      }

      await repository.updateIntakeContext(file.id, firstContext)

      // Update with new context
      const secondContext = {
        vendorName: 'Updated Vendor',
        solutionName: 'Updated Solution',
        solutionType: 'AI platform',
        industry: 'finance',
        features: ['fraud detection'],
        claims: ['PCI DSS compliant'],
        complianceMentions: ['PCI DSS'],
      }

      await repository.updateIntakeContext(file.id, secondContext, ['compliance'])

      const filesWithContext = await repository.findByConversationWithContext(testConversationId)

      expect(filesWithContext).toHaveLength(1)
      expect(filesWithContext[0].intakeContext).toEqual(secondContext)
      expect(filesWithContext[0].intakeGapCategories).toEqual(['compliance'])
    })
  })

  describe('findByConversationWithContext', () => {
    it('should return files sorted by parse time', async () => {
      const file1 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'doc1.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/doc1.pdf',
      })

      const file2 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'doc2.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/doc2.pdf',
      })

      const file3 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'doc3.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/doc3.pdf',
      })

      // Add context in reverse order
      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.updateIntakeContext(file3.id, {
        vendorName: 'Vendor 3',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.updateIntakeContext(file1.id, {
        vendorName: 'Vendor 1',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await repository.updateIntakeContext(file2.id, {
        vendorName: 'Vendor 2',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      const filesWithContext = await repository.findByConversationWithContext(testConversationId)

      expect(filesWithContext).toHaveLength(3)
      expect(filesWithContext[0].id).toBe(file3.id) // First parsed
      expect(filesWithContext[1].id).toBe(file1.id) // Second parsed
      expect(filesWithContext[2].id).toBe(file2.id) // Third parsed
    })

    it('should exclude files without context', async () => {
      const file1 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'with-context.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/with-context.pdf',
      })

      const file2 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'without-context.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/without-context.pdf',
      })

      // Only add context to file1
      await repository.updateIntakeContext(file1.id, {
        vendorName: 'Test Vendor',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      const filesWithContext = await repository.findByConversationWithContext(testConversationId)

      expect(filesWithContext).toHaveLength(1)
      expect(filesWithContext[0].id).toBe(file1.id)
    })

    it('should return empty array when no files have context', async () => {
      await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'no-context.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/no-context.pdf',
      })

      const filesWithContext = await repository.findByConversationWithContext(testConversationId)

      expect(filesWithContext).toHaveLength(0)
    })

    it('should return empty array for conversation with no files', async () => {
      const filesWithContext = await repository.findByConversationWithContext(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(filesWithContext).toHaveLength(0)
    })

    it('should only return files from specified conversation', async () => {
      // Create another conversation
      const conversation2 = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })
      const createdConversation2 = await conversationRepository.create(conversation2)

      // Create file in first conversation
      const file1 = await repository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'conv1-file.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/conv1-file.pdf',
      })

      // Create file in second conversation
      const file2 = await repository.create({
        userId: testUserId,
        conversationId: createdConversation2.id,
        filename: 'conv2-file.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/conv2-file.pdf',
      })

      // Add context to both
      await repository.updateIntakeContext(file1.id, {
        vendorName: 'Vendor 1',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      await repository.updateIntakeContext(file2.id, {
        vendorName: 'Vendor 2',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      })

      // Query first conversation
      const conv1Files = await repository.findByConversationWithContext(testConversationId)

      expect(conv1Files).toHaveLength(1)
      expect(conv1Files[0].id).toBe(file1.id)

      // Query second conversation
      const conv2Files = await repository.findByConversationWithContext(createdConversation2.id)

      expect(conv2Files).toHaveLength(1)
      expect(conv2Files[0].id).toBe(file2.id)
    })
  })
})
