/**
 * ITitleUpdateService Interface
 *
 * Story 35.1.1: Create ITitleUpdateService interface
 *
 * Defines the contract for the Title Update service, which handles
 * automatic title generation for conversations based on mode and context,
 * and scoring-mode title updates from uploaded filenames.
 */

import type { IAuthenticatedSocket } from '../ChatContext.js';

/**
 * Service for managing conversation title updates
 *
 * Handles two distinct flows:
 * 1. Auto-generation: LLM-based title generation for consult/assessment modes
 * 2. Scoring title: Filename-based title for scoring mode file uploads
 */
export interface ITitleUpdateService {
  /**
   * Generate and update conversation title if conditions are met
   *
   * Guards:
   * - Skips if title generation service not configured
   * - Skips for scoring mode (titles come from filename)
   * - Only triggers at specific message counts per mode
   * - Skips if title was manually edited by user
   * - Skips if title already set (unless vendor info update)
   *
   * @param socket - Client socket to emit title update event
   * @param conversationId - Conversation to generate title for
   * @param mode - Conversation mode (consult, assessment, scoring)
   * @param assistantResponse - Assistant response text for LLM context
   */
  generateTitleIfNeeded(
    socket: IAuthenticatedSocket,
    conversationId: string,
    mode: 'consult' | 'assessment' | 'scoring',
    assistantResponse: string
  ): Promise<void>;

  /**
   * Update conversation title for scoring mode with filename
   *
   * Truncates long filenames while preserving file extension.
   * Delegates to ITitleGenerationService.formatScoringTitle() when available,
   * otherwise uses inline truncation logic.
   *
   * @param socket - Client socket to emit title update event
   * @param conversationId - Conversation to update title for
   * @param filename - Uploaded filename to use in title
   */
  updateScoringTitle(
    socket: IAuthenticatedSocket,
    conversationId: string,
    filename: string
  ): Promise<void>;
}
