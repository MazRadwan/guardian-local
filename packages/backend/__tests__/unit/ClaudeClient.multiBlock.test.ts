/**
 * Unit tests for ClaudeClient multi-block user prompt support (Story 39.3.4)
 *
 * Tests verify that ClaudeClient.streamWithTool() correctly handles:
 * 1. String userPrompt (backward compatible)
 * 2. ContentBlockForPrompt[] userPrompt with cacheable hint mapped to cache_control
 */

// Mock the entire module before importing
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
import type { ToolDefinition, ContentBlockForPrompt } from '../../src/application/interfaces/ILLMClient.js';

describe('ClaudeClient - multi-block user prompt (Story 39.3.4)', () => {
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
  const createMockStream = (usage?: Record<string, number>) => {
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
      currentMessage: {
        stop_reason: 'end_turn',
        usage: usage ?? { input_tokens: 100, output_tokens: 50 },
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeClient('test-api-key');
  });

  describe('streamWithTool with string userPrompt (backward compatible)', () => {
    it('should pass string userPrompt as message content directly', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'System prompt',
        userPrompt: 'Simple string user prompt',
        tools: [testTool],
      });

      expect(mockStream).toHaveBeenCalled();
      const requestBody = mockStream.mock.calls[0][0];

      // Messages should contain a single user message with string content
      expect(requestBody.messages).toEqual([
        { role: 'user', content: 'Simple string user prompt' },
      ]);
    });

    it('should work with caching enabled and string userPrompt', async () => {
      mockStream.mockResolvedValue(createMockStream());

      await client.streamWithTool({
        systemPrompt: 'System prompt',
        userPrompt: 'Score this vendor',
        tools: [testTool],
        usePromptCache: true,
      });

      const requestBody = mockStream.mock.calls[0][0];
      const requestOptions = mockStream.mock.calls[0][1];

      // User message should be a plain string
      expect(requestBody.messages[0].content).toBe('Score this vendor');

      // System prompt should have cache_control
      expect(requestBody.system).toEqual([
        {
          type: 'text',
          text: 'System prompt',
          cache_control: { type: 'ephemeral' },
        },
      ]);

      // Headers should include caching beta
      expect(requestOptions).toEqual({
        headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
      });
    });
  });

  describe('streamWithTool with ContentBlockForPrompt[] userPrompt', () => {
    it('should map cacheable: true to cache_control in Anthropic API call', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        {
          type: 'text',
          text: 'ISO catalog section (cacheable)',
          cacheable: true,
        },
        {
          type: 'text',
          text: 'Vendor responses (unique per call)',
        },
      ];

      await client.streamWithTool({
        systemPrompt: 'System prompt',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
        usePromptCache: true,
      });

      expect(mockStream).toHaveBeenCalled();
      const requestBody = mockStream.mock.calls[0][0];

      // cacheable: true should be mapped to cache_control: { type: 'ephemeral' }
      expect(requestBody.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'ISO catalog section (cacheable)',
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text: 'Vendor responses (unique per call)',
            },
          ],
        },
      ]);
    });

    it('should preserve cache_control mapping on individual blocks', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        {
          type: 'text',
          text: 'Block 1 with cache',
          cacheable: true,
        },
        {
          type: 'text',
          text: 'Block 2 without cache',
        },
        {
          type: 'text',
          text: 'Block 3 with cache',
          cacheable: true,
        },
      ];

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
      });

      const requestBody = mockStream.mock.calls[0][0];
      const content = requestBody.messages[0].content;

      // Verify cacheable: true blocks get cache_control, others do not
      expect(content[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(content[1].cache_control).toBeUndefined();
      expect(content[2].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should not add cache_control when cacheable is false or undefined', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        {
          type: 'text',
          text: 'Block without cacheable field',
        },
        {
          type: 'text',
          text: 'Block with cacheable false',
          cacheable: false,
        },
      ];

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
      });

      const requestBody = mockStream.mock.calls[0][0];
      const content = requestBody.messages[0].content;

      expect(content[0].cache_control).toBeUndefined();
      expect(content[1].cache_control).toBeUndefined();
    });

    it('should work with multi-block prompt and all streaming callbacks', async () => {
      const textDeltas: string[] = [];
      const toolCalls: Array<{ name: string; input: unknown }> = [];

      const mockStreamWithContent = {
        [Symbol.asyncIterator]: () => {
          const events = [
            {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Analysis result' },
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
        currentMessage: {
          stop_reason: 'tool_use',
          usage: { input_tokens: 5000, output_tokens: 200, cache_read_input_tokens: 3000 },
        },
      };

      mockStream.mockResolvedValue(mockStreamWithContent);

      const multiBlockPrompt: ContentBlockForPrompt[] = [
        { type: 'text', text: 'Cached ISO catalog', cacheable: true },
        { type: 'text', text: 'Vendor data' },
      ];

      let capturedUsage: Record<string, number> | undefined;

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: multiBlockPrompt,
        tools: [testTool],
        usePromptCache: true,
        onTextDelta: (delta) => textDeltas.push(delta),
        onToolUse: (name, input) => toolCalls.push({ name, input }),
        onUsage: (usage) => { capturedUsage = usage as Record<string, number>; },
      });

      // Callbacks should work normally
      expect(textDeltas).toEqual(['Analysis result']);
      expect(toolCalls).toEqual([{ name: 'test_tool', input: { test_param: 'value' } }]);
      expect(capturedUsage).toBeDefined();
      expect(capturedUsage?.cache_read_input_tokens).toBe(3000);
    });

    it('should handle single-block array the same as multi-block', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const singleBlockPrompt: ContentBlockForPrompt[] = [
        { type: 'text', text: 'Single block content' },
      ];

      await client.streamWithTool({
        systemPrompt: 'System',
        userPrompt: singleBlockPrompt,
        tools: [testTool],
      });

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages[0].content).toEqual([
        { type: 'text', text: 'Single block content' },
      ]);
    });
  });
});
