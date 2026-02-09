/**
 * Unit Tests for ClaudeStreamingService
 *
 * Story 36.2.3: Moved from MessageHandler.test.ts
 * Story 28.9.5: Original Claude streaming tests
 * Story 36.2.1: ClaudeStreamingService extracted from MessageHandler
 *
 * Tests cover:
 * streamClaudeResponse:
 * 1. Stream tokens to socket using async iterator
 * 2. NOT emit assistant_done when aborted
 * 3. Collect tool uses from final chunk
 * 4. Handle Claude API errors gracefully
 * 5. Reset abortRequested flag before streaming
 * 6. Save partial response on abort
 */

import { ClaudeStreamingService } from '../../../../../src/infrastructure/websocket/services/ClaudeStreamingService.js';
import type { StreamingResult, StreamingOptions } from '../../../../../src/infrastructure/websocket/types/SendMessage.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { IClaudeClient, StreamChunk, ToolUseBlock } from '../../../../../src/application/interfaces/IClaudeClient.js';
import type { Message } from '../../../../../src/domain/entities/Message.js';

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
 * Create a mock ClaudeClient
 * Story 28.9.5: Claude streaming
 */
const createMockClaudeClient = (): jest.Mocked<IClaudeClient> => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  continueWithToolResult: jest.fn(),
} as unknown as jest.Mocked<IClaudeClient>);

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

