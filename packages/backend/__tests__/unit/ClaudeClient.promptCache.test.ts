/**
 * Unit tests for ClaudeClient prompt caching and maxTokens support
 *
 * Story 20.3.1: Prompt Caching for Scoring Rubric
 * Story 20.3.2: Configurable maxTokens for Scoring
 *
 * Tests verify that ClaudeClient correctly:
 * 1. Includes cache_control when usePromptCache is true
 * 2. Adds anthropic-beta header when usePromptCache is true
 * 3. Works without caching when usePromptCache is false/undefined
 * 4. Passes custom maxTokens value to Claude API
 * 5. Uses default maxTokens (8192) when not specified
 */

// Mock the entire module before importing
const mockStream = jest.fn();
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  }));
});

// Import after mock
import { ClaudeClient } from '../../src/infrastructure/ai/ClaudeClient.js';
import type { ToolDefinition } from '../../src/application/interfaces/ILLMClient.js';

describe('ClaudeClient - prompt caching', () => {
  let client: ClaudeClient;

  const testTool: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    input_schema: {
      type: 'object',
      properties: {
        test_param: { type: 'string' },
      },
      required: ['test_param'],
    },
  };

  // Create a mock stream that behaves like an async iterable
  const createMockStream = () => {
    const events = [
      { type: 'message_stop' },
    ];
    let index = 0;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (index < events.length) {
            return { value: events[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      }),
      currentMessage: { stop_reason: 'end_turn' },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeClient('test-api-key');
  });

  describe('streamWithTool with usePromptCache', () => {
    it('should include cache_control in system prompt when usePromptCache is true', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        usePromptCache: true,
      });

      // Verify the stream was called
      expect(mockStream).toHaveBeenCalled();

      // Get the first argument (request body) from the call
      const requestBody = mockStream.mock.calls[0][0];

      // System should be an array with cache_control
      expect(requestBody.system).toEqual([
        {
          type: 'text',
          text: 'You are a scoring assistant',
          cache_control: { type: 'ephemeral' },
        },
      ]);
    });

    it('should include anthropic-beta header when usePromptCache is true', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        usePromptCache: true,
      });

      // Get the second argument (request options) from the call
      const requestOptions = mockStream.mock.calls[0][1];

      expect(requestOptions).toEqual({
        headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
      });
    });

    it('should NOT include cache_control when usePromptCache is false', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        usePromptCache: false,
      });

      const requestBody = mockStream.mock.calls[0][0];
      const requestOptions = mockStream.mock.calls[0][1];

      // System should be plain string, not array
      expect(requestBody.system).toBe('You are a scoring assistant');
      expect(requestOptions).toBeUndefined();
    });

    it('should NOT include cache_control when usePromptCache is undefined', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        // usePromptCache not provided
      });

      const requestBody = mockStream.mock.calls[0][0];
      const requestOptions = mockStream.mock.calls[0][1];

      // System should be plain string, not array
      expect(requestBody.system).toBe('You are a scoring assistant');
      expect(requestOptions).toBeUndefined();
    });
  });

  describe('backward compatibility', () => {
    it('should work with all existing options when caching is enabled', async () => {
      const textDeltas: string[] = [];
      const toolCalls: Array<{ name: string; input: unknown }> = [];

      // Mock stream with text delta and tool use
      const mockStreamWithContent = {
        [Symbol.asyncIterator]: () => {
          const events = [
            {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Analysis: ' },
            },
            {
              type: 'content_block_start',
              content_block: { type: 'tool_use', id: 'tool-1', name: 'test_tool' },
            },
            {
              type: 'content_block_delta',
              delta: { type: 'input_json_delta', partial_json: '{"test_param":"value"}' },
            },
            { type: 'content_block_stop' },
            { type: 'message_stop' },
          ];
          let index = 0;
          return {
            next: async () => {
              if (index < events.length) {
                return { value: events[index++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
        currentMessage: { stop_reason: 'tool_use' },
      };

      mockStream.mockResolvedValue(mockStreamWithContent);

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        tool_choice: { type: 'any' },
        usePromptCache: true,
        onTextDelta: (delta) => textDeltas.push(delta),
        onToolUse: (name, input) => toolCalls.push({ name, input }),
      });

      // Verify callbacks still work
      expect(textDeltas).toEqual(['Analysis: ']);
      expect(toolCalls).toEqual([{ name: 'test_tool', input: { test_param: 'value' } }]);

      // Verify cache control is included
      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.system).toEqual([
        {
          type: 'text',
          text: 'You are a scoring assistant',
          cache_control: { type: 'ephemeral' },
        },
      ]);

      // Verify tool_choice is passed through
      expect(requestBody.tool_choice).toEqual({ type: 'any' });
    });
  });

  describe('sendMessage with usePromptCache', () => {
    it('should include cache_control in system prompt when usePromptCache is true', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      await client.sendMessage(
        [{ role: 'user', content: 'Test message' }],
        {
          systemPrompt: 'You are a helpful assistant',
          usePromptCache: true,
        }
      );

      const requestBody = mockCreate.mock.calls[0][0];
      const requestOptions = mockCreate.mock.calls[0][1];

      // System should be an array with cache_control
      expect(requestBody.system).toEqual([
        {
          type: 'text',
          text: 'You are a helpful assistant',
          cache_control: { type: 'ephemeral' },
        },
      ]);

      // Should include beta header
      expect(requestOptions).toEqual({
        headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
      });
    });

    it('should NOT include cache_control when usePromptCache is false', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      await client.sendMessage(
        [{ role: 'user', content: 'Test message' }],
        {
          systemPrompt: 'You are a helpful assistant',
          usePromptCache: false,
        }
      );

      const requestBody = mockCreate.mock.calls[0][0];
      const requestOptions = mockCreate.mock.calls[0][1];

      // System should be plain string
      expect(requestBody.system).toBe('You are a helpful assistant');
      expect(requestOptions).toBeUndefined();
    });
  });

  /**
   * Story 20.3.2: Configurable maxTokens for Scoring
   */
  describe('streamWithTool with maxTokens', () => {
    it('should pass custom maxTokens value to Claude API', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        maxTokens: 2500,  // Custom value for scoring
      });

      const requestBody = mockStream.mock.calls[0][0];

      // Verify custom maxTokens is passed
      expect(requestBody.max_tokens).toBe(2500);
    });

    it('should use default maxTokens (8192) when not specified', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        // maxTokens not provided - should default to 8192
      });

      const requestBody = mockStream.mock.calls[0][0];

      // Verify default maxTokens is used
      expect(requestBody.max_tokens).toBe(8192);
    });

    it('should work with maxTokens combined with usePromptCache', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'You are a scoring assistant',
        userPrompt: 'Score this response',
        tools: [testTool],
        usePromptCache: true,
        maxTokens: 2500,
      });

      const requestBody = mockStream.mock.calls[0][0];
      const requestOptions = mockStream.mock.calls[0][1];

      // Verify both maxTokens and cache control are set correctly
      expect(requestBody.max_tokens).toBe(2500);
      expect(requestBody.system).toEqual([
        {
          type: 'text',
          text: 'You are a scoring assistant',
          cache_control: { type: 'ephemeral' },
        },
      ]);
      expect(requestOptions).toEqual({
        headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
      });
    });

    it('should accept maxTokens as low as 1', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'Test',
        userPrompt: 'Test',
        tools: [testTool],
        maxTokens: 1,
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.max_tokens).toBe(1);
    });

    it('should accept high maxTokens values', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'Test',
        userPrompt: 'Test',
        tools: [testTool],
        maxTokens: 100000,  // High value
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.max_tokens).toBe(100000);
    });
  });
});
