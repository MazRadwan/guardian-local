/**
 * Integration tests for Epic 18 file excerpt storage
 *
 * Tests the new repository methods:
 * - updateTextExcerpt()
 * - updateParseStatus()
 * - tryStartParsing()
 * - create() with optional textExcerpt
 */

import { DrizzleFileRepository } from '../../src/infrastructure/database/repositories/DrizzleFileRepository'
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { testDb, closeTestDb } from '../setup/test-db'
import { Conversation } from '../../src/domain/entities/Conversation'
import { User } from '../../src/domain/entities/User'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('Epic 18: File Excerpt Storage Integration', () => {
  let fileRepository: DrizzleFileRepository
  let conversationRepository: DrizzleConversationRepository
  let userRepository: DrizzleUserRepository
  let testUserId: string
  let testConversationId: string

  beforeAll(async () => {
    // Initialize repositories with test database
    fileRepository = new DrizzleFileRepository(testDb)
    conversationRepository = new DrizzleConversationRepository(testDb)
    userRepository = new DrizzleUserRepository(testDb)
  })

  beforeEach(async () => {
    // Clean and setup test data
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)

    // Create test user
    const passwordHash = await bcrypt.hash('testpass', 10)
    const user = User.create({
      email: 'excerpt-test@example.com',
      name: 'Excerpt Test User',
      passwordHash,
      role: 'analyst',
    })
    const createdUser = await userRepository.create(user)
    testUserId = createdUser.id

    // Create test conversation
    const conversation = Conversation.create({
      userId: testUserId,
      mode: 'consult',
    })
    const createdConversation = await conversationRepository.create(conversation)
    testConversationId = createdConversation.id
  })

  afterAll(async () => {
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
    await closeTestDb()
  })

  describe('create() with textExcerpt', () => {
    it('should create file with textExcerpt', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-with-excerpt.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test-with-excerpt.pdf',
        textExcerpt: 'This is extracted text from the PDF document.',
      })

      expect(file.id).toBeDefined()
      expect(file.textExcerpt).toBe('This is extracted text from the PDF document.')
      expect(file.parseStatus).toBe('pending') // Default status
    })

    it('should create file without textExcerpt (null)', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-no-excerpt.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test-no-excerpt.pdf',
        // textExcerpt not provided
      })

      expect(file.id).toBeDefined()
      expect(file.textExcerpt).toBeNull()
      expect(file.parseStatus).toBe('pending')
    })

    it('should handle large text excerpts (10k chars)', async () => {
      const largeExcerpt = 'A'.repeat(10000)

      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'large-excerpt.pdf',
        mimeType: 'application/pdf',
        size: 50000,
        storagePath: '/uploads/large-excerpt.pdf',
        textExcerpt: largeExcerpt,
      })

      expect(file.textExcerpt).toBe(largeExcerpt)
      expect(file.textExcerpt?.length).toBe(10000)
    })
  })

  describe('updateTextExcerpt()', () => {
    it('should update text excerpt for existing file', async () => {
      // Create file without excerpt
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'update-excerpt.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/update-excerpt.pdf',
      })

      // Update excerpt
      await fileRepository.updateTextExcerpt(file.id, 'Updated excerpt content')

      // Verify update
      const updated = await fileRepository.findById(file.id)
      expect(updated?.textExcerpt).toBe('Updated excerpt content')
    })

    it('should replace existing excerpt', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'replace-excerpt.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/replace-excerpt.pdf',
        textExcerpt: 'Original excerpt',
      })

      await fileRepository.updateTextExcerpt(file.id, 'Replaced excerpt')

      const updated = await fileRepository.findById(file.id)
      expect(updated?.textExcerpt).toBe('Replaced excerpt')
    })
  })

  describe('updateParseStatus()', () => {
    it('should update parse status from pending to completed', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'status-test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/status-test.pdf',
      })

      expect(file.parseStatus).toBe('pending')

      await fileRepository.updateParseStatus(file.id, 'completed')

      const updated = await fileRepository.findById(file.id)
      expect(updated?.parseStatus).toBe('completed')
    })

    it('should update parse status to failed', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'failed-test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/failed-test.pdf',
      })

      await fileRepository.updateParseStatus(file.id, 'failed')

      const updated = await fileRepository.findById(file.id)
      expect(updated?.parseStatus).toBe('failed')
    })
  })

  describe('tryStartParsing()', () => {
    it('should return true and update status when pending', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'try-start-pending.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/try-start-pending.pdf',
      })

      expect(file.parseStatus).toBe('pending')

      const result = await fileRepository.tryStartParsing(file.id)

      expect(result).toBe(true)

      const updated = await fileRepository.findById(file.id)
      expect(updated?.parseStatus).toBe('in_progress')
    })

    it('should return false when already in_progress (idempotency)', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'try-start-progress.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/try-start-progress.pdf',
      })

      // First call: should succeed
      const firstResult = await fileRepository.tryStartParsing(file.id)
      expect(firstResult).toBe(true)

      // Second call: should fail (already in_progress)
      const secondResult = await fileRepository.tryStartParsing(file.id)
      expect(secondResult).toBe(false)

      // Status should still be in_progress
      const updated = await fileRepository.findById(file.id)
      expect(updated?.parseStatus).toBe('in_progress')
    })

    it('should return false when status is completed', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'try-start-completed.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/try-start-completed.pdf',
      })

      await fileRepository.updateParseStatus(file.id, 'completed')

      const result = await fileRepository.tryStartParsing(file.id)
      expect(result).toBe(false)

      // Status should remain completed
      const updated = await fileRepository.findById(file.id)
      expect(updated?.parseStatus).toBe('completed')
    })

    it('should return false when status is failed', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'try-start-failed.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/try-start-failed.pdf',
      })

      await fileRepository.updateParseStatus(file.id, 'failed')

      const result = await fileRepository.tryStartParsing(file.id)
      expect(result).toBe(false)

      // Status should remain failed
      const updated = await fileRepository.findById(file.id)
      expect(updated?.parseStatus).toBe('failed')
    })

    it('should handle concurrent tryStartParsing calls (race condition)', async () => {
      // Create 10 files
      const files = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          fileRepository.create({
            userId: testUserId,
            conversationId: testConversationId,
            filename: `concurrent-${i}.pdf`,
            mimeType: 'application/pdf',
            size: 1024,
            storagePath: `/uploads/concurrent-${i}.pdf`,
          })
        )
      )

      // Try to start parsing on all files concurrently
      // Each file should only succeed once
      for (const file of files) {
        const results = await Promise.all([
          fileRepository.tryStartParsing(file.id),
          fileRepository.tryStartParsing(file.id),
          fileRepository.tryStartParsing(file.id),
        ])

        // Only one should succeed per file
        const successCount = results.filter((r) => r === true).length
        expect(successCount).toBe(1)
      }
    })
  })

  describe('findById with new fields', () => {
    it('should return textExcerpt and parseStatus', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'find-test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/find-test.pdf',
        textExcerpt: 'Test excerpt for find',
      })

      const found = await fileRepository.findById(file.id)

      expect(found).not.toBeNull()
      expect(found?.textExcerpt).toBe('Test excerpt for find')
      expect(found?.parseStatus).toBe('pending')
    })
  })
})
