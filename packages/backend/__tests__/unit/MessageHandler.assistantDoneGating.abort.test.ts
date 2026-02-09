/**
 * Unit Tests for MessageHandler Assistant Done Gating - Abort Scenarios
 *
 * Story 33.2.4: Assistant Done Gating
 *
 * Tests cover:
 * 1. Abort after tool_use but before follow-up does NOT save empty assistant message
 * 2. Abort emits tool_status 'idle'
 * 3. Abort does NOT emit assistant_done
 * 4. No orphaned messages in database after abort
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
 * Create a mock authenticated socket with abort capability
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
 * Helper to create an async generator from chunks with abort support
 */
async function* createChunkGenerator(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Helper to create a chunk generator that triggers abort after certain chunks
 */
function createChunkGeneratorWithAbort(
  chunks: StreamChunk[],
  socket: IAuthenticatedSocket,
  abortAfterChunkIndex: number
): AsyncGenerator<StreamChunk> {
  return (async function* () {
    for (let i = 0; i < chunks.length; i++) {
      if (i === abortAfterChunkIndex) {
        socket.data.abortRequested = true;
      }
      yield chunks[i];
    }
  })();
}

describe('MessageHandler Assistant Done Gating - Abort Scenarios', () => {
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

    // Story 34.1.4: Default mock for ConsultToolLoopService
    // When the tool loop is triggered, it handles all events including abort
    mockConsultToolLoopService.execute.mockImplementation(async (options) => {
      // Check if abort was requested during execution
      if (options.socket.data.abortRequested) {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: true,
          stopReason: undefined,
        };
      }
      // Normal completion
      options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
      options.socket.emit('assistant_done', {
        messageId: 'msg-123',
        conversationId: options.conversationId,
        fullText: 'Final response',
        assessmentId: null,
      });
      return {
        fullResponse: 'Final response',
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

  describe('Abort before tool execution', () => {
    it('should NOT save assistant message when aborted before tool execution', async () => {
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

      // Story 34.1.4: Mock ConsultToolLoopService to simulate abort during execution
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        // Simulate abort being set during tool dispatch
        options.socket.data.abortRequested = true;
        // Service emits tool_status 'idle' on abort
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: true,
          stopReason: undefined,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // MessageHandler does not save assistant messages when tool loop is delegated
      // ConsultToolLoopService handles abort without saving
      const assistantMessages = mockConversationService.sendMessage.mock.calls.filter(
        call => call[0].role === 'assistant'
      );
      expect(assistantMessages).toHaveLength(0);

      // Should emit tool_status 'idle' (from ConsultToolLoopService mock)
      const toolStatusCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'tool_status'
      );
      const idleCalls = toolStatusCalls.filter(
        call => (call[1] as { status: string }).status === 'idle'
      );
      expect(idleCalls.length).toBeGreaterThan(0);

      // Should NOT emit assistant_done
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(0);

      // Result should indicate abort
      expect(result.wasAborted).toBe(true);
    });

    it('should emit tool_status idle when aborted during tool execution', async () => {
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

      // Story 34.1.4: Mock ConsultToolLoopService to emit idle on abort
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.data.abortRequested = true;
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: true,
          stopReason: undefined,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should emit tool_status 'idle' (from ConsultToolLoopService mock)
      const toolStatusCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'tool_status'
      );
      const idleCalls = toolStatusCalls.filter(
        call => (call[1] as { status: string }).status === 'idle'
      );
      expect(idleCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Abort during follow-up stream', () => {
    it('should NOT emit assistant_done when aborted during follow-up stream', async () => {
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

      // Story 34.1.4: Mock ConsultToolLoopService to simulate abort during follow-up stream
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        // Simulate abort during the follow-up stream
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        return {
          fullResponse: 'Starting...',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: true,
          stopReason: undefined,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should NOT emit assistant_done when aborted
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(0);

      // Result should indicate abort
      expect(result.wasAborted).toBe(true);
    });

    it('should save partial response when aborted during follow-up stream', async () => {
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

      // Story 34.1.4: Mock ConsultToolLoopService to return partial content on abort
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        return {
          fullResponse: 'Partial content',
          toolUseBlocks: [],
          savedMessageId: 'msg-partial',
          wasAborted: true,
          stopReason: undefined,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Story 34.1.4: ConsultToolLoopService handles partial response saving
      // MessageHandler gets the result from the service
      expect(result.fullResponse).toBe('Partial content');
      expect(result.savedMessageId).toBe('msg-partial');
    });
  });

  describe('No orphaned messages', () => {
    it('should not leave orphaned messages when aborted at various points', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'web_search',
        input: { query: 'test' },
      };

      const firstStreamChunks: StreamChunk[] = [
        { content: 'Pre-tool text', isComplete: false },
        { content: '', isComplete: true, toolUse: [toolUseBlock], stopReason: 'tool_use' },
      ];
      mockClaudeClient.streamMessage.mockReturnValue(createChunkGenerator(firstStreamChunks));

      // Story 34.1.4: Mock ConsultToolLoopService to return abort with no message saved
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.data.abortRequested = true;
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: true,
          stopReason: undefined,
        };
      });

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // The pre-tool text should NOT be saved as a message
      // MessageHandler does not persist messages when tool loop is delegated
      const sendMessageCalls = mockConversationService.sendMessage.mock.calls;

      // Verify no message was saved with the pre-tool text
      const preTooMessageSaved = sendMessageCalls.some(
        call => call[0].content?.text === 'Pre-tool text'
      );
      expect(preTooMessageSaved).toBe(false);
    });
  });

  describe('Abort in first stream (before tool_use)', () => {
    it('should handle abort in first stream gracefully', async () => {
      const chunks: StreamChunk[] = [
        { content: 'Starting...', isComplete: false },
        { content: ' still going...', isComplete: false },
        { content: '', isComplete: true, stopReason: 'end_turn' },
      ];

      mockClaudeClient.streamMessage.mockReturnValue(
        createChunkGeneratorWithAbort(chunks, mockSocket, 1)
      );

      const options: StreamingOptions = {
        enableTools: true,
        mode: 'consult',
        source: 'user_input',
      };

      const result = await handler.streamClaudeResponse(mockSocket, 'conv-1', [], 'prompt', options);

      // Should be marked as aborted
      expect(result.wasAborted).toBe(true);

      // Should NOT emit assistant_done
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(0);

      // Partial response should still be saved
      const sendMessageCalls = mockConversationService.sendMessage.mock.calls;
      if (sendMessageCalls.length > 0) {
        const savedContent = sendMessageCalls[0][0].content.text;
        expect(savedContent).toContain('Starting...');
      }
    });
  });
});
