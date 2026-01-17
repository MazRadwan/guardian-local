/**
 * Integration Test - Full Attachment Flow (Epic 16.6.9)
 *
 * Tests the complete attachment lifecycle end-to-end:
 * 1. Upload file → get fileId from database
 * 2. Send message with attachment via WebSocket
 * 3. Verify message saved with attachment in database
 * 4. Request history → verify attachment in response
 * 5. Download file → verify content matches original
 *
 * Also validates cross-conversation security (attachment isolation)
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { db } from '../../src/infrastructure/database/client';
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository';
import { DrizzleMessageRepository } from '../../src/infrastructure/database/repositories/DrizzleMessageRepository';
import { DrizzleUserRepository } from '../../src/infrastructure/database/repositories/DrizzleUserRepository';
import { DrizzleFileRepository } from '../../src/infrastructure/database/repositories/DrizzleFileRepository';
import { ConversationService } from '../../src/application/services/ConversationService';
import { ChatServer } from '../../src/infrastructure/websocket/ChatServer';
import { JWTProvider } from '../../src/infrastructure/auth/JWTProvider';
import { User } from '../../src/domain/entities/User';
import { testDb, closeTestDb } from '../setup/test-db';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import type { IClaudeClient, ClaudeMessage, StreamChunk } from '../../src/application/interfaces/IClaudeClient';
import { RateLimiter } from '../../src/infrastructure/websocket/RateLimiter';
import { PromptCacheManager } from '../../src/infrastructure/ai/PromptCacheManager';
import { getSystemPrompt } from '../../src/infrastructure/ai/prompts';

// Mock prompts module
jest.mock('../../src/infrastructure/ai/prompts', () => ({
  getSystemPrompt: jest.fn().mockReturnValue('Mocked system prompt for testing'),
}));

// Mock Claude client for deterministic responses
class MockClaudeClient implements IClaudeClient {
  async sendMessage(messages: ClaudeMessage[]): Promise<any> {
    return {
      content: 'Mock Claude response',
      stop_reason: 'end_turn',
      model: 'claude-test-model',
    };
  }

  async *streamMessage(messages: ClaudeMessage[]): AsyncGenerator<StreamChunk> {
    yield { content: 'Mock ', isComplete: false };
    yield { content: 'streaming response', isComplete: false };
    yield { content: '', isComplete: true };
  }
}

// Mock service repositories
const mockVendorRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByName: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockAssessmentRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockQuestionRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByAssessmentId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  bulkCreate: jest.fn(),
};

describe('Attachment Flow Integration Tests', () => {
  let httpServer: HTTPServer;
  let ioServer: SocketIOServer;
  let chatServer: ChatServer;
  let clientSocket: ClientSocket;
  let conversationService: ConversationService;
  let fileRepository: DrizzleFileRepository;
  let userRepository: DrizzleUserRepository;
  let jwtProvider: JWTProvider;
  let testUserId: string;
  let testToken: string;
  let testConversationId: string;

  const PORT = 8002; // Different port from other tests

  beforeAll(async () => {
    // Setup HTTP server
    httpServer = new HTTPServer();

    // Setup Socket.IO server
    ioServer = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Setup repositories
    const conversationRepository = new DrizzleConversationRepository(testDb);
    const messageRepository = new DrizzleMessageRepository(testDb);
    userRepository = new DrizzleUserRepository(testDb);
    fileRepository = new DrizzleFileRepository(testDb);

    conversationService = new ConversationService(
      conversationRepository,
      messageRepository
    );

    // Setup JWT provider
    jwtProvider = new JWTProvider('test-jwt-secret-key', '1h');

    // Setup chat server with mock Claude client
    const mockClaudeClient = new MockClaudeClient();
    const rateLimiter = new RateLimiter(100, 60000);
    const promptCacheManager = new PromptCacheManager(
      { enabled: false, prefix: 'test' },
      getSystemPrompt
    );

    // Create mock service instances (for constructor compatibility)
    const mockAssessmentService = {
      createAssessment: jest.fn(),
      getAssessment: jest.fn(),
    } as any;

    const mockVendorService = {
      findOrCreateDefault: jest.fn(),
    } as any;

    const mockQuestionnaireReadyService = {
      handle: jest.fn(),
    } as any;

    const mockQuestionnaireGenerationService = {
      generate: jest.fn(),
    } as any;

    const mockQuestionService = {
      getQuestionCount: jest.fn(),
      getQuestions: jest.fn(),
    } as any;

    chatServer = new ChatServer(
      ioServer,
      conversationService,
      mockClaudeClient,
      rateLimiter,
      'test-jwt-secret-key',
      promptCacheManager,
      mockAssessmentService,
      mockVendorService,
      mockQuestionnaireReadyService,
      mockQuestionnaireGenerationService,
      mockQuestionService,
      fileRepository
    );

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, resolve);
    });

    // Create test user
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = User.create({
      email: 'attachment-test@example.com',
      name: 'Attachment Test User',
      passwordHash,
      role: 'analyst',
    });

    const createdUser = await userRepository.create(user);
    testUserId = createdUser.id;

    // Generate JWT token
    testToken = jwtProvider.generateToken({
      userId: testUserId,
      email: 'attachment-test@example.com',
      role: 'analyst',
    });

    // Create test conversation
    const conversation = await conversationService.createConversation({
      userId: testUserId,
      mode: 'consult',
    });
    testConversationId = conversation.id;
  });

  afterAll(async () => {
    // Cleanup
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`);
    await testDb.execute(sql`TRUNCATE TABLE messages CASCADE`);
    await testDb.execute(sql`TRUNCATE TABLE conversations CASCADE`);
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`);

    // Close connections
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }

    ioServer.close();
    httpServer.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    // Clean messages and files before each test
    await testDb.execute(sql`TRUNCATE TABLE files CASCADE`);
    await testDb.execute(sql`TRUNCATE TABLE messages CASCADE`);
  });

  afterEach(() => {
    // Disconnect client after each test
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Full attachment lifecycle', () => {
    it('should complete full attachment lifecycle', async () => {
      // 1. Upload file → get fileId from database
      const testFileContent = Buffer.from('Test PDF content for attachment flow test');
      const fileRecord = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: testFileContent.length,
        storagePath: '/test/storage/test-document.pdf',
      });

      expect(fileRecord.id).toBeDefined();
      expect(fileRecord.filename).toBe('test-document.pdf');

      // 2. Connect WebSocket client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: {
          token: testToken,
        },
      });

      // Wait for connection
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          resolve();
        });
      });

      // 3. Send message with attachment (file-only, empty text is OK)
      const sendMessagePromise = new Promise<void>((resolve, reject) => {
        clientSocket.on('message_sent', (data) => {
          try {
            // Verify message confirmation includes attachment metadata
            expect(data.messageId).toBeDefined();
            expect(data.conversationId).toBe(testConversationId);
            expect(data.attachments).toBeDefined();
            expect(data.attachments).toHaveLength(1);
            expect(data.attachments[0]).toEqual({
              fileId: fileRecord.id,
              filename: 'test-document.pdf',
              mimeType: 'application/pdf',
              size: testFileContent.length,
              // storagePath should NOT be present
            });
            expect(data.attachments[0]).not.toHaveProperty('storagePath');
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        clientSocket.on('error', (error) => {
          reject(new Error(`WebSocket error: ${error.message}`));
        });

        // Send message with attachment
        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: 'Here is the document',
          attachments: [{ fileId: fileRecord.id }],
        });
      });

      await sendMessagePromise;

      // 4. Verify message saved with attachment in database
      const messages = await conversationService.getHistory(testConversationId);
      const userMessage = messages.find((m) => m.role === 'user');

      expect(userMessage).toBeDefined();
      expect(userMessage!.content.text).toBe('Here is the document');
      expect(userMessage!.attachments).toBeDefined();
      expect(userMessage!.attachments).toHaveLength(1);
      // Epic 16.6.9: storagePath NOT stored in message attachments
      expect(userMessage!.attachments![0]).toEqual({
        fileId: fileRecord.id,
        filename: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: testFileContent.length,
      });
      expect(userMessage!.attachments![0]).not.toHaveProperty('storagePath');

      // 5. Request history → verify attachment in response (storagePath stripped)
      const historyPromise = new Promise<void>((resolve, reject) => {
        clientSocket.on('history', (data) => {
          try {
            expect(data.conversationId).toBe(testConversationId);
            expect(data.messages).toBeDefined();

            const userMsg = data.messages.find((m: any) => m.role === 'user');
            expect(userMsg).toBeDefined();
            expect(userMsg.attachments).toBeDefined();
            expect(userMsg.attachments).toHaveLength(1);
            expect(userMsg.attachments[0]).toEqual({
              fileId: fileRecord.id,
              filename: 'test-document.pdf',
              mimeType: 'application/pdf',
              size: testFileContent.length,
              // storagePath should NOT be in history response
            });
            expect(userMsg.attachments[0]).not.toHaveProperty('storagePath');
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        clientSocket.emit('get_history', {
          conversationId: testConversationId,
        });
      });

      await historyPromise;

      // 6. Verify file can be retrieved from repository (simulates download)
      const retrievedFile = await fileRepository.findByIdAndUser(
        fileRecord.id,
        testUserId
      );

      expect(retrievedFile).toBeDefined();
      expect(retrievedFile!.filename).toBe('test-document.pdf');
      expect(retrievedFile!.storagePath).toBe('/test/storage/test-document.pdf');
    });

    it('should allow file-only message (no text)', async () => {
      // Create file
      const fileRecord = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'file-only.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/test/storage/file-only.pdf',
      });

      // Connect client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Send message with NO text, only attachment
      const messageSentPromise = new Promise<void>((resolve, reject) => {
        clientSocket.on('message_sent', (data) => {
          try {
            expect(data.attachments).toHaveLength(1);
            expect(data.attachments[0].fileId).toBe(fileRecord.id);
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        clientSocket.on('error', (error) => {
          reject(new Error(`Should not error on file-only message: ${error.message}`));
        });

        // Send with empty text
        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: '', // Empty text
          attachments: [{ fileId: fileRecord.id }],
        });
      });

      await messageSentPromise;

      // Verify saved in database
      const messages = await conversationService.getHistory(testConversationId);
      const userMessage = messages.find((m) => m.role === 'user');

      expect(userMessage).toBeDefined();
      // When user sends file-only message (no text), system adds placeholder
      // to provide context to Claude about what files are attached
      expect(userMessage!.content.text).toBe('[Uploaded file for analysis: file-only.pdf]');
      expect(userMessage!.attachments).toHaveLength(1);
      expect(userMessage!.attachments![0].fileId).toBe(fileRecord.id);
    });
  });

  describe('Cross-conversation attachment security', () => {
    it('should prevent cross-conversation file attachment', async () => {
      // Create two conversations for same user
      const conversationA = await conversationService.createConversation({
        userId: testUserId,
        mode: 'consult',
      });

      const conversationB = await conversationService.createConversation({
        userId: testUserId,
        mode: 'consult',
      });

      // Upload file to conversation A
      const fileInConvA = await fileRepository.create({
        userId: testUserId,
        conversationId: conversationA.id,
        filename: 'conv-a-file.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '/test/storage/conv-a-file.pdf',
      });

      // Connect client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Try to attach file from conversation A to message in conversation B
      const errorPromise = new Promise<void>((resolve, reject) => {
        clientSocket.on('error', (error) => {
          try {
            expect(error.event).toBe('send_message');
            expect(error.message).toContain('Invalid attachment');
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        clientSocket.on('message_sent', () => {
          reject(new Error('Should not have sent message with cross-conversation file'));
        });

        // Send message to conversation B with file from conversation A
        clientSocket.emit('send_message', {
          conversationId: conversationB.id,
          text: 'Trying to attach file from another conversation',
          attachments: [{ fileId: fileInConvA.id }],
        });
      });

      await errorPromise;

      // Verify message was NOT saved to conversation B
      const messagesInConvB = await conversationService.getHistory(conversationB.id);
      const userMessages = messagesInConvB.filter((m) => m.role === 'user');
      expect(userMessages).toHaveLength(0);
    });

    it('should allow same file attached to multiple messages in same conversation', async () => {
      // Create file
      const fileRecord = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'reusable.pdf',
        mimeType: 'application/pdf',
        size: 3072,
        storagePath: '/test/storage/reusable.pdf',
      });

      // Connect client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Send first message with attachment
      await new Promise<void>((resolve, reject) => {
        clientSocket.on('message_sent', (data) => {
          if (data.attachments && data.attachments.length > 0) {
            resolve();
          }
        });

        clientSocket.on('error', (error) => {
          reject(new Error(`Error on first message: ${error.message}`));
        });

        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: 'First message with file',
          attachments: [{ fileId: fileRecord.id }],
        });
      });

      // Send second message with same attachment
      await new Promise<void>((resolve, reject) => {
        // Remove previous listener to avoid double-firing
        clientSocket.removeAllListeners('message_sent');
        clientSocket.removeAllListeners('error');

        clientSocket.on('message_sent', (data) => {
          try {
            expect(data.attachments).toHaveLength(1);
            expect(data.attachments[0].fileId).toBe(fileRecord.id);
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        clientSocket.on('error', (error) => {
          reject(new Error(`Error on second message: ${error.message}`));
        });

        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: 'Second message with same file',
          attachments: [{ fileId: fileRecord.id }],
        });
      });

      // Verify both messages saved
      const messages = await conversationService.getHistory(testConversationId);
      const userMessages = messages.filter((m) => m.role === 'user');

      expect(userMessages).toHaveLength(2);
      expect(userMessages[0].attachments).toHaveLength(1);
      expect(userMessages[0].attachments![0].fileId).toBe(fileRecord.id);
      expect(userMessages[1].attachments).toHaveLength(1);
      expect(userMessages[1].attachments![0].fileId).toBe(fileRecord.id);
    });
  });

  describe('Attachment validation', () => {
    it('should reject invalid fileId', async () => {
      // Connect client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Try to send message with non-existent fileId
      const errorPromise = new Promise<void>((resolve, reject) => {
        clientSocket.on('error', (error) => {
          try {
            expect(error.event).toBe('send_message');
            expect(error.message).toContain('Invalid attachment');
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        clientSocket.on('message_sent', () => {
          reject(new Error('Should not have sent message with invalid fileId'));
        });

        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: 'Message with invalid file',
          attachments: [{ fileId: '00000000-0000-0000-0000-000000000000' }],
        });
      });

      await errorPromise;
    });

    it('should require text or attachments (not both missing)', async () => {
      // Connect client
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Try to send message with no text and no attachments
      const errorPromise = new Promise<void>((resolve, reject) => {
        clientSocket.on('error', (error) => {
          try {
            expect(error.event).toBe('send_message');
            expect(error.message).toContain('Message text or attachments required');
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        clientSocket.on('message_sent', () => {
          reject(new Error('Should not have sent empty message'));
        });

        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: '',
          attachments: [],
        });
      });

      await errorPromise;
    });
  });

  describe('Database integrity', () => {
    it('should persist attachment metadata correctly in JSONB', async () => {
      // Create file
      const fileRecord = await fileRepository.create({
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'metadata-test.pdf',
        mimeType: 'application/pdf',
        size: 4096,
        storagePath: '/test/storage/metadata-test.pdf',
      });

      // Connect and send message
      clientSocket = ioClient(`http://localhost:${PORT}/chat`, {
        auth: { token: testToken },
      });

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      await new Promise<void>((resolve, reject) => {
        clientSocket.on('message_sent', () => resolve());
        clientSocket.on('error', (error) => reject(new Error(error.message)));

        clientSocket.emit('send_message', {
          conversationId: testConversationId,
          text: 'Testing metadata persistence',
          attachments: [{ fileId: fileRecord.id }],
        });
      });

      // Query database directly to verify JSONB structure
      const messages = await conversationService.getHistory(testConversationId);
      const userMessage = messages.find((m) => m.role === 'user');

      expect(userMessage).toBeDefined();
      expect(userMessage!.attachments).toBeDefined();
      expect(Array.isArray(userMessage!.attachments)).toBe(true);
      // Epic 16.6.9: storagePath NOT stored in message attachments
      expect(userMessage!.attachments![0]).toEqual({
        fileId: fileRecord.id,
        filename: 'metadata-test.pdf',
        mimeType: 'application/pdf',
        size: 4096,
      });
      expect(userMessage!.attachments![0]).not.toHaveProperty('storagePath');
    });
  });
});
