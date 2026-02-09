/**
 * SendMessageValidator - Validates send_message requests
 *
 * Story 36.1.1: Extracted validation logic from MessageHandler.
 * Validates payload, auth, rate limits, ownership, and attachments.
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { RateLimiter } from '../RateLimiter.js';
import type { MessageAttachment } from '../../../domain/entities/Message.js';
import type {
  SendMessagePayload,
  SendMessageValidationResult,
  ValidationError,
} from '../types/SendMessage.js';

export class SendMessageValidator {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly rateLimiter: RateLimiter
  ) {}

  /**
   * Validate send_message request
   *
   * CRITICAL BEHAVIORS:
   * 1. Support both `text` and `content` fields (payload.text || payload.content)
   * 2. Rate limiter uses isRateLimited(userId) and getResetTime(userId)
   * 3. conversationId MUST be from payload - NO fallback to socket.conversationId
   * 4. Must have text OR attachments (file-only messages allowed)
   * 5. Attachment validation via findByIdAndConversation
   * 6. Attachment ownership check (file.userId === socket.userId)
   */
  async validateSendMessage(
    socket: IAuthenticatedSocket,
    payload: SendMessagePayload
  ): Promise<SendMessageValidationResult> {
    const validateStartTime = Date.now();
    console.log(`[TIMING] SendMessageValidator validateSendMessage START: ${validateStartTime} (conversationId: ${payload?.conversationId}, hasAttachments: ${!!(payload?.attachments?.length)})`);

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
        socket.userId
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
    console.log(`[TIMING] SendMessageValidator validateSendMessage END: ${validateEndTime} (duration: ${validateEndTime - validateStartTime}ms, valid: true)`);

    return {
      valid: true,
      conversationId,
      messageText,
      enrichedAttachments,
    };
  }

  /**
   * Validate and enrich attachments with race condition handling (Story 31.2).
   * Waits for file records, validates conversation membership and ownership,
   * returns enriched attachments with server-side metadata.
   */
  private async validateAndEnrichAttachments(
    attachments: Array<{ fileId: string }>,
    conversationId: string,
    userId: string
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
      console.warn(`[SendMessageValidator] Files missing after retry: ${missing.join(', ')}`);
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
   * Validate conversation exists and belongs to the specified user.
   * @throws Error if conversation not found or not owned by user
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
   * Story 31.2.1: Wait for file records to exist in DB with retry.
   * Handles race condition where user sends message before file_attached completes.
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
      const existingFiles = await this.fileRepository.findByIds(missing);
      const existingIds = new Set(existingFiles.map(f => f.id));

      found = fileIds.filter(id => existingIds.has(id) || found.includes(id));
      missing = fileIds.filter(id => !found.includes(id));

      if (missing.length > 0) {
        console.log(`[SendMessageValidator] Waiting for file records: ${missing.length} missing, elapsed: ${Date.now() - startTime}ms`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    if (missing.length > 0) {
      console.warn(`[SendMessageValidator] Files still missing after ${maxWaitMs}ms: ${missing.join(', ')}`);
    }

    return { found, missing };
  }
}