describe('ClaudeStreamingService', () => {
  let service: ClaudeStreamingService;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockClaudeClient = createMockClaudeClient();
    service = new ClaudeStreamingService(
      mockClaudeClient,
      mockConversationService
    );
    mockSocket = createMockSocket('user-123');

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Story 28.9.5: streamClaudeResponse tests
   *
   * Tests Claude streaming with abort handling.
   * CRITICAL: Uses async generator functions to mock the streaming.
   */
  describe('streamClaudeResponse', () => {
    it('should stream tokens to socket using async iterator', async () => {
      // Create async generator mock
      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Hello ' };
        yield { isComplete: false, content: 'world!' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());

      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'saved-msg-1', content: { text: 'Hello world!' } })
      );

      const result = await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Verify stream start was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', {
        conversationId: 'conv-1',
      });

      // Verify tokens were emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', {
        conversationId: 'conv-1',
        token: 'Hello ',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', {
        conversationId: 'conv-1',
        token: 'world!',
      });

      // Verify assistant_done was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', {
        messageId: 'saved-msg-1',
        conversationId: 'conv-1',
        fullText: 'Hello world!',
        assessmentId: null,
      });

      // Verify result
      expect(result.fullResponse).toBe('Hello world!');
      expect(result.wasAborted).toBe(false);
      expect(result.savedMessageId).toBe('saved-msg-1');
    });

    it('should reset abortRequested flag before streaming', async () => {
      // Set abort flag to true before call
      mockSocket.data.abortRequested = true;

      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Test' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());
      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'msg-1', content: { text: 'Test' } })
      );

      await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Stream should have completed because abort flag was reset
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', expect.anything());
    });

    it('should NOT emit assistant_done when aborted', async () => {
      // Create a stream that checks abort flag mid-stream
      async function* mockAbortableStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'First ' };
        // After first chunk, set abort flag (simulating user abort during stream)
        mockSocket.data.abortRequested = true;
        yield { isComplete: false, content: 'Second ' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockAbortableStream());

      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'partial-msg', content: { text: 'First ' } })
      );

      const result = await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // assistant_done should NOT have been called
      const emitCalls = mockSocket.emit.mock.calls;
      const assistantDoneCalls = emitCalls.filter(call => call[0] === 'assistant_done');
      expect(assistantDoneCalls.length).toBe(0);

      // Result should indicate abort
      expect(result.wasAborted).toBe(true);
      expect(result.fullResponse).toBe('First ');
    });

    it('should save partial response to DB even when aborted', async () => {
      async function* mockAbortableStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Partial ' };
        yield { isComplete: false, content: 'content ' };
        // Simulate abort
        mockSocket.data.abortRequested = true;
        yield { isComplete: false, content: 'should not be included' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockAbortableStream());

      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'partial-saved', content: { text: 'Partial content ' } })
      );

      const result = await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Should have saved partial response
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: 'Partial content ' },
      });

      expect(result.savedMessageId).toBe('partial-saved');
      expect(result.wasAborted).toBe(true);
    });

    it('should collect tool uses from final chunk', async () => {
      const mockToolUse: ToolUseBlock[] = [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'assessment_tool',
          input: { dimension: 'security' },
        },
      ];

      async function* mockStreamWithTools(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Analyzing ' };
        yield { isComplete: false, content: 'security...' };
        yield { isComplete: true, content: '', toolUse: mockToolUse };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStreamWithTools());

      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'tool-msg', content: { text: 'Analyzing security...' } })
      );

      const result = await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Assess security' }],
        'System prompt',
        { enableTools: true }
      );

      expect(result.toolUseBlocks).toHaveLength(1);
      expect(result.toolUseBlocks[0].name).toBe('assessment_tool');
      expect(result.toolUseBlocks[0].input).toEqual({ dimension: 'security' });
    });

    it('should handle Claude API errors gracefully', async () => {
      // Simulate Claude API error
      async function* mockErrorStream(): AsyncGenerator<StreamChunk> {
        throw new Error('Claude API rate limit exceeded');
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockErrorStream());

      // Error message save
      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({
          id: 'error-msg',
          role: 'system',
          content: { text: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment." },
        })
      );

      const result = await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Should return empty result on error
      expect(result.fullResponse).toBe('');
      expect(result.savedMessageId).toBeNull();
      expect(result.wasAborted).toBe(false);

      // Should emit error message
      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        id: 'error-msg',
        role: 'system',
      }));
    });

    it('should pass tools to Claude when enableTools is true', async () => {
      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Response' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());
      mockConversationService.sendMessage.mockResolvedValue(createMockMessage());

      const mockTools = [
        {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object' as const, properties: {} },
        },
      ];

      await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: true, tools: mockTools }
      );

      // Epic 30 Sprint 3: streamMessage now takes 3 args (messages, options, imageBlocks)
      expect(mockClaudeClient.streamMessage).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hi' }],
        expect.objectContaining({
          systemPrompt: 'System prompt',
          tools: mockTools,
        }),
        undefined  // No imageBlocks in this test
      );
    });

    it('should NOT pass tools to Claude when enableTools is false', async () => {
      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Response' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());
      mockConversationService.sendMessage.mockResolvedValue(createMockMessage());

      await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      const callOptions = mockClaudeClient.streamMessage.mock.calls[0][1];
      expect(callOptions).not.toHaveProperty('tools');
    });

    it('should pass prompt caching options when provided', async () => {
      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());

      await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [],
        'System prompt',
        {
          enableTools: false,
          usePromptCache: true,
          cachedPromptId: 'cached-123',
        }
      );

      // Epic 30 Sprint 3: streamMessage now takes 3 args (messages, options, imageBlocks)
      expect(mockClaudeClient.streamMessage).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          usePromptCache: true,
          cachedPromptId: 'cached-123',
        }),
        undefined  // No imageBlocks in this test
      );
    });

    it('should not save message when response is empty', async () => {
      async function* mockEmptyStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockEmptyStream());

      const result = await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Should not call sendMessage for empty response
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();

      expect(result.fullResponse).toBe('');
      expect(result.savedMessageId).toBeNull();

      // Should still emit assistant_done
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', {
        messageId: null,
        conversationId: 'conv-1',
        fullText: '',
        assessmentId: null,
      });
    });

    // Epic 30 Sprint 3: Test imageBlocks are passed to Claude
    it('should pass imageBlocks to Claude when provided', async () => {
      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'I see the image.' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());
      mockConversationService.sendMessage.mockResolvedValue(createMockMessage());

      const mockImageBlocks = [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: 'test-base64-data',
          },
        },
      ];

      await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'What do you see?' }],
        'System prompt',
        { enableTools: false, imageBlocks: mockImageBlocks }
      );

      expect(mockClaudeClient.streamMessage).toHaveBeenCalledWith(
        [{ role: 'user', content: 'What do you see?' }],
        expect.objectContaining({ systemPrompt: 'System prompt' }),
        mockImageBlocks  // imageBlocks should be passed as 3rd argument
      );
    });

    it('should pass undefined imageBlocks when empty array provided', async () => {
      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Response' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());
      mockConversationService.sendMessage.mockResolvedValue(createMockMessage());

      await service.streamClaudeResponse(
        mockSocket,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false, imageBlocks: [] }  // Empty array
      );

      expect(mockClaudeClient.streamMessage).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hi' }],
        expect.any(Object),
        undefined  // Empty array should result in undefined (not passed to Claude)
      );
    });
  });
});
