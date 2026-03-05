/**
 * ClaudeVisionClient - IVisionClient implementation
 *
 * Handles Claude Vision API operations:
 * - analyzeImages: Analyze images with Claude Vision
 * - prepareDocument: Convert document buffers to vision-ready images
 *
 * Story 39.4.3: Extracted from ClaudeClient.ts
 * Epic 16: Document Parser Infrastructure
 */

import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';
import type {
  IVisionClient,
  VisionContent,
  VisionRequest,
  VisionResponse,
} from '../../application/interfaces/IVisionClient.js';
import { ClaudeClientBase, getMaxTokens } from './ClaudeClientBase.js';

export class ClaudeVisionClient extends ClaudeClientBase implements IVisionClient {
  /**
   * Analyze images with Claude Vision
   */
  async analyzeImages(request: VisionRequest): Promise<VisionResponse> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          ...request.images.map((img) => ({
            type: 'image' as const,
            source: img.source,
          })),
          { type: 'text' as const, text: request.prompt },
        ],
      },
    ];

    // Story 20.3.3: Forward abortSignal to actually cancel the API request
    const requestOptions: { signal?: AbortSignal } = {};
    if (request.abortSignal) {
      requestOptions.signal = request.abortSignal;
    }

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: request.maxTokens || getMaxTokens(4096),
        system: request.systemPrompt || 'You are a document analysis assistant.',
        messages,
      },
      Object.keys(requestOptions).length > 0 ? requestOptions : undefined
    );

    // Join all text blocks (consistent with sendMessage behavior)
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason || 'end_turn',
    };
  }

  /**
   * Convert document buffer to vision-ready images
   *
   * For PDFs: Extract text (Vision API reserved for actual images/scans)
   * For images: Encode as base64
   * For DOCX: Return empty (handled via mammoth text extraction)
   */
  async prepareDocument(
    buffer: Buffer,
    mimeType: string
  ): Promise<VisionContent[]> {
    if (mimeType === 'application/pdf') {
      return this.preparePdfDocument(buffer);
    }

    if (mimeType.startsWith('image/')) {
      return this.prepareImageDocument(buffer, mimeType);
    }

    // DOCX text extraction handled by DocumentParserService (not here)
    if (mimeType.includes('wordprocessingml')) {
      console.log('[ClaudeVisionClient] DOCX detected, will use text extraction');
      return [];
    }

    throw new Error(`Unsupported MIME type for vision: ${mimeType}`);
  }

  private async preparePdfDocument(buffer: Buffer): Promise<VisionContent[]> {
    // pdf-parse v2 uses class-based API
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();

      console.log(
        '[ClaudeVisionClient] PDF detected, extracted text:',
        result.total,
        'pages'
      );

      // Return empty for now - PDFs handled via text extraction
      return [];
    } finally {
      await parser.destroy();
    }
  }

  private prepareImageDocument(
    buffer: Buffer,
    mimeType: string
  ): VisionContent[] {
    const base64 = buffer.toString('base64');
    const mediaType = mimeType as VisionContent['source']['media_type'];

    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64,
        },
      },
    ];
  }
}
