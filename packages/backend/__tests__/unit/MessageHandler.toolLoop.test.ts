/**
 * Unit Tests for MessageHandler Consult Mode Tool Loop
 *
 * Story 33.2.2: Consult Mode Tool Loop
 * Story 34.1.3: ConsultToolLoopService Delegation
 *
 * After Epic 34, MessageHandler delegates tool loop execution to ConsultToolLoopService.
 * These tests verify:
 * 1. Tool loop gating conditions (mode, source, stopReason)
 * 2. Delegation to ConsultToolLoopService when conditions are met
 * 3. Non-delegation when conditions are not met
 * 4. Correct options passed to service
 * 5. Result handling from service
 */

import {
  MessageHandler,
  type StreamingOptions,
  type StreamingResult,
} from '../../src/infrastructure/websocket/handlers/MessageHandler.js';
import type { IAuthenticatedSocket } from '../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../src/application/services/ConversationService.js';
import type { FileContextBuilder } from '../../src/infrastructure/websocket/context/FileContextBuilder.js';
import type { IClaudeClient, StreamChunk, ToolUseBlock, ClaudeMessage, ToolResultBlock } from '../../src/application/interfaces/IClaudeClient.js';
import type { ToolUseRegistry } from '../../src/infrastructure/websocket/ToolUseRegistry.js';
import type { IConsultToolLoopService, ConsultToolLoopResult } from '../../src/infrastructure/websocket/services/IConsultToolLoopService.js';
import type { Message } from '../../src/domain/entities/Message.js';

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
 * Create a mock FileContextBuilder
 */
const createMockFileContextBuilder = (): jest.Mocked<FileContextBuilder> => ({
  build: jest.fn(),
  buildWithImages: jest.fn().mockResolvedValue({ textContext: '', imageBlocks: [] }),
  formatIntakeContextFile: jest.fn(),
  formatTextExcerptFile: jest.fn(),
} as unknown as jest.Mocked<FileContextBuilder>);

/**
 * Create a mock ClaudeClient
 */
const createMockClaudeClient = (): jest.Mocked<IClaudeClient> => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  continueWithToolResult: jest.fn(),
} as unknown as jest.Mocked<IClaudeClient>);

/**
 * Create a mock ToolUseRegistry
 */
const createMockToolRegistry = (): jest.Mocked<ToolUseRegistry> => ({
  register: jest.fn(),
  getHandler: jest.fn(),
  hasHandler: jest.fn(),
  getRegisteredTools: jest.fn(),
  dispatch: jest.fn(),
} as unknown as jest.Mocked<ToolUseRegistry>);

/**
 * Create a mock ConsultToolLoopService
 */
const createMockConsultToolLoopService = (): jest.Mocked<IConsultToolLoopService> => ({
  execute: jest.fn(),
} as unknown as jest.Mocked<IConsultToolLoopService>);

/**
 * Create a mock Message (for sendMessage response)
 */
const createMockMessage = (overrides?: Partial<Message>): Message => ({
  id: 'msg-123',
  conversationId: 'conv-1',
  role: 'assistant',
  content: { text: 'Hello from Claude' },
  createdAt: new Date('2025-01-15T10:00:00Z'),
  attachments: undefined,
  ...overrides,
} as Message);

/**
 * Create a mock authenticated socket
 */
const createMockSocket = (userId?: string, conversationId?: string): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-123',
  userId,
  userEmail: userId ? 'test@example.com' : undefined,
  userRole: userId ? 'analyst' : undefined,
  conversationId,
  data: {},
  handshake: {
    auth: {},
  },
  emit: jest.fn(),
  join: jest.fn(),
} as unknown as jest.Mocked<IAuthenticatedSocket>);

/**
 * Helper to create an async generator from chunks
 */
