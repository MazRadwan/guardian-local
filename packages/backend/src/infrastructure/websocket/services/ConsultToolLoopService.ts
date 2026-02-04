/**
 * ConsultToolLoopService - Consult mode tool loop execution
 *
 * Story 34.1.2: Implement ConsultToolLoopService
 * Epic 34: Moved to infrastructure layer (websocket-specific)
 *
 * Extracted from MessageHandler.ts to reduce coupling and improve testability.
 * This service handles the tool_use -> tool_result -> final response flow
 * for consult mode web search.
 *
 * Critical behaviors preserved from MessageHandler:
 * 1. MAX_TOOL_ITERATIONS = 3 - Loop limit
 * 2. is_error graceful degradation - Send is_error: true when max hit
 * 3. Abort handling - Check socket.data.abortRequested at every stage
 * 4. tool_status events - Emit searching, reading, idle
 * 5. Context accumulation - buildAugmentedMessages logic unchanged
 * 6. Final message saving - Save to DB via conversationService
 * 7. assistant_done suppression - Don't emit if aborted
 * 8. Error handling - Emit idle, send error message
 * 9. assistant_token streaming - Emit tokens during tool loop continuations
 * 10. ToolUseContext fields - Preserve userId, assessmentId: null, mode: 'consult'
 * 11. Loop exit gating - Exit when stopReason !== 'tool_use' or no tool blocks
 * 12. firstResponse parameter - Currently unused in loop body, preserve this behavior
 */

