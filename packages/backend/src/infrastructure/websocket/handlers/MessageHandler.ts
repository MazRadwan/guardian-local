/**
 * MessageHandler - WebSocket handler for file context building and Claude streaming
 *
 * Story 28.9.2: Extract MessageHandler.ts (file context building)
 * Story 28.9.5: Extract MessageHandler.ts (Claude streaming)
 * Story 36.1.2: Removed validation (now in SendMessageValidator)
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - File context building for Claude prompts
 * - Claude streaming with abort handling
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. File context building accepts pre-validated enrichedAttachments
 * 2. Tools ONLY enabled in assessment mode (shouldUseTool = mode === 'assessment')
 * 3. Consult mode auto-summarizes empty file-only messages
 * 4. assistant_done suppressed on abort (socket.data.abortRequested === true)
 * 5. Partial response saved to DB even on abort
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { MessageAttachment } from '../../../domain/entities/Message.js';
import type { FileContextBuilder, FileContextResult } from '../context/FileContextBuilder.js';
import type { IClaudeClient, ClaudeMessage, ToolUseBlock, ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';
import type { ImageContentBlock } from '../../ai/types/vision.js';
import type { ToolUseRegistry } from '../ToolUseRegistry.js';
import type { IConsultToolLoopService } from '../services/IConsultToolLoopService.js';

/**
 * Story 28.9.5: Result of streamClaudeResponse
 * Story 33.2.2: Extended with stopReason for tool loop detection
 *
 * Contains the full response text, any tool use blocks from Claude,
 * the saved message ID (if response was non-empty), abort status, and stop reason.
 */