async function* createChunkGenerator(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('MessageHandler Tool Loop', () => {
  let handler: MessageHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockFileContextBuilder: jest.Mocked<FileContextBuilder>;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockToolRegistry: jest.Mocked<ToolUseRegistry>;
  let mockConsultToolLoopService: jest.Mocked<IConsultToolLoopService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockFileContextBuilder = createMockFileContextBuilder();
    mockClaudeClient = createMockClaudeClient();
    mockToolRegistry = createMockToolRegistry();
    mockConsultToolLoopService = createMockConsultToolLoopService();

    // Story 36.1.2: MessageHandler now has 5 params (no fileRepository/rateLimiter)
    handler = new MessageHandler(
      mockConversationService,
      mockFileContextBuilder,
      mockClaudeClient,
      mockToolRegistry,
      mockConsultToolLoopService
    );

    mockSocket = createMockSocket('user-123');

    // Default: sendMessage returns a message
    mockConversationService.sendMessage.mockResolvedValue(createMockMessage());

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Tool Loop Delegation', () => {
    it('should delegate to ConsultToolLoopService when tool_use in consult mode', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test query' },
      };

      // First stream: returns tool_use
      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Mock service response
      const mockToolLoopResult: ConsultToolLoopResult = {
        fullResponse: 'Based on the search, here is your answer.',
        toolUseBlocks: [],
        savedMessageId: 'msg-123',
        wasAborted: false,
        stopReason: 'end_turn',
      };
      mockConsultToolLoopService.execute.mockResolvedValue(mockToolLoopResult);

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'system prompt',
        options
      );

      // Service was called
      expect(mockConsultToolLoopService.execute).toHaveBeenCalled();

      // Result from service
      expect(result.fullResponse).toBe('Based on the search, here is your answer.');
      expect(result.toolUseBlocks).toEqual([]);
      expect(result.savedMessageId).toBe('msg-123');
    });

    it('should pass correct options to service', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-123',
        name: 'web_search',
        input: { query: 'HIPAA compliance' },
      };

      const chunks: StreamChunk[] = [
        { content: 'Initial text', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockConsultToolLoopService.execute.mockResolvedValue({
        fullResponse: 'Answer',
        toolUseBlocks: [],
        savedMessageId: 'msg-123',
        wasAborted: false,
        stopReason: 'end_turn',
      });

      const tools = [{ name: 'web_search', description: 'Search', input_schema: { type: 'object' as const, properties: {} } }];
      const messages: ClaudeMessage[] = [{ role: 'user', content: 'Search for HIPAA' }];

      await handler.streamClaudeResponse(mockSocket, 'conv-1', messages, 'system prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
        tools,
      });

      // Verify options passed to service
      expect(mockConsultToolLoopService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          socket: mockSocket,
          conversationId: 'conv-1',
          originalMessages: messages,
          firstResponse: 'Initial text',
          toolUseBlocks: [toolUseBlock],
          systemPrompt: 'system prompt',
          claudeOptions: expect.objectContaining({ tools }),
        })
      );
    });

    it('should include stopReason in StreamingResult', async () => {
      const chunks: StreamChunk[] = [
        { content: 'Hello', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const options: StreamingOptions = {
        enableTools: false,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'system prompt',
        options
      );

      expect(result.stopReason).toBe('end_turn');
    });
  });

  describe('Mode Gating', () => {
    it('should delegate to service in consult mode with tool_use', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockConsultToolLoopService.execute.mockResolvedValue({
        fullResponse: 'Final',
        toolUseBlocks: [],
        savedMessageId: 'msg-123',
        wasAborted: false,
        stopReason: 'end_turn',
      });

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      expect(mockConsultToolLoopService.execute).toHaveBeenCalled();
    });

    it('should NOT delegate in assessment mode', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'questionnaire_ready',
        input: {},
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'assessment',
        source: 'user_input',
      });

      // Service NOT called for assessment mode
      expect(mockConsultToolLoopService.execute).not.toHaveBeenCalled();

      // Tool use blocks returned for ChatServer to handle
      expect(result.toolUseBlocks).toEqual([toolUseBlock]);
    });

    it('should NOT delegate in scoring mode', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'some_tool',
        input: {},
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: false,
        mode: 'scoring',
        source: 'user_input',
      });

      expect(mockConsultToolLoopService.execute).not.toHaveBeenCalled();
      expect(result.toolUseBlocks).toEqual([toolUseBlock]);
    });
  });

  describe('Source Gating', () => {
    it('should NOT delegate when source is auto_summarize', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'auto_summarize',
      });

      expect(mockConsultToolLoopService.execute).not.toHaveBeenCalled();
      expect(result.toolUseBlocks).toEqual([toolUseBlock]);
    });

    it('should delegate when source is user_input', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockConsultToolLoopService.execute.mockResolvedValue({
        fullResponse: 'Final',
        toolUseBlocks: [],
        savedMessageId: 'msg-123',
        wasAborted: false,
        stopReason: 'end_turn',
      });

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      expect(mockConsultToolLoopService.execute).toHaveBeenCalled();
    });
  });

  describe('StopReason Gating', () => {
    it('should NOT delegate when stopReason is not tool_use', async () => {
      const chunks: StreamChunk[] = [
        { content: 'Hello', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      expect(mockConsultToolLoopService.execute).not.toHaveBeenCalled();
    });

    it('should NOT delegate when no tool_use blocks', async () => {
      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      expect(mockConsultToolLoopService.execute).not.toHaveBeenCalled();
    });
  });

  describe('Double Handling Prevention', () => {
    it('should return empty toolUseBlocks after service handles them', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockConsultToolLoopService.execute.mockResolvedValue({
        fullResponse: 'Answer',
        toolUseBlocks: [],
        savedMessageId: 'msg-123',
        wasAborted: false,
        stopReason: 'end_turn',
      });

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      // toolUseBlocks should be empty to prevent ChatServer from also dispatching
      expect(result.toolUseBlocks).toEqual([]);
    });
  });

  describe('Service Result Handling', () => {
    it('should propagate wasAborted from service', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockConsultToolLoopService.execute.mockResolvedValue({
        fullResponse: 'Partial',
        toolUseBlocks: [],
        savedMessageId: null,
        wasAborted: true,
        stopReason: undefined,
      });

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      expect(result.wasAborted).toBe(true);
    });

    it('should propagate savedMessageId from service', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockConsultToolLoopService.execute.mockResolvedValue({
        fullResponse: 'Final answer',
        toolUseBlocks: [],
        savedMessageId: 'saved-msg-456',
        wasAborted: false,
        stopReason: 'end_turn',
      });

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      });

      expect(result.savedMessageId).toBe('saved-msg-456');
    });
  });
});
