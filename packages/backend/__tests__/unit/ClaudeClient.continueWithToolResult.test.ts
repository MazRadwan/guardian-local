/**
 * Unit tests for ClaudeClient.continueWithToolResult
 *
 * Part of Epic 33: Consult Search Tool
 * Story 33.1.4: Claude Client Tool Result Support
 *
 * Tests verify that continueWithToolResult correctly:
 * 1. Builds correct message array with tool_use and tool_result
 * 2. Formats tool_result blocks per Anthropic API spec
 * 3. Serializes tool_use_id correctly (matching original tool_use.id)
 * 4. Streams response after tool_result submission
 * 5. Handles multiple tool_results
 * 6. Preserves system prompt in follow-up call
 * 7. Maintains tool definitions in follow-up call
 * 8. Handles API errors gracefully
 */

import type {
  ToolUseBlock,
  ToolResultBlock,
} from '../../src/application/interfaces/IClaudeClient.js';

// Mock the entire Anthropic SDK module before importing ClaudeClient
const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
      stream: mockStream,
    },
  }));
});

// Import after mock
import { ClaudeClient } from '../../src/infrastructure/ai/ClaudeClient.js';

describe('ClaudeClient.continueWithToolResult', () => {
  let client: ClaudeClient;

  const testMessages = [
    { role: 'user' as const, content: 'What are the latest HIPAA updates?' },
  ];

  const testToolUseBlocks: ToolUseBlock[] = [
    {
      type: 'tool_use',
      id: 'toolu_01abc123',
      name: 'web_search',
      input: { query: 'HIPAA updates 2024' },
    },
  ];

  const testToolResults: ToolResultBlock[] = [
    {
      type: 'tool_result',
      tool_use_id: 'toolu_01abc123',
      content: 'Search results: HHS released new guidance on HIPAA compliance...',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeClient('test-api-key');
  });

  /**
   * Helper to create a mock async iterator for streaming events
   */
  function createMockStreamEvents(events: Array<{ type: string; [key: string]: unknown }>) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event;
        }
      },
      currentMessage: { stop_reason: 'end_turn' },
    };
  }

  describe('message array structure', () => {
    it('should build message array with [original messages, assistant tool_use, user tool_result]', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      // Consume the generator
      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      // Verify the call was made
      expect(mockStream).toHaveBeenCalledTimes(1);

      // Get the messages from the call
      const callArgs = mockStream.mock.calls[0][0];
      const messages = callArgs.messages;

      // Verify message structure: 3 messages total
      expect(messages).toHaveLength(3);

      // 1. Original user message
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'What are the latest HIPAA updates?',
      });

      // 2. Assistant message with tool_use
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toHaveLength(1);
      expect(messages[1].content[0]).toEqual({
        type: 'tool_use',
        id: 'toolu_01abc123',
        name: 'web_search',
        input: { query: 'HIPAA updates 2024' },
      });

      // 3. User message with tool_result
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toHaveLength(1);
      expect(messages[2].content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'toolu_01abc123',
        content: 'Search results: HHS released new guidance on HIPAA compliance...',
      });
    });
  });

  describe('tool_result serialization', () => {
    it('should format tool_result blocks with correct fields', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      for await (const chunk of generator) {
        // Consume
      }

      const callArgs = mockStream.mock.calls[0][0];
      const toolResultMessage = callArgs.messages[2];

      // Verify tool_result block has correct structure
      const toolResultBlock = toolResultMessage.content[0];
      expect(toolResultBlock).toHaveProperty('type', 'tool_result');
      expect(toolResultBlock).toHaveProperty('tool_use_id', 'toolu_01abc123');
      expect(toolResultBlock).toHaveProperty('content');
      // Verify no extra fields
      expect(Object.keys(toolResultBlock)).toEqual(['type', 'tool_use_id', 'content']);
    });

    it('should ensure tool_use_id matches original tool_use.id', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      for await (const chunk of generator) {
        // Consume
      }

      const callArgs = mockStream.mock.calls[0][0];
      const toolUseMessage = callArgs.messages[1];
      const toolResultMessage = callArgs.messages[2];

      const toolUseId = toolUseMessage.content[0].id;
      const toolResultToolUseId = toolResultMessage.content[0].tool_use_id;

      expect(toolResultToolUseId).toBe(toolUseId);
      expect(toolResultToolUseId).toBe('toolu_01abc123');
    });
  });

  describe('streaming response', () => {
    it('should stream text deltas from response', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Based ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'on the search results...' } },
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      // Should have 3 chunks: 2 text deltas + 1 final
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ content: 'Based ', isComplete: false });
      expect(chunks[1]).toEqual({ content: 'on the search results...', isComplete: false });
      expect(chunks[2]).toEqual({
        content: '',
        isComplete: true,
        toolUse: undefined,
        stopReason: 'end_turn',
      });
    });

    it('should include stop reason in final chunk', async () => {
      const mockEvents = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'message_stop' };
        },
        currentMessage: { stop_reason: 'end_turn' },
      };
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks[chunks.length - 1].stopReason).toBe('end_turn');
    });
  });

  describe('multiple tool results', () => {
    it('should handle multiple tool_results in single continuation', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Combined results...' } },
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const multipleToolUseBlocks: ToolUseBlock[] = [
        {
          type: 'tool_use',
          id: 'toolu_01abc123',
          name: 'web_search',
          input: { query: 'HIPAA updates' },
        },
        {
          type: 'tool_use',
          id: 'toolu_02def456',
          name: 'web_search',
          input: { query: 'HIPAA penalties' },
        },
      ];

      const multipleToolResults: ToolResultBlock[] = [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_01abc123',
          content: 'HIPAA updates result...',
        },
        {
          type: 'tool_result',
          tool_use_id: 'toolu_02def456',
          content: 'HIPAA penalties result...',
        },
      ];

      const generator = client.continueWithToolResult(
        testMessages,
        multipleToolUseBlocks,
        multipleToolResults
      );

      for await (const chunk of generator) {
        // Consume
      }

      const callArgs = mockStream.mock.calls[0][0];
      const messages = callArgs.messages;

      // Assistant message should have 2 tool_use blocks
      expect(messages[1].content).toHaveLength(2);
      expect(messages[1].content[0].id).toBe('toolu_01abc123');
      expect(messages[1].content[1].id).toBe('toolu_02def456');

      // User message should have 2 tool_result blocks
      expect(messages[2].content).toHaveLength(2);
      expect(messages[2].content[0].tool_use_id).toBe('toolu_01abc123');
      expect(messages[2].content[1].tool_use_id).toBe('toolu_02def456');
    });
  });

  describe('options handling', () => {
    it('should preserve system prompt in follow-up call', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults,
        { systemPrompt: 'You are a healthcare compliance assistant.' }
      );

      for await (const chunk of generator) {
        // Consume
      }

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a healthcare compliance assistant.');
    });

    it('should maintain tool definitions in follow-up call', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const tools = [
        {
          name: 'web_search',
          description: 'Search the web',
          input_schema: {
            type: 'object' as const,
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ];

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults,
        { tools }
      );

      for await (const chunk of generator) {
        // Consume
      }

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.tools).toEqual(tools);
    });

    it('should use prompt caching when enabled', async () => {
      const mockEvents = createMockStreamEvents([
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults,
        {
          systemPrompt: 'System prompt',
          usePromptCache: true,
        }
      );

      for await (const chunk of generator) {
        // Consume
      }

      // Should have cache_control in system prompt
      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.system).toEqual([
        {
          type: 'text',
          text: 'System prompt',
          cache_control: { type: 'ephemeral' },
        },
      ]);

      // Should have caching header
      const requestOptions = mockStream.mock.calls[0][1];
      expect(requestOptions?.headers).toEqual({
        'anthropic-beta': 'prompt-caching-2024-07-31',
      });
    });
  });

  describe('error handling', () => {
    it('should handle non-retryable API errors gracefully', async () => {
      mockStream.mockRejectedValue(new Error('Invalid API key'));

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      await expect(async () => {
        for await (const chunk of generator) {
          // Consume
        }
      }).rejects.toThrow('Tool result continuation failed: Invalid API key');
    });

    it('should retry on overloaded errors', async () => {
      // First call fails with overloaded
      mockStream.mockRejectedValueOnce(new Error('API overloaded'));

      // Second call succeeds
      const mockEvents = createMockStreamEvents([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Success' } },
        { type: 'message_stop' },
      ]);
      mockStream.mockResolvedValueOnce(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      // Should have succeeded on retry
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Success');

      // Should have been called twice
      expect(mockStream).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout for retry delay

    it('should throw after max retry attempts', async () => {
      mockStream.mockRejectedValue(new Error('API overloaded'));

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      await expect(async () => {
        for await (const chunk of generator) {
          // Consume
        }
      }).rejects.toThrow('Tool result continuation failed after 3 attempts');

      // Should have tried 3 times
      expect(mockStream).toHaveBeenCalledTimes(3);
    }, 30000); // Increase timeout for multiple retries
  });

  describe('nested tool calls', () => {
    it('should handle tool_use blocks in response (for nested tool calls)', async () => {
      const mockEvents = createMockStreamEvents([
        {
          type: 'content_block_start',
          content_block: {
            type: 'tool_use',
            id: 'toolu_nested_123',
            name: 'another_tool',
          },
        },
        {
          type: 'content_block_delta',
          delta: {
            type: 'input_json_delta',
            partial_json: '{"param": "value"}',
          },
        },
        { type: 'content_block_stop' },
        { type: 'message_stop' },
      ]);
      // Set stop_reason to tool_use for nested tool call scenario
      mockEvents.currentMessage = { stop_reason: 'tool_use' };
      mockStream.mockResolvedValue(mockEvents);

      const generator = client.continueWithToolResult(
        testMessages,
        testToolUseBlocks,
        testToolResults
      );

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      // Final chunk should have tool use
      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.isComplete).toBe(true);
      expect(finalChunk.toolUse).toBeDefined();
      expect(finalChunk.toolUse).toHaveLength(1);
      expect(finalChunk.toolUse![0]).toEqual({
        type: 'tool_use',
        id: 'toolu_nested_123',
        name: 'another_tool',
        input: { param: 'value' },
      });
      expect(finalChunk.stopReason).toBe('tool_use');
    });
  });
});
