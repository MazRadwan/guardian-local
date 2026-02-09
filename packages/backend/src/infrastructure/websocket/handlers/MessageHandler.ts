/**
 * MessageHandler - WebSocket handler for send_message validation and context building
 *
 * Story 28.9.1: Extract MessageHandler.ts (send_message validation)
 * Story 28.9.2: Extract MessageHandler.ts (file context building)
 * Story 28.9.4: Extract MessageHandler.ts (mode-specific routing)
 * Story 28.9.5: Extract MessageHandler.ts (Claude streaming)
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Validates send_message payloads
 * - Rate limit checking with reset time
 * - Conversation ownership validation
 * - Attachment validation and enrichment
 * - File-only message support (placeholder text generation inlined to ChatServer)
 * - File context building for Claude prompts
 * - Mode-specific routing (consult/assessment/scoring)
 * - Claude streaming with abort handling
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Support both `text` and `content` fields (payload.text || payload.content)
 * 2. Rate limiter uses isRateLimited(userId) and getResetTime(userId)
 * 3. conversationId MUST be from payload - NO fallback to socket.conversationId
 * 4. Must have text OR attachments (file-only messages allowed)
 * 5. Attachment validation via findByIdAndConversation
 * 6. Attachment ownership check (file.userId === socket.userId)
 * 7. Placeholder text generation moved to ChatServer (inlined)
 * 8. File context building accepts pre-validated enrichedAttachments
 * 9. Tools ONLY enabled in assessment mode (shouldUseTool = mode === 'assessment')
 * 10. Scoring mode bypasses Claude entirely - triggers triggerScoringOnSend instead
 * 11. Consult mode auto-summarizes empty file-only messages
 * 12. Assessment mode does background enrichment for files
 * 13. message_sent event emitted by ChatServer after saving user message
 * 14. assistant_done suppressed on abort (socket.data.abortRequested === true)
 * 15. Partial response saved to DB even on abort
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage.js';
import type { ITextExtractionService, ValidatedDocumentType } from '../../../application/interfaces/ITextExtractionService.js';
import type { IIntakeDocumentParser } from '../../../application/interfaces/IIntakeDocumentParser.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { RateLimiter } from '../RateLimiter.js';
import type { MessageAttachment, MessageComponent } from '../../../domain/entities/Message.js';
import type { FileContextBuilder, FileContextResult } from '../context/FileContextBuilder.js';
import type { IClaudeClient, ClaudeMessage, ToolUseBlock, ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';
import type { ImageContentBlock } from '../../ai/types/vision.js';
import type { ToolUseRegistry } from '../ToolUseRegistry.js';
import type { IConsultToolLoopService } from '../services/IConsultToolLoopService.js';

/**
 * Story 28.11.2: MIME type to validated document type mapping
 * Used for context injection fallback when re-reading from S3.
 * Handles DOCX-as-ZIP edge case by mapping to correct type.
 */
const MIME_TYPE_MAP: Record<string, ValidatedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

/**
 * Send message payload from client
 * CRITICAL: Supports both `text` and `content` fields for backward compatibility
 */
export interface SendMessagePayload {
  /** Conversation ID (REQUIRED - no fallback to socket.conversationId) */
  conversationId?: string;
  /** Message text (preferred field name) */
  text?: string;
  /** Message text (backward compatibility) */
  content?: string;
  /** File attachments */
  attachments?: Array<{ fileId: string }>;
  /** UI components embedded in message */
  components?: MessageComponent[];
  /** Whether this is a regenerate request */
  isRegenerate?: boolean;
}

/**
 * Validation error structure
 */
export interface ValidationError {
  /** Event name for error emission */
  event: string;
  /** Error message */
  message: string;
  /** Optional error code (e.g., RATE_LIMIT_EXCEEDED) */
  code?: string;
}

/**
 * Validation result from validateSendMessage
 */
export interface SendMessageValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error details if validation failed */
  error?: ValidationError;
  /** Validated conversation ID */
  conversationId?: string;
  /** Extracted message text (from text or content field) */
  messageText?: string;
  /** Enriched attachments with server-side metadata */
  enrichedAttachments?: MessageAttachment[];
  /** Story 31.2: Whether to emit file_processing_error event instead of generic error */
  emitFileProcessingError?: boolean;
  /** Story 31.2: File IDs that are missing after retry */
  missingFileIds?: string[];
}

