/**
 * Integration Tests for Consult Mode Web Search (Epic 33)
 *
 * Story 33.3.4: Integration & E2E Tests
 *
 * These tests verify the WebSearchToolService and tool loop flow
 * for web search in consult mode, including:
 * - Tool execution with mocked Jina client
 * - Status callbacks emitted correctly
 * - Error handling is graceful
 * - Rate limiting works correctly
 *
 * Test architecture:
 * - Unit tests for WebSearchToolService with mocked IJinaClient
 * - Integration tests for ToolUseRegistry dispatching
 * - No external API calls (all Jina calls mocked)
 */

import type { IJinaClient, JinaSearchResult, JinaReadResult } from '../../src/application/interfaces/IJinaClient';
import type { ToolUseContext, ToolUseInput } from '../../src/application/interfaces/IToolUseHandler';
import { WebSearchToolService, type SearchStatusCallback, type StatusCallbackFactory } from '../../src/application/services/WebSearchToolService';
import { ToolUseRegistry } from '../../src/infrastructure/websocket/ToolUseRegistry';

/**
 * Mock Jina client for testing web search without real API calls
 */
class MockJinaClient implements IJinaClient {
  searchCalled = false;
  readUrlsCalled = false;
  shouldFail = false;
  lastQuery = '';

  async search(query: string, maxResults?: number): Promise<JinaSearchResult[]> {
    this.searchCalled = true;
    this.lastQuery = query;

    if (this.shouldFail) {
      throw new Error('API rate limited');
    }

    return [
      {
        title: 'HIPAA 2024 Updates',
        url: 'https://example.com/hipaa',
        snippet: 'Latest changes to HIPAA regulations for healthcare organizations...',
      },
      {
        title: 'Healthcare Compliance Guide',
        url: 'https://example.com/compliance',
        snippet: 'Complete guide to healthcare compliance requirements...',
      },
    ];
  }

  async readUrl(url: string): Promise<JinaReadResult> {
    return {
      url,
      content: 'Full article content about HIPAA updates and healthcare compliance...',
      title: 'HIPAA 2024 Updates',
    };
  }

  async readUrls(urls: string[]): Promise<JinaReadResult[]> {
    this.readUrlsCalled = true;

    return urls.map(url => ({
      url,
      content: `Full article content from ${url}...`,
      title: 'Source Title',
    }));
  }

  reset(): void {
    this.searchCalled = false;
    this.readUrlsCalled = false;
    this.shouldFail = false;
    this.lastQuery = '';
  }
}