export interface StreamingResult {
  /** Full accumulated response text */
  fullResponse: string;
  /** Tool use blocks from Claude's final chunk (if any) */
  toolUseBlocks: ToolUseBlock[];
  /** ID of the saved message (null if empty response) */
  savedMessageId: string | null;
  /** Whether the stream was aborted by user */
  wasAborted: boolean;
  /** Story 33.2.2: Stop reason from Claude API */
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

/**
 * Story 28.9.5: Options for streamClaudeResponse
 * Epic 30 Sprint 3: Added imageBlocks for Vision API support
 * Story 33.2.2: Added mode and source for tool loop gating
 */
export interface StreamingOptions {
  /** Whether to enable Claude tools */
  enableTools: boolean;
  /** Tools to provide to Claude (if enableTools is true) */
  tools?: ClaudeTool[];
  /** Whether to use prompt caching */
  usePromptCache?: boolean;
  /** Cached prompt ID (if using prompt caching) */
  cachedPromptId?: string;
  /** Epic 30: Image content blocks for Vision API */
  imageBlocks?: ImageContentBlock[];
  /** Story 33.2.2: Conversation mode for tool loop gating */
  mode?: 'consult' | 'assessment' | 'scoring';
  /** Story 33.2.2: Message source for tool loop gating (only 'user_input' triggers tools) */
  source?: 'user_input' | 'auto_summarize';
}

/**
 * MessageHandler - File context building and Claude streaming
 *
 * Story 36.1.2: Validation responsibility moved to SendMessageValidator.
 * This handler now focuses on:
 * 1. Building file context for Claude prompts
 * 2. Streaming Claude responses with abort handling
 */
export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileContextBuilder?: FileContextBuilder,
    private readonly claudeClient?: IClaudeClient,
    // Story 33.2.2: ToolUseRegistry for consult mode tool loop
    private readonly toolRegistry?: ToolUseRegistry,
    // Story 34.1.3: ConsultToolLoopService for consult mode tool execution
    private readonly consultToolLoopService?: IConsultToolLoopService
  ) {}

  /**
   * Build file context for Claude prompt
   *
   * Story 28.9.2: File context building for Claude prompts
   * Epic 30 Sprint 3: Now returns FileContextResult with both text and image blocks
   * Epic 30 Sprint 4 Story 30.4.3: Mode parameter for Vision API gating
   *
   * NOTE: This method receives enrichedAttachments that have ALREADY been
   * validated by validateSendMessage(). It does NOT re-validate.
   *
   * The validation responsibility (ownership, conversation membership) is
   * handled in SendMessageValidator via `findByIdAndConversation`.
   *
   * Context building scenarios:
   * 1. No FileContextBuilder configured - returns empty result
   * 2. No attachments provided - uses all conversation files
   * 3. Empty attachments array - uses all conversation files
   * 4. Specific attachments - scopes to those validated file IDs
   *
   * Mode-specific behavior (Epic 30 Sprint 4 Story 30.4.3):
   * - Consult mode: Images processed via Vision API (returns imageBlocks)
   * - Assessment mode: Images processed via Vision API (returns imageBlocks)
   * - Scoring mode: Uses DocumentParser flow, not this method
   *
   * @param conversationId - The conversation ID
   * @param enrichedAttachments - Pre-validated attachments from validation step (optional)
   * @param mode - Conversation mode for Vision API gating (default: consult)
   * @returns FileContextResult with textContext and imageBlocks
   */
  async buildFileContext(
    conversationId: string,
    enrichedAttachments?: MessageAttachment[],
    mode?: 'consult' | 'assessment' | 'scoring'
  ): Promise<FileContextResult> {
    const buildContextStartTime = Date.now();
    console.log(`[TIMING] MessageHandler buildFileContext START: ${buildContextStartTime} (conversationId: ${conversationId}, attachmentCount: ${enrichedAttachments?.length || 0}, mode: ${mode || 'consult'})`);

    // No FileContextBuilder configured - return empty result
    if (!this.fileContextBuilder) {
      console.log(`[TIMING] MessageHandler buildFileContext NO_BUILDER: ${Date.now()}`);
      return { textContext: '', imageBlocks: [] };
    }

    // Build options with mode for Vision API gating
    const options = mode ? { mode } : undefined;

    let result: FileContextResult;
    // No specific files - use all conversation files
    if (!enrichedAttachments || enrichedAttachments.length === 0) {
      result = await this.fileContextBuilder.buildWithImages(conversationId, undefined, options);
    } else {
      // Scope to specific validated files
      const fileIds = enrichedAttachments.map((a) => a.fileId);
      result = await this.fileContextBuilder.buildWithImages(conversationId, fileIds, options);
    }

    const buildContextEndTime = Date.now();
    console.log(`[TIMING] MessageHandler buildFileContext END: ${buildContextEndTime} (duration: ${buildContextEndTime - buildContextStartTime}ms, textContextLength: ${result.textContext.length}, imageBlocksCount: ${result.imageBlocks.length})`);

    return result;
  }

  /**
   * Stream Claude response to client
   *
   * Story 28.9.5: Claude streaming with abort handling
   * Story 33.2.2: Consult mode tool loop (web_search)
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
    // Validate claudeClient is configured
    if (!this.claudeClient) {
      throw new Error('ClaudeClient not configured in MessageHandler');
    }

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
          console.log(`[MessageHandler] Stream aborted by user, breaking loop`);
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
            console.log(`[MessageHandler] Claude emitted ${toolUseBlocks.length} tool_use block(s): ${toolUseBlocks.map(t => t.name).join(', ')}`);
          }
          if (chunk.stopReason) {
            stopReason = chunk.stopReason as StreamingResult['stopReason'];
            console.log(`[MessageHandler] Claude stop_reason: ${stopReason}`);
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
      console.log(`[MessageHandler] Tool loop check: mode=${options.mode}, source=${options.source}, stopReason=${stopReason}, toolUseBlocks=${toolUseBlocks.length}, hasLoopService=${!!this.consultToolLoopService}, wasAborted=${wasAborted}`);

      const shouldExecuteToolLoop =
        options.mode === 'consult' &&
        options.source === 'user_input' &&
        stopReason === 'tool_use' &&
        toolUseBlocks.length > 0 &&
        this.consultToolLoopService &&
        !wasAborted;

      if (shouldExecuteToolLoop) {
        console.log(`[MessageHandler] Consult mode tool loop triggered for ${toolUseBlocks.length} tool(s)`);

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
        console.log(`[MessageHandler] Stream aborted - partial response saved (${fullResponse.length} chars)`);
      }

      return {
        fullResponse,
        toolUseBlocks,
        savedMessageId,
        wasAborted,
        stopReason,
      };
    } catch (error) {
      console.error('[MessageHandler] Claude API error:', error);

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
