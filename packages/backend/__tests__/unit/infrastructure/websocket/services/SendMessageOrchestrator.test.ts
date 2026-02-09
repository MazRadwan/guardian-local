/**
 * Unit Tests for SendMessageOrchestrator
 *
 * Story 36.3.2: Adapted from MessageHandler.test.ts buildFileContext tests.
 * Story 36.3.3: Added orchestrator pipeline tests covering all 7 steps.
 *
 * Key behaviors tested:
 * - Step 1: Validation (valid, invalid, file_processing_error)
 * - Step 2: Message persistence (save, regenerate, placeholder text)
 * - Step 4: Scoring bypass (early return)
 * - Step 5: File context building (consult, assessment, scoring)
 * - Step 6: Streaming (tools, prompt cache pass-through)
 * - Step 7: Post-streaming (tool dispatch, enrichment, title generation, abort)
 */

import { SendMessageOrchestrator, type SendMessageOrchestratorDeps } from '../../../../../src/infrastructure/websocket/services/SendMessageOrchestrator.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { SendMessagePayload } from '../../../../../src/infrastructure/websocket/types/SendMessage.js';
import type { FileContextBuilder } from '../../../../../src/infrastructure/websocket/context/FileContextBuilder.js';
import { consultModeTools, assessmentModeTools } from '../../../../../src/infrastructure/ai/tools/index.js';

/**
 * Create a minimal mock socket for orchestrator tests
 */
const createMockSocket = (): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-1',
  userId: 'user-1',
  userEmail: 'test@example.com',
  conversationId: 'conv-1',
  data: {},
  handshake: { auth: {} },
  emit: jest.fn(),
  join: jest.fn(),
});

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
 * Create base orchestrator deps with sensible defaults.
 * Caller overrides specific deps as needed for each test.
 */
const createBaseDeps = (overrides?: Partial<SendMessageOrchestratorDeps>): SendMessageOrchestratorDeps => {
  const conversationService = {
    sendMessage: jest.fn().mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      createdAt: new Date(),
    }),
    getHistory: jest.fn().mockResolvedValue([]),
    deleteMessage: jest.fn(),
  } as any;

  const contextBuilder = {
    build: jest.fn().mockResolvedValue({
      messages: [],
      systemPrompt: 'Base system prompt',
      promptCache: { usePromptCache: false },
      mode: 'consult',
    }),
  } as any;

  const streamingService = {
    streamClaudeResponse: jest.fn().mockResolvedValue({
      fullResponse: 'Test response',
      wasAborted: false,
      toolUseBlocks: [],
      savedMessageId: 'assistant-msg-1',
      stopReason: 'end_turn',
    }),
  } as any;

  const validator = {
    validateSendMessage: jest.fn().mockResolvedValue({
      valid: true,
      conversationId: 'conv-1',
      messageText: 'Hello',
      enrichedAttachments: undefined,
    }),
  } as any;

  return {
    validator,
    streamingService,
    conversationService,
    contextBuilder,
    fileContextBuilder: undefined,
    scoringHandler: { triggerScoringOnSend: jest.fn() } as any,
    toolRegistry: { dispatch: jest.fn().mockResolvedValue({ handled: false }) } as any,
    titleUpdateService: {
      updateScoringTitle: jest.fn(),
      generateTitleIfNeeded: jest.fn().mockResolvedValue(undefined),
    } as any,
    backgroundEnrichmentService: {
      enrichInBackground: jest.fn().mockResolvedValue(undefined),
    } as any,
    webSearchEnabled: false,
    ...overrides,
  };
};

/** Helper: standard enriched attachment */
const makeAttachment = (fileId = 'f-1', filename = 'doc.pdf') => ({
  fileId,
  filename,
  mimeType: 'application/pdf',
  size: 1024,
});

