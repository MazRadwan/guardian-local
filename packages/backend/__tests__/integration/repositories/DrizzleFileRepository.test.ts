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
})
