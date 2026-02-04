/**
 * Unit Tests for MessageHandler Assistant Done Gating
 *
 * Story 33.2.4: Assistant Done Gating
 *
 * Tests cover:
 * 1. assistant_done NOT emitted when stop_reason is 'tool_use' and mode is 'consult'
 * 2. assistant_done IS emitted after continueAfterToolUse completes
 * 3. assistant_done IS emitted normally when stop_reason is 'end_turn'
 * 4. Only one assistant_done emitted per user message (no duplicates)
 * 5. Assessment mode assistant_done unaffected
 * 6. Streaming tokens still emitted before tool_use
 * 7. No intermediate assistant message persisted on tool_use
 * 8. Exactly one assistant message persisted after tool_result processing
 * 9. Persisted message contains final response text (not pre-tool text)
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
import type { IConsultToolLoopService } from '../../src/infrastructure/websocket/services/IConsultToolLoopService.js';
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
 * Create a mock ConsultToolLoopService
 * Story 34.1.3: Added for ConsultToolLoopService delegation
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

describe('MessageHandler Assistant Done Gating', () => {
  let handler: MessageHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockFileContextBuilder: jest.Mocked<FileContextBuilder>;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockToolRegistry: jest.Mocked<ToolUseRegistry>;
  let mockConsultToolLoopService: jest.Mocked<IConsultToolLoopService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockFileRepository = createMockFileRepository();
    mockRateLimiter = createMockRateLimiter();
    mockFileContextBuilder = createMockFileContextBuilder();
    mockClaudeClient = createMockClaudeClient();
    mockToolRegistry = createMockToolRegistry();
    mockConsultToolLoopService = createMockConsultToolLoopService();

    // Create handler with ToolUseRegistry and ConsultToolLoopService
    handler = new MessageHandler(
      mockConversationService,
      mockFileRepository,
      mockRateLimiter,
      mockFileContextBuilder,
      mockClaudeClient,
      undefined, // fileStorage
      undefined, // intakeParser
      undefined, // titleGenerationService
      mockToolRegistry,
      mockConsultToolLoopService
    );

    mockSocket = createMockSocket('user-123');

    // Default: not rate limited
    mockRateLimiter.isRateLimited.mockReturnValue(false);

    // Default: sendMessage returns a message
    mockConversationService.sendMessage.mockResolvedValue(createMockMessage());

    // Story 34.1.4: Default mock for ConsultToolLoopService
    // When the tool loop is triggered, it handles all events internally
    // Set up a default mock that emits events and returns expected results
    mockConsultToolLoopService.execute.mockImplementation(async (options) => {
      // Emit assistant_done as the service would
      options.socket.emit('assistant_done', {
        messageId: 'msg-123',
        conversationId: options.conversationId,
        fullText: 'Final response from tool loop',
        assessmentId: null,
      });
      return {
        fullResponse: 'Final response from tool loop',
        toolUseBlocks: [],
        savedMessageId: 'msg-123',
        wasAborted: false,
        stopReason: 'end_turn' as const,
      };
    });

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('assistant_done emission gating', () => {
    it('should NOT emit assistant_done when stop_reason is tool_use in consult mode', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test query' },
      };

      // First stream: returns tool_use with some pre-tool text
      const firstStreamChunks: StreamChunk[] = [
        { content: 'Let me search for that...', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Story 34.1.4: Mock ConsultToolLoopService to return the expected final response
      // The service handles tool dispatch, continuation, and event emission internally
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        // Service emits assistant_done with the final response (not pre-tool text)
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Based on the search results, here is your answer.',
          assessmentId: null,
        });
        return {
          fullResponse: 'Based on the search results, here is your answer.',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'system prompt',
        options
      );

      // Get all assistant_done emissions
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );

      // Should have exactly ONE assistant_done (from ConsultToolLoopService)
      expect(assistantDoneCalls).toHaveLength(1);

      // The assistant_done should contain the FINAL response text
      const emittedPayload = assistantDoneCalls[0][1] as { fullText: string };
      expect(emittedPayload.fullText).toBe('Based on the search results, here is your answer.');

      // Should NOT contain the pre-tool text
      expect(emittedPayload.fullText).not.toContain('Let me search for that');
    });

    it('should emit assistant_done after continueAfterToolUse completes', async () => {
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

      // Story 34.1.4: Mock ConsultToolLoopService
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Final answer from tool results',
          assessmentId: null,
        });
        return {
          fullResponse: 'Final answer from tool results',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Verify assistant_done was emitted
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      // Verify it contains the final response
      const payload = assistantDoneCalls[0][1] as { fullText: string; messageId: string };
      expect(payload.fullText).toBe('Final answer from tool results');
      expect(payload.messageId).toBe('msg-123');
    });

    it('should emit assistant_done normally when stop_reason is end_turn', async () => {
      const chunks: StreamChunk[] = [
        { content: 'Hello, ', isComplete: false },
        { content: 'how can I help?', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const options: StreamingOptions = {
        enableTools: false,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      const payload = assistantDoneCalls[0][1] as { fullText: string };
      expect(payload.fullText).toBe('Hello, how can I help?');
    });

    it('should emit exactly one assistant_done per user message (no duplicates)', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: 'Searching...', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Story 34.1.4: Mock ConsultToolLoopService
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Here is the answer.',
          assessmentId: null,
        });
        return {
          fullResponse: 'Here is the answer.',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );

      // CRITICAL: Only ONE assistant_done should be emitted
      expect(assistantDoneCalls).toHaveLength(1);
    });
  });

  describe('Mode-specific behavior preservation', () => {
    it('should emit assistant_done normally in assessment mode with tool_use', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'questionnaire_ready',
        input: {},
      };

      const chunks: StreamChunk[] = [
        { content: 'Assessment response', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'assessment',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Assessment mode should emit assistant_done even with tool_use
      // (because tool loop is NOT executed for assessment mode)
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      // Tool registry should NOT be called (assessment tools handled by ChatServer)
      expect(mockToolRegistry.dispatch).not.toHaveBeenCalled();
    });

    it('should emit assistant_done normally in scoring mode', async () => {
      const chunks: StreamChunk[] = [
        { content: 'Scoring response', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const options: StreamingOptions = {
        enableTools: false,
        mode: 'scoring',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);
    });
  });

  describe('Streaming token emission', () => {
    it('should still emit streaming tokens during initial response before tool_use', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: 'Let me ', isComplete: false },
        { content: 'search ', isComplete: false },
        { content: 'for that.', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Story 34.1.4: Mock ConsultToolLoopService to emit second stream tokens
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        // Service emits tokens from the second stream (tool continuation)
        options.socket.emit('assistant_token', { conversationId: options.conversationId, token: 'Answer.' });
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Answer.',
          assessmentId: null,
        });
        return {
          fullResponse: 'Answer.',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Get all assistant_token emissions
      const tokenCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_token'
      );

      // Should have tokens from BOTH first stream and second stream
      const tokenTexts = tokenCalls.map(call => (call[1] as { token: string }).token);

      // First stream tokens (emitted by MessageHandler)
      expect(tokenTexts).toContain('Let me ');
      expect(tokenTexts).toContain('search ');
      expect(tokenTexts).toContain('for that.');

      // Second stream tokens (emitted by ConsultToolLoopService mock)
      expect(tokenTexts).toContain('Answer.');
    });
  });

  describe('Message persistence gating', () => {
    it('should NOT persist intermediate assistant message on tool_use', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: 'Pre-tool text that should NOT be saved', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Story 34.1.4: ConsultToolLoopService handles message persistence
      // MessageHandler should NOT call sendMessage when tool loop is triggered
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Final answer',
          assessmentId: null,
        });
        return {
          fullResponse: 'Final answer',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // MessageHandler should NOT call sendMessage when tool loop is delegated
      // Message persistence is handled by ConsultToolLoopService
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('should persist exactly one assistant message after tool_result processing', async () => {
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

      // Story 34.1.4: ConsultToolLoopService saves exactly one message
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'The answer is 42.',
          assessmentId: null,
        });
        return {
          fullResponse: 'The answer is 42.',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // MessageHandler does not persist message when tool loop is delegated
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();

      // Result includes the saved message ID from the service
      expect(result.savedMessageId).toBe('msg-123');
    });

    it('should persist message with final response text (not pre-tool text)', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'HIPAA requirements' },
      };

      // First stream has some "thinking" text before tool_use
      const firstStreamChunks: StreamChunk[] = [
        { content: 'I will search for HIPAA info...', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Story 34.1.4: ConsultToolLoopService persists final response (not pre-tool text)
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Based on my search, HIPAA requires organizations to...',
          assessmentId: null,
        });
        return {
          fullResponse: 'Based on my search, HIPAA requires organizations to...',
          toolUseBlocks: [],
          savedMessageId: 'msg-123',
          wasAborted: false,
          stopReason: 'end_turn' as const,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // MessageHandler does not persist message when tool loop is delegated
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();

      // Verify the result contains the final response (not pre-tool text)
      expect(result.fullResponse).toBe('Based on my search, HIPAA requires organizations to...');
    });
  });

  describe('Non-tool flow behavior (regression)', () => {
    it('should persist message normally when no tools are used', async () => {
      const chunks: StreamChunk[] = [
        { content: 'Hello, ', isComplete: false },
        { content: 'I can help you.', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const options: StreamingOptions = {
        enableTools: false,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Message should be persisted
      expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: 'Hello, I can help you.' },
      });

      // assistant_done should be emitted
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);
    });

    it('should persist message in assessment mode even with tool_use', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'questionnaire_ready',
        input: {},
      };

      const chunks: StreamChunk[] = [
        { content: 'Assessment complete.', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(chunks));

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'assessment',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Message should be persisted (assessment mode doesn't use tool loop)
      expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: 'Assessment complete.' },
      });
    });
  });
});
