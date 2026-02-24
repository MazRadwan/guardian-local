/**
 * Unit tests for ClaudeVisionClient (Story 39.4.3)
 *
 * Tests verify that ClaudeVisionClient correctly:
 * 1. analyzeImages calls Anthropic API with image content
 * 2. prepareDocument handles PDF, image, and DOCX MIME types
 * 3. prepareImageDocument returns base64-encoded content
 */

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: jest.fn(),
    },
  }));
});

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ total: 3 }),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { ClaudeVisionClient } from '../../../../src/infrastructure/ai/ClaudeVisionClient.js';
import type { VisionRequest } from '../../../../src/application/interfaces/IVisionClient.js';

describe('ClaudeVisionClient', () => {
  let client: ClaudeVisionClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeVisionClient('test-api-key');
  });

  describe('analyzeImages', () => {
    it('should call Anthropic API with image content and return response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Analysis result' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const request: VisionRequest = {
        images: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUg==',
          },
        }],
        prompt: 'Describe this image',
        systemPrompt: 'You are a document analyst',
      };

      const response = await client.analyzeImages(request);

      expect(response.content).toBe('Analysis result');
      expect(response.usage.inputTokens).toBe(100);
      expect(response.usage.outputTokens).toBe(50);
      expect(response.stopReason).toBe('end_turn');

      // Verify API call structure
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toHaveLength(2);
      expect(callArgs.messages[0].content[0].type).toBe('image');
      expect(callArgs.messages[0].content[1].type).toBe('text');
      expect(callArgs.system).toBe('You are a document analyst');
    });

    it('should use default system prompt when none provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Result' }],
        usage: { input_tokens: 50, output_tokens: 25 },
        stop_reason: 'end_turn',
      });

      await client.analyzeImages({
        images: [{
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'base64data' },
        }],
        prompt: 'Analyze',
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a document analysis assistant.');
    });

    it('should forward abortSignal to API request', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Result' }],
        usage: { input_tokens: 50, output_tokens: 25 },
        stop_reason: 'end_turn',
      });

      const controller = new AbortController();
      await client.analyzeImages({
        images: [{
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'data' },
        }],
        prompt: 'Analyze',
        abortSignal: controller.signal,
      });

      const requestOptions = mockCreate.mock.calls[0][1];
      expect(requestOptions?.signal).toBe(controller.signal);
    });

    it('should handle multiple images in a single request', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Comparison result' }],
        usage: { input_tokens: 200, output_tokens: 100 },
        stop_reason: 'end_turn',
      });

      await client.analyzeImages({
        images: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'img1' } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'img2' } },
        ],
        prompt: 'Compare these images',
      });

      const callArgs = mockCreate.mock.calls[0][0];
      // 2 images + 1 text prompt
      expect(callArgs.messages[0].content).toHaveLength(3);
    });
  });

  describe('prepareDocument', () => {
    it('should handle PDF mime type by extracting text and returning empty', async () => {
      const buffer = Buffer.from('fake-pdf-content');
      const result = await client.prepareDocument(buffer, 'application/pdf');

      expect(result).toEqual([]);
    });

    it('should handle image mime type by returning base64-encoded content', async () => {
      const buffer = Buffer.from('fake-image-content');
      const result = await client.prepareDocument(buffer, 'image/png');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('image');
      expect(result[0].source.type).toBe('base64');
      expect(result[0].source.media_type).toBe('image/png');
      expect(result[0].source.data).toBe(buffer.toString('base64'));
    });

    it('should handle JPEG image type', async () => {
      const buffer = Buffer.from('jpeg-data');
      const result = await client.prepareDocument(buffer, 'image/jpeg');

      expect(result).toHaveLength(1);
      expect(result[0].source.media_type).toBe('image/jpeg');
    });

    it('should handle DOCX mime type by returning empty array', async () => {
      const buffer = Buffer.from('docx-content');
      const result = await client.prepareDocument(
        buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      expect(result).toEqual([]);
    });

    it('should throw for unsupported mime types', async () => {
      const buffer = Buffer.from('unknown');

      await expect(
        client.prepareDocument(buffer, 'application/octet-stream')
      ).rejects.toThrow('Unsupported MIME type for vision: application/octet-stream');
    });
  });
});