describe('WebSearchToolService Integration Tests', () => {
  let mockJinaClient: MockJinaClient;
  let webSearchService: WebSearchToolService;
  let statusCallbacks: Array<{ conversationId: string; status: string }>;
  let statusCallbackFactory: StatusCallbackFactory;

  beforeEach(() => {
    mockJinaClient = new MockJinaClient();
    statusCallbacks = [];

    // Create a status callback factory that records all status changes
    statusCallbackFactory = (conversationId: string): SearchStatusCallback => {
      return (status: 'searching' | 'reading' | 'idle') => {
        statusCallbacks.push({ conversationId, status });
      };
    };

    webSearchService = new WebSearchToolService(mockJinaClient, statusCallbackFactory);

    // Clear rate limits between tests
    WebSearchToolService.clearAllRateLimits();
  });

  describe('Tool Execution Flow', () => {
    it('should execute web search and return formatted results', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-tool-use-123',
        input: { query: 'HIPAA 2024 updates', max_results: 5 },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-123',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      const result = await webSearchService.handle(input, context);

      // Assert: Tool was handled
      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
      expect(result.toolResult?.toolUseId).toBe('test-tool-use-123');

      // Assert: Jina was called
      expect(mockJinaClient.searchCalled).toBe(true);
      expect(mockJinaClient.readUrlsCalled).toBe(true);

      // Assert: Result contains formatted content with citations
      const content = result.toolResult?.content || '';
      expect(content).toContain('Found 2 search result(s)');
      expect(content).toContain('https://example.com/hipaa');
      expect(content).toContain('Please cite sources');
    });

    it('should emit status callbacks during search', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-tool-use-456',
        input: { query: 'healthcare regulations', max_results: 3 },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-456',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      await webSearchService.handle(input, context);

      // Assert: Status callbacks were emitted in correct order
      expect(statusCallbacks.length).toBeGreaterThanOrEqual(3);

      // First callback should be 'searching'
      expect(statusCallbacks[0]).toEqual({
        conversationId: 'conv-456',
        status: 'searching',
      });

      // Should have 'reading' at some point
      const readingCallback = statusCallbacks.find(c => c.status === 'reading');
      expect(readingCallback).toBeDefined();
      expect(readingCallback?.conversationId).toBe('conv-456');

      // Last callback should be 'idle'
      const lastCallback = statusCallbacks[statusCallbacks.length - 1];
      expect(lastCallback).toEqual({
        conversationId: 'conv-456',
        status: 'idle',
      });
    });

    it('should only handle web_search tool', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'other_tool',
        toolUseId: 'test-tool-use-789',
        input: { query: 'test' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-789',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      const result = await webSearchService.handle(input, context);

      // Assert: Tool was NOT handled
      expect(result.handled).toBe(false);
      expect(result.toolResult).toBeUndefined();

      // Assert: Jina was NOT called
      expect(mockJinaClient.searchCalled).toBe(false);
    });
  });

  describe('PHI Redaction', () => {
    it('should redact email addresses from search queries', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-phi-email',
        input: { query: 'patient john.doe@hospital.com compliance' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-phi-1',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      await webSearchService.handle(input, context);

      // Assert: Email was redacted in the query sent to Jina
      expect(mockJinaClient.lastQuery).toContain('[REDACTED_EMAIL]');
      expect(mockJinaClient.lastQuery).not.toContain('john.doe@hospital.com');
    });

    it('should redact phone numbers from search queries', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-phi-phone',
        input: { query: 'patient record 555-123-4567 updates' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-phi-2',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      await webSearchService.handle(input, context);

      // Assert: Phone was redacted
      expect(mockJinaClient.lastQuery).toContain('[REDACTED_PHONE]');
      expect(mockJinaClient.lastQuery).not.toContain('555-123-4567');
    });

    it('should redact SSN patterns from search queries', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-phi-ssn',
        input: { query: 'patient 123-45-6789 medical history' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-phi-3',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      await webSearchService.handle(input, context);

      // Assert: SSN was redacted
      expect(mockJinaClient.lastQuery).toContain('[REDACTED_SSN]');
      expect(mockJinaClient.lastQuery).not.toContain('123-45-6789');
    });
  });

  describe('Error Handling', () => {
    it('should handle Jina API errors gracefully', async () => {
      // Arrange: Make Jina fail
      mockJinaClient.shouldFail = true;

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-error-123',
        input: { query: 'test query' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-error-1',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      const result = await webSearchService.handle(input, context);

      // Assert: Tool was handled (returned error as result, not thrown)
      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();

      // Assert: Error message included
      const content = result.toolResult?.content || '';
      expect(content).toContain('Search failed');
      expect(content).toContain('answer based on your existing knowledge');
    });

    it('should emit idle status even on error', async () => {
      // Arrange
      mockJinaClient.shouldFail = true;

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-error-456',
        input: { query: 'test query' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-error-2',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      await webSearchService.handle(input, context);

      // Assert: Last status should be idle
      const lastCallback = statusCallbacks[statusCallbacks.length - 1];
      expect(lastCallback?.status).toBe('idle');
    });

    it('should return error for missing query', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-missing-query',
        input: {}, // Missing query
      };

      const context: ToolUseContext = {
        conversationId: 'conv-missing-1',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      const result = await webSearchService.handle(input, context);

      // Assert
      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('Missing required field: query');
    });

    it('should return error for empty query', async () => {
      // Arrange
      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-empty-query',
        input: { query: '   ' }, // Empty after trim
      };

      const context: ToolUseContext = {
        conversationId: 'conv-empty-1',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      const result = await webSearchService.handle(input, context);

      // Assert
      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('query cannot be empty');
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit rapid requests from same conversation', async () => {
      // Arrange
      const context: ToolUseContext = {
        conversationId: 'conv-rate-limit-1',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // First request
      const input1: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-rate-1',
        input: { query: 'first query' },
      };

      const result1 = await webSearchService.handle(input1, context);
      expect(result1.handled).toBe(true);
      expect(mockJinaClient.searchCalled).toBe(true);

      // Reset Jina mock (but NOT rate limit)
      mockJinaClient.reset();

      // Immediate second request
      const input2: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-rate-2',
        input: { query: 'second query' },
      };

      const result2 = await webSearchService.handle(input2, context);

      // Assert: Second request was rate limited
      expect(result2.handled).toBe(true);
      expect(result2.toolResult?.content).toContain('Rate limit exceeded');
      expect(mockJinaClient.searchCalled).toBe(false);
    });

    it('should allow requests from different conversations', async () => {
      // First request from conv-1
      const context1: ToolUseContext = {
        conversationId: 'conv-different-1',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      const input1: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-diff-1',
        input: { query: 'query one' },
      };

      await webSearchService.handle(input1, context1);
      expect(mockJinaClient.searchCalled).toBe(true);

      // Reset Jina mock
      mockJinaClient.reset();

      // Immediate request from conv-2 (different conversation)
      const context2: ToolUseContext = {
        conversationId: 'conv-different-2',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      const input2: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-diff-2',
        input: { query: 'query two' },
      };

      const result2 = await webSearchService.handle(input2, context2);

      // Assert: Second request NOT rate limited (different conversation)
      expect(result2.handled).toBe(true);
      expect(result2.toolResult?.content).not.toContain('Rate limit');
      expect(mockJinaClient.searchCalled).toBe(true);
    });
  });

  describe('Empty Results Handling', () => {
    it('should handle empty search results gracefully', async () => {
      // Arrange: Mock empty results
      mockJinaClient.search = jest.fn().mockResolvedValue([]);

      const input: ToolUseInput = {
        toolName: 'web_search',
        toolUseId: 'test-empty-results',
        input: { query: 'very obscure query' },
      };

      const context: ToolUseContext = {
        conversationId: 'conv-empty-results',
        userId: 'user-123',
        assessmentId: null,
        mode: 'consult',
      };

      // Act
      const result = await webSearchService.handle(input, context);

      // Assert
      expect(result.handled).toBe(true);
      expect(result.toolResult?.content).toContain('No results found');
      expect(result.toolResult?.content).toContain('answer based on your existing knowledge');
    });
  });
});

