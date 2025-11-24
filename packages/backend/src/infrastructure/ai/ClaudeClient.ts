/**
 * ClaudeClient Implementation
 *
 * Wraps Anthropic SDK with retry logic, error handling, and streaming support
 * Model: claude-sonnet-4-5-20250929 (latest Sonnet 4.5)
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  IClaudeClient,
  ClaudeMessage,
  ClaudeResponse,
  StreamChunk,
  ClaudeRequestOptions,
} from '../../application/interfaces/IClaudeClient.js';

export class ClaudeClient implements IClaudeClient {
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
    const { systemPrompt, usePromptCache } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = usePromptCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : undefined;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }, requestOptions);

        // Extract text content from response
        const content =
          response.content[0].type === 'text' ? response.content[0].text : '';

        return {
          content,
          stop_reason: response.stop_reason || 'end_turn',
          model: response.model,
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
    const { systemPrompt, usePromptCache } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = usePromptCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : undefined;

    try {
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      }, requestOptions);

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          yield {
            content: chunk.delta.text,
            isComplete: false,
          };
        }
      }

      // Final chunk to signal completion
      yield {
        content: '',
        isComplete: true,
      };
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

  private buildSystemPrompt(systemPrompt?: string, usePromptCache?: boolean) {
    if (!systemPrompt) {
      return undefined;
    }

    if (usePromptCache) {
      return [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }

    return systemPrompt;
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