/**
 * Mode-specific configuration for message processing
 *
 * Story 28.9.4: Mode-specific routing logic
 *
 * CRITICAL TOOL ENABLEMENT RULES (from ChatServer.ts line 916):
 * - Tools are ONLY enabled in assessment mode (shouldUseTool = mode === 'assessment')
 * - Consult mode: NO tools, just conversation
 * - Scoring mode: NO tools, bypasses Claude entirely
 */
export interface ModeConfig {
  /** The conversation mode */
  mode: 'consult' | 'assessment' | 'scoring';
  /** Whether to enable Claude tools (ONLY true in assessment mode) */
  enableTools: boolean;
  /** Whether to auto-summarize empty file-only messages (consult mode) */
  autoSummarize: boolean;
  /** Whether to do background file enrichment (assessment mode) */
  backgroundEnrich: boolean;
  /** Whether to bypass Claude entirely and trigger scoring directly (scoring mode) */
  bypassClaude: boolean;
}

/**
 * Result of shouldBypassClaude check
 */
export interface BypassClaudeResult {
  /** Whether Claude should be bypassed */
  bypass: boolean;
  /** Reason for bypassing (if applicable) */
  reason?: 'scoring';
}

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
 * MessageHandler - Validates send_message requests
 *
 * Responsibilities:
 * 1. Validate payload structure and required fields
 * 2. Check user authentication
 * 3. Enforce rate limits
 * 4. Validate conversation ownership
 * 5. Validate and enrich file attachments
 * 6. Generate placeholder text for file-only messages
 *
 * Security:
 * - Rate limit check prevents message spam
 * - Ownership validation prevents cross-user access
 * - Attachment ownership validation prevents file access attacks
 * - Server-side metadata prevents client-provided file manipulation
 *
 * Error handling:
 * - Returns structured error with event name and message
 * - Rate limit errors include reset time and error code
 */
