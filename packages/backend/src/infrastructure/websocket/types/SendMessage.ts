/**
 * SendMessage types - Shared type definitions for send_message validation and streaming
 *
 * Story 36.1.1: Extracted from MessageHandler.ts to enable reuse by
 * both MessageHandler and SendMessageValidator.
 * Story 36.2.1: Added StreamingResult and StreamingOptions (moved from MessageHandler.ts)
 *
 * These types define the contract between the WebSocket handler layer,
 * the validation service layer, and the streaming service layer.
 */

import type { MessageAttachment, MessageComponent } from '../../../domain/entities/Message.js';
import type { ClaudeTool, ToolUseBlock } from '../../../application/interfaces/IClaudeClient.js';
import type { ImageContentBlock } from '../../ai/types/vision.js';

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
 * Story 28.9.5: Result of streamClaudeResponse
 * Story 33.2.2: Extended with stopReason for tool loop detection
 * Story 36.2.1: Moved from MessageHandler.ts to shared types
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
 * Story 36.2.1: Moved from MessageHandler.ts to shared types
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
