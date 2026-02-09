/**
 * Unit Tests for MessageHandler
 *
 * Story 28.9.2: Extract MessageHandler.ts (file context building)
 * Story 28.9.5: Extract MessageHandler.ts (Claude streaming)
 * Story 36.1.3: Validation tests moved to SendMessageValidator.test.ts
 *
 * Tests cover:
 * buildFileContext (Story 28.9.2):
 * 1. Return empty string when FileContextBuilder not configured
 * 2. Build context for all files when no attachments provided
 * 3. Build context for all files when empty attachments array
 * 4. Scope to specific files when enrichedAttachments provided
 * 5. Extract fileIds from enrichedAttachments
 *
 * streamClaudeResponse (Story 28.9.5):
 * 1. Stream tokens to socket using async iterator
 * 2. NOT emit assistant_done when aborted
 * 3. Collect tool uses from final chunk
 * 4. Handle Claude API errors gracefully
 * 5. Reset abortRequested flag before streaming
 * 6. Save partial response on abort
 *
 * Note: generatePlaceholderText and saveUserMessageAndEmit tests removed -
 * these methods were inlined into ChatServer (refactor/inline-message-persistence).
 * Behavior is covered by integration tests in attachment-flow.test.ts and
 * e2e tests in websocket-chat.test.ts.
 */

import {
  MessageHandler,
  type StreamingResult,
  type StreamingOptions,
} from '../../../../../src/infrastructure/websocket/handlers/MessageHandler.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { MessageAttachment } from '../../../../../src/domain/entities/Message.js';
import type { FileContextBuilder } from '../../../../../src/infrastructure/websocket/context/FileContextBuilder.js';
import type { IClaudeClient, StreamChunk, ToolUseBlock, ClaudeMessage } from '../../../../../src/application/interfaces/IClaudeClient.js';
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
 * Create a mock FileContextBuilder
 * Story 28.9.2: File context building
 */
