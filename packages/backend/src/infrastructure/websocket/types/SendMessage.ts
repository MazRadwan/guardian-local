/**
 * SendMessage types - Shared type definitions for send_message validation
 *
 * Story 36.1.1: Extracted from MessageHandler.ts to enable reuse by
 * both MessageHandler and SendMessageValidator.
 *
 * These types define the contract between the WebSocket handler layer
 * and the validation service layer.
 */

import type { MessageAttachment, MessageComponent } from '../../../domain/entities/Message.js';

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
