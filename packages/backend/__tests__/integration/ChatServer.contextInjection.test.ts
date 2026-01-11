/**
 * Integration tests for ChatServer context injection fallback
 *
 * Epic 18 Story 18.2.2: Tests the fallback hierarchy for context injection
 * 1. intakeContext (structured, from Claude enrichment) - best
 * 2. textExcerpt (raw text, from upload extraction) - good
 * 3. Re-read from S3 (slow fallback for missing excerpt)
 */

import { testDb, closeTestDb } from '../setup/test-db'
import { DrizzleFileRepository } from '../../src/infrastructure/database/repositories/DrizzleFileRepository'
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { User } from '../../src/domain/entities/User'
import { Conversation } from '../../src/domain/entities/Conversation'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import type { FileWithExcerpt } from '../../src/application/interfaces/IFileRepository'
import type { IntakeDocumentContext } from '../../src/domain/entities/Conversation'

describe('ChatServer Context Injection (Integration)', () => {
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
    const passwordHash = await bcrypt.hash('password123', 10)
    const user = User.create({
      email: 'context-test@example.com',
      name: 'Context Test User',
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

  describe('findByConversationWithExcerpt', () => {
    it('should return all files in conversation including those without intakeContext', async () => {
      // Create file with intakeContext
      const file1 = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'file-with-context.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/file1.pdf',
        textExcerpt: 'Some text',
      })

      // Update with intake context
      const intakeContext: IntakeDocumentContext = {
        vendorName: 'TestVendor',
        solutionName: 'TestSolution',
        solutionType: 'SaaS',
        industry: 'Healthcare',
        features: ['Feature1', 'Feature2'],
        claims: ['Claim1'],
        complianceMentions: ['HIPAA'],
      }
      await fileRepository.updateIntakeContext(file1.id, intakeContext)

      // Create file with only textExcerpt (no intakeContext)
      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'file-excerpt-only.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '/storage/file2.pdf',
        textExcerpt: 'This is an excerpt from the document',
      })

      // Create file with neither (no excerpt, no context)
      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'file-no-context.pdf',
        mimeType: 'application/pdf',
        size: 512,
        storagePath: '/storage/file3.pdf',
      })

      // Query all files
      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)

      // Should return all 3 files
      expect(files).toHaveLength(3)

      // Verify file1 (with context)
      const fileWithContext = files.find(f => f.filename === 'file-with-context.pdf')
      expect(fileWithContext).toBeDefined()
      expect(fileWithContext!.intakeContext).not.toBeNull()
      expect(fileWithContext!.intakeContext!.vendorName).toBe('TestVendor')
      expect(fileWithContext!.textExcerpt).toBe('Some text')

      // Verify file2 (excerpt only)
      const fileWithExcerpt = files.find(f => f.filename === 'file-excerpt-only.pdf')
      expect(fileWithExcerpt).toBeDefined()
      expect(fileWithExcerpt!.intakeContext).toBeNull()
      expect(fileWithExcerpt!.textExcerpt).toBe('This is an excerpt from the document')

      // Verify file3 (neither)
      const fileNoContext = files.find(f => f.filename === 'file-no-context.pdf')
      expect(fileNoContext).toBeDefined()
      expect(fileNoContext!.intakeContext).toBeNull()
      expect(fileNoContext!.textExcerpt).toBeNull()
    })

    it('should return empty array for conversation with no files', async () => {
      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)
      expect(files).toEqual([])
    })

    it('should only return files for the specified conversation', async () => {
      // Create another conversation
      const otherConversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })
      const createdOtherConversation = await conversationRepository.create(otherConversation)

      // Create file in other conversation
      await fileRepository.create({
        userId: testUserId,
        conversationId: createdOtherConversation.id,
        filename: 'other-file.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/other.pdf',
      })

      // Create file in test conversation
      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-file.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/test.pdf',
      })

      // Query test conversation
      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)

      // Should only return the test file
      expect(files).toHaveLength(1)
      expect(files[0].filename).toBe('test-file.pdf')
    })

    it('should order files by createdAt ascending', async () => {
      // Create files with small delays to ensure different timestamps
      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'first.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/first.pdf',
      })

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10))

      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'second.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/second.pdf',
      })

      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)

      expect(files).toHaveLength(2)
      expect(files[0].filename).toBe('first.pdf')
      expect(files[1].filename).toBe('second.pdf')
    })
  })

  describe('context fallback hierarchy', () => {
    /**
     * Helper to simulate ChatServer.buildFileContext behavior
     * (extracted logic without actual ChatServer dependencies)
     */
    function determineContextSource(file: FileWithExcerpt): 'intakeContext' | 'textExcerpt' | 's3-fallback' {
      if (file.intakeContext) return 'intakeContext'
      if (file.textExcerpt) return 'textExcerpt'
      return 's3-fallback'
    }

    it('should prioritize intakeContext over textExcerpt', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'both.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/both.pdf',
        textExcerpt: 'Raw excerpt text',
      })

      await fileRepository.updateIntakeContext(file.id, {
        vendorName: 'StructuredVendor',
        solutionName: 'StructuredSolution',
        solutionType: 'SaaS',
        industry: 'Healthcare',
        features: [],
        claims: [],
        complianceMentions: [],
      })

      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)
      expect(files).toHaveLength(1)
      expect(determineContextSource(files[0])).toBe('intakeContext')
    })

    it('should use textExcerpt when intakeContext is null', async () => {
      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'excerpt-only.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/excerpt.pdf',
        textExcerpt: 'Raw excerpt text without enrichment',
      })

      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)
      expect(files).toHaveLength(1)
      expect(files[0].intakeContext).toBeNull()
      expect(files[0].textExcerpt).not.toBeNull()
      expect(determineContextSource(files[0])).toBe('textExcerpt')
    })

    it('should require S3 fallback when both are null', async () => {
      await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'empty.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/empty.pdf',
        // No textExcerpt
      })

      const files = await fileRepository.findByConversationWithExcerpt(testConversationId)
      expect(files).toHaveLength(1)
      expect(files[0].intakeContext).toBeNull()
      expect(files[0].textExcerpt).toBeNull()
      expect(determineContextSource(files[0])).toBe('s3-fallback')
    })
  })

  describe('lazy backfill via updateTextExcerpt', () => {
    it('should update textExcerpt for file without excerpt', async () => {
      const file = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'to-backfill.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/backfill.pdf',
        // No textExcerpt initially
      })

      // Verify initially null
      const beforeUpdate = await fileRepository.findById(file.id)
      expect(beforeUpdate!.textExcerpt).toBeNull()

      // Simulate lazy backfill
      await fileRepository.updateTextExcerpt(file.id, 'Backfilled excerpt from S3')

      // Verify updated
      const afterUpdate = await fileRepository.findById(file.id)
      expect(afterUpdate!.textExcerpt).toBe('Backfilled excerpt from S3')
    })
  })
})
