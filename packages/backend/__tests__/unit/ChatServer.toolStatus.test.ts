/**
 * Unit tests for ChatServer tool_status WebSocket event emission
 *
 * Story 33.3.1: Tool Status WebSocket Event
 *
 * V2 ARCHITECTURE CHANGE:
 * As of Epic 33 V2 multi-search implementation, status emissions are handled by
 * MessageHandler.executeConsultToolLoop(), NOT by WebSearchToolService.
 *
 * This prevents duplicate/out-of-order status events when running multiple
 * search iterations. MessageHandler now emits:
 * - 'searching' at start of each iteration
 * - 'reading' after tool dispatch returns
 * - 'idle' when loop completes
 *
 * Tests now validate:
 * - WebSearchToolService does NOT emit status events directly
 * - Callback factory is still wired up (for potential future use)
 * - Search functionality works independently of status emission
 */

import { WebSearchToolService, StatusCallbackFactory } from '../../src/application/services/WebSearchToolService.js';
import type { IJinaClient, JinaSearchResult, JinaReadResult } from '../../src/application/interfaces/IJinaClient.js';
import type { ToolUseContext } from '../../src/application/interfaces/IToolUseHandler.js';
import type { ToolStatusPayload } from '../../src/infrastructure/websocket/ChatServer.js';

// Mock Jina client
const createMockJinaClient = (): jest.Mocked<IJinaClient> => ({
  search: jest.fn(),
  readUrl: jest.fn(),
  readUrls: jest.fn(),
});

