/**
 * Unit Tests for MessageHandler Assistant Done Gating - Edge Cases
 *
 * Story 33.2.4: Assistant Done Gating
 *
 * Tests cover:
 * 1. Tool handler failure still results in assistant_done after error recovery
 * 2. Tool handler failure saves graceful error response (not empty)
 * 3. Second stream failure handled gracefully
 */

import {
  MessageHandler,
  type StreamingOptions,
  type StreamingResult,
} from '../../src/infrastructure/websocket/handlers/MessageHandler.js';
import type { IAuthenticatedSocket } from '../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../src/application/services/ConversationService.js';
import type { IFileRepository } from '../../src/application/interfaces/IFileRepository.js';
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
  data: {
    abortRequested: false,
  },
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

/**
 * Helper to create a generator that throws an error
 */
async function* createErrorGenerator(error: Error): AsyncGenerator<StreamChunk> {
  throw error;
}

describe('MessageHandler Assistant Done Gating - Edge Cases', () => {
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

  describe('Tool handler failure recovery', () => {
    it('should emit assistant_done after error recovery when tool handler fails', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Tool dispatch returns error
      mockToolRegistry.dispatch.mockResolvedValue({
        handled: false,
        error: 'Search service unavailable',
      });

      // Claude should receive the error and provide a graceful response
      const secondStreamChunks: StreamChunk[] = [
        { content: "I apologize, but I couldn't complete the search. ", isComplete: false },
        { content: 'Based on my knowledge...', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should emit assistant_done with the graceful error response
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      const payload = assistantDoneCalls[0][1] as { fullText: string };
      expect(payload.fullText).toContain("I apologize");
      expect(payload.fullText).toContain('Based on my knowledge');
    });

    it('should save graceful error response (not empty) when tool handler fails', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'healthcare regulations' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Tool dispatch returns network error
      mockToolRegistry.dispatch.mockResolvedValue({
        handled: false,
        error: 'Network timeout after 30s',
      });

      // Claude provides fallback response
      const secondStreamChunks: StreamChunk[] = [
        { content: 'While I could not search for current information, ', isComplete: false },
        { content: 'here is what I know about healthcare regulations...', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should save a non-empty message
      expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(1);

      const savedMessage = mockConversationService.sendMessage.mock.calls[0][0];
      expect(savedMessage.content.text).not.toBe('');
      expect(savedMessage.content.text).toContain('healthcare regulations');
    });

    it('should pass error message to Claude via tool_result for graceful handling', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Tool dispatch returns specific error
      mockToolRegistry.dispatch.mockResolvedValue({
        handled: false,
        error: 'Rate limit exceeded for Jina API',
      });

      const secondStreamChunks: StreamChunk[] = [
        { content: 'Answer', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Verify continueWithToolResult was called with the error message
      expect(mockClaudeClient.continueWithToolResult).toHaveBeenCalledWith(
        [],
        [toolUseBlock],
        [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'Rate limit exceeded for Jina API',
          },
        ],
        expect.any(Object)
      );
    });
  });

  describe('Second stream failure', () => {
    it('should handle second stream failure gracefully', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      // Second stream throws an error
      mockClaudeClient.continueWithToolResult.mockReturnValue(
        createErrorGenerator(new Error('Claude API error'))
      );

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should handle error gracefully (not throw)
      expect(result.fullResponse).toBe('');

      // Should emit tool_status 'idle' even on error
      const toolStatusCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'tool_status'
      );
      const idleCalls = toolStatusCalls.filter(
        call => (call[1] as { status: string }).status === 'idle'
      );
      expect(idleCalls.length).toBeGreaterThan(0);

      // Should save and emit a system error message for the user
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'system',
          content: expect.objectContaining({
            text: expect.stringContaining('error'),
          }),
        })
      );

      // Should emit a message event with the error
      const messageCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'message'
      );
      expect(messageCalls.length).toBeGreaterThan(0);
    });

    it('should not emit assistant_done when second stream fails completely', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      // Second stream throws an error
      mockClaudeClient.continueWithToolResult.mockReturnValue(
        createErrorGenerator(new Error('Connection reset'))
      );

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should NOT emit assistant_done on complete failure
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(0);
    });
  });

  describe('Multiple tools in single request', () => {
    it('should handle multiple tool uses correctly', async () => {
      const toolUseBlocks: ToolUseBlock[] = [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'web_search',
          input: { query: 'HIPAA requirements' },
        },
        {
          type: 'tool_use',
          id: 'tool-2',
          name: 'web_search',
          input: { query: 'HITRUST certification' },
        },
      ];

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: toolUseBlocks, stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Both tools return successfully
      mockToolRegistry.dispatch
        .mockResolvedValueOnce({
          handled: true,
          toolResult: { toolUseId: 'tool-1', content: 'HIPAA results...' },
        })
        .mockResolvedValueOnce({
          handled: true,
          toolResult: { toolUseId: 'tool-2', content: 'HITRUST results...' },
        });

      const secondStreamChunks: StreamChunk[] = [
        { content: 'Based on both searches, here is the comparison...', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Both tools should be dispatched
      expect(mockToolRegistry.dispatch).toHaveBeenCalledTimes(2);

      // Should emit exactly one assistant_done
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      // Should save exactly one message
      expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle partial tool failure in multi-tool request', async () => {
      const toolUseBlocks: ToolUseBlock[] = [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'web_search',
          input: { query: 'working query' },
        },
        {
          type: 'tool_use',
          id: 'tool-2',
          name: 'web_search',
          input: { query: 'failing query' },
        },
      ];

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: toolUseBlocks, stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // First tool succeeds, second fails
      mockToolRegistry.dispatch
        .mockResolvedValueOnce({
          handled: true,
          toolResult: { toolUseId: 'tool-1', content: 'Success results' },
        })
        .mockResolvedValueOnce({
          handled: false,
          error: 'Search failed for this query',
        });

      const secondStreamChunks: StreamChunk[] = [
        { content: 'One search succeeded, one failed. Here is what I found...', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should still complete successfully
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      // Verify both tool results were passed to Claude
      expect(mockClaudeClient.continueWithToolResult).toHaveBeenCalledWith(
        [],
        toolUseBlocks,
        [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'Success results' },
          { type: 'tool_result', tool_use_id: 'tool-2', content: 'Search failed for this query' },
        ],
        expect.any(Object)
      );
    });
  });

  describe('Empty response handling', () => {
    it('should not save empty final response after tool loop', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      mockToolRegistry.dispatch.mockResolvedValue({
        handled: true,
        toolResult: { toolUseId: 'tool-1', content: 'results' },
      });

      // Second stream returns empty response
      const secondStreamChunks: StreamChunk[] = [
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.continueWithToolResult.mockReturnValue(createChunkGenerator(secondStreamChunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Empty response should not be saved
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
      expect(result.savedMessageId).toBeNull();

      // assistant_done should still be emitted (but with null messageId)
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      const payload = assistantDoneCalls[0][1] as { messageId: string | null };
      expect(payload.messageId).toBeNull();
    });
  });
});
