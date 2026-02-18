/**
 * ClaudeStreamClient - ILLMClient implementation
 *
 * Handles streaming conversations with tool support:
 * - streamWithTool: Streaming with tool use (scoring, structured output)
 * - getModelId: Model identifier for provenance tracking
 *
 * Story 39.4.4: Extracted from ClaudeClient.ts
 * Story 39.3.4: Multi-block user prompt support (ContentBlockForPrompt[])
 * Epic 39: onUsage callback for metrics collection
 */

import type {
  ClaudeTool,
} from '../../application/interfaces/IClaudeClient.js';
import type {
  ILLMClient,
  StreamWithToolOptions,
} from '../../application/interfaces/ILLMClient.js';
import { ClaudeClientBase, ClaudeAPIError } from './ClaudeClientBase.js';

export class ClaudeStreamClient extends ClaudeClientBase implements ILLMClient {
  /**
   * Get the model identifier for provenance tracking
   */
  getModelId(): string {
    return this.model;
  }

  /**
   * Stream a conversation with tool support.
   * Used by ScoringService for scoring analysis.
   *
   * Supports both string and ContentBlockForPrompt[] for userPrompt.
   * When usePromptCache is true and a block has cacheable: true,
   * the block gets cache_control: { type: 'ephemeral' }.
   */
  async streamWithTool(options: StreamWithToolOptions): Promise<void> {
    const {
      systemPrompt,
      userPrompt,
      tools,
      tool_choice,
      usePromptCache,
      maxTokens = 8192,
      temperature,
      abortSignal,
      onTextDelta,
      onToolUse,
      onUsage,
    } = options;

    // Convert tool definitions to Claude format
    const claudeTools: ClaudeTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    // Build user message content: string passthrough or ContentBlockForPrompt[]
    const userContent = typeof userPrompt === 'string'
      ? userPrompt
      : userPrompt.map(block => ({
          type: block.type,
          text: block.text,
          ...(usePromptCache && block.cacheable ? { cache_control: { type: 'ephemeral' as const } } : {}),
        }));

    // Format system prompt for caching if enabled
    const system = this.buildSystemPrompt(systemPrompt, usePromptCache);

    // Build request options with optional caching header and abort signal
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
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user' as const, content: userContent }],
          tools: claudeTools.length > 0 ? claudeTools : undefined,
          ...(tool_choice && { tool_choice }),
          ...(temperature !== undefined && { temperature }),
        },
        requestOptions
      );

      // Track tool use blocks during streaming
      let currentToolUse: { name: string; inputJson: string } | null = null;
      let textLength = 0;
      let toolCallStarted = false;
      let toolJsonLength = 0;
      let messageStopSeen = false;
      let streamStopReason = 'not_seen';

      for await (const event of stream) {
        if (abortSignal?.aborted) {
          console.log('[ClaudeStreamClient] streamWithTool aborted');
          break;
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            toolCallStarted = true;
            console.log(`[ClaudeStreamClient] Tool call started: ${event.content_block.name}`);
            currentToolUse = {
              name: event.content_block.name,
              inputJson: '',
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            textLength += event.delta.text.length;
            onTextDelta?.(event.delta.text);
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.inputJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            toolJsonLength = currentToolUse.inputJson.length;
            console.log(`[ClaudeStreamClient] Tool block complete, JSON length: ${toolJsonLength}`);
            try {
              const input = JSON.parse(currentToolUse.inputJson || '{}');
              onToolUse?.(currentToolUse.name, input);
            } catch (parseErr) {
              console.error('[ClaudeStreamClient] Failed to parse tool input JSON:', (parseErr as Error).message);
              console.error('[ClaudeStreamClient] Tool JSON length:', currentToolUse.inputJson.length);
              console.error('[ClaudeStreamClient] Tool JSON last 200 chars:', currentToolUse.inputJson.slice(-200));
            }
            currentToolUse = null;
          }
        } else if (event.type === 'message_stop') {
          messageStopSeen = true;
          streamStopReason = stream.currentMessage?.stop_reason || 'null';
          console.log(`[ClaudeStreamClient] message_stop event -- stop_reason: ${streamStopReason}`);
        }
      }

      // Check if tool call was started but never finished (truncated)
      if (currentToolUse) {
        toolJsonLength = currentToolUse.inputJson.length;
        console.error(`[ClaudeStreamClient] INCOMPLETE tool call -- stream ended before content_block_stop. JSON accumulated: ${toolJsonLength} chars`);
        console.error(`[ClaudeStreamClient] Incomplete JSON last 200 chars: ${currentToolUse.inputJson.slice(-200)}`);
      }

      // Log final stream diagnostics
      const finalStopReason = stream.currentMessage?.stop_reason || 'unavailable';
      const usage = stream.currentMessage?.usage;
      console.log(`[ClaudeStreamClient] streamWithTool complete -- stop_reason: ${finalStopReason}, messageStopSeen: ${messageStopSeen}, textLength: ${textLength}, toolCallStarted: ${toolCallStarted}, toolJsonLength: ${toolJsonLength}, usage: ${JSON.stringify(usage)}`);

      // Epic 39: Invoke onUsage callback for metrics collection
      if (usage && onUsage) {
        onUsage({
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read_input_tokens: (usage as Record<string, unknown>).cache_read_input_tokens as number | undefined,
          cache_creation_input_tokens: (usage as Record<string, unknown>).cache_creation_input_tokens as number | undefined,
        });
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        console.log('[ClaudeStreamClient] streamWithTool aborted during request');
        return;
      }
      throw new ClaudeAPIError(
        `streamWithTool failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }
}
