/**
 * Unit tests for WebSearchToolService
 *
 * Part of Epic 33: Consult Search Tool
 */

import {
  WebSearchToolService,
  StatusCallbackFactory,
} from '../../src/application/services/WebSearchToolService.js';
import {
  ToolUseInput,
  ToolUseContext,
} from '../../src/application/interfaces/IToolUseHandler.js';
import type {
  IJinaClient,
  JinaSearchResult,
  JinaReadResult,
} from '../../src/application/interfaces/IJinaClient.js';
import { JinaError } from '../../src/application/interfaces/IJinaClient.js';
import { JINA_CONFIG } from '../../src/infrastructure/ai/JinaClient.js';

// Mock Jina client
const createMockJinaClient = (): jest.Mocked<IJinaClient> => ({
  search: jest.fn(),
  readUrl: jest.fn(),
  readUrls: jest.fn(),
});

describe('WebSearchToolService', () => {
  let service: WebSearchToolService;
  let mockJinaClient: jest.Mocked<IJinaClient>;
  let statusChanges: Array<{ conversationId: string; status: string }>;
  let createStatusCallback: StatusCallbackFactory;

  const baseContext: ToolUseContext = {
    conversationId: 'conv-123',
    userId: 'user-456',
    assessmentId: null,
    mode: 'consult',
  };

  const baseInput: ToolUseInput = {
    toolName: 'web_search',
    toolUseId: 'tool-use-789',
    input: {
      query: 'HIPAA compliance requirements 2024',
    },
  };

  const mockSearchResults: JinaSearchResult[] = [
    {
      title: 'HIPAA Compliance Guide 2024',
      url: 'https://example.com/hipaa-guide',
      snippet: 'Comprehensive guide to HIPAA compliance requirements...',
    },
    {
      title: 'Healthcare Data Security Standards',
      url: 'https://example.com/security-standards',
      snippet: 'Overview of security standards for healthcare...',
    },
    {
      title: 'Privacy Rule Updates',
      url: 'https://example.com/privacy-updates',
      snippet: 'Recent updates to the HIPAA Privacy Rule...',
    },
  ];

  const mockReadResults: JinaReadResult[] = [
    {
      url: 'https://example.com/hipaa-guide',
      title: 'HIPAA Compliance Guide 2024',
      content: 'Full content of the HIPAA compliance guide...',
    },
    {
      url: 'https://example.com/security-standards',
      title: 'Healthcare Data Security Standards',
      content: 'Detailed security standards content...',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    statusChanges = [];
    // Story 33.3.1: Use callback factory pattern that tracks conversationId
    createStatusCallback = (conversationId: string) => {
      return (status: 'searching' | 'reading' | 'idle') => {
        statusChanges.push({ conversationId, status });
      };
    };
    mockJinaClient = createMockJinaClient();

    // Default successful responses
    mockJinaClient.search.mockResolvedValue(mockSearchResults);
    mockJinaClient.readUrls.mockResolvedValue(mockReadResults);

    // Clear rate limits before each test
    WebSearchToolService.clearAllRateLimits();

    service = new WebSearchToolService(mockJinaClient, createStatusCallback);
  });

  describe('toolName', () => {
    it('should have correct tool name', () => {
      expect(service.toolName).toBe('web_search');
    });
  });

  describe('handle - tool name matching', () => {
    it('should return handled: false for non-matching tool name', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        toolName: 'wrong_tool',
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(false);
      expect(result.toolResult).toBeUndefined();
    });

    it('should return handled: true for matching tool name', async () => {
      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
    });
  });

  describe('handle - status callbacks (V2: no emissions from service)', () => {
    /**
     * V2 ARCHITECTURE: Status emissions moved to MessageHandler.executeConsultToolLoop()
     * WebSearchToolService no longer emits status directly to prevent duplicate/out-of-order events
     */
    it('should NOT emit searching status (V2: MessageHandler handles this)', async () => {
      await service.handle(baseInput, baseContext);

      // V2: No status emissions from WebSearchToolService
      expect(statusChanges).toHaveLength(0);
    });

    it('should NOT emit reading status (V2: MessageHandler handles this)', async () => {
      await service.handle(baseInput, baseContext);

      // V2: No status emissions from WebSearchToolService
      expect(statusChanges).toHaveLength(0);
    });

    it('should NOT emit idle status on completion (V2: MessageHandler handles this)', async () => {
      await service.handle(baseInput, baseContext);

      // V2: No status emissions from WebSearchToolService
      expect(statusChanges).toHaveLength(0);
    });

    it('should NOT emit idle status on error (V2: MessageHandler handles this)', async () => {
      mockJinaClient.search.mockRejectedValue(new Error('Network error'));

      const result = await service.handle(baseInput, baseContext);

      // V2: No status emissions, but error is properly returned
      expect(statusChanges).toHaveLength(0);
      expect(result.toolResult?.content).toContain('Search failed');
    });

    it('should work without status callback', async () => {
      const serviceWithoutCallback = new WebSearchToolService(mockJinaClient);

      // Should not throw
      const result = await serviceWithoutCallback.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
    });

    it('should accept callback factory but not use it (V2)', async () => {
      await service.handle(baseInput, baseContext);

      // Callback factory wired but no emissions
      expect(statusChanges).toHaveLength(0);
    });

    it('should handle multiple conversations independently without status', async () => {
      // First call
      await service.handle(baseInput, baseContext);

      // Clear rate limit for second call
      WebSearchToolService.clearRateLimit('conv-different');

      // Second call with different conversation
      const differentContext: ToolUseContext = {
        ...baseContext,
        conversationId: 'conv-different',
      };
      const result2 = await service.handle(baseInput, differentContext);

      // V2: No status changes, but both searches work
      expect(statusChanges).toHaveLength(0);
      expect(result2.handled).toBe(true);
    });
  });

  describe('handle - Jina client calls', () => {
    it('should call jinaClient.search with correct query and max_results', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: 'test query', max_results: 7 },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test query', 7);
    });

    it('should use default max_results of 5 when not provided', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: 'test query' },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test query', 5);
    });

    it('should call jinaClient.readUrls with top MAX_URLS_TO_READ URLs', async () => {
      await service.handle(baseInput, baseContext);

      const expectedUrls = mockSearchResults
        .slice(0, JINA_CONFIG.MAX_URLS_TO_READ)
        .map((r) => r.url);

      expect(mockJinaClient.readUrls).toHaveBeenCalledWith(expectedUrls);
    });
  });

  describe('handle - result formatting', () => {
    it('should format results with source URLs for citation', async () => {
      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.content).toContain('https://example.com/hipaa-guide');
      expect(result.toolResult?.content).toContain('https://example.com/security-standards');
    });

    it('should include full content when read results available', async () => {
      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.content).toContain('Full content of the HIPAA compliance guide...');
      expect(result.toolResult?.content).toContain('Successfully read');
    });

    it('should include citation instruction', async () => {
      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.content).toContain('cite sources using the URLs');
    });

    it('should return correct toolUseId in result', async () => {
      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.toolUseId).toBe('tool-use-789');
    });
  });

  describe('handle - error handling', () => {
    it('should return graceful error message as tool_result on Jina search failure', async () => {
      mockJinaClient.search.mockRejectedValue(new JinaError('Rate limit exceeded', 'rate_limit'));

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Search failed');
      expect(result.toolResult?.content).toContain('Rate limit exceeded');
      expect(result.toolResult?.content).toContain('answer based on your existing knowledge');
    });

    it('should return graceful error message on network error', async () => {
      mockJinaClient.search.mockRejectedValue(new Error('Network error'));

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Search failed');
      expect(result.toolResult?.content).toContain('Network error');
    });

    it('should never throw - always returns tool_result', async () => {
      mockJinaClient.search.mockRejectedValue(new Error('Unexpected error'));

      // Should not throw
      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
    });
  });

  describe('handle - empty search results', () => {
    it('should handle empty search results gracefully', async () => {
      mockJinaClient.search.mockResolvedValue([]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('No results found');
      expect(result.toolResult?.content).toContain('answer based on your existing knowledge');
    });

    it('should not call readUrls when search returns empty', async () => {
      mockJinaClient.search.mockResolvedValue([]);

      await service.handle(baseInput, baseContext);

      expect(mockJinaClient.readUrls).not.toHaveBeenCalled();
    });
  });

  describe('handle - fail-soft behavior', () => {
    it('should handle partial read failures - returns partial results', async () => {
      // Only one URL successfully read
      mockJinaClient.readUrls.mockResolvedValue([mockReadResults[0]]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Successfully read 1 source');
      expect(result.toolResult?.content).toContain('Full content of the HIPAA compliance guide');
      expect(result.toolResult?.content).toContain('Additional references');
    });

    it('should handle all read failures - returns search snippets only', async () => {
      mockJinaClient.readUrls.mockResolvedValue([]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Could not read full content');
      expect(result.toolResult?.content).toContain('Using search snippets');
      expect(result.toolResult?.content).toContain('Comprehensive guide to HIPAA compliance');
    });

    it('should never fail entire tool call due to read failures', async () => {
      mockJinaClient.readUrls.mockRejectedValue(new Error('Read failed'));

      // Search succeeds but readUrls throws
      const result = await service.handle(baseInput, baseContext);

      // Should still return a result (from catch block)
      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
    });

    it('should return "No results found" when search returns empty', async () => {
      mockJinaClient.search.mockResolvedValue([]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.content).toContain('No results found');
    });
  });

  describe('handle - input validation', () => {
    it('should return error tool_result when query is missing', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {},
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Missing required field: query');
    });

    it('should return error tool_result when query is null', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: null },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Missing required field: query');
    });

    it('should return error tool_result when query is empty string', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: '' },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Invalid query');
      expect(result.toolResult?.content).toContain('cannot be empty');
    });

    it('should return error tool_result when query is whitespace only', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: '   ' },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Invalid query');
    });

    it('should clamp max_results to minimum of 1', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: 'test', max_results: 0 },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test', 1);
    });

    it('should clamp max_results to maximum of 10', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: 'test', max_results: 100 },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test', 10);
    });

    it('should handle negative max_results by clamping to 1', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: 'test', max_results: -5 },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test', 1);
    });

    it('should ignore non-numeric max_results and use default', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: 'test', max_results: 'five' },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test', 5);
    });

    it('should trim whitespace from query', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: '  test query  ' },
      };

      await service.handle(input, baseContext);

      expect(mockJinaClient.search).toHaveBeenCalledWith('test query', 5);
    });
  });

  describe('handle - rate limiting', () => {
    it('should enforce 2-second minimum between searches per conversation', async () => {
      // First search succeeds
      await service.handle(baseInput, baseContext);

      // Second search immediately after should be rate limited
      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Rate limit exceeded');
      expect(mockJinaClient.search).toHaveBeenCalledTimes(1);
    });

    it('should return rate limit error as tool_result when called too quickly', async () => {
      await service.handle(baseInput, baseContext);

      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.content).toContain('Please wait');
      expect(result.toolResult?.content).toContain('second');
    });

    it('should allow search after rate limit window expires', async () => {
      await service.handle(baseInput, baseContext);

      // Clear rate limit to simulate time passing
      WebSearchToolService.clearRateLimit('conv-123');

      const result = await service.handle(baseInput, baseContext);

      expect(result.toolResult?.content).not.toContain('Rate limit exceeded');
      expect(mockJinaClient.search).toHaveBeenCalledTimes(2);
    });

    it('should track rate limits per conversation independently', async () => {
      // First conversation search
      await service.handle(baseInput, baseContext);

      // Different conversation should not be rate limited
      const differentContext: ToolUseContext = {
        ...baseContext,
        conversationId: 'conv-different',
      };

      const result = await service.handle(baseInput, differentContext);

      expect(result.toolResult?.content).not.toContain('Rate limit exceeded');
      expect(mockJinaClient.search).toHaveBeenCalledTimes(2);
    });

    it('should return rate limit error without emitting status (V2)', async () => {
      await service.handle(baseInput, baseContext);
      statusChanges = []; // Clear after first call

      const result = await service.handle(baseInput, baseContext);

      // V2: No status emissions at all (rate limited case returns early)
      expect(statusChanges).toHaveLength(0);
      expect(result.toolResult?.content).toContain('Rate limit exceeded');
    });
  });

  describe('handle - edge cases', () => {
    it('should handle input with additional unknown properties', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: {
          query: 'test',
          max_results: 5,
          unknown_field: 'ignored',
        },
      };

      const result = await service.handle(input, baseContext);

      expect(result.handled).toBe(true);
      expect(mockJinaClient.search).toHaveBeenCalledWith('test', 5);
    });

    it('should handle search results without titles', async () => {
      mockJinaClient.search.mockResolvedValue([
        { title: '', url: 'https://example.com/page', snippet: 'Some content' },
      ]);
      mockJinaClient.readUrls.mockResolvedValue([]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('https://example.com/page');
    });

    it('should handle search results without snippets', async () => {
      mockJinaClient.search.mockResolvedValue([
        { title: 'Page Title', url: 'https://example.com/page', snippet: '' },
      ]);
      mockJinaClient.readUrls.mockResolvedValue([]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Page Title');
    });

    it('should handle read results without titles', async () => {
      mockJinaClient.readUrls.mockResolvedValue([
        { url: 'https://example.com/page', content: 'Full content here' },
      ]);

      const result = await service.handle(baseInput, baseContext);

      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Full content here');
    });

    it('should NOT emit status on validation error (V2)', async () => {
      const input: ToolUseInput = {
        ...baseInput,
        input: { query: '' },
      };

      const result = await service.handle(input, baseContext);

      // V2: No status emissions from WebSearchToolService
      expect(statusChanges).toHaveLength(0);
      // But validation error is properly returned
      expect(result.toolResult?.content).toContain('query');
    });
  });

  describe('static methods', () => {
    it('should clear rate limit for specific conversation', () => {
      // This is tested implicitly via the rate limiting tests
      // Just verify the method exists and doesn't throw
      expect(() => WebSearchToolService.clearRateLimit('conv-123')).not.toThrow();
    });

    it('should clear all rate limits', () => {
      expect(() => WebSearchToolService.clearAllRateLimits()).not.toThrow();
    });
  });
});