const createMockFileContextBuilder = (): jest.Mocked<FileContextBuilder> => ({
  build: jest.fn(),
  buildWithImages: jest.fn().mockResolvedValue({ textContext: '', imageBlocks: [] }),
  formatIntakeContextFile: jest.fn(),
  formatTextExcerptFile: jest.fn(),
} as unknown as jest.Mocked<FileContextBuilder>);

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

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    // Story 36.1.2: MessageHandler now has 5 params (validation moved to SendMessageValidator)
    handler = new MessageHandler(mockConversationService);
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
   * Story 28.9.2: buildFileContext tests
   *
   * Tests file context building for Claude prompts.
   * NOTE: Validation (ownership, conversation membership) is handled in Story 28.9.1.
   * This method receives pre-validated enrichedAttachments and builds context from them.
   */
  describe('buildFileContext', () => {
    let mockFileContextBuilder: jest.Mocked<FileContextBuilder>;
    let handlerWithBuilder: MessageHandler;

    beforeEach(() => {
      mockFileContextBuilder = createMockFileContextBuilder();
      // Story 36.1.2: MessageHandler now has 5 params (no fileRepository/rateLimiter)
      handlerWithBuilder = new MessageHandler(
        mockConversationService,
        mockFileContextBuilder
      );
    });

    it('should return empty result when FileContextBuilder not configured', async () => {
      // Use handler without FileContextBuilder (from parent describe)
      const result = await handler.buildFileContext('conv-1');

      expect(result).toEqual({ textContext: '', imageBlocks: [] });
    });

    it('should return empty result when FileContextBuilder not configured (with attachments)', async () => {
      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
      ];

      const result = await handler.buildFileContext('conv-1', enrichedAttachments);

      expect(result).toEqual({ textContext: '', imageBlocks: [] });
    });

    it('should build context for all files when no attachments provided', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1');

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', undefined, undefined);
      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledTimes(1);
      expect(result.textContext).toContain('Attached Documents');
    });

    it('should build context for all files when empty attachments array', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1', []);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', undefined, undefined);
      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledTimes(1);
      expect(result.textContext).toContain('Attached Documents');
    });

    it('should build context for all files when undefined attachments', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1', undefined);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', undefined, undefined);
    });

    it('should scope to specific files when enrichedAttachments provided', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Scoped context for specific files',
        imageBlocks: [],
      });

      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
        { fileId: 'file-2', filename: 'data.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 2048 },
      ];

      const result = await handlerWithBuilder.buildFileContext('conv-1', enrichedAttachments);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', ['file-1', 'file-2'], undefined);
      expect(result.textContext).toBe('Scoped context for specific files');
    });

    it('should extract fileIds from enrichedAttachments correctly', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Context',
        imageBlocks: [],
      });

      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'uuid-aaa', filename: 'report.pdf', mimeType: 'application/pdf', size: 5000 },
        { fileId: 'uuid-bbb', filename: 'analysis.docx', mimeType: 'application/docx', size: 3000 },
        { fileId: 'uuid-ccc', filename: 'summary.txt', mimeType: 'text/plain', size: 1000 },
      ];

      await handlerWithBuilder.buildFileContext('my-conv-id', enrichedAttachments);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
        'my-conv-id',
        ['uuid-aaa', 'uuid-bbb', 'uuid-ccc'],
        undefined
      );
    });

    it('should handle single enriched attachment', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Single file context',
        imageBlocks: [],
      });

      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'single-file', filename: 'only-one.pdf', mimeType: 'application/pdf', size: 1024 },
      ];

      const result = await handlerWithBuilder.buildFileContext('conv-1', enrichedAttachments);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', ['single-file'], undefined);
      expect(result.textContext).toBe('Single file context');
    });

    it('should return empty result when FileContextBuilder returns empty', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-no-files');

      expect(result.textContext).toBe('');
      expect(result.imageBlocks).toEqual([]);
    });

    it('should propagate errors from FileContextBuilder', async () => {
      mockFileContextBuilder.buildWithImages.mockRejectedValue(new Error('S3 connection failed'));

      await expect(
        handlerWithBuilder.buildFileContext('conv-1')
      ).rejects.toThrow('S3 connection failed');
    });

    it('should pass conversationId correctly to FileContextBuilder', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Context',
        imageBlocks: [],
      });

      await handlerWithBuilder.buildFileContext('specific-conversation-uuid');

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('specific-conversation-uuid', undefined, undefined);
    });

    // Epic 30 Sprint 3: New test for imageBlocks
    it('should return imageBlocks when VisionContentBuilder produces them', async () => {
      const mockImageBlock = {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: 'test-base64-data',
        },
      };
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '',
        imageBlocks: [mockImageBlock],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1');

      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0]).toEqual(mockImageBlock);
    });

    // Epic 30 Sprint 4 Story 30.4.3: Mode-specific Vision API behavior
    describe('mode-specific Vision API gating', () => {
      it('should pass mode to FileContextBuilder.buildWithImages', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Context',
          imageBlocks: [],
        });

        await handlerWithBuilder.buildFileContext('conv-1', undefined, 'assessment');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'assessment' }
        );
      });

      it('should pass consult mode to FileContextBuilder.buildWithImages', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Context',
          imageBlocks: [],
        });

        await handlerWithBuilder.buildFileContext('conv-1', undefined, 'consult');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'consult' }
        );
      });

      it('should NOT pass mode options when mode is undefined (backwards compatibility)', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Context',
          imageBlocks: [],
        });

        await handlerWithBuilder.buildFileContext('conv-1');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          undefined
        );
      });

      it('should pass mode with specific fileIds when enrichedAttachments provided', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Scoped context',
          imageBlocks: [],
        });

        const enrichedAttachments: MessageAttachment[] = [
          { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
        ];

        await handlerWithBuilder.buildFileContext('conv-1', enrichedAttachments, 'assessment');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          ['file-1'],
          { mode: 'assessment' }
        );
      });

      it('should return empty imageBlocks for assessment mode (Vision API disabled)', async () => {
        // This test verifies the integration: when assessment mode is passed,
        // FileContextBuilder returns empty imageBlocks (Vision API disabled)
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Document context',
          imageBlocks: [], // Empty because assessment mode disables Vision
        });

        const result = await handlerWithBuilder.buildFileContext('conv-1', undefined, 'assessment');

        // Verify mode was passed
        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'assessment' }
        );
        // Verify result has empty imageBlocks
        expect(result.imageBlocks).toHaveLength(0);
        expect(result.textContext).toBe('Document context');
      });

      it('should return imageBlocks for consult mode (Vision API enabled)', async () => {
        const mockImageBlock = {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: 'test-base64-data',
          },
        };
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: '',
          imageBlocks: [mockImageBlock],
        });

        const result = await handlerWithBuilder.buildFileContext('conv-1', undefined, 'consult');

        // Verify mode was passed
        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'consult' }
        );
        // Verify result has imageBlocks
        expect(result.imageBlocks).toHaveLength(1);
        expect(result.imageBlocks[0]).toEqual(mockImageBlock);
      });
    });
  });

  /**
   * Story 28.9.5: streamClaudeResponse tests
   *
   * Tests Claude streaming with abort handling.
   * CRITICAL: Uses async generator functions to mock the streaming.
   */
  describe('streamClaudeResponse', () => {
    let handlerWithClaude: MessageHandler;
    let mockClaudeClient: jest.Mocked<IClaudeClient>;
    let mockSocketForStreaming: jest.Mocked<IAuthenticatedSocket>;

    beforeEach(() => {
      mockClaudeClient = createMockClaudeClient();
      // Story 36.1.2: MessageHandler now has 5 params (no fileRepository/rateLimiter)
      handlerWithClaude = new MessageHandler(
        mockConversationService,
        undefined, // No FileContextBuilder
        mockClaudeClient
      );
      mockSocketForStreaming = createMockSocket('user-123');
    });

    it('should throw error when ClaudeClient not configured', async () => {
      // Use handler without claudeClient (from parent describe)
      await expect(
        handler.streamClaudeResponse(
          mockSocket,
          'conv-1',
          [{ role: 'user', content: 'Hello' }],
          'System prompt',
          { enableTools: false }
        )
      ).rejects.toThrow('ClaudeClient not configured in MessageHandler');
    });

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

      const result = await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Verify stream start was emitted
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('assistant_stream_start', {
        conversationId: 'conv-1',
      });

      // Verify tokens were emitted
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('assistant_token', {
        conversationId: 'conv-1',
        token: 'Hello ',
      });
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('assistant_token', {
        conversationId: 'conv-1',
        token: 'world!',
      });

      // Verify assistant_done was emitted
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('assistant_done', {
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
      mockSocketForStreaming.data.abortRequested = true;

      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'Test' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());
      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'msg-1', content: { text: 'Test' } })
      );

      await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // Stream should have completed because abort flag was reset
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('assistant_done', expect.anything());
    });

    it('should NOT emit assistant_done when aborted', async () => {
      // Create a stream that checks abort flag mid-stream
      let chunkIndex = 0;
      async function* mockAbortableStream(): AsyncGenerator<StreamChunk> {
        yield { isComplete: false, content: 'First ' };
        // After first chunk, set abort flag (simulating user abort during stream)
        mockSocketForStreaming.data.abortRequested = true;
        yield { isComplete: false, content: 'Second ' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockAbortableStream());

      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'partial-msg', content: { text: 'First ' } })
      );

      const result = await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
        'conv-1',
        [{ role: 'user', content: 'Hi' }],
        'System prompt',
        { enableTools: false }
      );

      // assistant_done should NOT have been called
      const emitCalls = mockSocketForStreaming.emit.mock.calls;
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
        mockSocketForStreaming.data.abortRequested = true;
        yield { isComplete: false, content: 'should not be included' };
        yield { isComplete: true, content: '' };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockAbortableStream());

      mockConversationService.sendMessage.mockResolvedValue(
        createMockMessage({ id: 'partial-saved', content: { text: 'Partial content ' } })
      );

      const result = await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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

      const result = await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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

      const result = await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('message', expect.objectContaining({
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

      await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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

      await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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

      await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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

      const result = await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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
      expect(mockSocketForStreaming.emit).toHaveBeenCalledWith('assistant_done', {
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

      await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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

      await handlerWithClaude.streamClaudeResponse(
        mockSocketForStreaming,
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
