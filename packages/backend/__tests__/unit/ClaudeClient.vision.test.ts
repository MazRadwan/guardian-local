/**
 * Unit tests for ClaudeClient Vision support (Epic 30)
 *
 * Story 30.1.3: ClaudeClient Content Array Support
 *
 * Tests verify that ClaudeClient correctly:
 * 1. Handles imageBlocks parameter in streamMessage
 * 2. Merges imageBlocks into last user message
 * 3. Maintains backward compatibility when no imageBlocks provided
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
import type { ImageContentBlock } from '../../src/infrastructure/ai/types/index.js';

describe('ClaudeClient - Vision support (Epic 30)', () => {
  let client: ClaudeClient;

  // Create a mock stream that behaves like an async iterable
  const createMockStream = () => {
    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response text' } },
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

  const testImageBlock: ImageContentBlock = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeClient('test-api-key');
  });

  describe('streamMessage with imageBlocks', () => {
    it('should work without imageBlocks (backward compatible)', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const messages = [{ role: 'user' as const, content: 'Hello, world!' }];
      const chunks: string[] = [];

      for await (const chunk of client.streamMessage(messages, {})) {
        if (chunk.content) {
          chunks.push(chunk.content);
        }
      }

      // Verify stream was called with string content (not ContentBlock array)
      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        { role: 'user', content: 'Hello, world!' },
      ]);

      // Verify response was streamed
      expect(chunks).toContain('Response text');
    });

    it('should merge imageBlocks into last user message', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const messages = [{ role: 'user' as const, content: 'Describe this image:' }];
      const imageBlocks = [testImageBlock];

      const chunks: string[] = [];
      for await (const chunk of client.streamMessage(messages, {}, imageBlocks)) {
        if (chunk.content) {
          chunks.push(chunk.content);
        }
      }

      // Verify stream was called with ContentBlock array
      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        {
          role: 'user',
          content: [
            testImageBlock,
            { type: 'text', text: 'Describe this image:' },
          ],
        },
      ]);
    });

    it('should merge multiple imageBlocks into last user message', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const secondImageBlock: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'base64encodeddata2',
        },
      };

      const messages = [{ role: 'user' as const, content: 'Compare these images:' }];
      const imageBlocks = [testImageBlock, secondImageBlock];

      for await (const chunk of client.streamMessage(messages, {}, imageBlocks)) {
        // Consume the stream
      }

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        {
          role: 'user',
          content: [
            testImageBlock,
            secondImageBlock,
            { type: 'text', text: 'Compare these images:' },
          ],
        },
      ]);
    });

    it('should only merge imageBlocks into the LAST user message', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const messages = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'First response' },
        { role: 'user' as const, content: 'Second message with image' },
      ];
      const imageBlocks = [testImageBlock];

      for await (const chunk of client.streamMessage(messages, {}, imageBlocks)) {
        // Consume the stream
      }

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        { role: 'user', content: 'First message' },  // Not modified
        { role: 'assistant', content: 'First response' },  // Not modified
        {
          role: 'user',
          content: [
            testImageBlock,
            { type: 'text', text: 'Second message with image' },
          ],
        },  // Last user message modified
      ]);
    });

    it('should handle empty imageBlocks array (no changes)', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const messages = [{ role: 'user' as const, content: 'No images here' }];

      for await (const chunk of client.streamMessage(messages, {}, [])) {
        // Consume the stream
      }

      const requestBody = mockStream.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        { role: 'user', content: 'No images here' },
      ]);
    });

    it('should handle messages with only assistant messages (edge case)', async () => {
      mockStream.mockResolvedValue(createMockStream());

      // Edge case: Only assistant messages (unusual but possible)
      const messages = [
        { role: 'assistant' as const, content: 'I am ready to help' },
      ];
      const imageBlocks = [testImageBlock];

      for await (const chunk of client.streamMessage(messages, {}, imageBlocks)) {
        // Consume the stream
      }

      const requestBody = mockStream.mock.calls[0][0];
      // Should add a new user message with the images
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0]).toEqual({ role: 'assistant', content: 'I am ready to help' });
      expect(requestBody.messages[1].role).toBe('user');
      expect(Array.isArray(requestBody.messages[1].content)).toBe(true);
      expect(requestBody.messages[1].content).toContainEqual(testImageBlock);
    });

    it('should work with all supported image media types', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const mediaTypes: Array<'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = [
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
      ];

      for (const mediaType of mediaTypes) {
        jest.clearAllMocks();
        mockStream.mockResolvedValue(createMockStream());

        const imageBlock: ImageContentBlock = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: 'testdata',
          },
        };

        const messages = [{ role: 'user' as const, content: 'Analyze:' }];

        for await (const chunk of client.streamMessage(messages, {}, [imageBlock])) {
          // Consume the stream
        }

        const requestBody = mockStream.mock.calls[0][0];
        expect(requestBody.messages[0].content[0].source.media_type).toBe(mediaType);
      }
    });

    it('should preserve other options when using imageBlocks', async () => {
      mockStream.mockResolvedValue(createMockStream());

      const messages = [{ role: 'user' as const, content: 'Test with options' }];
      const imageBlocks = [testImageBlock];

      for await (const chunk of client.streamMessage(
        messages,
        { systemPrompt: 'You are a vision assistant' },
        imageBlocks
      )) {
        // Consume the stream
      }

      const requestBody = mockStream.mock.calls[0][0];

      // Verify imageBlocks are merged
      expect(Array.isArray(requestBody.messages[0].content)).toBe(true);

      // Verify system prompt is preserved
      expect(requestBody.system).toBe('You are a vision assistant');
    });
  });

  describe('sendMessage (unchanged for now)', () => {
    it('should still work with string content only', async () => {
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

      const requestBody = mockCreate.mock.calls[0][0];
      expect(requestBody.messages).toEqual([
        { role: 'user', content: 'Hello' },
      ]);
    });
  });
});
