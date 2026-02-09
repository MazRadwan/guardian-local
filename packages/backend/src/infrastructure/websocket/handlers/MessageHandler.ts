/**
 * MessageHandler - File context building for Claude prompts
 *
 * Story 28.9.2: Extract MessageHandler.ts (file context building)
 * Story 36.1.2: Removed validation (now in SendMessageValidator)
 * Story 36.2.2: Removed streaming (now in ClaudeStreamingService)
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Builds file context (text + image blocks) for Claude prompts
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. File context building accepts pre-validated enrichedAttachments
 * 2. No specific files -> uses all conversation files
 * 3. Mode parameter gates Vision API (consult/assessment get imageBlocks)
 */

import type { MessageAttachment } from '../../../domain/entities/Message.js';
import type { FileContextBuilder, FileContextResult } from '../context/FileContextBuilder.js';

/**
 * MessageHandler - File context building only
 *
 * Story 36.2.2: Streaming responsibility moved to ClaudeStreamingService.
 * This handler now focuses solely on building file context for Claude prompts.
 */
export class MessageHandler {
  constructor(
    private readonly fileContextBuilder?: FileContextBuilder
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
}