describe('SendMessageOrchestrator', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────
  // Step 1: Validation
  // ──────────────────────────────────────────────
  describe('Step 1: Validation', () => {
    it('should emit error and NOT proceed when validation fails', async () => {
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: false,
        error: { event: 'error', message: 'Missing conversation ID' },
      });
      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { text: 'Hello' });

      // Should emit error
      expect(socket.emit).toHaveBeenCalledWith('error', {
        event: 'error',
        message: 'Missing conversation ID',
      });
      // Should NOT proceed to step 2 (no message saved)
      expect(deps.conversationService.sendMessage).not.toHaveBeenCalled();
      // Should NOT proceed to step 3 (no context built)
      expect(deps.contextBuilder.build).not.toHaveBeenCalled();
      // Should NOT proceed to step 6 (no streaming)
      expect(deps.streamingService.streamClaudeResponse).not.toHaveBeenCalled();
    });

    it('should emit file_processing_error with correct payload when emitFileProcessingError is set', async () => {
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: false,
        emitFileProcessingError: true,
        conversationId: 'conv-1',
        missingFileIds: ['f-1', 'f-2'],
        error: { event: 'error', message: 'Files still processing' },
      });
      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      // Should emit file_processing_error (NOT generic error)
      expect(socket.emit).toHaveBeenCalledWith('file_processing_error', {
        conversationId: 'conv-1',
        missingFileIds: ['f-1', 'f-2'],
        message: 'Files still processing',
      });
      // Should NOT emit generic error
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
      // Should NOT proceed to step 2
      expect(deps.conversationService.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // Step 2: Message persistence
  // ──────────────────────────────────────────────
  describe('Step 2: Message persistence', () => {
    it('should save user message and emit message_sent with enrichedAttachments', async () => {
      const enriched = [makeAttachment()];
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Hello world',
        enrichedAttachments: enriched,
      });
      deps.conversationService.sendMessage = jest.fn().mockResolvedValue({
        id: 'msg-42',
        conversationId: 'conv-1',
        createdAt,
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello world' });

      // Should save message with correct params
      expect(deps.conversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'user',
        content: { text: 'Hello world', components: undefined },
        attachments: enriched,
      });
      // Should emit message_sent with enrichedAttachments (not message.attachments)
      expect(socket.emit).toHaveBeenCalledWith('message_sent', {
        messageId: 'msg-42',
        conversationId: 'conv-1',
        timestamp: createdAt,
        attachments: enriched,
      });
    });

    it('should delete last assistant message and NOT save user message on regenerate', async () => {
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Regenerate me',
        enrichedAttachments: undefined,
      });
      deps.conversationService.getHistory = jest.fn().mockResolvedValue([
        { id: 'assistant-old', role: 'assistant', content: { text: 'Old response' } },
      ]);

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Regenerate me', isRegenerate: true });

      // Should NOT save user message
      expect(deps.conversationService.sendMessage).not.toHaveBeenCalled();
      // Should delete old assistant message
      expect(deps.conversationService.deleteMessage).toHaveBeenCalledWith('assistant-old');
    });

    it('should generate placeholder text when no messageText but has attachments', async () => {
      const enriched = [makeAttachment('f-1', 'report.pdf'), makeAttachment('f-2', 'data.csv')];
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: '',
        enrichedAttachments: enriched,
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', attachments: [{ fileId: 'f-1' }, { fileId: 'f-2' }] });

      // Should generate placeholder text
      expect(deps.conversationService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            text: '[Uploaded file for analysis: report.pdf, data.csv]',
          }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────
  // Step 4: Scoring bypass
  // ──────────────────────────────────────────────
  describe('Step 4: Scoring bypass', () => {
    it('should trigger scoring and return before streaming when bypassClaude and hasAttachments', async () => {
      const enriched = [makeAttachment('f-1', 'vendor_response.pdf')];
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Score this vendor',
        enrichedAttachments: enriched,
      });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Scoring prompt',
        promptCache: { usePromptCache: false },
        mode: 'scoring',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Score this vendor', attachments: [{ fileId: 'f-1' }] });

      // Should call triggerScoringOnSend
      expect(deps.scoringHandler.triggerScoringOnSend).toHaveBeenCalledWith(
        socket,
        'conv-1',
        'user-1',
        ['f-1'],
        'Score this vendor',
        expect.any(Function)
      );
      // Should NOT stream
      expect(deps.streamingService.streamClaudeResponse).not.toHaveBeenCalled();
    });

    it('should exclude placeholder text from userQuery in scoring bypass', async () => {
      const enriched = [makeAttachment('f-1', 'vendor.pdf')];
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: '',
        enrichedAttachments: enriched,
      });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Scoring prompt',
        promptCache: { usePromptCache: false },
        mode: 'scoring',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', attachments: [{ fileId: 'f-1' }] });

      // Placeholder text starts with '[Uploaded file', so userQuery should be undefined
      expect(deps.scoringHandler.triggerScoringOnSend).toHaveBeenCalledWith(
        socket,
        'conv-1',
        'user-1',
        ['f-1'],
        undefined,
        expect.any(Function)
      );
    });

    it('should NOT trigger scoring in non-scoring mode and proceed to streaming', async () => {
      const enriched = [makeAttachment()];
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Analyze this',
        enrichedAttachments: enriched,
      });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Consult prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Analyze this', attachments: [{ fileId: 'f-1' }] });

      // Should NOT trigger scoring
      expect(deps.scoringHandler.triggerScoringOnSend).not.toHaveBeenCalled();
      // Should proceed to streaming
      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // Step 5: File context building (original tests)
  // ──────────────────────────────────────────────
  describe('Step 5: File context building', () => {
    it('should leave system prompt unchanged when fileContextBuilder is not configured', async () => {
      const deps = createBaseDeps({ fileContextBuilder: undefined });
      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      // streamClaudeResponse should receive the original system prompt (no file context appended)
      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        'Base system prompt',
        expect.objectContaining({ imageBlocks: [] })
      );
    });

    it('should return empty imageBlocks when fileContextBuilder is not configured', async () => {
      const deps = createBaseDeps({ fileContextBuilder: undefined });
      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ imageBlocks: [] })
      );
    });

    it('should build file context for consult mode', async () => {
      const mockFileContextBuilder = createMockFileContextBuilder();
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const deps = createBaseDeps({ fileContextBuilder: mockFileContextBuilder });
      // Ensure contextBuilder returns consult mode
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'System prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      // Verify fileContextBuilder.buildWithImages was called
      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
        'conv-1',
        undefined,  // scopeToFileIds always undefined
        { mode: 'consult' }
      );

      // Verify enhanced prompt was passed to streaming
      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        'System prompt\n\n--- Attached Documents ---\nDocument context here',
        expect.anything()
      );
    });

    it('should build file context for assessment mode', async () => {
      const mockFileContextBuilder = createMockFileContextBuilder();
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nAssessment doc',
        imageBlocks: [],
      });

      const deps = createBaseDeps({ fileContextBuilder: mockFileContextBuilder });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'System prompt',
        promptCache: { usePromptCache: false },
        mode: 'assessment',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
        'conv-1',
        undefined,  // scopeToFileIds always undefined
        { mode: 'assessment' }
      );
    });

    it('should NOT build file context for scoring mode (early return at Step 4)', async () => {
      const mockFileContextBuilder = createMockFileContextBuilder();

      const deps = createBaseDeps({ fileContextBuilder: mockFileContextBuilder });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'System prompt',
        promptCache: { usePromptCache: false },
        mode: 'scoring',
      });
      // Scoring mode with attachments triggers early return
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Score this',
        enrichedAttachments: [{ fileId: 'f-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 }],
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Score this', attachments: [{ fileId: 'f-1' }] });

      // fileContextBuilder should NOT be called (scoring bypasses to Step 4 early return)
      expect(mockFileContextBuilder.buildWithImages).not.toHaveBeenCalled();
    });

    it('should always pass undefined for scopeToFileIds (uses ALL conversation files)', async () => {
      const mockFileContextBuilder = createMockFileContextBuilder();
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Context',
        imageBlocks: [],
      });

      const deps = createBaseDeps({ fileContextBuilder: mockFileContextBuilder });
      // Even with enrichedAttachments in the payload, scopeToFileIds is undefined
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Check this',
        enrichedAttachments: [{ fileId: 'f-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 }],
      });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Check this', attachments: [{ fileId: 'f-1' }] });

      // Second argument (scopeToFileIds) must be undefined
      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
        'conv-1',
        undefined,
        expect.objectContaining({ mode: 'consult' })
      );
    });

    it('should pass imageBlocks from fileContextBuilder to streamClaudeResponse', async () => {
      const mockImageBlock = {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: 'test-base64-data',
        },
      };
      const mockFileContextBuilder = createMockFileContextBuilder();
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '',
        imageBlocks: [mockImageBlock],
      });

      const deps = createBaseDeps({ fileContextBuilder: mockFileContextBuilder });
      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ imageBlocks: [mockImageBlock] })
      );
    });

    it('should not modify system prompt when fileContextBuilder returns empty textContext', async () => {
      const mockFileContextBuilder = createMockFileContextBuilder();
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '',
        imageBlocks: [],
      });

      const deps = createBaseDeps({ fileContextBuilder: mockFileContextBuilder });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Original prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      // System prompt should remain unchanged (no file context appended)
      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        'Original prompt',
        expect.anything()
      );
    });
  });

  // ──────────────────────────────────────────────
  // Step 6: Streaming
  // ──────────────────────────────────────────────
  describe('Step 6: Streaming', () => {
    it('should pass consultModeTools when consult mode with webSearchEnabled', async () => {
      const deps = createBaseDeps({ webSearchEnabled: true });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Search something' });

      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          enableTools: true,
          tools: consultModeTools,
        })
      );
    });

    it('should pass undefined for tools when consult mode without webSearchEnabled', async () => {
      const deps = createBaseDeps({ webSearchEnabled: false });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          enableTools: true,
          tools: undefined,
        })
      );
    });

    it('should pass assessmentModeTools in assessment mode', async () => {
      const deps = createBaseDeps();
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'assessment',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Assess this' });

      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          enableTools: true,
          tools: assessmentModeTools,
        })
      );
    });

    it('should forward usePromptCache and cachedPromptId to streaming', async () => {
      const deps = createBaseDeps();
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: true, cachedPromptId: 'cache-abc' },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      expect(deps.streamingService.streamClaudeResponse).toHaveBeenCalledWith(
        socket,
        'conv-1',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          usePromptCache: true,
          cachedPromptId: 'cache-abc',
        })
      );
    });
  });

  // ──────────────────────────────────────────────
  // Step 7: Post-streaming
  // ──────────────────────────────────────────────
  describe('Step 7: Post-streaming', () => {
    it('should dispatch each toolUseBlock via toolRegistry', async () => {
      const deps = createBaseDeps();
      deps.streamingService.streamClaudeResponse = jest.fn().mockResolvedValue({
        fullResponse: 'Response',
        wasAborted: false,
        toolUseBlocks: [
          { id: 'tool-1', name: 'questionnaire_ready', input: { foo: 'bar' } },
          { id: 'tool-2', name: 'web_search', input: { query: 'test' } },
        ],
        savedMessageId: 'msg-1',
        stopReason: 'tool_use',
      });
      deps.toolRegistry.dispatch = jest.fn().mockResolvedValue({ handled: true });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      // Should dispatch both tool uses
      expect(deps.toolRegistry.dispatch).toHaveBeenCalledTimes(2);
      expect(deps.toolRegistry.dispatch).toHaveBeenCalledWith(
        { toolName: 'questionnaire_ready', toolUseId: 'tool-1', input: { foo: 'bar' } },
        { conversationId: 'conv-1', userId: 'user-1', assessmentId: null, mode: 'consult' }
      );
      expect(deps.toolRegistry.dispatch).toHaveBeenCalledWith(
        { toolName: 'web_search', toolUseId: 'tool-2', input: { query: 'test' } },
        { conversationId: 'conv-1', userId: 'user-1', assessmentId: null, mode: 'consult' }
      );
    });

    it('should emit event from socket when tool dispatch returns handled with emitEvent', async () => {
      const deps = createBaseDeps();
      deps.streamingService.streamClaudeResponse = jest.fn().mockResolvedValue({
        fullResponse: 'Response',
        wasAborted: false,
        toolUseBlocks: [
          { id: 'tool-1', name: 'questionnaire_ready', input: {} },
        ],
        savedMessageId: 'msg-1',
        stopReason: 'tool_use',
      });
      deps.toolRegistry.dispatch = jest.fn().mockResolvedValue({
        handled: true,
        emitEvent: { event: 'questionnaire_ready', payload: { assessmentId: 'assess-1' } },
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Generate questionnaire' });

      expect(socket.emit).toHaveBeenCalledWith('questionnaire_ready', { assessmentId: 'assess-1' });
    });

    it('should call enrichInBackground for assessment mode with attachments (fire-and-forget)', async () => {
      const enriched = [makeAttachment('f-1', 'doc.pdf')];
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Analyze doc',
        enrichedAttachments: enriched,
      });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'assessment',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Analyze doc', attachments: [{ fileId: 'f-1' }] });

      expect(deps.backgroundEnrichmentService.enrichInBackground).toHaveBeenCalledWith(
        'conv-1',
        ['f-1']
      );
    });

    it('should NOT call enrichInBackground for consult mode', async () => {
      const enriched = [makeAttachment()];
      const deps = createBaseDeps();
      deps.validator.validateSendMessage = jest.fn().mockResolvedValue({
        valid: true,
        conversationId: 'conv-1',
        messageText: 'Hello',
        enrichedAttachments: enriched,
      });
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello', attachments: [{ fileId: 'f-1' }] });

      expect(deps.backgroundEnrichmentService.enrichInBackground).not.toHaveBeenCalled();
    });

    it('should call generateTitleIfNeeded for all modes (fire-and-forget)', async () => {
      const deps = createBaseDeps();
      deps.contextBuilder.build = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Prompt',
        promptCache: { usePromptCache: false },
        mode: 'consult',
      });
      deps.streamingService.streamClaudeResponse = jest.fn().mockResolvedValue({
        fullResponse: 'Claude says hello',
        wasAborted: false,
        toolUseBlocks: [],
        savedMessageId: 'msg-1',
        stopReason: 'end_turn',
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      expect(deps.titleUpdateService.generateTitleIfNeeded).toHaveBeenCalledWith(
        socket,
        'conv-1',
        'consult',
        'Claude says hello'
      );
    });

    it('should skip all post-streaming work when wasAborted is true', async () => {
      const deps = createBaseDeps();
      deps.streamingService.streamClaudeResponse = jest.fn().mockResolvedValue({
        fullResponse: 'Partial response...',
        wasAborted: true,
        toolUseBlocks: [{ id: 'tool-1', name: 'some_tool', input: {} }],
        savedMessageId: null,
        stopReason: undefined,
      });

      const orchestrator = new SendMessageOrchestrator(deps);
      const socket = createMockSocket();

      await orchestrator.execute(socket, { conversationId: 'conv-1', text: 'Hello' });

      // Should NOT dispatch tools
      expect(deps.toolRegistry.dispatch).not.toHaveBeenCalled();
      // Should NOT call enrichment
      expect(deps.backgroundEnrichmentService.enrichInBackground).not.toHaveBeenCalled();
      // Should NOT call title generation
      expect(deps.titleUpdateService.generateTitleIfNeeded).not.toHaveBeenCalled();
    });
  });
});