describe('ToolUseRegistry Integration Tests', () => {
  let mockJinaClient: MockJinaClient;
  let webSearchService: WebSearchToolService;
  let registry: ToolUseRegistry;

  beforeEach(() => {
    mockJinaClient = new MockJinaClient();
    webSearchService = new WebSearchToolService(mockJinaClient);
    registry = new ToolUseRegistry();
    registry.register(webSearchService);

    WebSearchToolService.clearAllRateLimits();
  });

  it('should dispatch web_search tool to WebSearchToolService', async () => {
    // Arrange
    const input: ToolUseInput = {
      toolName: 'web_search',
      toolUseId: 'registry-test-1',
      input: { query: 'healthcare compliance' },
    };

    const context: ToolUseContext = {
      conversationId: 'registry-conv-1',
      userId: 'user-123',
      assessmentId: null,
      mode: 'consult',
    };

    // Act
    const result = await registry.dispatch(input, context);

    // Assert
    expect(result.handled).toBe(true);
    expect(mockJinaClient.searchCalled).toBe(true);
    expect(result.toolResult).toBeDefined();
  });

  it('should return not handled for unknown tools', async () => {
    // Arrange
    const input: ToolUseInput = {
      toolName: 'unknown_tool',
      toolUseId: 'registry-test-2',
      input: {},
    };

    const context: ToolUseContext = {
      conversationId: 'registry-conv-2',
      userId: 'user-123',
      assessmentId: null,
      mode: 'consult',
    };

    // Act
    const result = await registry.dispatch(input, context);

    // Assert
    expect(result.handled).toBe(false);
    expect(mockJinaClient.searchCalled).toBe(false);
  });
});
