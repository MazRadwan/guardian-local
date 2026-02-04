/**
 * Unit Tests for MessageHandler Consult Mode Tool Loop
 *
 * Story 33.2.2: Consult Mode Tool Loop
 *
 * Tests cover:
 * 1. Detects stop_reason: tool_use in streaming result
 * 2. Only processes tool loop when mode is 'consult'
 * 3. Skips tool loop for assessment mode (let existing handler handle)
 * 4. Calls ToolUseRegistry.dispatch with correct input and context
 * 5. Calls continueWithToolResult with tool_result blocks
 * 6. Streams final response after tool_result
 * 7. Handles tool execution errors gracefully
 * 8. Limits to 1 tool loop iteration
 * 9. Does not double-emit assistant_done
 * 10. MessageHandler receives ToolUseRegistry via constructor
 * 11. ChatServer doesn't dispatch consult tool_use in parallel (toolUseBlocks returned empty)
 * 12. StreamingResult includes stopReason field
 * 13. StreamingOptions includes mode field
 */

import {
  MessageHandler,
  type StreamingOptions,
  type StreamingResult,
} from '../../src/infrastructure/websocket/handlers/MessageHandler.js';
import type { IAuthenticatedSocket } from '../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../src/application/services/ConversationService.js';
import type { IFileRepository, FileRecord } from '../../src/application/interfaces/IFileRepository.js';
import type { RateLimiter } from '../../src/infrastructure/websocket/RateLimiter.js';
import type { FileContextBuilder } from '../../src/infrastructure/websocket/context/FileContextBuilder.js';
import type { IClaudeClient, StreamChunk, ToolUseBlock, ClaudeMessage, ToolResultBlock } from '../../src/application/interfaces/IClaudeClient.js';
import type { ToolUseRegistry } from '../../src/infrastructure/websocket/ToolUseRegistry.js';
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
 * Create a mock IFileRepository
 */
const createMockFileRepository = (): jest.Mocked<IFileRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIds: jest.fn(),
  findByIdAndUser: jest.fn(),
  findByIdAndConversation: jest.fn(),
  updateIntakeContext: jest.fn(),
  findByConversationWithContext: jest.fn(),
  updateTextExcerpt: jest.fn(),
  updateExcerptAndClassification: jest.fn(),
  updateParseStatus: jest.fn(),
  tryStartParsing: jest.fn(),
  findByConversationWithExcerpt: jest.fn(),
  deleteByConversationId: jest.fn(),
} as unknown as jest.Mocked<IFileRepository>);

/**
 * Create a mock RateLimiter
 */
