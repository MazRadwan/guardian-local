/**
 * TitleUpdateService - Story 35.1.1
 * Extracted from MessageHandler lines 1040-1141 and 1282-1318.
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { ITitleGenerationService } from '../../../application/interfaces/ITitleGenerationService.js';
import type { TitleContext } from '../../../application/services/TitleGenerationService.js';
import { isPlaceholderTitle } from '../../../application/services/TitleGenerationService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ITitleUpdateService } from './ITitleUpdateService.js';

export class TitleUpdateService implements ITitleUpdateService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly titleGenerationService?: ITitleGenerationService
  ) {}

  /** Generate and update conversation title if conditions are met (from MessageHandler lines 1040-1141) */
  async generateTitleIfNeeded(
    socket: IAuthenticatedSocket,
    conversationId: string,
    mode: 'consult' | 'assessment' | 'scoring',
    assistantResponse: string
  ): Promise<void> {
    try {
      // Guard 1: Skip if title generation service not configured
      if (!this.titleGenerationService) {
        return;
      }

      // Guard 2: Skip for scoring mode - titles come from filename (handled in file upload flow)
      if (mode === 'scoring') {
        return;
      }

      // Guard 3: Check message count for title generation triggers
      // - Consult mode: 2 messages (user + assistant)
      // - Assessment mode: 3 messages (first exchange) OR 5 messages (after vendor info)
      const messageCount = await this.conversationService.getMessageCount(conversationId);
      const validCounts = mode === 'assessment' ? [3, 5] : [2];
      if (!validCounts.includes(messageCount)) {
        return;
      }

      // Check if this is a vendor info update (assessment mode at message 5)
      const isVendorInfoUpdate = mode === 'assessment' && messageCount === 5;

      // Guard 4: Check if conversation exists
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        return;
      }

      // Guard 5: Skip if title was manually edited by user
      if (conversation.titleManuallyEdited) {
        return;
      }

      // Guard 6: For initial generation, skip if title already set (not a placeholder)
      // For vendor info update, proceed to update with better title
      if (!isVendorInfoUpdate && !isPlaceholderTitle(conversation.title)) {
        return;
      }

      // Get the appropriate user message based on context
      let userMessage: string | undefined;

      if (isVendorInfoUpdate) {
        // Get second user message (vendor info) from conversation history
        // Message order: [preamble, user-1 (type selection), assistant-1, user-2 (vendor info), assistant-2]
        const history = await this.conversationService.getHistory(conversationId, 10, 0);
        const userMessages = history.filter(m => m.role === 'user');
        const secondUserMsg = userMessages[1]; // 0-indexed, second user message
        userMessage = secondUserMsg?.content.text;

        if (!userMessage) {
          console.warn('[TitleUpdateService] No vendor info message found for title update');
          return;
        }
      } else {
        // Initial generation: use first user message
        const firstUserMessage = await this.conversationService.getFirstUserMessage(conversationId);
        userMessage = firstUserMessage?.content.text;

        if (!userMessage) {
          console.warn('[TitleUpdateService] No user message found for title generation');
          return;
        }
      }

      // Build context for title generation
      const titleContext: TitleContext = {
        mode,
        userMessage,
        assistantResponse: assistantResponse,
      };

      // Generate title using TitleGenerationService
      const result = await this.titleGenerationService.generateModeAwareTitle(titleContext);

      // Update title in database (only if not manually edited)
      const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
        conversationId,
        result.title
      );

      if (titleUpdated) {
        // Emit title update event for real-time sidebar update
        socket.emit('conversation_title_updated', {
          conversationId,
          title: result.title,
        });
        const updateType = isVendorInfoUpdate ? 'vendor-update' : 'initial';
        console.log(`[TitleUpdateService] Generated ${mode} title (${updateType}, source: ${result.source}): "${result.title}"`);
      }
    } catch (error) {
      // Non-fatal - log and continue
      console.error('[TitleUpdateService] Error in generateTitleIfNeeded:', error);
    }
  }

  /** Update conversation title for scoring mode with filename (from MessageHandler lines 1282-1318) */
  async updateScoringTitle(
    socket: IAuthenticatedSocket,
    conversationId: string,
    filename: string
  ): Promise<void> {
    // Delegate to TitleGenerationService when available
    let scoringTitle: string;

    if (this.titleGenerationService) {
      scoringTitle = this.titleGenerationService.formatScoringTitle(filename);
    } else {
      // Inline truncation fallback (preserves behavior when service is absent)
      scoringTitle = this.formatScoringTitleInline(filename);
    }

    const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
      conversationId,
      scoringTitle
    );

    if (titleUpdated) {
      socket.emit('conversation_title_updated', {
        conversationId,
        title: scoringTitle,
      });
      console.log(`[TitleUpdateService] Updated scoring title: "${scoringTitle}"`);
    }
  }

  /** Inline scoring title formatting fallback when titleGenerationService is absent */
  private formatScoringTitleInline(filename: string): string {
    const maxTitleLength = 50;
    const prefix = 'Scoring: ';
    const maxFilenameLength = maxTitleLength - prefix.length;

    let truncatedFilename = filename;
    if (filename.length > maxFilenameLength) {
      // Truncate while preserving extension
      const lastDot = filename.lastIndexOf('.');
      const extension = lastDot > 0 ? filename.slice(lastDot) : '';
      const baseName = lastDot > 0 ? filename.slice(0, lastDot) : filename;
      const availableLength = maxFilenameLength - 3 - extension.length;
      if (availableLength > 0) {
        truncatedFilename = baseName.slice(0, availableLength) + '...' + extension;
      } else {
        truncatedFilename = filename.slice(0, maxFilenameLength - 3) + '...';
      }
    }

    return `${prefix}${truncatedFilename}`;
  }
}
