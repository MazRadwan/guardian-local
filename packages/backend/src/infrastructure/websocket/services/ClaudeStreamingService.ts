/**
 * ClaudeStreamingService - Streams Claude responses to WebSocket clients
 *
 * Story 36.2.1: Extracted from MessageHandler.streamClaudeResponse()
 *
 * ARCHITECTURE: Infrastructure layer service.
 * - Manages Claude API streaming with abort handling
 * - Emits WebSocket events (assistant_stream_start, assistant_token, assistant_done)
 * - Delegates tool loop execution to ConsultToolLoopService
 * - Saves messages to DB via ConversationService
 *
 * CRITICAL BEHAVIORS PRESERVED FROM MessageHandler:
 * 1. assistant_stream_start emitted before streaming begins
 * 2. assistant_token emitted per chunk
 * 3. assistant_done emitted after streaming UNLESS abort
 * 4. Partial response saved to DB even on abort
 * 5. Tool loop gating: ALL 5 conditions must be true
 * 6. Empty toolUseBlocks returned when tool loop handles internally
 * 7. System error message saved to DB on Claude API failure
 * 8. stopReason passed through in StreamingResult
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IClaudeClient, ClaudeMessage, ToolUseBlock } from '../../../application/interfaces/IClaudeClient.js';
import type { IConsultToolLoopService } from './IConsultToolLoopService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { StreamingOptions, StreamingResult } from '../types/SendMessage.js';

export class ClaudeStreamingService {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly conversationService: ConversationService,
    private readonly consultToolLoopService?: IConsultToolLoopService
  ) {}

  /**
   * Stream Claude response to client
   *
   * Story 28.9.5: Claude streaming with abort handling
   * Story 33.2.2: Consult mode tool loop (web_search)
   * Story 36.2.1: Extracted from MessageHandler
   *
   * CRITICAL BEHAVIORS TO PRESERVE:
   * 1. Uses async iterator: `for await (const chunk of claudeClient.streamMessage(...))`
   * 2. Abort check inside loop: `if (socket.data.abortRequested) break;`
   * 3. assistant_done SUPPRESSED on abort
   * 4. Partial response saved to DB even on abort
   * 5. Tool uses captured from final chunk (chunk.isComplete && chunk.toolUse)
   *
   * Story 33.2.2 / Epic 34 Tool Loop:
   * - Only triggered when: mode === 'consult' AND source === 'user_input' AND stopReason === 'tool_use'
   * - Delegates to ConsultToolLoopService for tool execution
   * - Service handles up to 3 iterations (MAX_TOOL_ITERATIONS)
   * - Returns empty toolUseBlocks to prevent double handling by ChatServer
   *
   * @param socket - Authenticated socket to emit events on
   * @param conversationId - Conversation ID for the message
   * @param messages - Message history for Claude context
   * @param systemPrompt - System prompt for Claude
   * @param options - Streaming options (tools, caching, imageBlocks, mode, source)
   * @returns StreamingResult with response, tool uses, abort status, and stopReason
   */
  async streamClaudeResponse(
    socket: IAuthenticatedSocket,
    conversationId: string,
    messages: ClaudeMessage[],
    systemPrompt: string,
    options: StreamingOptions
  ): Promise<StreamingResult> {
    // Reset abort flag before starting stream
    socket.data.abortRequested = false;

    // Emit stream start event
    socket.emit('assistant_stream_start', {
      conversationId,
    });

    let fullResponse = '';
    let toolUseBlocks: ToolUseBlock[] = [];
    let savedMessageId: string | null = null;
    let wasAborted = false;
    let stopReason: StreamingResult['stopReason'];

    try {
      // Build Claude options
      const claudeOptions = {
        systemPrompt,
        usePromptCache: options.usePromptCache || false,
        ...(options.cachedPromptId && { cachedPromptId: options.cachedPromptId }),
        ...(options.enableTools && options.tools && { tools: options.tools }),
      };

      // Epic 30 Sprint 3: Pass imageBlocks to Claude for Vision API support
      const imageBlocks = options.imageBlocks && options.imageBlocks.length > 0 ? options.imageBlocks : undefined;

      // Stream response chunks from Claude using async iterator
      for await (const chunk of this.claudeClient.streamMessage(messages, claudeOptions, imageBlocks)) {
        // CRITICAL: Check if stream was aborted by user
        if (socket.data.abortRequested) {
          console.log(`[ClaudeStreamingService] Stream aborted by user, breaking loop`);
          wasAborted = true;
          break;
        }

        if (!chunk.isComplete && chunk.content) {
          fullResponse += chunk.content;

          // Emit each chunk to client
          socket.emit('assistant_token', {
            conversationId,
            token: chunk.content,
          });
        }

        // Capture tool use and stop reason from final chunk
        if (chunk.isComplete) {
          if (chunk.toolUse) {
            toolUseBlocks = chunk.toolUse;
            console.log(`[ClaudeStreamingService] Claude emitted ${toolUseBlocks.length} tool_use block(s): ${toolUseBlocks.map(t => t.name).join(', ')}`);
          }
          if (chunk.stopReason) {
            stopReason = chunk.stopReason as StreamingResult['stopReason'];
            console.log(`[ClaudeStreamingService] Claude stop_reason: ${stopReason}`);
          }
        }
      }

      // Story 33.2.2: Consult mode tool loop
      // Gating: Only process tool loop when ALL conditions are met:
      // 1. mode === 'consult' (not assessment or scoring)
      // 2. source === 'user_input' (not auto_summarize)
      // 3. stopReason === 'tool_use'
      // 4. toolUseBlocks.length > 0
      // 5. consultToolLoopService is configured

      // Debug log to diagnose tool loop gating
      console.log(`[ClaudeStreamingService] Tool loop check: mode=${options.mode}, source=${options.source}, stopReason=${stopReason}, toolUseBlocks=${toolUseBlocks.length}, hasLoopService=${!!this.consultToolLoopService}, wasAborted=${wasAborted}`);

      const shouldExecuteToolLoop =
        options.mode === 'consult' &&
        options.source === 'user_input' &&
        stopReason === 'tool_use' &&
        toolUseBlocks.length > 0 &&
        this.consultToolLoopService &&
        !wasAborted;

      if (shouldExecuteToolLoop) {
        console.log(`[ClaudeStreamingService] Consult mode tool loop triggered for ${toolUseBlocks.length} tool(s)`);

        // Story 34.1.3: Delegate to ConsultToolLoopService
        const toolLoopResult = await this.consultToolLoopService!.execute({
          socket,
          conversationId,
          originalMessages: messages,
          firstResponse: fullResponse,
          toolUseBlocks,
          systemPrompt,
          claudeOptions: { tools: options.tools },
        });

        // Update with final response from tool loop
        fullResponse = toolLoopResult.fullResponse;
        savedMessageId = toolLoopResult.savedMessageId;
        wasAborted = toolLoopResult.wasAborted;
        stopReason = toolLoopResult.stopReason;

        // CRITICAL: Return empty toolUseBlocks to prevent double handling by ChatServer
        // The tool loop handled the tools internally
        return {
          fullResponse,
          toolUseBlocks: [],  // Cleared - tools already handled
          savedMessageId,
          wasAborted,
          stopReason,
        };
      }

      // Save message to database (even if aborted, save partial response)
      if (fullResponse.length > 0) {
        const completeMessage = await this.conversationService.sendMessage({
          conversationId,
          role: 'assistant',
          content: { text: fullResponse },
        });
        savedMessageId = completeMessage.id;
      }

      // CRITICAL: Only emit assistant_done if NOT aborted
      if (!wasAborted) {
        socket.emit('assistant_done', {
          messageId: savedMessageId,
          conversationId,
          fullText: fullResponse,
          assessmentId: null,
        });
      } else {
        console.log(`[ClaudeStreamingService] Stream aborted - partial response saved (${fullResponse.length} chars)`);
      }

      return {
        fullResponse,
        toolUseBlocks,
        savedMessageId,
        wasAborted,
        stopReason,
      };
    } catch (error) {
      console.error('[ClaudeStreamingService] Claude API error:', error);

      // Send user-friendly error message
      const errorMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'system',
        content: {
          text: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
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
}
