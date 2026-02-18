/**
 * ClaudeTextClient - IClaudeClient implementation
 *
 * Handles text-based Claude API operations:
 * - sendMessage: Non-streaming message with retry logic
 * - streamMessage: Streaming with real-time chunks
 * - continueWithToolResult: Tool result continuation (Epic 33)
 *
 * Story 39.4.3: Extracted from ClaudeClient.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  IClaudeClient,
  ClaudeMessage,
  ClaudeResponse,
  StreamChunk,
  ClaudeRequestOptions,
  ToolUseBlock,
  ToolResultBlock,
} from '../../application/interfaces/IClaudeClient.js';
import type { ImageContentBlock } from './types/index.js';
import { ClaudeClientBase, ClaudeAPIError } from './ClaudeClientBase.js';

export class ClaudeTextClient extends ClaudeClientBase implements IClaudeClient {
  /**
   * Send message to Claude with retry logic
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {}
  ): Promise<ClaudeResponse> {
    const { systemPrompt, usePromptCache, tools, tool_choice, maxTokens, abortSignal } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
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

    const effectiveMaxTokens = maxTokens ?? this.maxTokens;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: effectiveMaxTokens,
            system,
            messages: messages.map((msg) => ({ role: msg.role, content: msg.content })),
            ...(tools && tools.length > 0 && { tools }),
            ...(tool_choice && { tool_choice }),
          },
          requestOptions
        );

        const content = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        const toolUseBlocks = response.content
          .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
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
        if (attempt === this.retryAttempts - 1) break;
        await this.sleep(this.retryDelays[attempt]);
      }
    }

    throw new ClaudeAPIError(
      `Failed after ${this.retryAttempts} attempts: ${lastError?.message}`,
      lastError || undefined
    );
  }

  /**
   * Stream message from Claude with real-time chunks.
   * Epic 30: Added optional imageBlocks parameter for multimodal messages.
   */
  async *streamMessage(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {},
    imageBlocks?: ImageContentBlock[]
  ): AsyncGenerator<StreamChunk> {
    const streamStartTime = Date.now();
    const systemPromptLength = options.systemPrompt?.length || 0;
    const hasFileContext = options.systemPrompt?.includes('--- Attached Documents ---') || false;
    const imageBlockCount = imageBlocks?.length || 0;
    console.log(`[TIMING] ClaudeClient streamMessage START: ${streamStartTime} (systemPromptLength: ${systemPromptLength}, hasFileContext: ${hasFileContext}, imageBlockCount: ${imageBlockCount}, messageCount: ${messages.length})`);

    const { systemPrompt, usePromptCache, tools } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = this.buildCacheRequestOptions(usePromptCache);
    const apiMessages = this.toApiMessages(messages, imageBlocks);

    yield* this.streamWithRetry(
      { system, messages: apiMessages, tools },
      requestOptions,
      'Streaming failed',
      () => {
        const streamEndTime = Date.now();
        console.log(`[TIMING] ClaudeClient streamMessage END: ${streamEndTime} (duration: ${streamEndTime - streamStartTime}ms)`);
      }
    );
  }

  /**
   * Continue a conversation after tool use (Epic 33).
   * Builds message array: existing messages + assistant tool_use + user tool_result
   */
  async *continueWithToolResult(
    messages: ClaudeMessage[],
    toolUseBlocks: ToolUseBlock[],
    toolResults: ToolResultBlock[],
    options: ClaudeRequestOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const { systemPrompt, usePromptCache, tools } = options;
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);
    const requestOptions = this.buildCacheRequestOptions(usePromptCache);

    const extendedMessages: Anthropic.MessageParam[] = [
      ...this.toApiMessages(messages),
      {
        role: 'assistant',
        content: toolUseBlocks.map((tu) => ({
          type: 'tool_use' as const,
          id: tu.id,
          name: tu.name,
          input: tu.input,
        })),
      },
      {
        role: 'user',
        content: toolResults.map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.tool_use_id,
          content: tr.content,
          ...(tr.is_error && { is_error: tr.is_error }),
        })),
      },
    ];

    yield* this.streamWithRetry(
      { system, messages: extendedMessages, tools },
      requestOptions,
      'Tool result continuation failed'
    );
  }

  /**
   * Shared streaming + retry logic for streamMessage and continueWithToolResult.
   */
  private async *streamWithRetry(
    params: {
      system: string | Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> | undefined;
      messages: Anthropic.MessageParam[];
      tools?: ClaudeRequestOptions['tools'];
    },
    requestOptions: { headers: Record<string, string> } | undefined,
    errorPrefix: string,
    onComplete?: () => void
  ): AsyncGenerator<StreamChunk> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const stream = await this.client.messages.stream(
          {
            model: this.model,
            max_tokens: this.maxTokens,
            system: params.system,
            messages: params.messages,
            ...(params.tools && params.tools.length > 0 && { tools: params.tools }),
          },
          requestOptions
        );

        for await (const chunk of this.processStreamEvents(stream)) {
          if (chunk.isComplete) onComplete?.();
          yield chunk;
        }

        return;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message || '';

        if (!this.isRetryableError(errorMessage)) {
          throw new ClaudeAPIError(`${errorPrefix}: ${errorMessage}`, error as Error);
        }
        if (attempt === this.retryAttempts - 1) break;

        console.log(
          `[ClaudeClient] Retryable error (attempt ${attempt + 1}/${this.retryAttempts}): ${errorMessage}. Retrying in ${this.retryDelays[attempt]}ms...`
        );
        await this.sleep(this.retryDelays[attempt]);
      }
    }

    throw new ClaudeAPIError(
      `${errorPrefix} after ${this.retryAttempts} attempts: ${lastError?.message}`,
      lastError || undefined
    );
  }
}
