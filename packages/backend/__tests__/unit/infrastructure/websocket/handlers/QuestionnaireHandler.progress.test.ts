/**
 * Unit Tests for QuestionnaireHandler Progress Emission
 *
 * Story 32.1.3: Verifies that QuestionnaireHandler correctly wires up
 * the SocketProgressEmitter and progress events reach the client.
 *
 * Tests cover:
 * 1. Handler creates SocketProgressEmitter with socket and conversationId
 * 2. Progress events are emitted to the socket during generation
 * 3. Multiple progress events are emitted with increasing step numbers
 */

import {
  QuestionnaireHandler,
  type GenerateQuestionnairePayload,
} from '../../../../../src/infrastructure/websocket/handlers/QuestionnaireHandler.js';
import type { IAuthenticatedSocket, ChatContext } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { QuestionnaireGenerationService } from '../../../../../src/application/services/QuestionnaireGenerationService.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { StreamingHandler } from '../../../../../src/infrastructure/websocket/StreamingHandler.js';
import type { Conversation } from '../../../../../src/domain/entities/Conversation.js';
import type { GenerationResult } from '../../../../../src/application/interfaces/IQuestionnaireGenerationService.js';
import type { IProgressEmitter } from '../../../../../src/application/interfaces/IProgressEmitter.js';

/**
 * Create a mock QuestionnaireGenerationService that captures the progress emitter
 */
const createMockQuestionnaireGenerationService = (
  captureEmitter?: (emitter: IProgressEmitter) => void
): jest.Mocked<QuestionnaireGenerationService> => ({
  generate: jest.fn().mockImplementation((_context, progressEmitter) => {
    // Capture the emitter if callback provided
    if (captureEmitter && progressEmitter) {
      captureEmitter(progressEmitter);
    }
    // Return mock result
    return Promise.resolve({
      schema: {
        version: '1.0',
        metadata: {
          assessmentId: 'assess-123',
          assessmentType: 'comprehensive',
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
          generatedAt: '2025-01-15T10:00:00Z',
          questionCount: 10,
        },
        sections: [],
      },
      assessmentId: 'assess-123',
      markdown: '# Test Questionnaire',
    } as GenerationResult);
  }),
} as unknown as jest.Mocked<QuestionnaireGenerationService>);

/**
 * Create a mock ConversationService
 */
const createMockConversationService = (): jest.Mocked<ConversationService> => ({
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  getUserConversations: jest.fn(),
  switchMode: jest.fn(),
  linkAssessment: jest.fn(),
  sendMessage: jest.fn(),
  getHistory: jest.fn(),
  completeConversation: jest.fn(),
  deleteConversation: jest.fn(),
  updateContext: jest.fn(),
  getConversationTitle: jest.fn(),
  getFirstUserMessage: jest.fn(),
  getFirstAssistantMessage: jest.fn(),
  getMessageCount: jest.fn(),
  updateTitle: jest.fn(),
  updateTitleIfNotManuallyEdited: jest.fn(),
} as unknown as jest.Mocked<ConversationService>);

/**
 * Create a mock StreamingHandler
 */
const createMockStreamingHandler = (): jest.Mocked<StreamingHandler> => ({
  streamToSocket: jest.fn(),
  chunkMarkdown: jest.fn(),
  sleep: jest.fn(),
} as unknown as jest.Mocked<StreamingHandler>);

/**
 * Create a mock authenticated socket
 */
const createMockSocket = (userId?: string): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-123',
  userId,
  userEmail: userId ? 'test@example.com' : undefined,
  userRole: userId ? 'analyst' : undefined,
  conversationId: undefined,
  data: {},
  handshake: {
    auth: {},
  },
  emit: jest.fn(),
  join: jest.fn(),
} as unknown as jest.Mocked<IAuthenticatedSocket>);

/**
 * Create a mock conversation
 */
const createMockConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: 'conv-1',
  userId: 'user-123',
  mode: 'assessment',
  assessmentId: null,
  status: 'active',
  context: {},
  startedAt: new Date('2025-01-15T10:00:00Z'),
  lastActivityAt: new Date('2025-01-15T11:00:00Z'),
  completedAt: null,
  title: null,
  titleManuallyEdited: false,
  ...overrides,
} as Conversation);

/**
 * Create a mock ChatContext
 */
