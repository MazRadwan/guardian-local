/**
 * Integration Tests for DrizzleMessageRepository
 * Tests repository with real database connection
 */

import { DrizzleMessageRepository } from '../../../src/infrastructure/database/repositories/DrizzleMessageRepository'
import { DrizzleConversationRepository } from '../../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { DrizzleUserRepository } from '../../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { Message } from '../../../src/domain/entities/Message'
import { Conversation } from '../../../src/domain/entities/Conversation'
import { User } from '../../../src/domain/entities/User'
import { testDb, closeTestDb } from '../../setup/test-db'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('DrizzleMessageRepository Integration Tests', () => {
  let repository: DrizzleMessageRepository
  let conversationRepository: DrizzleConversationRepository
  let userRepository: DrizzleUserRepository
  let testConversationId: string
  let testUserId: string

  beforeAll(async () => {
    repository = new DrizzleMessageRepository(testDb)
    conversationRepository = new DrizzleConversationRepository(testDb)
    userRepository = new DrizzleUserRepository(testDb)

    // Create a test user
    const passwordHash = await bcrypt.hash('password123', 10)
    const user = User.create({
      email: 'message-test@example.com',
      name: 'Message Test User',
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

    const createdConversation =
      await conversationRepository.create(conversation)
    testConversationId = createdConversation.id
  })

  beforeEach(async () => {
    // Clean messages table before each test
    await testDb.execute(sql`TRUNCATE TABLE messages CASCADE`)
  })

  afterAll(async () => {
    // Clean up
    await testDb.execute(sql`TRUNCATE TABLE messages CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
    await closeTestDb()
  })

  describe('create', () => {
    it('should create message and return with generated ID', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: {
          text: 'Hello, how can I assess this vendor?',
        },
      })

      const created = await repository.create(message)

      expect(created.id).toBeDefined()
      expect(created.id.length).toBeGreaterThan(0)
      expect(created.conversationId).toBe(testConversationId)
      expect(created.role).toBe('user')
      expect(created.content.text).toBe('Hello, how can I assess this vendor?')
      expect(created.createdAt).toBeInstanceOf(Date)
    })

    it('should create message with assistant role', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: {
          text: 'I can help you assess your vendor.',
        },
      })

      const created = await repository.create(message)

      expect(created.role).toBe('assistant')
      expect(created.content.text).toBe('I can help you assess your vendor.')
    })

    it('should create message with system role', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'system',
        content: {
          text: 'Assessment started.',
        },
      })

      const created = await repository.create(message)

      expect(created.role).toBe('system')
    })

    it('should create message with components', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: {
          text: 'Would you like to start an assessment?',
          components: [
            {
              type: 'button',
              data: { label: 'Start Assessment', action: 'start_assessment' },
            },
            {
              type: 'button',
              data: { label: 'Learn More', action: 'learn_more' },
            },
          ],
        },
      })

      const created = await repository.create(message)

      expect(created.content.components).toHaveLength(2)
      expect(created.content.components![0].type).toBe('button')
      expect(created.content.components![0].data).toEqual({
        label: 'Start Assessment',
        action: 'start_assessment',
      })
    })
  })

  describe('findById', () => {
    it('should find message by ID', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: {
          text: 'Test message',
        },
      })

      const created = await repository.create(message)
      const found = await repository.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.conversationId).toBe(testConversationId)
      expect(found!.content.text).toBe('Test message')
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toBeNull()
    })
  })

  describe('findByConversationId', () => {
    it('should find all messages for conversation', async () => {
      const message1 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'First message' },
      })

      const message2 = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Second message' },
      })

      const message3 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Third message' },
      })

      await repository.create(message1)
      await repository.create(message2)
      await repository.create(message3)

      const found = await repository.findByConversationId(testConversationId)

      expect(found).toHaveLength(3)
      expect(found[0].content.text).toBe('First message')
      expect(found[1].content.text).toBe('Second message')
      expect(found[2].content.text).toBe('Third message')
    })

    it('should return messages in chronological order', async () => {
      const message1 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Message 1' },
      })

      await repository.create(message1)
      await new Promise((resolve) => setTimeout(resolve, 50))

      const message2 = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Message 2' },
      })

      await repository.create(message2)
      await new Promise((resolve) => setTimeout(resolve, 50))

      const message3 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Message 3' },
      })

      await repository.create(message3)

      const found = await repository.findByConversationId(testConversationId)

      expect(found[0].createdAt.getTime()).toBeLessThan(
        found[1].createdAt.getTime()
      )
      expect(found[1].createdAt.getTime()).toBeLessThan(
        found[2].createdAt.getTime()
      )
    })

    it('should return empty array for conversation with no messages', async () => {
      const found = await repository.findByConversationId(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toEqual([])
    })
  })

  describe('getHistory', () => {
    beforeEach(async () => {
      // Create 10 messages for pagination testing
      for (let i = 1; i <= 10; i++) {
        const message = Message.create({
          conversationId: testConversationId,
          role: i % 2 === 0 ? 'assistant' : 'user',
          content: { text: `Message ${i}` },
        })
        await repository.create(message)
        // Small delay to ensure distinct timestamps
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    })

    it('should get history with default limit', async () => {
      const history = await repository.getHistory(testConversationId)

      expect(history).toHaveLength(10)
      expect(history[0].content.text).toBe('Message 1')
      expect(history[9].content.text).toBe('Message 10')
    })

    it('should respect limit parameter', async () => {
      const history = await repository.getHistory(testConversationId, 5)

      expect(history).toHaveLength(5)
    })

    it('should respect offset parameter', async () => {
      const history = await repository.getHistory(testConversationId, 5, 5)

      // offset=5 skips 5 newest messages (M10, M9, M8, M7, M6)
      // Returns next 5: M5, M4, M3, M2, M1 (newest to oldest)
      // Then reversed to chronological: M1, M2, M3, M4, M5
      expect(history).toHaveLength(5)
      expect(history[0].content.text).toBe('Message 1')
      expect(history[4].content.text).toBe('Message 5')
    })

    it('should return messages in chronological order (oldest first)', async () => {
      const history = await repository.getHistory(testConversationId)

      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1].createdAt.getTime()).toBeLessThanOrEqual(
          history[i].createdAt.getTime()
        )
      }
    })
  })

  describe('count', () => {
    it('should count messages in conversation', async () => {
      const message1 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Message 1' },
      })

      const message2 = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Message 2' },
      })

      await repository.create(message1)
      await repository.create(message2)

      const count = await repository.count(testConversationId)

      expect(count).toBe(2)
    })

    it('should return 0 for conversation with no messages', async () => {
      const count = await repository.count(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(count).toBe(0)
    })
  })

  describe('findFirstUserMessage', () => {
    it('should find first user message in conversation', async () => {
      // Create assistant message first
      const message1 = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Welcome! How can I help?' },
      })
      await repository.create(message1)
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Create first user message
      const message2 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'I need help assessing a vendor' },
      })
      await repository.create(message2)
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Create second user message
      const message3 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'What about their security?' },
      })
      await repository.create(message3)

      const firstUserMessage = await repository.findFirstUserMessage(testConversationId)

      expect(firstUserMessage).not.toBeNull()
      expect(firstUserMessage!.role).toBe('user')
      expect(firstUserMessage!.content.text).toBe('I need help assessing a vendor')
    })

    it('should return null when no user messages exist', async () => {
      // Create only assistant messages
      const message1 = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Welcome!' },
      })
      await repository.create(message1)

      const message2 = Message.create({
        conversationId: testConversationId,
        role: 'system',
        content: { text: 'System message' },
      })
      await repository.create(message2)

      const firstUserMessage = await repository.findFirstUserMessage(testConversationId)

      expect(firstUserMessage).toBeNull()
    })

    it('should return null for conversation with no messages', async () => {
      const firstUserMessage = await repository.findFirstUserMessage(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(firstUserMessage).toBeNull()
    })

    it('should return first user message even when multiple user messages exist', async () => {
      // Create multiple messages with delays to ensure chronological order
      const message1 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'First user message' },
      })
      await repository.create(message1)
      await new Promise((resolve) => setTimeout(resolve, 10))

      const message2 = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Response' },
      })
      await repository.create(message2)
      await new Promise((resolve) => setTimeout(resolve, 10))

      const message3 = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Second user message' },
      })
      await repository.create(message3)

      const firstUserMessage = await repository.findFirstUserMessage(testConversationId)

      expect(firstUserMessage).not.toBeNull()
      expect(firstUserMessage!.content.text).toBe('First user message')
    })
  })

  describe('delete', () => {
    it('should delete message', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'To be deleted' },
      })

      const created = await repository.create(message)

      await repository.delete(created.id)

      const found = await repository.findById(created.id)
      expect(found).toBeNull()
    })
  })

  describe('JSONB content persistence', () => {
    it('should persist and retrieve simple text content', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'user',
        content: {
          text: 'Simple text message',
        },
      })

      const created = await repository.create(message)
      const found = await repository.findById(created.id)

      expect(found!.content).toEqual({
        text: 'Simple text message',
      })
    })

    it('should persist and retrieve content with complex components', async () => {
      const complexContent = {
        text: 'Please review these options:',
        components: [
          {
            type: 'button' as const,
            data: {
              label: 'Option 1',
              action: 'select_option_1',
              metadata: { value: 1, priority: 'high' },
            },
          },
          {
            type: 'link' as const,
            data: {
              url: 'https://example.com',
              title: 'Learn More',
            },
          },
          {
            type: 'code' as const,
            data: {
              language: 'javascript',
              code: 'console.log("Hello World");',
            },
          },
        ],
      }

      const message = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: complexContent,
      })

      const created = await repository.create(message)
      const found = await repository.findById(created.id)

      expect(found!.content).toEqual(complexContent)
      expect(found!.content.components).toHaveLength(3)
      expect(found!.content.components![0].data).toEqual({
        label: 'Option 1',
        action: 'select_option_1',
        metadata: { value: 1, priority: 'high' },
      })
    })

    it('should handle empty components array', async () => {
      const message = Message.create({
        conversationId: testConversationId,
        role: 'assistant',
        content: {
          text: 'Message with empty components',
          components: [],
        },
      })

      const created = await repository.create(message)
      const found = await repository.findById(created.id)

      expect(found!.content.components).toEqual([])
    })
  })

  describe('cascade delete', () => {
    it('should delete messages when conversation is deleted', async () => {
      // Create a new conversation for this test
      const conversation = Conversation.create({
        userId: testUserId,
        mode: 'consult',
      })
      const createdConversation =
        await conversationRepository.create(conversation)

      // Create messages for this conversation
      const message1 = Message.create({
        conversationId: createdConversation.id,
        role: 'user',
        content: { text: 'Message 1' },
      })

      const message2 = Message.create({
        conversationId: createdConversation.id,
        role: 'assistant',
        content: { text: 'Message 2' },
      })

      const created1 = await repository.create(message1)
      const created2 = await repository.create(message2)

      // Delete the conversation
      await conversationRepository.delete(createdConversation.id)

      // Messages should be deleted due to CASCADE
      const found1 = await repository.findById(created1.id)
      const found2 = await repository.findById(created2.id)

      expect(found1).toBeNull()
      expect(found2).toBeNull()
    })
  })
})