export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly fileContextBuilder?: FileContextBuilder,
    private readonly claudeClient?: IClaudeClient,
    // Story 28.11.2: Dependencies for background enrichment
    private readonly fileStorage?: IFileStorage,
    private readonly intakeParser?: IIntakeDocumentParser,
    // Story 33.2.2: ToolUseRegistry for consult mode tool loop
    private readonly toolRegistry?: ToolUseRegistry,
    // Story 34.1.3: ConsultToolLoopService for consult mode tool execution
    private readonly consultToolLoopService?: IConsultToolLoopService
  ) {}

  /**
   * Validate send_message request
   *
   * CRITICAL BEHAVIORS TO PRESERVE:
   * 1. Support both `text` and `content` fields (payload.text || payload.content)
   * 2. Rate limiter uses isRateLimited(userId) and getResetTime(userId)
   * 3. conversationId MUST be from payload - NO fallback to socket.conversationId
   * 4. Must have text OR attachments (file-only messages allowed)
   * 5. Attachment validation via findByIdAndConversation
   * 6. Attachment ownership check (file.userId === socket.userId)
   *
   * @param socket - Authenticated socket
   * @param payload - Send message payload
   * @returns Validation result with error or enriched attachments
   */
  async validateSendMessage(
    socket: IAuthenticatedSocket,
    payload: SendMessagePayload
  ): Promise<SendMessageValidationResult> {
    const validateStartTime = Date.now();
    console.log(`[TIMING] MessageHandler validateSendMessage START: ${validateStartTime} (conversationId: ${payload?.conversationId}, hasAttachments: ${!!(payload?.attachments?.length)})`);

    // Validate payload is an object
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        error: { event: 'send_message', message: 'Invalid message payload' },
      };
    }

    // Auth check - must have userId
    if (!socket.userId) {
      return {
        valid: false,
        error: { event: 'send_message', message: 'User not authenticated' },
      };
    }

    // CRITICAL: conversationId MUST be provided by client - NO fallback to socket.conversationId
    const conversationId = payload.conversationId;
    if (!conversationId) {
      return {
        valid: false,
        error: { event: 'send_message', message: 'Conversation ID required' },
      };
    }

    // Support both text and content fields (prefer text for new clients)
    const messageText = payload.text || payload.content;
    const attachments = payload.attachments;

    // Validate: must have text OR attachments (or both)
    const hasAttachments = attachments && attachments.length > 0;
    const hasText = messageText && typeof messageText === 'string' && messageText.trim().length > 0;

    if (!hasText && !hasAttachments) {
      return {
        valid: false,
        error: { event: 'send_message', message: 'Message text or attachments required' },
      };
    }

    // Validate conversation ownership
    try {
      await this.validateConversationOwnership(conversationId, socket.userId);
    } catch (error) {
      return {
        valid: false,
        error: {
          event: 'send_message',
          message: error instanceof Error ? error.message : 'Unauthorized access',
        },
      };
    }

    // Rate limit check - MUST use isRateLimited() and getResetTime()
    if (this.rateLimiter.isRateLimited(socket.userId)) {
      const resetTime = this.rateLimiter.getResetTime(socket.userId);
      return {
        valid: false,
        error: {
          event: 'send_message',
          message: `Rate limit exceeded. Please wait ${resetTime} seconds before sending more messages.`,
          code: 'RATE_LIMIT_EXCEEDED',
        },
      };
    }

    // Validate and enrich attachments
    let enrichedAttachments: MessageAttachment[] | undefined;
    if (hasAttachments && attachments) {
      const attachmentResult = await this.validateAndEnrichAttachments(
        attachments,
        conversationId,
        socket.userId,
        socket
      );

      if (!attachmentResult.valid) {
        // Story 31.2: Pass through file_processing_error flag for special handling
        if (attachmentResult.emitFileProcessingError) {
          return {
            valid: false,
            error: attachmentResult.error,
            emitFileProcessingError: true,
            missingFileIds: attachmentResult.missingFileIds,
            conversationId,
          };
        }
        return {
          valid: false,
          error: attachmentResult.error,
        };
      }

      enrichedAttachments = attachmentResult.attachments;
    }

    const validateEndTime = Date.now();
    console.log(`[TIMING] MessageHandler validateSendMessage END: ${validateEndTime} (duration: ${validateEndTime - validateStartTime}ms, valid: true)`);

    return {
      valid: true,
      conversationId,
      messageText,
      enrichedAttachments,
    };
  }

  /**
   * Validate and enrich attachments
   *
   * Story 31.2: Now includes file existence waiting for race condition handling.
   * CRITICAL: Uses findByIdAndConversation for validation
   * - First waits for file records to exist (race condition with file_attached)
   * - Verifies file exists in the specified conversation
   * - Verifies file ownership matches requesting user
   * - Returns enriched attachments with server-side metadata (don't trust client)
   *
   * @param attachments - Attachment array with fileId from client
   * @param conversationId - Conversation ID for file lookup
   * @param userId - User ID for ownership validation
   * @param socket - Socket for emitting file_processing_error if files missing
   * @returns Validation result with enriched attachments or error
   */
  private async validateAndEnrichAttachments(
    attachments: Array<{ fileId: string }>,
    conversationId: string,
    userId: string,
    socket?: IAuthenticatedSocket
  ): Promise<{
    valid: boolean;
    attachments?: MessageAttachment[];
    error?: ValidationError;
    emitFileProcessingError?: boolean;
    missingFileIds?: string[];
  }> {
    // Story 31.2: Wait for file records before validation (race condition handling)
    const fileIds = attachments.map(att => att.fileId);
    const { found, missing } = await this.waitForFileRecords(fileIds);

    if (missing.length > 0) {
      console.warn(`[MessageHandler] Files missing after retry: ${missing.join(', ')}`);
      // Signal to caller that file_processing_error should be emitted
      return {
        valid: false,
        emitFileProcessingError: true,
        missingFileIds: missing,
        error: {
          event: 'file_processing_error',
          message: 'Some files are still processing. Please wait a moment and try again.',
        },
      };
    }

    const enriched: MessageAttachment[] = [];

    for (const att of attachments) {
      // Validate: file exists AND belongs to this conversation
      const file = await this.fileRepository.findByIdAndConversation(att.fileId, conversationId);

      if (!file) {
        return {
          valid: false,
          error: {
            event: 'send_message',
            message: `Invalid attachment: file ${att.fileId} not found or not authorized`,
          },
        };
      }

      // Verify user owns the file
      if (file.userId !== userId) {
        return {
          valid: false,
          error: {
            event: 'send_message',
            message: 'Attachment not authorized',
          },
        };
      }

      // Enrich with server-side metadata (don't trust client)
      enriched.push({
        fileId: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
      });
    }

    return { valid: true, attachments: enriched };
  }

  /**
   * Validate conversation ownership
   *
   * Checks that:
   * 1. Conversation exists
   * 2. Conversation belongs to the specified user
   *
   * @param conversationId - Conversation to validate
   * @param userId - Expected owner
   * @throws Error if conversation not found
   * @throws Error if conversation not owned by user
   */
  private async validateConversationOwnership(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    if (conversation.userId !== userId) {
      throw new Error('You do not have access to this conversation');
    }
  }

  /**
   * Story 31.2.1: Wait for file records to exist in DB with retry
   *
   * Handles race condition where user sends message before file_attached completes.
   * Uses heuristic polling with configurable timeout and interval.
   *
   * @param fileIds - Array of file IDs to check for existence
   * @param maxWaitMs - Maximum time to wait for files (default: 2000ms)
   * @param intervalMs - Polling interval (default: 100ms)
   * @returns Object with found and missing file ID arrays
   */
  async waitForFileRecords(
    fileIds: string[],
    maxWaitMs: number = 2000,
    intervalMs: number = 100
  ): Promise<{ found: string[]; missing: string[] }> {
    if (fileIds.length === 0) {
      return { found: [], missing: [] };
    }

    const startTime = Date.now();
    let found: string[] = [];
    let missing: string[] = [...fileIds];

    while (missing.length > 0 && (Date.now() - startTime) < maxWaitMs) {
      // Check which files exist
      const existingFiles = await this.fileRepository.findByIds(missing);
      const existingIds = new Set(existingFiles.map(f => f.id));

      found = fileIds.filter(id => existingIds.has(id) || found.includes(id));
      missing = fileIds.filter(id => !found.includes(id));

      if (missing.length > 0) {
        console.log(`[MessageHandler] Waiting for file records: ${missing.length} missing, elapsed: ${Date.now() - startTime}ms`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    if (missing.length > 0) {
      console.warn(`[MessageHandler] Files still missing after ${maxWaitMs}ms: ${missing.join(', ')}`);
    }

    return { found, missing };
  }

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
   * handled in Story 28.9.1 via `findByIdAndConversation` in validateSendMessage().
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
   * Get mode-specific configuration for message processing
   *
   * Story 28.9.4: Mode-specific routing logic
   *
   * CRITICAL BEHAVIORS TO PRESERVE (from ChatServer.ts):
   * 1. Tools are ONLY enabled in assessment mode (shouldUseTool = mode === 'assessment')
   * 2. Scoring mode bypasses Claude entirely - triggers triggerScoringOnSend instead
   * 3. Consult mode auto-summarizes empty file-only messages
   * 4. Assessment mode does background enrichment for files
   *
   * @param mode - The conversation mode
   * @returns Mode-specific configuration
   */
  getModeConfig(mode: string): ModeConfig {
    switch (mode) {
      case 'assessment':
        return {
          mode: 'assessment',
          enableTools: true,         // ONLY assessment mode has tools
          autoSummarize: false,
          backgroundEnrich: true,    // Enrich files in background
          bypassClaude: false,
        };

      case 'scoring':
        return {
          mode: 'scoring',
          enableTools: false,        // No tools in scoring
          autoSummarize: false,
          backgroundEnrich: false,
          bypassClaude: true,        // Bypass Claude, trigger scoring directly
        };

      case 'consult':
      default:
        return {
          mode: 'consult',
          enableTools: true,         // Epic 33: Enable web_search tool in consult mode
          autoSummarize: true,       // Auto-summarize empty file messages
          backgroundEnrich: false,
          bypassClaude: false,
        };
    }
  }

  /**
   * Check if Claude should be bypassed for this mode
   *
   * Story 28.9.4: Mode-specific routing
   *
   * CRITICAL: In scoring mode with attachments, we bypass Claude entirely
   * and trigger scoring directly. This is the "trigger-on-send" pattern.
   *
   * @param mode - The conversation mode
   * @param hasAttachments - Whether the message has file attachments
   * @returns Whether to bypass Claude and the reason
   */
  shouldBypassClaude(
    mode: string,
    hasAttachments: boolean
  ): BypassClaudeResult {
    const config = this.getModeConfig(mode);

    if (config.bypassClaude && hasAttachments) {
      return { bypass: true, reason: 'scoring' };
    }

    return { bypass: false };
  }

  /**
   * Check if auto-summarize should trigger
   *
   * Story 28.9.4: Mode-specific routing
   *
   * CRITICAL: In consult mode, when user sends files without text,
   * auto-generate a summary to kickstart the conversation.
   *
   * @param mode - The conversation mode
   * @param hasText - Whether the message has text content
   * @param hasAttachments - Whether the message has file attachments
   * @returns Whether to auto-summarize the files
   */
  shouldAutoSummarize(
    mode: string,
    hasText: boolean,
    hasAttachments: boolean
  ): boolean {
    const config = this.getModeConfig(mode);
    return config.autoSummarize && !hasText && hasAttachments;
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

  /**
   * Story 28.11.2: Background enrichment for Assessment mode
   *
   * Runs in background (fire-and-forget) after immediate response is sent.
   * Uses tryStartParsing() for idempotency - prevents duplicate processing.
   *
   * @param conversationId - Conversation containing files to enrich
   * @param fileIds - File IDs to process
   */
  async enrichInBackground(
    conversationId: string,
    fileIds: string[]
  ): Promise<void> {
    // Check dependencies
    if (!this.intakeParser || !this.fileStorage) {
      console.warn('[MessageHandler] Intake parser or file storage not configured, skipping background enrichment');
      return;
    }

    for (const fileId of fileIds) {
      try {
        // Use idempotency check (parseStatus column)
        // Only proceeds if status was 'pending' -> 'in_progress'
        const started = await this.fileRepository.tryStartParsing(fileId);
        if (!started) {
          console.log(`[MessageHandler] File ${fileId} already being processed, skipping`);
          continue;
        }

        // Get file record for storage path
        const file = await this.fileRepository.findById(fileId);
        if (!file) {
          console.warn(`[MessageHandler] File ${fileId} not found for enrichment`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          continue;
        }

        // Retrieve file from storage
        const buffer = await this.fileStorage.retrieve(file.storagePath);

        // Map MIME type to document type
        const documentType = MIME_TYPE_MAP[file.mimeType];
        if (!documentType) {
          console.warn(`[MessageHandler] Unsupported MIME type for enrichment: ${file.mimeType}`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          continue;
        }

        // Parse for context (assessment mode uses standard enrichment)
        const result = await this.intakeParser.parseForContext(buffer, {
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.size,
          documentType,
          storagePath: file.storagePath,
          uploadedAt: file.createdAt,
          uploadedBy: file.userId,
        });

        if (result.success && result.context) {
          // Store enriched context
          await this.fileRepository.updateIntakeContext(
            fileId,
            {
              vendorName: result.context.vendorName,
              solutionName: result.context.solutionName,
              solutionType: result.context.solutionType,
              industry: result.context.industry,
              features: result.context.features,
              claims: result.context.claims,
              complianceMentions: result.context.complianceMentions,
            },
            result.gapCategories
          );
          await this.fileRepository.updateParseStatus(fileId, 'completed');
          console.log(`[MessageHandler] Background enrichment completed for file ${fileId}`);
        } else {
          console.warn(`[MessageHandler] Background enrichment failed for file ${fileId}: ${result.error}`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
        }
      } catch (err) {
        console.error(`[MessageHandler] Error during background enrichment for file ${fileId}:`, err);
        // Mark as failed but continue with other files
        await this.fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
      }
    }
  }

  /**
   * Story 28.11.2: Auto-summarize documents in Consult mode
   *
   * When user sends file(s) without a message in Consult mode,
   * automatically generate a summary to kickstart the conversation.
   *
   * @param socket - Client socket to emit events to
   * @param conversationId - Conversation containing the files
   * @param userId - User who uploaded the files
   * @param fileIds - File IDs to summarize
   */
  async autoSummarizeDocuments(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userId: string,
    fileIds: string[]
  ): Promise<void> {
    try {
      // Validate claudeClient is configured
      if (!this.claudeClient) {
        console.warn('[MessageHandler] Claude client not configured for auto-summarize');
        socket.emit('message', {
          role: 'assistant',
          content: "I received your file but couldn't process it. Please try again.",
          conversationId,
        });
        return;
      }

      // Build file context scoped to the specific files being summarized
      // This prevents mixing unrelated documents from the conversation
      const fileContext = this.fileContextBuilder
        ? await this.fileContextBuilder.build(conversationId, fileIds)
        : null;

      if (!fileContext) {
        // No context available - ask user to try again
        socket.emit('message', {
          role: 'assistant',
          content: "I received your file but couldn't extract the content. Could you try uploading it again?",
          conversationId,
        });
        return;
      }

      // Get file names for personalized response
      const files = await Promise.all(
        fileIds.map(id => this.fileRepository.findById(id))
      );
      const validFiles = files.filter(Boolean) as NonNullable<typeof files[number]>[];
      const fileNames = validFiles.map(f => f.filename).join(', ');

      // Build summarization prompt
      const isSingleFile = fileIds.length === 1;
      const fileLabel = isSingleFile
        ? `a document (${fileNames})`
        : `${fileIds.length} documents (${fileNames})`;
      const systemPrompt = this.buildAutoSummarizePrompt(fileLabel);

      // Get conversation messages (empty array is fine - we just need file context)
      const messages: ClaudeMessage[] = [];

      // Emit typing indicator
      socket.emit('assistant_stream_start', { conversationId });

      // Stream Claude response
      let fullResponse = '';

      for await (const chunk of this.claudeClient.streamMessage(messages, {
        systemPrompt: `${systemPrompt}\n\n${fileContext}`,
      })) {
        if (!chunk.isComplete && chunk.content) {
          fullResponse += chunk.content;
          socket.emit('assistant_token', {
            conversationId,
            token: chunk.content,
          });
        }
      }

      // Save assistant response
      const summaryMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: fullResponse },
      });

      // Emit stream complete
      socket.emit('assistant_done', {
        conversationId,
        messageId: summaryMessage.id,
        fullText: fullResponse,
      });

      console.log(`[MessageHandler] Auto-summarize complete (${fullResponse.length} chars)`);
    } catch (error) {
      console.error('[MessageHandler] Auto-summarize failed:', error);
      socket.emit('message', {
        role: 'assistant',
        content: "I had trouble summarizing the document. What would you like to know about it?",
        conversationId,
      });
    }
  }

  /**
   * Story 28.11.2: Build system prompt for auto-summarization
   *
   * Creates a Guardian-style prompt that produces summaries focused on
   * AI governance and vendor assessment relevance.
   *
   * @param fileLabel - Description of the file(s) being summarized
   * @returns System prompt for Claude
   */
  private buildAutoSummarizePrompt(fileLabel: string): string {
    return `You are Guardian, an AI assistant helping healthcare organizations assess AI vendors.

The user has uploaded ${fileLabel} and wants to understand its contents.

Please provide a helpful summary that:
1. Identifies what type of document this is (security whitepaper, compliance cert, product doc, questionnaire, etc.)
2. Highlights key points relevant to AI governance and vendor assessment
3. Notes any security, privacy, or compliance information mentioned
4. Ends with an invitation to ask follow-up questions

Keep the summary concise (3-5 paragraphs) and focus on information relevant to vendor assessment.
If the document appears to be a completed questionnaire, mention that it can be scored in Scoring mode.`;
  }

}
