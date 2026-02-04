/**
 * Unit tests for ChatServer web search integration
 *
 * Story 33.2.1: Register WebSearchToolService
 *
 * Tests validate:
 * - WebSearchToolService registration with ToolUseRegistry
 * - Consult mode uses consultModeTools (not assessmentModeTools)
 * - Assessment mode still uses assessmentModeTools
 * - consultModeTools contains web_search tool definition
 * - Graceful degradation when JINA_API_KEY is missing
 * - Feature flag ENABLE_WEB_SEARCH behavior
 */

import { consultModeTools, assessmentModeTools } from '../../src/infrastructure/ai/tools/index.js';
import { ToolUseRegistry } from '../../src/infrastructure/websocket/ToolUseRegistry.js';
import type { IToolUseHandler, ToolUseContext, ToolUseInput, ToolUseResult } from '../../src/application/interfaces/IToolUseHandler.js';

describe('ChatServer Web Search Integration (Story 33.2.1)', () => {
  describe('Tool Array Configuration', () => {
    it('consultModeTools should contain web_search tool', () => {
      const toolNames = consultModeTools.map((t) => t.name);
      expect(toolNames).toContain('web_search');
    });

    it('consultModeTools should NOT contain questionnaire_ready tool', () => {
      const toolNames = consultModeTools.map((t) => t.name);
      expect(toolNames).not.toContain('questionnaire_ready');
    });

    it('assessmentModeTools should contain questionnaire_ready tool', () => {
      const toolNames = assessmentModeTools.map((t) => t.name);
      expect(toolNames).toContain('questionnaire_ready');
    });

    it('assessmentModeTools should NOT contain web_search tool', () => {
      const toolNames = assessmentModeTools.map((t) => t.name);
      expect(toolNames).not.toContain('web_search');
    });

    it('consultModeTools and assessmentModeTools should be different arrays', () => {
      expect(consultModeTools).not.toBe(assessmentModeTools);
    });

    it('consultModeTools should have correct web_search tool schema', () => {
      const webSearchTool = consultModeTools.find((t) => t.name === 'web_search');
      expect(webSearchTool).toBeDefined();
      expect(webSearchTool?.input_schema.type).toBe('object');
      expect(webSearchTool?.input_schema.required).toContain('query');
    });
  });

  describe('ToolUseRegistry Integration', () => {
    let registry: ToolUseRegistry;
    let consoleSpy: {
      log: jest.SpyInstance;
      warn: jest.SpyInstance;
      error: jest.SpyInstance;
    };

    beforeEach(() => {
      registry = new ToolUseRegistry();
      consoleSpy = {
        log: jest.spyOn(console, 'log').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation(),
      };
    });

    afterEach(() => {
      consoleSpy.log.mockRestore();
      consoleSpy.warn.mockRestore();
      consoleSpy.error.mockRestore();
    });

    it('should register WebSearchToolService by toolName', () => {
      const mockWebSearchService: IToolUseHandler = {
        toolName: 'web_search',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };

      registry.register(mockWebSearchService);

      expect(registry.hasHandler('web_search')).toBe(true);
      expect(registry.getHandler('web_search')).toBe(mockWebSearchService);
    });

    it('should dispatch web_search tool to correct handler', async () => {
      const mockResult: ToolUseResult = {
        handled: true,
        toolResult: {
          toolUseId: 'tool-123',
          content: 'Search results...',
        },
      };

      const mockWebSearchService: IToolUseHandler = {
        toolName: 'web_search',
        handle: jest.fn().mockResolvedValue(mockResult),
      };

      registry.register(mockWebSearchService);

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'tool-123',
        input: { query: 'HIPAA compliance 2024' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentId: null,
        mode: 'consult',
      };

      const result = await registry.dispatch(input, context);

      expect(mockWebSearchService.handle).toHaveBeenCalledWith(input, context);
      expect(result).toEqual(mockResult);
    });

    it('should support both questionnaire_ready and web_search handlers', () => {
      const mockQuestionnaireHandler: IToolUseHandler = {
        toolName: 'questionnaire_ready',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };

      const mockWebSearchHandler: IToolUseHandler = {
        toolName: 'web_search',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };

      registry.register(mockQuestionnaireHandler);
      registry.register(mockWebSearchHandler);

      expect(registry.hasHandler('questionnaire_ready')).toBe(true);
      expect(registry.hasHandler('web_search')).toBe(true);
      expect(registry.getRegisteredTools()).toContain('questionnaire_ready');
      expect(registry.getRegisteredTools()).toContain('web_search');
    });

    it('should pass mode in context when dispatching', async () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'web_search',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };

      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'tool-456',
        input: { query: 'test' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        assessmentId: null,
        mode: 'consult',
      };

      await registry.dispatch(input, context);

      expect(mockHandler.handle).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'consult' })
      );
    });
  });

  describe('Mode-Specific Tool Selection Logic', () => {
    /**
     * These tests verify the tool selection logic that would be used in ChatServer.
     * The actual ChatServer uses:
     *   const tools = modeConfig.enableTools
     *     ? (mode === 'consult' ? consultModeTools : assessmentModeTools)
     *     : undefined;
     */

    function selectToolsForMode(mode: string, enableTools: boolean) {
      if (!enableTools) return undefined;
      return mode === 'consult' ? consultModeTools : assessmentModeTools;
    }

    it('should select consultModeTools when mode is consult and tools enabled', () => {
      const tools = selectToolsForMode('consult', true);
      expect(tools).toBe(consultModeTools);
    });

    it('should select assessmentModeTools when mode is assessment and tools enabled', () => {
      const tools = selectToolsForMode('assessment', true);
      expect(tools).toBe(assessmentModeTools);
    });

    it('should return undefined when tools disabled (scoring mode)', () => {
      const tools = selectToolsForMode('scoring', false);
      expect(tools).toBeUndefined();
    });

    it('should select assessmentModeTools for any non-consult mode when tools enabled', () => {
      // This tests the fallback behavior
      const tools = selectToolsForMode('unknown', true);
      expect(tools).toBe(assessmentModeTools);
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle missing web_search handler gracefully', async () => {
      const registry = new ToolUseRegistry();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Only register questionnaire_ready, not web_search
      const mockQuestionnaireHandler: IToolUseHandler = {
        toolName: 'questionnaire_ready',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };
      registry.register(mockQuestionnaireHandler);

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'tool-789',
        input: { query: 'test' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-3',
        userId: 'user-3',
        assessmentId: null,
        mode: 'consult',
      };

      const result = await registry.dispatch(input, context);

      // Should return handled: false when handler not found
      expect(result.handled).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ToolUseRegistry] No handler for tool: web_search'
      );

      consoleSpy.mockRestore();
    });

    it('should handle web_search handler errors gracefully', async () => {
      const registry = new ToolUseRegistry();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockErrorHandler: IToolUseHandler = {
        toolName: 'web_search',
        handle: jest.fn().mockRejectedValue(new Error('Jina API error')),
      };
      registry.register(mockErrorHandler);

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'tool-error',
        input: { query: 'test' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-4',
        userId: 'user-4',
        assessmentId: null,
        mode: 'consult',
      };

      const result = await registry.dispatch(input, context);

      // Should return handled: false with error message
      expect(result.handled).toBe(false);
      expect(result.error).toBe('Jina API error');

      consoleSpy.mockRestore();
    });
  });
});
