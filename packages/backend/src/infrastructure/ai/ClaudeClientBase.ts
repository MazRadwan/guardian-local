/**
 * ClaudeClientBase - Shared infrastructure for Claude API clients
 *
 * Provides Anthropic SDK initialization, retry logic, and shared helper methods.
 * Extended by ClaudeTextClient, ClaudeVisionClient, and ClaudeClient.
 *
 * Story 39.4.3: Split ClaudeClient into focused modules
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ClaudeMessage,
  StreamChunk,
  ToolUseBlock,
} from '../../application/interfaces/IClaudeClient.js';
import type {
  ImageContentBlock,
  ClaudeApiMessage,
  ContentBlock,
} from './types/index.js';

/**
 * Returns LOCAL_MODEL_MAX_TOKENS if set, otherwise the provided default.
 * Used to override token limits when running local models (tokens are free).
 */
export function getMaxTokens(defaultValue: number): number {
  const override = parseInt(process.env.LOCAL_MODEL_MAX_TOKENS || '0', 10);
  return override > 0 ? override : defaultValue;
}

/**
 * Returns LOCAL_MODEL_NAME if set, otherwise the provided default.
 * Used to override model identifier when running local models via LM Studio.
 */
export function getModelId(defaultValue: string): string {
  return process.env.LOCAL_MODEL_NAME || defaultValue;
}

export class ClaudeClientBase {
  protected client: Anthropic;
  protected readonly model = getModelId('claude-sonnet-4-5-20250929');
  protected readonly maxTokens = getMaxTokens(4096);
  protected readonly retryAttempts = 3;
  protected readonly retryDelays = [2000, 4000, 8000]; // Exponential backoff

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    // Local models (LM Studio) need longer timeout — scoring can take 10+ min on Qwen
    const isLocalModel = !!process.env.ANTHROPIC_BASE_URL;
    this.client = new Anthropic({
      apiKey,
      timeout: isLocalModel ? 30 * 60 * 1000 : undefined, // 30 min for local, SDK default for cloud
    });
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected buildSystemPrompt(
    systemPrompt?: string,
    usePromptCache?: boolean
  ):
    | string
    | Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }>
    | undefined {
    if (!systemPrompt) return undefined;
    if (usePromptCache) {
      return [{
        type: 'text' as const,
        text: systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      }];
    }
    return systemPrompt;
  }

  /**
   * Build request options for prompt caching
   */
  protected buildCacheRequestOptions(
    usePromptCache?: boolean
  ): { headers: Record<string, string> } | undefined {
    return usePromptCache
      ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
      : undefined;
  }

  /**
   * Check if an error is retryable (overloaded, rate limit, transient transport).
   * Inspects both message text and structured error codes (error.code, cause.code).
   */
  protected isRetryableError(errorMessage: string): boolean {
    const msg = errorMessage.toLowerCase();
    return (
      msg.includes('overloaded') ||
      msg.includes('rate_limit') ||
      msg.includes('529') ||
      msg.includes('503') ||
      msg.includes('premature close') ||
      msg.includes('econnreset') ||
      msg.includes('socket hang up') ||
      msg.includes('etimedout') ||
      msg.includes('und_err_socket')
    );
  }

  /**
   * Static version for use outside subclasses (e.g., ScoringLLMService).
   */
  static isTransientError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Check message text
    if (
      msg.includes('premature close') ||
      msg.includes('econnreset') ||
      msg.includes('socket hang up') ||
      msg.includes('etimedout') ||
      msg.includes('und_err_socket') ||
      msg.includes('overloaded') ||
      msg.includes('rate_limit') ||
      msg.includes('529') ||
      msg.includes('503')
    ) {
      return true;
    }

    // Check structured error code / cause.code
    const errCode = (error as { code?: string })?.code?.toLowerCase();
    const causeCode = ((error as { cause?: { code?: string } })?.cause?.code)?.toLowerCase();
    const transientCodes = ['econnreset', 'etimedout', 'epipe', 'und_err_socket'];
    if (errCode && transientCodes.includes(errCode)) return true;
    if (causeCode && transientCodes.includes(causeCode)) return true;

    return false;
  }

  /**
   * Process streaming events from Anthropic API into StreamChunks.
   * Shared by streamMessage and continueWithToolResult.
   */
  protected async *processStreamEvents(
    stream: AsyncIterable<{ type: string; [key: string]: unknown }> & {
      currentMessage?: { stop_reason?: string | null };
    }
  ): AsyncGenerator<StreamChunk> {
    const toolUseBlocks: ToolUseBlock[] = [];
    let currentToolUse: Partial<ToolUseBlock> | null = null;
    let toolInputJson = '';

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const contentBlock = event.content_block as { type: string; id?: string; name?: string };
        if (contentBlock?.type === 'tool_use') {
          currentToolUse = {
            type: 'tool_use',
            id: contentBlock.id,
            name: contentBlock.name,
          };
          toolInputJson = '';
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string; partial_json?: string };
        if (delta.type === 'text_delta') {
          yield { content: delta.text!, isComplete: false };
        } else if (delta.type === 'input_json_delta' && currentToolUse) {
          toolInputJson += delta.partial_json!;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
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
        yield {
          content: '',
          isComplete: true,
          toolUse: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
          stopReason: stream.currentMessage?.stop_reason || 'end_turn',
        };
      }
    }
  }

  /**
   * Convert domain messages to API format, optionally merging image blocks.
   * Epic 30: Handles domain ClaudeMessage -> ClaudeApiMessage conversion.
   */
  protected toApiMessages(
    messages: ClaudeMessage[],
    imageBlocks?: ImageContentBlock[]
  ): ClaudeApiMessage[] {
    if (!imageBlocks || imageBlocks.length === 0) {
      return messages.map((msg) => ({ role: msg.role, content: msg.content }));
    }

    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) {
      const newUserContent: ContentBlock[] = [...imageBlocks, { type: 'text', text: '' }];
      return [
        ...messages.map((msg) => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: newUserContent },
      ];
    }

    return messages.map((msg, index) => {
      if (index === lastUserIndex) {
        const contentBlocks: ContentBlock[] = [
          ...imageBlocks,
          { type: 'text', text: msg.content },
        ];
        return { role: msg.role, content: contentBlocks };
      }
      return { role: msg.role, content: msg.content };
    });
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
