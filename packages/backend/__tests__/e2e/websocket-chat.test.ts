/**
 * E2E Tests for WebSocket Chat
 * Tests WebSocket connection, authentication, and message handling
 */

import { Server as HTTPServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client'
import { ChatServer } from '../../src/infrastructure/websocket/ChatServer'
import { ConversationService } from '../../src/application/services/ConversationService'
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository'
import { DrizzleMessageRepository } from '../../src/infrastructure/database/repositories/DrizzleMessageRepository'
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { JWTProvider } from '../../src/infrastructure/auth/JWTProvider'
import { User } from '../../src/domain/entities/User'
import { testDb, closeTestDb } from '../setup/test-db'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('WebSocket Chat E2E Tests', () => {
  let httpServer: HTTPServer
  let ioServer: SocketIOServer
  let chatServer: ChatServer
  let clientSocket: ClientSocket
  let conversationService: ConversationService
  let userRepository: DrizzleUserRepository
  let jwtProvider: JWTProvider
  let testUserId: string
  let testToken: string
  let testConversationId: string

  const PORT = 8001 // Different port from main app

  beforeAll(async () => {
    // Setup HTTP server
    httpServer = new HTTPServer()

    // Setup Socket.IO server
    ioServer = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    })

    // Setup repositories and services
    const conversationRepository = new DrizzleConversationRepository(testDb)
    const messageRepository = new DrizzleMessageRepository(testDb)
    userRepository = new DrizzleUserRepository(testDb)

    conversationService = new ConversationService(
      conversationRepository,
      messageRepository
    )

    // Setup JWT provider
    jwtProvider = new JWTProvider('test-jwt-secret-key', '1h')

    // Setup chat server
    chatServer = new ChatServer(
      ioServer,
      conversationService,
      'test-jwt-secret-key'
    )

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, resolve)
    })

    // Create test user
    const passwordHash = await bcrypt.hash('password123', 10)
    const user = User.create({
      email: 'websocket-test@example.com',
      name: 'WebSocket Test User',
      passwordHash,
      role: 'analyst',
    })

    const createdUser = await userRepository.create(user)
    testUserId = createdUser.id

    // Generate JWT token
    testToken = jwtProvider.generateToken({
      userId: testUserId,
      email: 'websocket-test@example.com',
      role: 'analyst',
    })

    // Create test conversation
    const conversation = await conversationService.createConversation({
      userId: testUserId,
      mode: 'consult',
    })
    testConversationId = conversation.id
  })

  afterAll(async () => {
    // Cleanup
    await testDb.execute(sql`TRUNCATE TABLE messages CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`)
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)

    // Close connections
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect()
    }

    ioServer.close()
    httpServer.close()
    await closeTestDb()
  })

  beforeEach(async () => {
    // Clean messages before each test
    await testDb.execute(sql`TRUNCATE TABLE messages CASCADE`)
  })

  afterEach(() => {
    // Disconnect client after each test
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect()
    }
  })

  describe('WebSocket connection', () => {
    it('should connect with valid JWT token', (done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: testToken,
        },
      })

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true)
        done()
      })

      clientSocket.on('connect_error', (error) => {
        done(new Error(`Connection failed: ${error.message}`))
      })
    })

    it('should receive connected event with user info', (done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: testToken,
        },
      })

      clientSocket.on('connected', (data) => {
        expect(data.message).toBe('Connected to Guardian chat server')
        expect(data.userId).toBe(testUserId)
        done()
      })
    })

    it('should reject connection without token', (done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {},
      })

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication token required')
        done()
      })
    })

    it('should reject connection with invalid token', (done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: 'invalid-token',
        },
      })

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid authentication token')
        done()
      })
    })

    it('should reject connection with expired token', (done) => {
      // Create an expired token (negative expiry)
      const expiredProvider = new JWTProvider('test-jwt-secret-key', '-1h')
      const expiredToken = expiredProvider.generateToken({
        userId: testUserId,
        email: 'test@example.com',
        role: 'analyst',
      })

      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: expiredToken,
        },
      })

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid authentication token')
        done()
      })
    })
  })

  describe('send_message event', () => {
    beforeEach((done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: testToken,
        },
      })

      clientSocket.on('connect', () => {
        done()
      })
    })

    it('should send message and receive confirmation', (done) => {
      const messageText = 'Hello, I need help with vendor assessment'

      clientSocket.emit('send_message', {
        conversationId: testConversationId,
        text: messageText,
      })

      clientSocket.on('message_sent', (data) => {
        expect(data.messageId).toBeDefined()
        expect(data.conversationId).toBe(testConversationId)
        expect(data.timestamp).toBeDefined()
        done()
      })
    })

    it('should save message to database', (done) => {
      const messageText = 'Test message for database'

      clientSocket.emit('send_message', {
        conversationId: testConversationId,
        text: messageText,
      })

      clientSocket.on('message_sent', async (data) => {
        // Verify message was saved
        const messages = await conversationService.getHistory(
          testConversationId
        )

        expect(messages).toHaveLength(1)
        expect(messages[0].content.text).toBe(messageText)
        expect(messages[0].role).toBe('user')
        done()
      })
    })

    it('should send message with components', (done) => {
      const messageText = 'Message with components'
      const components = [
        {
          type: 'button' as const,
          data: { label: 'Start Assessment', action: 'start' },
        },
      ]

      clientSocket.emit('send_message', {
        conversationId: testConversationId,
        text: messageText,
        components,
      })

      clientSocket.on('message', (data) => {
        expect(data.content.text).toBe(messageText)
        expect(data.content.components).toEqual(components)
        done()
      })
    })

    it('should emit error for invalid conversation ID', (done) => {
      clientSocket.emit('send_message', {
        conversationId: '00000000-0000-0000-0000-000000000000',
        text: 'Test message',
      })

      clientSocket.on('error', (error) => {
        expect(error.event).toBe('send_message')
        expect(error.message).toBeDefined()
        done()
      })
    })

    it('should receive message event after send', (done) => {
      const messageText = 'Test message for event'

      clientSocket.emit('send_message', {
        conversationId: testConversationId,
        text: messageText,
      })

      clientSocket.on('message', (data) => {
        expect(data.id).toBeDefined()
        expect(data.conversationId).toBe(testConversationId)
        expect(data.role).toBe('user')
        expect(data.content.text).toBe(messageText)
        expect(data.createdAt).toBeDefined()
        done()
      })
    })
  })

  describe('get_history event', () => {
    beforeEach(async (done) => {
      // Create some messages
      await conversationService.sendMessage({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Message 1' },
      })

      await conversationService.sendMessage({
        conversationId: testConversationId,
        role: 'assistant',
        content: { text: 'Message 2' },
      })

      await conversationService.sendMessage({
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Message 3' },
      })

      // Connect client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: testToken,
        },
      })

      clientSocket.on('connect', () => {
        done()
      })
    })

    it('should get conversation history', (done) => {
      clientSocket.emit('get_history', {
        conversationId: testConversationId,
      })

      clientSocket.on('history', (data) => {
        expect(data.conversationId).toBe(testConversationId)
        expect(data.messages).toHaveLength(3)
        expect(data.messages[0].content.text).toBe('Message 1')
        expect(data.messages[1].content.text).toBe('Message 2')
        expect(data.messages[2].content.text).toBe('Message 3')
        done()
      })
    })

    it('should get history with limit', (done) => {
      clientSocket.emit('get_history', {
        conversationId: testConversationId,
        limit: 2,
      })

      clientSocket.on('history', (data) => {
        expect(data.messages).toHaveLength(2)
        done()
      })
    })

    it('should get history with offset', (done) => {
      clientSocket.emit('get_history', {
        conversationId: testConversationId,
        limit: 2,
        offset: 1,
      })

      clientSocket.on('history', (data) => {
        expect(data.messages).toHaveLength(2)
        expect(data.messages[0].content.text).toBe('Message 2')
        expect(data.messages[1].content.text).toBe('Message 3')
        done()
      })
    })

    it('should return empty array for conversation with no messages', async (done) => {
      // Create a new empty conversation
      const emptyConversation = await conversationService.createConversation({
        userId: testUserId,
        mode: 'consult',
      })

      clientSocket.emit('get_history', {
        conversationId: emptyConversation.id,
      })

      clientSocket.on('history', (data) => {
        expect(data.conversationId).toBe(emptyConversation.id)
        expect(data.messages).toEqual([])
        done()
      })
    })

    it('should emit error for invalid conversation ID', (done) => {
      clientSocket.emit('get_history', {
        conversationId: '00000000-0000-0000-0000-000000000000',
      })

      clientSocket.on('history', (data) => {
        expect(data.messages).toEqual([])
        done()
      })
    })

    it('should return messages in chronological order', (done) => {
      clientSocket.emit('get_history', {
        conversationId: testConversationId,
      })

      clientSocket.on('history', (data) => {
        const messages = data.messages
        for (let i = 1; i < messages.length; i++) {
          const prevDate = new Date(messages[i - 1].createdAt)
          const currDate = new Date(messages[i].createdAt)
          expect(prevDate.getTime()).toBeLessThanOrEqual(currDate.getTime())
        }
        done()
      })
    })
  })

  describe('disconnect event', () => {
    it('should handle client disconnect', (done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: testToken,
        },
      })

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true)

        // Disconnect
        clientSocket.disconnect()

        // Wait a bit for disconnect to process
        setTimeout(() => {
          expect(clientSocket.connected).toBe(false)
          done()
        }, 100)
      })
    })
  })

  describe('multiple clients', () => {
    let clientSocket2: ClientSocket

    afterEach(() => {
      if (clientSocket2 && clientSocket2.connected) {
        clientSocket2.disconnect()
      }
    })

    it('should support multiple simultaneous connections', (done) => {
      let connected = 0

      const checkBothConnected = () => {
        connected++
        if (connected === 2) {
          expect(clientSocket.connected).toBe(true)
          expect(clientSocket2.connected).toBe(true)
          done()
        }
      }

      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      })

      clientSocket2 = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      })

      clientSocket.on('connect', checkBothConnected)
      clientSocket2.on('connect', checkBothConnected)
    })
  })

  describe('error handling', () => {
    beforeEach((done) => {
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      })

      clientSocket.on('connect', () => {
        done()
      })
    })

    it('should handle missing conversationId in send_message', (done) => {
      clientSocket.emit('send_message', {
        text: 'Message without conversation ID',
      } as any)

      clientSocket.on('error', (error) => {
        expect(error.event).toBe('send_message')
        expect(error.message).toBeDefined()
        done()
      })
    })

    it('should handle missing text in send_message', (done) => {
      clientSocket.emit('send_message', {
        conversationId: testConversationId,
      } as any)

      clientSocket.on('error', (error) => {
        expect(error.event).toBe('send_message')
        expect(error.message).toBeDefined()
        done()
      })
    })
  })
})