const createMockChatContext = (): ChatContext => ({
  pendingCreations: new Map(),
  abortedStreams: new Set(),
  rateLimiter: {} as ChatContext['rateLimiter'],
  promptCache: {} as ChatContext['promptCache'],
});

describe('QuestionnaireHandler Progress Emission', () => {
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockStreamingHandler: jest.Mocked<StreamingHandler>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;
  let mockChatContext: ChatContext;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockStreamingHandler = createMockStreamingHandler();
    mockSocket = createMockSocket('user-123');
    mockChatContext = createMockChatContext();

    // Default setup for successful generation
    mockConversationService.getConversation.mockResolvedValue(
      createMockConversation({ id: 'conv-1', userId: 'user-123' })
    );
    mockConversationService.sendMessage.mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: { text: 'test' },
      createdAt: new Date(),
    } as any);
    mockStreamingHandler.streamToSocket.mockResolvedValue();
    mockConversationService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const defaultPayload: GenerateQuestionnairePayload = {
    conversationId: 'conv-1',
    assessmentType: 'comprehensive',
    vendorName: 'Test Vendor',
    solutionName: 'Test Solution',
  };

  describe('progress emitter wiring', () => {
    it('should pass progress emitter to QuestionnaireGenerationService.generate()', async () => {
      let capturedEmitter: IProgressEmitter | null = null;
      const mockService = createMockQuestionnaireGenerationService((emitter) => {
        capturedEmitter = emitter;
      });

      const handler = new QuestionnaireHandler(
        mockService,
        mockConversationService,
        mockStreamingHandler
      );

      await handler.handleGenerateQuestionnaire(
        mockSocket,
        defaultPayload,
        'user-123',
        mockChatContext
      );

      // Verify generate was called with a progress emitter
      expect(mockService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
        }),
        expect.any(Object) // Progress emitter
      );

      // Verify the emitter was captured and is not null
      expect(capturedEmitter).not.toBeNull();
    });

    it('should create emitter bound to correct socket and conversationId', async () => {
      let capturedEmitter: IProgressEmitter | null = null;
      const mockService = createMockQuestionnaireGenerationService((emitter) => {
        capturedEmitter = emitter;
      });

      const handler = new QuestionnaireHandler(
        mockService,
        mockConversationService,
        mockStreamingHandler
      );

      await handler.handleGenerateQuestionnaire(
        mockSocket,
        defaultPayload,
        'user-123',
        mockChatContext
      );

      // Emit a test progress event through the captured emitter
      capturedEmitter!.emit('Test message', 1, 10, 1);

      // Verify the socket received the progress event with correct conversationId
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'questionnaire_progress',
        expect.objectContaining({
          conversationId: 'conv-1',
          message: 'Test message',
          step: 1,
          totalSteps: 10,
          seq: 1,
        })
      );
    });
  });

  describe('progress event emission via socket', () => {
    it('should emit questionnaire_progress events to socket when emitter is used', async () => {
      let capturedEmitter: IProgressEmitter | null = null;
      const mockService = createMockQuestionnaireGenerationService((emitter) => {
        capturedEmitter = emitter;
      });

      const handler = new QuestionnaireHandler(
        mockService,
        mockConversationService,
        mockStreamingHandler
      );

      await handler.handleGenerateQuestionnaire(
        mockSocket,
        defaultPayload,
        'user-123',
        mockChatContext
      );

      // Simulate multiple progress emissions
      capturedEmitter!.emit('Analyzing vendor context...', 1, 11, 1);
      capturedEmitter!.emit('Generating questions...', 5, 11, 5);
      capturedEmitter!.emit('Finalizing questionnaire...', 11, 11, 11);

      // Verify all progress events were emitted
      const progressCalls = (mockSocket.emit as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[0] === 'questionnaire_progress'
      );

      expect(progressCalls.length).toBe(3);
      expect(progressCalls[0][1].message).toBe('Analyzing vendor context...');
      expect(progressCalls[1][1].message).toBe('Generating questions...');
      expect(progressCalls[2][1].message).toBe('Finalizing questionnaire...');
    });

    it('should include timestamp in progress events', async () => {
      let capturedEmitter: IProgressEmitter | null = null;
      const mockService = createMockQuestionnaireGenerationService((emitter) => {
        capturedEmitter = emitter;
      });

      const handler = new QuestionnaireHandler(
        mockService,
        mockConversationService,
        mockStreamingHandler
      );

      const beforeTime = Date.now();
      await handler.handleGenerateQuestionnaire(
        mockSocket,
        defaultPayload,
        'user-123',
        mockChatContext
      );
      const afterTime = Date.now();

      // Emit a test progress event
      capturedEmitter!.emit('Test message', 1, 10, 1);

      // Find the progress event
      const progressCall = (mockSocket.emit as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'questionnaire_progress'
      );

      expect(progressCall).toBeDefined();
      expect(progressCall[1].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(progressCall[1].timestamp).toBeLessThanOrEqual(afterTime + 1000); // Allow 1s margin
    });

    it('should emit progress events with increasing sequence numbers', async () => {
      let capturedEmitter: IProgressEmitter | null = null;
      const mockService = createMockQuestionnaireGenerationService((emitter) => {
        capturedEmitter = emitter;
      });

      const handler = new QuestionnaireHandler(
        mockService,
        mockConversationService,
        mockStreamingHandler
      );

      await handler.handleGenerateQuestionnaire(
        mockSocket,
        defaultPayload,
        'user-123',
        mockChatContext
      );

      // Emit multiple progress events with increasing seq
      capturedEmitter!.emit('Step 1', 1, 5, 1);
      capturedEmitter!.emit('Step 2', 2, 5, 2);
      capturedEmitter!.emit('Step 3', 3, 5, 3);

      // Get all progress calls
      const progressCalls = (mockSocket.emit as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[0] === 'questionnaire_progress'
      );

      // Verify sequence numbers are increasing
      expect(progressCalls[0][1].seq).toBe(1);
      expect(progressCalls[1][1].seq).toBe(2);
      expect(progressCalls[2][1].seq).toBe(3);
    });
  });

  describe('progress emitter on different conversations', () => {
    it('should create separate emitters for different conversations', async () => {
      const capturedEmitters: Map<string, IProgressEmitter> = new Map();

      // Create service that captures emitter per conversation
      const mockService = {
        generate: jest.fn().mockImplementation((context, progressEmitter) => {
          capturedEmitters.set(context.conversationId, progressEmitter);
          return Promise.resolve({
            schema: {
              version: '1.0',
              metadata: {
                assessmentId: 'assess-123',
                assessmentType: 'comprehensive',
                vendorName: 'Test Vendor',
                solutionName: 'Test Solution',
                generatedAt: '2025-01-15T10:00:00Z',
                questionCount: 10,
              },
              sections: [],
            },
            assessmentId: 'assess-123',
            markdown: '# Test',
          });
        }),
      } as unknown as jest.Mocked<QuestionnaireGenerationService>;

      const handler = new QuestionnaireHandler(
        mockService,
        mockConversationService,
        mockStreamingHandler
      );

      // First conversation
      mockConversationService.getConversation.mockResolvedValueOnce(
        createMockConversation({ id: 'conv-1', userId: 'user-123' })
      );
      await handler.handleGenerateQuestionnaire(
        mockSocket,
        { ...defaultPayload, conversationId: 'conv-1' },
        'user-123',
        mockChatContext
      );

      // Second conversation
      mockConversationService.getConversation.mockResolvedValueOnce(
        createMockConversation({ id: 'conv-2', userId: 'user-123' })
      );
      await handler.handleGenerateQuestionnaire(
        mockSocket,
        { ...defaultPayload, conversationId: 'conv-2' },
        'user-123',
        mockChatContext
      );

      // Emit from first conversation's emitter
      capturedEmitters.get('conv-1')!.emit('Conv 1 message', 1, 5, 1);

      // Emit from second conversation's emitter
      capturedEmitters.get('conv-2')!.emit('Conv 2 message', 1, 5, 1);

      // Find progress calls
      const progressCalls = (mockSocket.emit as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[0] === 'questionnaire_progress'
      );

      // Verify each emitter sends to its own conversationId
      const conv1Call = progressCalls.find(
        (call: unknown[]) => (call[1] as any).conversationId === 'conv-1'
      );
      const conv2Call = progressCalls.find(
        (call: unknown[]) => (call[1] as any).conversationId === 'conv-2'
      );

      expect(conv1Call).toBeDefined();
      expect(conv2Call).toBeDefined();
      expect(conv1Call![1].message).toBe('Conv 1 message');
      expect(conv2Call![1].message).toBe('Conv 2 message');
    });
  });
});
