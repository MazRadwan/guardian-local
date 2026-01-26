/**
 * ClaudeClient Implementation
 *
 * Wraps Anthropic SDK with retry logic, error handling, and streaming support
 * Model: claude-sonnet-4-5-20250929 (latest Sonnet 4.5)
 *
 * Epic 16: Extended with Vision API support for document parsing
 * Epic 30: Extended with ContentBlock array support for multimodal messages
 */

import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';
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
import type {
  ILLMClient,
  StreamWithToolOptions,
  ToolDefinition,
} from '../../application/interfaces/ILLMClient.js';
import type {
  ImageContentBlock,
  ClaudeApiMessage,
  ContentBlock,
} from './types/index.js';

export class ClaudeClient implements IClaudeClient, IVisionClient, ILLMClient {
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
    const { systemPrompt, usePromptCache, tools, tool_choice, maxTokens, abortSignal } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    // Build request options with optional caching header and abort signal
    // Story 20.3.3: Forward abortSignal to actually cancel the API request
    const requestOptions: { headers?: Record<string, string>; signal?: AbortSignal } | undefined =
      (usePromptCache || abortSignal) ? {} : undefined;
    if (requestOptions) {
      if (usePromptCache) {
        requestOptions.headers = { 'anthropic-beta': 'prompt-caching-2024-07-31' };
      }
      if (abortSignal) {
        requestOptions.signal = abortSignal;
      }
    }

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
   * Includes retry logic for overloaded errors
   *
   * Epic 30: Added optional imageBlocks parameter for multimodal messages.
   * When imageBlocks are provided, they are merged into the last user message
   * using ContentBlock array format.
   *
   * @param messages - Conversation history (domain format, string content)
   * @param options - Optional request settings (system prompt, cached prompt id)
   * @param imageBlocks - Optional image content blocks to include in last user message
   */
  async *streamMessage(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {},
    imageBlocks?: ImageContentBlock[]
  ): AsyncGenerator<StreamChunk> {
    const { systemPrompt, usePromptCache, tools } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = usePromptCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : undefined;

    // Convert domain messages to API format, merging imageBlocks if provided
    const apiMessages = this.toApiMessages(messages, imageBlocks);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const stream = await this.client.messages.stream(
          {
            model: this.model,
            max_tokens: this.maxTokens,
            system,
            messages: apiMessages,
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

        // If we get here without error, the stream completed successfully
        return;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message || '';

        // Check if this is a retryable error (overloaded, rate limit, etc.)
        const isRetryable =
          errorMessage.includes('overloaded') ||
          errorMessage.includes('rate_limit') ||
          errorMessage.includes('529') ||
          errorMessage.includes('503');

        if (!isRetryable) {
          // Non-retryable error, throw immediately
          throw new ClaudeAPIError(`Streaming failed: ${errorMessage}`, error as Error);
        }

        // If this is the last attempt, don't wait
        if (attempt === this.retryAttempts - 1) {
          break;
        }

        // Log retry attempt
        console.log(
          `[ClaudeClient] Retryable error (attempt ${attempt + 1}/${this.retryAttempts}): ${errorMessage}. Retrying in ${this.retryDelays[attempt]}ms...`
        );

        // Wait before retry (exponential backoff)
        await this.sleep(this.retryDelays[attempt]);
      }
    }

    throw new ClaudeAPIError(
      `Streaming failed after ${this.retryAttempts} attempts: ${lastError?.message}`,
      lastError || undefined
    );
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

  /**
   * Convert domain messages to API format, optionally merging image blocks
   *
   * Epic 30: This method handles the conversion from domain ClaudeMessage (string content)
   * to ClaudeApiMessage (string | ContentBlock[]) for the Anthropic API.
   *
   * When imageBlocks are provided:
   * - Finds the last user message
   * - Converts it to ContentBlock[] format with text + images
   * - Other messages remain as simple strings
   *
   * @param messages - Domain messages with string content
   * @param imageBlocks - Optional image content blocks to merge into last user message
   * @returns API-formatted messages ready for Anthropic API
   */
  private toApiMessages(
    messages: ClaudeMessage[],
    imageBlocks?: ImageContentBlock[]
  ): ClaudeApiMessage[] {
    // If no imageBlocks, return messages as-is (backward compatible)
    if (!imageBlocks || imageBlocks.length === 0) {
      return messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Find the index of the last user message
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    // If no user message found, add images as new user message
    if (lastUserIndex === -1) {
      const newUserContent: ContentBlock[] = [
        ...imageBlocks,
        { type: 'text', text: '' },
      ];
      return [
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: newUserContent },
      ];
    }

    // Merge imageBlocks into the last user message
    return messages.map((msg, index) => {
      if (index === lastUserIndex) {
        // Convert to ContentBlock array: images first, then text
        const contentBlocks: ContentBlock[] = [
          ...imageBlocks,
          { type: 'text', text: msg.content },
        ];
        return {
          role: msg.role,
          content: contentBlocks,
        };
      }
      // Other messages remain as simple strings
      return {
        role: msg.role,
        content: msg.content,
      };
    });
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

    // Story 20.3.3: Forward abortSignal to actually cancel the API request
    const requestOptions: { signal?: AbortSignal } = {};
    if (request.abortSignal) {
      requestOptions.signal = request.abortSignal;
    }

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: request.maxTokens || 4096,
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
    // pdf-parse v2 uses class-based API
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();

      // For now, we'll handle PDF text extraction separately
      // Vision is primarily for scanned docs and images
      console.log(
        '[ClaudeClient] PDF detected, extracted text:',
        result.total,
        'pages'
      );

      // Return empty for now - PDFs handled via text extraction
      // In production, use pdf2pic for image-based PDFs (scans)
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

  // =========================================================================
  // ILLMClient Implementation (Epic 15)
  // =========================================================================

  /**
   * Get the model identifier for provenance tracking
   */
  getModelId(): string {
    return this.model;
  }

  /**
   * Stream a conversation with tool support
   * Used by ScoringService for scoring analysis
   *
   * @param options - System prompt, user prompt, tools, and callbacks
   */
  async streamWithTool(options: StreamWithToolOptions): Promise<void> {
    const {
      systemPrompt,
      userPrompt,
      tools,
      tool_choice,
      usePromptCache,
      maxTokens = 8192,  // Default for backward compatibility
      abortSignal,
      onTextDelta,
      onToolUse,
    } = options;

    // Convert tool definitions to Claude format
    const claudeTools: ClaudeTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    // Build messages
    const messages: ClaudeMessage[] = [
      { role: 'user', content: userPrompt },
    ];

    // Format system prompt for caching if enabled
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);

    // Build request options with optional caching header and abort signal
    // Story 20.3.3: Forward abortSignal to actually cancel the streaming API request
    const requestOptions: { headers?: Record<string, string>; signal?: AbortSignal } | undefined =
      (usePromptCache || abortSignal) ? {} : undefined;
    if (requestOptions) {
      if (usePromptCache) {
        requestOptions.headers = { 'anthropic-beta': 'prompt-caching-2024-07-31' };
      }
      if (abortSignal) {
        requestOptions.signal = abortSignal;
      }
    }

    try {
      const stream = await this.client.messages.stream(
        {
          model: this.model,
          max_tokens: maxTokens,  // Configurable for different use cases (default: 8192)
          system,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          tools: claudeTools.length > 0 ? claudeTools : undefined,
          // tool_choice forces Claude to use the tool - essential for structured output
          ...(tool_choice && { tool_choice }),
        },
        requestOptions
      );

      // Track tool use blocks during streaming
      let currentToolUse: { name: string; inputJson: string } | null = null;

      for await (const event of stream) {
        // Check abort signal
        if (abortSignal?.aborted) {
          console.log('[ClaudeClient] streamWithTool aborted');
          break;
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            // Start tracking a new tool use
            currentToolUse = {
              name: event.content_block.name,
              inputJson: '',
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Emit text delta
            onTextDelta?.(event.delta.text);
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            // Accumulate tool input JSON
            currentToolUse.inputJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            // Parse accumulated JSON and emit tool use
            try {
              const input = JSON.parse(currentToolUse.inputJson || '{}');
              onToolUse?.(currentToolUse.name, input);
            } catch {
              console.error('[ClaudeClient] Failed to parse tool input JSON');
            }
            currentToolUse = null;
          }
        }
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        console.log('[ClaudeClient] streamWithTool aborted during request');
        return;
      }
      throw new ClaudeAPIError(
        `streamWithTool failed: ${(error as Error).message}`,
        error as Error
      );
    }
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
