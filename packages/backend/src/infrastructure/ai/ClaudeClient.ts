/**
 * ClaudeClient Implementation
 *
 * Wraps Anthropic SDK with retry logic, error handling, and streaming support
 * Model: claude-sonnet-4-5-20250929 (latest Sonnet 4.5)
 *
 * Epic 16: Extended with Vision API support for document parsing
 */

import Anthropic from '@anthropic-ai/sdk';
import * as pdfParse from 'pdf-parse';
import type {
  IClaudeClient,
  ClaudeMessage,
  ClaudeResponse,
  StreamChunk,
  ClaudeRequestOptions,
  ClaudeTool,
  ToolUseBlock,
} from '../../application/interfaces/IClaudeClient.js';
import type {
  IVisionClient,
  VisionContent,
  VisionRequest,
  VisionResponse,
} from '../../application/interfaces/IVisionClient.js';

// pdf-parse default export workaround for ESM
// Type the function signature explicitly for the callable
type PdfParser = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
const pdf = ((pdfParse as { default?: unknown }).default ?? pdfParse) as PdfParser;

export class ClaudeClient implements IClaudeClient, IVisionClient {
  private client: Anthropic;
  private readonly model = 'claude-sonnet-4-5-20250929';
  private readonly maxTokens = 4096;
  private readonly retryAttempts = 3;
  private readonly retryDelays = [2000, 4000, 8000]; // Exponential backoff (2s, 4s, 8s)

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey,
    });
  }

  /**
   * Send message to Claude with retry logic
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {}
  ): Promise<ClaudeResponse> {
    const { systemPrompt, usePromptCache, tools, tool_choice, maxTokens } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = usePromptCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : undefined;

    // Use provided maxTokens or default
    const effectiveMaxTokens = maxTokens ?? this.maxTokens;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: effectiveMaxTokens,
            system,
            messages: messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            // Add tools if provided
            ...(tools && tools.length > 0 && { tools }),
            // Add tool_choice if provided (forces tool usage)
            ...(tool_choice && { tool_choice }),
          },
          requestOptions
        );

        // Extract text content using SDK types
        // Note: Anthropic SDK provides discriminated union types for content blocks
        const content = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        // Extract tool_use blocks using SDK types
        const toolUseBlocks = response.content
          .filter(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
          )
          .map((block) => ({
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          }));

        return {
          content,
          stop_reason: response.stop_reason || 'end_turn',
          model: response.model,
          toolUse: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
        };
      } catch (error) {
        lastError = error as Error;

        // If this is the last attempt, don't wait
        if (attempt === this.retryAttempts - 1) {
          break;
        }

        // Wait before retry (exponential backoff)
        await this.sleep(this.retryDelays[attempt]);
      }
    }

    throw new ClaudeAPIError(
      `Failed after ${this.retryAttempts} attempts: ${lastError?.message}`,
      lastError || undefined
    );
  }

  /**
   * Stream message from Claude with real-time chunks
   */
  async *streamMessage(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const { systemPrompt, usePromptCache, tools } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = usePromptCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : undefined;

    try {
      const stream = await this.client.messages.stream(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          // Add tools if provided
          ...(tools && tools.length > 0 && { tools }),
        },
        requestOptions
      );

      // Track tool use blocks during streaming
      const toolUseBlocks: ToolUseBlock[] = [];
      let currentToolUse: Partial<ToolUseBlock> | null = null;
      let toolInputJson = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            // Start tracking a new tool use
            currentToolUse = {
              type: 'tool_use',
              id: event.content_block.id,
              name: event.content_block.name,
            };
            toolInputJson = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              content: event.delta.text,
              isComplete: false,
            };
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            // Accumulate tool input JSON
            toolInputJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            // Parse accumulated JSON and complete the tool use block
            try {
              currentToolUse.input = JSON.parse(toolInputJson || '{}');
            } catch {
              currentToolUse.input = {};
            }
            toolUseBlocks.push(currentToolUse as ToolUseBlock);
            currentToolUse = null;
            toolInputJson = '';
          }
        } else if (event.type === 'message_stop') {
          // Final chunk with any tool uses
          yield {
            content: '',
            isComplete: true,
            toolUse: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
            stopReason: stream.currentMessage?.stop_reason || 'end_turn',
          };
        }
      }
    } catch (error) {
      throw new ClaudeAPIError(
        `Streaming failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildSystemPrompt(
    systemPrompt?: string,
    usePromptCache?: boolean
  ):
    | string
    | Array<{
        type: 'text';
        text: string;
        cache_control: { type: 'ephemeral' };
      }>
    | undefined {
    if (!systemPrompt) {
      return undefined;
    }

    if (usePromptCache) {
      return [
        {
          type: 'text' as const,
          text: systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ];
    }

    return systemPrompt;
  }

  // =========================================================================
  // IVisionClient Implementation (Epic 16)
  // =========================================================================

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt || 'You are a document analysis assistant.',
      messages,
    });

    const textContent = response.content.find(
      (c): c is Anthropic.TextBlock => c.type === 'text'
    );

    return {
      content: textContent?.text || '',
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
    // Vision API is only for images; PDFs/DOCX use text extraction path
    if (mimeType.includes('wordprocessingml')) {
      // Return empty - DOCX handled via mammoth text extraction in DocumentParserService
      console.log('[ClaudeClient] DOCX detected, will use text extraction');
      return [];
    }

    throw new Error(`Unsupported MIME type for vision: ${mimeType}`);
  }

  private async preparePdfDocument(buffer: Buffer): Promise<VisionContent[]> {
    // For MVP: Use pdf-parse to get text, skip image conversion
    // Future: Convert PDF pages to images using pdf2pic for scanned docs

    // Simple approach: Return text extracted from PDF
    // Claude can process this directly without vision
    const data = await pdf(buffer);

    // For now, we'll handle PDF text extraction separately
    // Vision is primarily for scanned docs and images
    console.log(
      '[ClaudeClient] PDF detected, extracted text:',
      data.numpages,
      'pages'
    );

    // Return empty for now - PDFs handled via text extraction
    // In production, use pdf2pic for image-based PDFs (scans)
    return [];
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

/**
 * Custom error for Claude API failures
 */
export class ClaudeAPIError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ClaudeAPIError';
  }
}
