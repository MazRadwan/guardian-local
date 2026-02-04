/**
 * Unit tests for ChatServer tool_status WebSocket event emission
 *
 * Story 33.3.1: Tool Status WebSocket Event
 *
 * Tests validate:
 * - tool_status event emitted with 'searching' status at search start
 * - tool_status event emitted with 'reading' status before reading URLs
 * - tool_status event emitted with 'idle' status on completion
 * - tool_status event emitted with 'idle' status on error
 * - Event includes correct conversationId
 * - Callback factory receives conversationId from context
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

  describe('tool_status event emission sequence', () => {
    it('should emit searching status at start of search', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-1',
          input: { query: 'test query' },
        },
        baseContext
      );

      expect(emittedPayloads[0]).toEqual({
        conversationId: 'conv-status-test',
        status: 'searching',
      });
    });

    it('should emit reading status before reading URLs', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-2',
          input: { query: 'test query' },
        },
        baseContext
      );

      const readingPayload = emittedPayloads.find((p) => p.status === 'reading');
      expect(readingPayload).toEqual({
        conversationId: 'conv-status-test',
        status: 'reading',
      });
    });

    it('should emit idle status on successful completion', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-3',
          input: { query: 'test query' },
        },
        baseContext
      );

      const lastPayload = emittedPayloads[emittedPayloads.length - 1];
      expect(lastPayload).toEqual({
        conversationId: 'conv-status-test',
        status: 'idle',
      });
    });

    it('should emit idle status on error', async () => {
      mockJinaClient.search.mockRejectedValue(new Error('Network error'));
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-4',
          input: { query: 'test query' },
        },
        baseContext
      );

      const lastPayload = emittedPayloads[emittedPayloads.length - 1];
      expect(lastPayload).toEqual({
        conversationId: 'conv-status-test',
        status: 'idle',
      });
    });

    it('should emit complete sequence: searching -> reading -> idle', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-5',
          input: { query: 'test query' },
        },
        baseContext
      );

      expect(emittedPayloads.map((p) => p.status)).toEqual(['searching', 'reading', 'idle']);
    });

    it('should skip reading status when search returns empty', async () => {
      mockJinaClient.search.mockResolvedValue([]);
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-6',
          input: { query: 'no results query' },
        },
        baseContext
      );

      // Should be: searching -> idle (no reading)
      expect(emittedPayloads.map((p) => p.status)).toEqual(['searching', 'idle']);
    });
  });

  describe('conversationId in tool_status payloads', () => {
    it('should include correct conversationId in all emitted payloads', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-7',
          input: { query: 'test query' },
        },
        baseContext
      );

      // All payloads should have the same conversationId
      expect(emittedPayloads.every((p) => p.conversationId === 'conv-status-test')).toBe(true);
    });

    it('should use different conversationId for different contexts', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      // First conversation
      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-8a',
          input: { query: 'query 1' },
        },
        { ...baseContext, conversationId: 'conv-A' }
      );

      // Clear rate limit for second conversation
      WebSearchToolService.clearRateLimit('conv-B');

      // Second conversation
      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-8b',
          input: { query: 'query 2' },
        },
        { ...baseContext, conversationId: 'conv-B' }
      );

      // Should have payloads for both conversations
      const convAPayloads = emittedPayloads.filter((p) => p.conversationId === 'conv-A');
      const convBPayloads = emittedPayloads.filter((p) => p.conversationId === 'conv-B');

      expect(convAPayloads.length).toBeGreaterThan(0);
      expect(convBPayloads.length).toBeGreaterThan(0);
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

    it('should emit idle on validation error', async () => {
      const service = new WebSearchToolService(mockJinaClient, createStatusCallback);

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-12',
          input: { query: '' }, // Empty query = validation error
        },
        baseContext
      );

      // Should emit: searching -> idle (validation error cuts short)
      expect(emittedPayloads[emittedPayloads.length - 1].status).toBe('idle');
    });
  });

  describe('simulated ChatServer integration', () => {
    /**
     * This test simulates how ChatServer would create the callback factory
     * and wire it up with Socket.IO emission
     */
    it('should emit events matching Socket.IO format from ChatServer', async () => {
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

      await service.handle(
        {
          toolName: 'web_search',
          toolUseId: 'tool-13',
          input: { query: 'HIPAA compliance' },
        },
        { ...baseContext, conversationId: 'conv-socket-test' }
      );

      // Verify the Socket.IO event format
      expect(socketIOEmissions.length).toBeGreaterThan(0);
      expect(socketIOEmissions[0]).toEqual({
        event: 'tool_status',
        payload: {
          conversationId: 'conv-socket-test',
          status: 'searching',
        },
      });

      // Verify all emissions have 'tool_status' event name
      expect(socketIOEmissions.every((e) => e.event === 'tool_status')).toBe(true);

      // Verify final status is 'idle'
      const lastEmission = socketIOEmissions[socketIOEmissions.length - 1];
      expect((lastEmission.payload as ToolStatusPayload).status).toBe('idle');
    });
  });
});