const createMockRateLimiter = (): jest.Mocked<RateLimiter> => ({
  isRateLimited: jest.fn(),
  getRemaining: jest.fn(),
  getResetTime: jest.fn(),
  reset: jest.fn(),
} as unknown as jest.Mocked<RateLimiter>);

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
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockFileContextBuilder: jest.Mocked<FileContextBuilder>;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockToolRegistry: jest.Mocked<ToolUseRegistry>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockFileRepository = createMockFileRepository();
    mockRateLimiter = createMockRateLimiter();
    mockFileContextBuilder = createMockFileContextBuilder();
    mockClaudeClient = createMockClaudeClient();
    mockToolRegistry = createMockToolRegistry();

    // Create handler with ToolUseRegistry
    handler = new MessageHandler(
      mockConversationService,
      mockFileRepository,
      mockRateLimiter,
      mockFileContextBuilder,
      mockClaudeClient,
      undefined, // fileStorage
      undefined, // intakeParser
      undefined, // titleGenerationService
      mockToolRegistry
    );

    mockSocket = createMockSocket('user-123');

    // Default: not rate limited
    mockRateLimiter.isRateLimited.mockReturnValue(false);

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

  describe('Tool Loop Detection', () => {
    it('should detect stop_reason: tool_use in streaming result', async () => {
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

      // Tool dispatch returns success
      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: {
          toolUseId: 'tool-1',
          content: 'Search results here',
        },
      });

      // Second stream: final response
      const secondStreamChunks: StreamChunk[] = [
        { content: 'Based on the search, ', isComplete: false },
        { content: 'here is your answer.', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

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

      // Tool loop was triggered
      expect(mockToolRegistry.dispatch).toHaveBeenCalled();
      expect(mockClaudeClient.continueWithToolResult).toHaveBeenCalled();

      // Result has final response
      expect(result.fullResponse).toBe('Based on the search, here is your answer.');

      // toolUseBlocks should be empty (handled internally)
      expect(result.toolUseBlocks).toEqual([]);
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
    it('should only process tool loop when mode is consult', async () => {
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

      // Test with consult mode
      const consultOptions: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'result' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Final', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', consultOptions);

      // Tool loop triggered for consult mode
      expect(mockToolRegistry.dispatch).toHaveBeenCalled();
    });

    it('should skip tool loop for assessment mode', async () => {
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

      const assessmentOptions: StreamingOptions = {
        enableTools: true,
        mode: 'assessment',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'prompt',
        assessmentOptions
      );

      // Tool loop NOT triggered for assessment mode
      expect(mockToolRegistry.dispatch).not.toHaveBeenCalled();

      // Tool use blocks returned for ChatServer to handle
      expect(result.toolUseBlocks).toEqual([toolUseBlock]);
    });

    it('should skip tool loop for scoring mode', async () => {
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

      const scoringOptions: StreamingOptions = {
        enableTools: false,
        mode: 'scoring',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'prompt',
        scoringOptions
      );

      // Tool loop NOT triggered for scoring mode
      expect(mockToolRegistry.dispatch).not.toHaveBeenCalled();
      expect(result.toolUseBlocks).toEqual([toolUseBlock]);
    });
  });

  describe('Source Gating', () => {
    it('should skip tool loop when source is auto_summarize', async () => {
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

      const autoSummarizeOptions: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'auto_summarize',  // Not user_input
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'prompt',
        autoSummarizeOptions
      );

      // Tool loop NOT triggered when source is auto_summarize
      expect(mockToolRegistry.dispatch).not.toHaveBeenCalled();
      expect(result.toolUseBlocks).toEqual([toolUseBlock]);
    });

    it('should trigger tool loop when source is user_input', async () => {
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

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'result' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Final', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const userInputOptions: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', userInputOptions);

      // Tool loop triggered
      expect(mockToolRegistry.dispatch).toHaveBeenCalled();
    });
  });

  describe('Tool Dispatch', () => {
    it('should call ToolUseRegistry.dispatch with correct input and context', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-123',
        name: 'web_search',
        input: { query: 'HIPAA compliance requirements' },
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-123', content: 'Search results' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Answer', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Verify dispatch was called with correct arguments
      expect(mockToolRegistry.dispatch).toHaveBeenCalledWith(
        {
          toolName: 'web_search',
          toolUseId: 'tool-123',
          input: { query: 'HIPAA compliance requirements' },
        },
        {
          conversationId: 'conv-1',
          userId: 'user-123',
          assessmentId: null,
          mode: 'consult',
        }
      );
    });

    it('should call continueWithToolResult with tool results', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstChunks));

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'Search results content' },
      });

      const secondChunks: StreamChunk[] = [
        { content: 'Final answer', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondChunks));

      const messages: ClaudeMessage[] = [{ role: 'user', content: 'Search for something' }];

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', messages, 'system prompt', options);

      // Verify continueWithToolResult was called
      expect(mockClaudeClient.continueWithToolResult).toHaveBeenCalledWith(
        messages,
        [toolUseBlock],
        [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'Search results content',
          },
        ],
        expect.objectContaining({
          systemPrompt: 'system prompt',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors gracefully', async () => {
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

      // Tool dispatch returns error
      mockToolRegistry.dispatch.mockResolvedValue({
        handled: false,
        error: 'Network timeout',
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Based on my knowledge...', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'prompt',
        options
      );

      // Should still complete with final response
      expect(result.fullResponse).toBe('Based on my knowledge...');

      // continueWithToolResult should be called with error message as tool_result
      expect(mockClaudeClient.continueWithToolResult).toHaveBeenCalledWith(
        [],
        [toolUseBlock],
        [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'Network timeout',
          },
        ],
        expect.any(Object)
      );
    });

    it('should handle unhandled tool gracefully', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'unknown_tool',
        input: {},
      };

      const chunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      // Tool not handled
      mockToolRegistry.dispatch.mockResolvedValue({
        handled: false,
      });

      const continueChunks: StreamChunk[] = [
        { content: 'I will answer without tools.', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'prompt',
        options
      );

      expect(result.fullResponse).toBe('I will answer without tools.');
    });
  });

  describe('Event Emission', () => {
    it('should emit tool_status events during tool loop', async () => {
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

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Done', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should emit tool_status events
      const emitCalls = mockSocket.emit.mock.calls;
      const toolStatusCalls = emitCalls.filter(call => call[0] === 'tool_status');

      expect(toolStatusCalls.length).toBeGreaterThanOrEqual(2);
      expect(toolStatusCalls.some(call => (call[1] as { status: string }).status === 'searching')).toBe(true);
      expect(toolStatusCalls.some(call => (call[1] as { status: string }).status === 'idle')).toBe(true);
    });

    it('should not double-emit assistant_done', async () => {
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

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Final answer', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should emit assistant_done exactly once
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);
    });
  });

  describe('Double Handling Prevention', () => {
    it('should return empty toolUseBlocks after handling in tool loop', async () => {
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

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Answer', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'prompt',
        options
      );

      // toolUseBlocks should be empty to prevent ChatServer from also dispatching
      expect(result.toolUseBlocks).toEqual([]);
    });
  });

  describe('Message Persistence', () => {
    it('should only persist final message after tool loop', async () => {
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

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      const continueChunks: StreamChunk[] = [
        { content: 'Final response text', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(continueChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // sendMessage should be called once (only for final response)
      expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: 'Final response text' },
      });
    });
  });
});
