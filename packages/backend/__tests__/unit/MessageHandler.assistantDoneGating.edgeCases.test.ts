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
    // When the tool loop is triggered, it handles all events internally
    mockConsultToolLoopService.execute.mockImplementation(async (options) => {
      options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
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

      // Story 34.1.4: ConsultToolLoopService handles tool errors and provides graceful response
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: "I apologize, but I couldn't complete the search. Based on my knowledge...",
          assessmentId: null,
        });
        return {
          fullResponse: "I apologize, but I couldn't complete the search. Based on my knowledge...",
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

      // Story 34.1.4: ConsultToolLoopService saves graceful error response
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'While I could not search for current information, here is what I know about healthcare regulations...',
          assessmentId: null,
        });
        return {
          fullResponse: 'While I could not search for current information, here is what I know about healthcare regulations...',
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

      // ConsultToolLoopService handles message saving
      // MessageHandler does not call sendMessage when tool loop is delegated
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();

      // Verify the result contains the graceful error response
      expect(result.fullResponse).not.toBe('');
      expect(result.fullResponse).toContain('healthcare regulations');
    });

    it('should delegate error handling to ConsultToolLoopService', async () => {
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

      // Story 34.1.4: ConsultToolLoopService receives tool_use blocks and handles errors
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Answer',
          assessmentId: null,
        });
        return {
          fullResponse: 'Answer',
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

      // Verify ConsultToolLoopService was called with the tool_use blocks
      expect(mockConsultToolLoopService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          toolUseBlocks: [toolUseBlock],
        })
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

      // Story 34.1.4: ConsultToolLoopService handles errors and emits system message
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        // Simulate error handling by service
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('message', {
          id: 'msg-error',
          conversationId: options.conversationId,
          role: 'system',
          content: { text: 'I encountered an error while searching. Please try again.' },
          createdAt: new Date(),
        });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: false,
          stopReason: undefined,
        };
      });

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

      // Should emit a message event with the error (from ConsultToolLoopService mock)
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

      // Story 34.1.4: ConsultToolLoopService handles stream failure without emitting assistant_done
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('message', {
          id: 'msg-error',
          conversationId: options.conversationId,
          role: 'system',
          content: { text: 'I encountered an error while searching. Please try again.' },
          createdAt: new Date(),
        });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
          wasAborted: false,
          stopReason: undefined,
        };
      });

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

      // Story 34.1.4: ConsultToolLoopService handles multiple tools
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'Based on both searches, here is the comparison...',
          assessmentId: null,
        });
        return {
          fullResponse: 'Based on both searches, here is the comparison...',
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

      // ConsultToolLoopService should receive both tool_use blocks
      expect(mockConsultToolLoopService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolUseBlocks,
        })
      );

      // Should emit exactly one assistant_done
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      // MessageHandler should not save message (delegated to service)
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('should delegate partial tool failure handling to ConsultToolLoopService', async () => {
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

      // Story 34.1.4: ConsultToolLoopService handles partial failures
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('assistant_done', {
          messageId: 'msg-123',
          conversationId: options.conversationId,
          fullText: 'One search succeeded, one failed. Here is what I found...',
          assessmentId: null,
        });
        return {
          fullResponse: 'One search succeeded, one failed. Here is what I found...',
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

      // Should still complete successfully
      const assistantDoneCalls = mockSocket.emit.mock.calls.filter(
        call => call[0] === 'assistant_done'
      );
      expect(assistantDoneCalls).toHaveLength(1);

      // Verify ConsultToolLoopService was called with all tool_use blocks
      expect(mockConsultToolLoopService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolUseBlocks,
        })
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

      // Story 34.1.4: ConsultToolLoopService handles empty response case
      mockConsultToolLoopService.execute.mockImplementation(async (options) => {
        options.socket.emit('tool_status', { conversationId: options.conversationId, status: 'idle' });
        options.socket.emit('assistant_done', {
          messageId: null,  // Empty response = no message saved
          conversationId: options.conversationId,
          fullText: '',
          assessmentId: null,
        });
        return {
          fullResponse: '',
          toolUseBlocks: [],
          savedMessageId: null,
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

      // MessageHandler does not save message when tool loop is delegated
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
