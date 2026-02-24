/**
 * Unit tests for ClaudeTextClient (Story 39.4.3)
 *
 * Tests verify that ClaudeTextClient correctly:
 * 1. sendMessage with retry logic (mock Anthropic SDK)
 * 2. streamMessage yields chunks correctly
 * 3. continueWithToolResult handles tool results
 */

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

import { ClaudeTextClient } from '../../../../src/infrastructure/ai/ClaudeTextClient.js';
import type { ToolUseBlock, ToolResultBlock } from '../../../../src/application/interfaces/IClaudeClient.js';

describe('ClaudeTextClient', () => {
  let client: ClaudeTextClient;

  const createMockStream = (events?: Array<{ type: string; [key: string]: unknown }>) => {
    const defaultEvents = events ?? [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'message_stop' },
    ];
    let index = 0;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (index < defaultEvents.length) {
            return { value: defaultEvents[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      }),
      currentMessage: { stop_reason: 'end_turn' },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeTextClient('test-api-key');
  });

  describe('sendMessage', () => {
    it('should send message and return response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      const response = await client.sendMessage(
        [{ role: 'user', content: 'Hello' }],
        { systemPrompt: 'You are helpful' }
      );

      expect(response.content).toBe('Response');
      expect(response.stop_reason).toBe('end_turn');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      mockCreate
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Recovered' }],
          stop_reason: 'end_turn',
          model: 'claude-sonnet-4-5-20250929',
        });

      const response = await client.sendMessage(
        [{ role: 'user', content: 'Hello' }]
      );

      expect(response.content).toBe('Recovered');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should throw after max retries', async () => {
      mockCreate.mockRejectedValue(new Error('Persistent error'));

      await expect(
        client.sendMessage([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Failed after 3 attempts');

      expect(mockCreate).toHaveBeenCalledTimes(3);
    }, 30000);

    it('should extract tool_use blocks from response', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'test_tool', input: { key: 'value' } },
        ],
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-5-20250929',
      });

      const response = await client.sendMessage(
        [{ role: 'user', content: 'Use tool' }],
        { tools: [{ name: 'test_tool', description: 'A tool', input_schema: { type: 'object', properties: {} } }] }
      );

      expect(response.toolUse).toBeDefined();
      expect(response.toolUse).toHaveLength(1);
      expect(response.toolUse![0].name).toBe('test_tool');
    });
  });

  describe('streamMessage', () => {
    it('should yield text chunks from stream', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const chunks = [];
      for await (const chunk of client.streamMessage(
        [{ role: 'user', content: 'Hello' }]
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ content: 'Hello', isComplete: false });
      expect(chunks[1].isComplete).toBe(true);
    });

    it('should handle tool_use blocks during streaming', async () => {
      const toolStream = createMockStream([
        { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool-1', name: 'my_tool' } },
        { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"k":"v"}' } },
        { type: 'content_block_stop' },
        { type: 'message_stop' },
      ]);
      toolStream.currentMessage = { stop_reason: 'tool_use' };
      mockStream.mockResolvedValue(toolStream);

      const chunks = [];
      for await (const chunk of client.streamMessage(
        [{ role: 'user', content: 'Use tool' }]
      )) {
        chunks.push(chunk);
      }

      const final = chunks[chunks.length - 1];
      expect(final.isComplete).toBe(true);
      expect(final.toolUse).toBeDefined();
      expect(final.toolUse![0].name).toBe('my_tool');
      expect(final.toolUse![0].input).toEqual({ k: 'v' });
    });

    it('should retry on overloaded error and succeed', async () => {
      mockStream
        .mockRejectedValueOnce(new Error('API overloaded'))
        .mockResolvedValueOnce(createMockStream());

      const chunks = [];
      for await (const chunk of client.streamMessage(
        [{ role: 'user', content: 'Hello' }]
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(mockStream).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should throw immediately on non-retryable error', async () => {
      mockStream.mockRejectedValue(new Error('Invalid API key'));

      await expect(async () => {
        for await (const chunk of client.streamMessage(
          [{ role: 'user', content: 'Hello' }]
        )) {
          // consume
        }
      }).rejects.toThrow('Streaming failed: Invalid API key');

      expect(mockStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('continueWithToolResult', () => {
    const toolUseBlocks: ToolUseBlock[] = [
      { type: 'tool_use', id: 'toolu_01', name: 'web_search', input: { query: 'test' } },
    ];

    const toolResults: ToolResultBlock[] = [
      { type: 'tool_result', tool_use_id: 'toolu_01', content: 'Search results...' },
    ];

    it('should build correct message array and stream response', async () => {
      mockStream.mockResolvedValue(createMockStream([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Answer' } },
        { type: 'message_stop' },
      ]));

      const chunks = [];
      for await (const chunk of client.continueWithToolResult(
        [{ role: 'user', content: 'Question?' }],
        toolUseBlocks,
        toolResults
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Answer');

      // Verify message structure
      const callArgs = mockStream.mock.calls[0][0];
      const messages = callArgs.messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content[0].type).toBe('tool_use');
      expect(messages[2].role).toBe('user');
      expect(messages[2].content[0].type).toBe('tool_result');
    });

    it('should pass system prompt and tools through', async () => {
      mockStream.mockResolvedValue(createMockStream([{ type: 'message_stop' }]));

      const tools = [{
        name: 'web_search',
        description: 'Search the web',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
      }];

      for await (const chunk of client.continueWithToolResult(
        [{ role: 'user', content: 'Q' }],
        toolUseBlocks,
        toolResults,
        { systemPrompt: 'You are helpful', tools }
      )) {
        // consume
      }

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.system).toBe('You are helpful');
      expect(callArgs.tools).toEqual(tools);
    });

    it('should retry on retryable errors', async () => {
      mockStream
        .mockRejectedValueOnce(new Error('API overloaded'))
        .mockResolvedValueOnce(createMockStream([{ type: 'message_stop' }]));

      const chunks = [];
      for await (const chunk of client.continueWithToolResult(
        [{ role: 'user', content: 'Q' }],
        toolUseBlocks,
        toolResults
      )) {
        chunks.push(chunk);
      }

      expect(mockStream).toHaveBeenCalledTimes(2);
    }, 15000);
  });
});