import type { IClaudeClient, ClaudeMessage, ToolUseBlock, ToolResultBlock, ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';
import type { IConsultToolLoopService, ConsultToolLoopOptions, ConsultToolLoopResult } from './IConsultToolLoopService.js';
import type { ToolUseRegistry } from '../ToolUseRegistry.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { ToolUseInput, ToolUseContext } from '../../../application/interfaces/IToolUseHandler.js';

/**
 * Maximum tool iterations per user query.
 * Allows Claude to make multiple searches before forcing conclusion.
 * On exceeding this limit, Claude receives is_error tool_result and must respond with available info.
 */
const MAX_TOOL_ITERATIONS = 3;

export class ConsultToolLoopService implements IConsultToolLoopService {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly toolRegistry: ToolUseRegistry,
    private readonly conversationService: ConversationService
  ) {}

  /**
   * Execute consult mode tool loop
   *
   * Flow:
   * 1. Emit tool_status 'searching' for UI feedback
   * 2. Execute tools via ToolUseRegistry.dispatch
   * 3. Build tool_result blocks
   * 4. Call claudeClient.continueWithToolResult for second stream
   * 5. Stream final response to client
   * 6. Save ONLY the final message to database
   * 7. Emit tool_status 'idle' when done
   */
  async execute(options: ConsultToolLoopOptions): Promise<ConsultToolLoopResult> {
    const {
      socket,
      conversationId,
      originalMessages,
      // firstResponse is intentionally unused - preserved for future use
      toolUseBlocks,
      systemPrompt,
      claudeOptions,
    } = options;

    let fullResponse = '';
    let savedMessageId: string | null = null;
    let wasAborted = false;
    let stopReason: ConsultToolLoopResult['stopReason'];

    // V2: Track iterations and current tool_use blocks
    let iteration = 0;
    let currentToolUseBlocks = toolUseBlocks;

    // Track accumulated context for multi-iteration (simplified - text only)
    const accumulatedResponses: string[] = [];
    const accumulatedToolSummaries: string[] = [];

    try {
      // V2: Loop until Claude stops calling tools or max iterations reached
      while (currentToolUseBlocks.length > 0 && !wasAborted) {
        iteration++;
        console.log(`[ConsultToolLoopService] Tool loop iteration ${iteration}/${MAX_TOOL_ITERATIONS}`);

        // Check if we've hit max iterations
        if (iteration > MAX_TOOL_ITERATIONS) {
          console.log(`[ConsultToolLoopService] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached, sending is_error`);

          // Build error results for all pending tool calls
          const errorResults: ToolResultBlock[] = currentToolUseBlocks.map(tu => ({
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: 'Search limit reached for this query. Please provide your best answer based on the information gathered so far.',
            is_error: true,
          }));

          // Final continuation WITHOUT tools - forces Claude to conclude
          socket.emit('tool_status', { conversationId, status: 'reading' });

          let finalResponse = '';
          for await (const chunk of this.claudeClient.continueWithToolResult(
            this.buildAugmentedMessages(originalMessages, accumulatedResponses, accumulatedToolSummaries),
            currentToolUseBlocks,
            errorResults,
            { systemPrompt }
          )) {
            if (socket.data.abortRequested) {
              wasAborted = true;
              break;
            }
            if (!chunk.isComplete && chunk.content) {
              finalResponse += chunk.content;
              socket.emit('assistant_token', { conversationId, token: chunk.content });
            }
            if (chunk.isComplete && chunk.stopReason) {
              stopReason = chunk.stopReason as ConsultToolLoopResult['stopReason'];
            }
          }
          fullResponse += finalResponse;
          break;
        }

        // 1. Emit tool_status for UI feedback
        socket.emit('tool_status', { conversationId, status: 'searching' });

        // 2. Check for abort before tool execution
        if (socket.data.abortRequested) {
          console.log('[ConsultToolLoopService] Tool loop aborted before execution');
          socket.emit('tool_status', { conversationId, status: 'idle' });
          wasAborted = true;
          break;
        }

        // 3. Execute tools via ToolUseRegistry
        const toolResults: ToolResultBlock[] = [];

        for (const toolUse of currentToolUseBlocks) {
          if (socket.data.abortRequested) {
            console.log('[ConsultToolLoopService] Tool loop aborted during execution');
            socket.emit('tool_status', { conversationId, status: 'idle' });
            wasAborted = true;
            break;
          }

          const input: ToolUseInput = {
            toolName: toolUse.name,
            toolUseId: toolUse.id,
            input: toolUse.input,
          };

          const context: ToolUseContext = {
            conversationId,
            userId: socket.userId!,
            assessmentId: null,
            mode: 'consult',
          };

          console.log(`[ConsultToolLoopService] Dispatching tool: ${toolUse.name} (iteration ${iteration})`);
          const result = await this.toolRegistry.dispatch(input, context);

          if (result.handled && result.toolResult) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: result.toolResult.toolUseId,
              content: result.toolResult.content,
            });
            // Track tool summary for context accumulation
            accumulatedToolSummaries.push(`[Search ${iteration}: ${JSON.stringify(toolUse.input)}]`);
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result.error || 'Tool execution failed. Please answer based on your knowledge.',
              is_error: true,
            });
          }
        }

        if (wasAborted) break;

        // 4. Emit reading status
        socket.emit('tool_status', { conversationId, status: 'reading' });

        // 5. Check abort before continuation
        if (socket.data.abortRequested) {
          console.log('[ConsultToolLoopService] Tool loop aborted before continuation');
          socket.emit('tool_status', { conversationId, status: 'idle' });
          wasAborted = true;
          break;
        }

        // 6. Continue conversation with tool results
        // V2: Pass tools to allow Claude to make additional searches
        console.log(`[ConsultToolLoopService] Continuing with ${toolResults.length} tool result(s), tools enabled for multi-search`);

        let iterationResponse = '';
        let newToolUseBlocks: ToolUseBlock[] = [];

        // Build messages with accumulated context for iterations 2+
        const messagesForContinuation = iteration === 1
          ? originalMessages
          : this.buildAugmentedMessages(originalMessages, accumulatedResponses, accumulatedToolSummaries);

        for await (const chunk of this.claudeClient.continueWithToolResult(
          messagesForContinuation,
          currentToolUseBlocks,
          toolResults,
          {
            systemPrompt,
            tools: claudeOptions.tools as ClaudeTool[], // V2: Enable tools for multi-search
          }
        )) {
          if (socket.data.abortRequested) {
            console.log('[ConsultToolLoopService] Tool loop aborted during stream');
            wasAborted = true;
            break;
          }

          if (!chunk.isComplete && chunk.content) {
            iterationResponse += chunk.content;
            socket.emit('assistant_token', { conversationId, token: chunk.content });
          }

          if (chunk.toolUse && chunk.toolUse.length > 0) {
            newToolUseBlocks = chunk.toolUse;
            console.log(`[ConsultToolLoopService] Claude emitted ${newToolUseBlocks.length} new tool_use block(s) in iteration ${iteration}`);
          }

          if (chunk.isComplete && chunk.stopReason) {
            stopReason = chunk.stopReason as ConsultToolLoopResult['stopReason'];
          }
        }

        // Accumulate response for context
        if (iterationResponse) {
          accumulatedResponses.push(iterationResponse);
        }
        fullResponse += iterationResponse;

        // Update for next iteration
        currentToolUseBlocks = newToolUseBlocks;

        // If no more tool calls or not tool_use stop reason, we're done
        if (currentToolUseBlocks.length === 0 || stopReason !== 'tool_use') {
          console.log(`[ConsultToolLoopService] Tool loop complete after ${iteration} iteration(s), stopReason=${stopReason}`);
          break;
        }
      }

      // 7. Save FINAL message to database
      if (fullResponse.length > 0) {
        const completeMessage = await this.conversationService.sendMessage({
          conversationId,
          role: 'assistant',
          content: { text: fullResponse },
        });
        savedMessageId = completeMessage.id;
      }

      // 8. Emit tool_status idle and assistant_done
      socket.emit('tool_status', { conversationId, status: 'idle' });

      if (!wasAborted) {
        socket.emit('assistant_done', {
          messageId: savedMessageId,
          conversationId,
          fullText: fullResponse,
          assessmentId: null,
        });
      } else {
        console.log(`[ConsultToolLoopService] Tool loop aborted - partial response saved (${fullResponse.length} chars)`);
      }

      return {
        fullResponse,
        toolUseBlocks: [],  // Tools already handled
        savedMessageId,
        wasAborted,
        stopReason,
      };
    } catch (error) {
      console.error('[ConsultToolLoopService] Tool loop error:', error);

      // Emit idle status on error
      socket.emit('tool_status', { conversationId, status: 'idle' });

      // Send user-friendly error message
      const errorMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'system',
        content: {
          text: "I encountered an error while searching. Please try again.",
        },
      });

      socket.emit('message', {
        id: errorMessage.id,
        conversationId: errorMessage.conversationId,
        role: errorMessage.role,
        content: errorMessage.content,
        createdAt: errorMessage.createdAt,
      });

      return {
        fullResponse: '',
        toolUseBlocks: [],
        savedMessageId: null,
        wasAborted: false,
        stopReason: undefined,
      };
    }
  }

  /**
   * V2: Build augmented messages with accumulated context from previous tool iterations.
   *
   * For multi-iteration tool loops, we need to give Claude context about what it
   * found in previous searches. This helper appends a summary of previous iterations
   * to the original messages.
   *
   * @param originalMessages - Original conversation history
   * @param accumulatedResponses - Text responses from previous iterations
   * @param accumulatedToolSummaries - Summaries of tool calls made
   * @returns Augmented messages array with context
   */
  private buildAugmentedMessages(
    originalMessages: ClaudeMessage[],
    accumulatedResponses: string[],
    accumulatedToolSummaries: string[]
  ): ClaudeMessage[] {
    if (accumulatedResponses.length === 0 && accumulatedToolSummaries.length === 0) {
      return originalMessages;
    }

    // Build context summary of previous iterations
    const contextParts: string[] = [];

    if (accumulatedToolSummaries.length > 0) {
      contextParts.push('Previous searches in this query:');
      contextParts.push(...accumulatedToolSummaries);
    }

    if (accumulatedResponses.length > 0) {
      contextParts.push('\nPrevious findings:');
      accumulatedResponses.forEach((response, i) => {
        if (response.trim()) {
          contextParts.push(`[Iteration ${i + 1}]: ${response.slice(0, 500)}${response.length > 500 ? '...' : ''}`);
        }
      });
    }

    const contextMessage = contextParts.join('\n');

    // Append context as a user message to give Claude awareness of previous iterations
    return [
      ...originalMessages,
      {
        role: 'user' as const,
        content: `[Context from previous search iterations]\n${contextMessage}\n\n[Continue with the next search or provide your answer]`,
      },
    ];
  }
}
