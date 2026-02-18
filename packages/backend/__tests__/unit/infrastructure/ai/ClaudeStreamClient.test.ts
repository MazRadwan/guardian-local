/**
 * Unit tests for ClaudeStreamClient (Story 39.4.4)
 *
 * Tests verify that ClaudeStreamClient.streamWithTool() correctly handles:
 * 1. Anthropic stream API invocation with correct parameters
 * 2. onTextDelta callback for text deltas
 * 3. onToolUse callback with parsed tool input
 * 4. Abort signal cancellation
 * 5. getModelId returns model string
 * 6. Multi-block userPrompt with cacheable mapping (usePromptCache=true)
 * 7. Multi-block userPrompt WITHOUT cache_control (usePromptCache=false)
 * 8. onUsage callback for metrics collection
 */

const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
      stream: mockStream,
    },
  }));
});

import { ClaudeStreamClient } from '../../../../src/infrastructure/ai/ClaudeStreamClient.js';
import type {
  ToolDefinition,
  ContentBlockForPrompt,
} from '../../../../src/application/interfaces/ILLMClient.js';

describe('ClaudeStreamClient (Story 39.4.4)', () => {
  let client: ClaudeStreamClient;

  const testTool: ToolDefinition = {
    name: 'score_dimension',
    description: 'Score a vendor dimension',
    input_schema: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        rationale: { type: 'string' },
      },
      required: ['score', 'rationale'],
    },
  };

  /**
   * Create a mock async iterable stream with configurable events and usage.
   */
  const createMockStream = (
    events?: Array<Record<string, unknown>>,
    usage?: Record<string, number>,
    stopReason?: string
  ) => {
    const streamEvents = events ?? [{ type: 'message_stop' }];
    let index = 0;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (index < streamEvents.length) {
            return { value: streamEvents[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      }),
      currentMessage: {
        stop_reason: stopReason ?? 'end_turn',
        usage: usage ?? { input_tokens: 100, output_tokens: 50 },
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeStreamClient('test-api-key');
  });

  // =========================================================================
  // getModelId
  // =========================================================================

  describe('getModelId', () => {
    it('should return the model identifier string', () => {
      const modelId = client.getModelId();
      expect(typeof modelId).toBe('string');
      expect(modelId.length).toBeGreaterThan(0);
      expect(modelId).toContain('claude');
    });
  });

  // =========================================================================
  // streamWithTool - basic API invocation
  // =========================================================================

  describe('streamWithTool API invocation', () => {
    it('should call Anthropic stream API with correct parameters', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this vendor response',
        tools: [testTool],
        maxTokens: 4096,
        temperature: 0,
      });

      expect(mockStream).toHaveBeenCalledTimes(1);
      const [requestBody, requestOptions] = mockStream.mock.calls[0];

      expect(requestBody.model).toContain('claude');
      expect(requestBody.max_tokens).toBe(4096);
      expect(requestBody.system).toBe('You are a scoring assistant');
      expect(requestBody.messages).toEqual([
        { role: 'user', content: 'Score this vendor response' },
      ]);
      expect(requestBody.tools).toEqual([
        {
          name: 'score_dimension',
          description: 'Score a vendor dimension',
          input_schema: testTool.input_schema,
        },
      ]);
      expect(requestBody.temperature).toBe(0);
      // No caching, no abort → no requestOptions
      expect(requestOptions).toBeUndefined();
    });

    it('should use default maxTokens of 8192 when not specified', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User prompt',
        tools: [testTool],
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.max_tokens).toBe(8192);
    });

    it('should omit tools from request when tools array is empty', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User prompt',
        tools: [],
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.tools).toBeUndefined();
    });

    it('should pass tool_choice when provided', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User prompt',
        tools: [testTool],
        tool_choice: { type: 'tool', name: 'score_dimension' },
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.tool_choice).toEqual({ type: 'tool', name: 'score_dimension' });
    });
  });

  // =========================================================================
  // onTextDelta callback
  // =========================================================================

  describe('onTextDelta callback', () => {
    it('should fire onTextDelta for text deltas', async () => {
      const textDeltas: string[] = [];
      const events = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
        { type: 'message_stop' },
      ];
      mockStream.mockResolvedValue(createMockStream(events));

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User',
        tools: [testTool],
        onTextDelta: (delta) => textDeltas.push(delta),
      });

      expect(textDeltas).toEqual(['Hello ', 'world']);
    });
  });

  // =========================================================================
  // onToolUse callback
  // =========================================================================

  describe('onToolUse callback', () => {
    it('should fire onToolUse with parsed tool input', async () => {
      const toolCalls: Array<{ name: string; input: unknown }> = [];
      const events = [
        {
          type: 'content_block_start',
          content_block: { type: 'tool_use', id: 'tool-1', name: 'score_dimension' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{"score":4,' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '"rationale":"Strong"}' },
        },
        { type: 'content_block_stop' },
        { type: 'message_stop' },
      ];
      mockStream.mockResolvedValue(createMockStream(events, undefined, 'tool_use'));

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'Score this',
        tools: [testTool],
        onToolUse: (name, input) => toolCalls.push({ name, input }),
      });

      expect(toolCalls).toEqual([
        { name: 'score_dimension', input: { score: 4, rationale: 'Strong' } },
      ]);
    });

    it('should handle malformed tool JSON gracefully', async () => {
      const toolCalls: Array<{ name: string; input: unknown }> = [];
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const events = [
        {
          type: 'content_block_start',
          content_block: { type: 'tool_use', id: 'tool-2', name: 'score_dimension' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{broken json' },
        },
        { type: 'content_block_stop' },
        { type: 'message_stop' },
      ];
      mockStream.mockResolvedValue(createMockStream(events));

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'Score',
        tools: [testTool],
        onToolUse: (name, input) => toolCalls.push({ name, input }),
      });

      // onToolUse should NOT be called for malformed JSON
      expect(toolCalls).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse tool input JSON'),
        expect.any(String)
      );
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // Abort signal
  // =========================================================================

  describe('abort signal', () => {
    it('should stop streaming when abort signal is triggered', async () => {
      const controller = new AbortController();
      const textDeltas: string[] = [];

      // Create a stream where abort fires after the second event is yielded.
      // The abort check is at the TOP of the loop body, so events yielded
      // before the abort are processed, but the next iteration breaks.
      const events = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Second' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Third' } },
        { type: 'message_stop' },
      ];

      let index = 0;
      const abortingStream = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            if (index < events.length) {
              const event = events[index++];
              // Abort after the second event is consumed (index is now 2)
              if (index === 2) {
                controller.abort();
              }
              return { value: event, done: false };
            }
            return { value: undefined, done: true };
          },
        }),
        currentMessage: {
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 10 },
        },
      };
      mockStream.mockResolvedValue(abortingStream);

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User',
        tools: [testTool],
        abortSignal: controller.signal,
        onTextDelta: (delta) => textDeltas.push(delta),
      });

      // First event is processed normally. Second event triggers abort
      // synchronously during next(), so when the loop body runs for the
      // second event, the abort check fires and breaks before processing.
      // "Third" and "message_stop" are never reached.
      expect(textDeltas).toEqual(['First']);
    });

    it('should pass abort signal in request options', async () => {
      const controller = new AbortController();
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User',
        tools: [testTool],
        abortSignal: controller.signal,
      });

      const requestOptions = mockStream.mock.calls[0][1];
      expect(requestOptions).toBeDefined();
      expect(requestOptions.signal).toBe(controller.signal);
    });

    it('should silently return when API call throws and signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      mockStream.mockRejectedValue(new Error('Request aborted'));

      // Should not throw
      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User',
        tools: [testTool],
        abortSignal: controller.signal,
      });
    });
  });

  // =========================================================================
  // Multi-block userPrompt with cacheable mapping
  // =========================================================================

  describe('multi-block userPrompt with usePromptCache=true', () => {
    it('should map cacheable: true to cache_control when usePromptCache is true', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        { type: 'text', text: 'ISO catalog section', cacheable: true },
        { type: 'text', text: 'Vendor responses' },
      ];

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
        usePromptCache: true,
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ISO catalog section', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'Vendor responses' },
          ],
        },
      ]);
    });

    it('should apply cache_control only to blocks with cacheable: true', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        { type: 'text', text: 'Block 1', cacheable: true },
        { type: 'text', text: 'Block 2' },
        { type: 'text', text: 'Block 3', cacheable: true },
      ];

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
        usePromptCache: true,
      });

      const content = mockStream.mock.calls[0][0].messages[0].content;
      expect(content[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(content[1].cache_control).toBeUndefined();
      expect(content[2].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should apply cache_control to system prompt when usePromptCache is true', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'Scoring system prompt',
        userPrompt: 'Score this',
        tools: [testTool],
        usePromptCache: true,
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.system).toEqual([
        { type: 'text', text: 'Scoring system prompt', cache_control: { type: 'ephemeral' } },
      ]);

      const requestOptions = mockStream.mock.calls[0][1];
      expect(requestOptions.headers).toEqual({ 'anthropic-beta': 'prompt-caching-2024-07-31' });
    });
  });

  // =========================================================================
  // Multi-block userPrompt WITHOUT cache_control
  // =========================================================================

  describe('multi-block userPrompt with usePromptCache=false', () => {
    it('should NOT add cache_control when usePromptCache is false even if cacheable is true', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        { type: 'text', text: 'ISO catalog section', cacheable: true },
        { type: 'text', text: 'Vendor responses' },
      ];

      await client.streamWithTool({
        systemPrompt: 'System prompt',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
        // usePromptCache deliberately omitted (defaults to undefined/false)
      });

      const requestBody = mockStream.mock.calls[0][0];
      const content = requestBody.messages[0].content;

      expect(content[0].cache_control).toBeUndefined();
      expect(content[1].cache_control).toBeUndefined();

      // No caching header
      const requestOptions = mockStream.mock.calls[0][1];
      expect(requestOptions).toBeUndefined();
    });

    it('should not add cache_control when cacheable is false or undefined', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        { type: 'text', text: 'Block without cacheable field' },
        { type: 'text', text: 'Block with cacheable false', cacheable: false },
      ];

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
      });

      const content = mockStream.mock.calls[0][0].messages[0].content;
      expect(content[0].cache_control).toBeUndefined();
      expect(content[1].cache_control).toBeUndefined();
    });
  });

  // =========================================================================
  // onUsage callback
  // =========================================================================

  describe('onUsage callback', () => {
    it('should invoke onUsage with token usage data at end of stream', async () => {
      const usage = {
        input_tokens: 5000,
        output_tokens: 200,
        cache_read_input_tokens: 3000,
        cache_creation_input_tokens: 1500,
      };
      mockStream.mockResolvedValue(createMockStream(undefined, usage));

      let capturedUsage: Record<string, unknown> | undefined;

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: 'User prompt',
        tools: [testTool],
        onUsage: (u) => { capturedUsage = u as Record<string, unknown>; },
      });

      expect(capturedUsage).toBeDefined();
      expect(capturedUsage?.input_tokens).toBe(5000);
      expect(capturedUsage?.output_tokens).toBe(200);
      expect(capturedUsage?.cache_read_input_tokens).toBe(3000);
      expect(capturedUsage?.cache_creation_input_tokens).toBe(1500);
    });

    it('should not throw when onUsage is not provided', async () => {
      mockStream.mockResolvedValue(createMockStream());

      // Should complete without error when no onUsage callback
      await expect(
        client.streamWithTool({
          systemPrompt: 'System',
          userPrompt: 'User',
          tools: [testTool],
        })
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('should throw ClaudeAPIError when stream API fails', async () => {
      mockStream.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        client.streamWithTool({
          systemPrompt: 'System',
          userPrompt: 'User',
          tools: [testTool],
        })
      ).rejects.toThrow('streamWithTool failed: API rate limit exceeded');
    });
  });
});