describe('ChatServer Tool Status WebSocket Events (Story 33.3.1)', () => {
  let mockJinaClient: jest.Mocked<IJinaClient>;
  let emittedPayloads: ToolStatusPayload[];
  let createStatusCallback: StatusCallbackFactory;

  const mockSearchResults: JinaSearchResult[] = [
    {
      title: 'Test Result',
      url: 'https://example.com/test',
      snippet: 'Test snippet',
    },
  ];

  const mockReadResults: JinaReadResult[] = [
    {
      url: 'https://example.com/test',
      title: 'Test Result',
      content: 'Test content',
    },
  ];

  const baseContext: ToolUseContext = {
    conversationId: 'conv-status-test',
    userId: 'user-123',
    assessmentId: null,
    mode: 'consult',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    emittedPayloads = [];
    mockJinaClient = createMockJinaClient();

    // Default successful responses
    mockJinaClient.search.mockResolvedValue(mockSearchResults);
    mockJinaClient.readUrls.mockResolvedValue(mockReadResults);

    // Clear rate limits before each test
    WebSearchToolService.clearAllRateLimits();

    // Simulate ChatServer's callback factory that would emit to Socket.IO
    createStatusCallback = (conversationId: string) => {
      return (status: 'searching' | 'reading' | 'idle') => {
        emittedPayloads.push({ conversationId, status });
      };
    };
  });

  describe('V2: WebSearchToolService does NOT emit status (MessageHandler handles it)', () => {
    it('should NOT emit any status events directly', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-1',
          input: { query: 'test query' },
        },
        baseContext
      );

      // V2: WebSearchToolService no longer emits status - MessageHandler does
      expect(emittedPayloads).toHaveLength(0);
    });

    it('should still perform search successfully without emitting status', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      const result = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-2',
          input: { query: 'test query' },
        },
        baseContext
      );

      // Search still works
      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
      expect(mockJinaClient.search).toHaveBeenCalledWith('test query', 5);
      // But no status emitted
      expect(emittedPayloads).toHaveLength(0);
    });

    it('should not emit status even on successful completion with read', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-3',
          input: { query: 'test query' },
        },
        baseContext
      );

      // V2: No status emissions from WebSearchToolService
      expect(emittedPayloads).toHaveLength(0);
    });

    it('should not emit status on error (MessageHandler handles errors)', async () => {
      mockJinaClient.search.mockRejectedValue(new Error('Network error'));
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      const result = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-4',
          input: { query: 'test query' },
        },
        baseContext
      );

      // V2: No status emissions, but error is returned in result
      expect(emittedPayloads).toHaveLength(0);
      expect(result.toolResult?.content).toContain('Search failed');
    });

    it('should not emit any sequence (V2: MessageHandler controls sequence)', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-5',
          input: { query: 'test query' },
        },
        baseContext
      );

      // V2: No status emissions from WebSearchToolService
      expect(emittedPayloads).toHaveLength(0);
    });

    it('should not emit status when search returns empty', async () => {
      mockJinaClient.search.mockResolvedValue([]);
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      const result = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-6',
          input: { query: 'no results query' },
        },
        baseContext
      );

      // V2: No status emissions
      expect(emittedPayloads).toHaveLength(0);
      expect(result.toolResult?.content).toContain('No results found');
    });
  });

  describe('V2: callback factory still wired (for potential future use)', () => {
    it('should accept callback factory in constructor', async () => {
      // Callback factory is still wired up even though not currently used
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-7',
          input: { query: 'test query' },
        },
        baseContext
      );

      // Search works, no status emitted
      expect(emittedPayloads).toHaveLength(0);
    });

    it('should work without callback factory', async () => {
      // Can create service without callback factory
      const service = new WebSearchToolService(mockJinaClient);

      const result = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-8a',
          input: { query: 'query 1' },
        },
        { ...baseContext, conversationId: 'conv-A' }
      );

      expect(result.handled).toBe(true);
    });

    it('should handle multiple conversations independently', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      // First conversation
      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-8b',
          input: { query: 'query 1' },
        },
        { ...baseContext, conversationId: 'conv-A' }
      );

      // Clear rate limit for second conversation
      WebSearchToolService.clearRateLimit('conv-B');

      // Second conversation
      const result2 = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-8c',
          input: { query: 'query 2' },
        },
        { ...baseContext, conversationId: 'conv-B' }
      );

      // V2: No status emissions, but both searches work
      expect(emittedPayloads).toHaveLength(0);
      expect(result2.handled).toBe(true);
    });

    it('should receive conversationId from ToolUseContext', async () => {
      const receivedConversationIds: string[] = [];
      const trackingFactory: StatusCallbackFactory = (conversationId: string) => {
        receivedConversationIds.push(conversationId);
        return () => {}; // No-op callback, we just want to track the conversationId
      };

      const service = new WebSearchToolService(mockJinaClient, trackingFactory);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-9',
          input: { query: 'test query' },
        },
        { ...baseContext, conversationId: 'conv-from-context' }
      );

      expect(receivedConversationIds).toContain('conv-from-context');
    });
  });

  describe('callback factory integration', () => {
    it('should create new callback for each handle call', async () => {
      let callbackCreationCount = 0;
      const countingFactory: StatusCallbackFactory = (conversationId: string) => {
        callbackCreationCount++;
        return () => {};
      };

      const service = new WebSearchToolService(mockJinaClient, countingFactory);

      // First call
      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-10a',
          input: { query: 'query 1' },
        },
        { ...baseContext, conversationId: 'conv-1' }
      );

      // Clear rate limit for second call
      WebSearchToolService.clearRateLimit('conv-2');

      // Second call with different conversation
      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-10b',
          input: { query: 'query 2' },
        },
        { ...baseContext, conversationId: 'conv-2' }
      );

      // Factory should be called once per handle() call
      expect(callbackCreationCount).toBe(2);
    });

    it('should work without callback factory (graceful degradation)', async () => {
      const serviceWithoutCallback = new WebSearchToolService(mockJinaClient);

      // Should not throw
      const result = await serviceWithoutCallback.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-11',
          input: { query: 'test query' },
        },
        baseContext
      );

      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
    });

    it('should not emit status on validation error (V2)', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      const result = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-12',
          input: { query: '' }, // Empty query = validation error
        },
        baseContext
      );

      // V2: No status emissions, but validation error is returned
      expect(emittedPayloads).toHaveLength(0);
      expect(result.toolResult?.content).toContain('query');
    });
  });

  describe('V2: simulated ChatServer integration (status via MessageHandler)', () => {
    /**
     * V2: WebSearchToolService no longer emits status directly.
     * This test verifies the callback factory is still wired but unused.
     * Status emissions now come from MessageHandler.executeConsultToolLoop().
     */
    it('should NOT emit events from WebSearchToolService (V2)', async () => {
      // Simulate the io.of('/chat').emit call from ChatServer
      const socketIOEmissions: Array<{ event: string; payload: unknown }> = [];

      const simulatedChatServerFactory: StatusCallbackFactory = (conversationId: string) => {
        return (status: 'searching' | 'reading' | 'idle') => {
          // This is what ChatServer does: this.io.of('/chat').emit('tool_status', payload)
          socketIOEmissions.push({
            event: 'tool_status',
            payload: { conversationId, status },
          });
        };
      };

      const service = new WebSearchToolService(mockJinaClient, simulatedChatServerFactory);

      const result = await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-13',
          input: { query: 'HIPAA compliance' },
        },
        { ...baseContext, conversationId: 'conv-socket-test' }
      );

      // V2: No events emitted from WebSearchToolService
      // Status events now come from MessageHandler.executeConsultToolLoop()
      expect(socketIOEmissions).toHaveLength(0);

      // But search still works
      expect(result.handled).toBe(true);
      expect(result.toolResult).toBeDefined();
    });
  });
});
