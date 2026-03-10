/**
 * ModeSwitchHandler - WebSocket handler for conversation mode switching
 *
 * Story 28.6.1: Extract switch_mode event handling from ChatServer.ts
 * Story 28.6.2: Add guidance messages for assessment/scoring modes
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Handles switch_mode event
 * - Validates mode is one of: consult, assessment, scoring
 * - Persists mode change via conversationService.switchMode()
 * - Emits conversation_mode_updated event
 * - Idempotent: emits event even when already in requested mode
 * - Guidance messages: persisted and emitted for assessment/scoring modes (not consult)
 *
 * CRITICAL: Requires explicit conversationId - NO fallback to socket.conversationId
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ConversationMode } from '../../../domain/entities/Conversation.js';
import { sanitizeErrorForClient } from '../../../utils/sanitize.js';

/**
 * Valid chat modes
 * NOTE: Using ConversationMode from domain for type consistency
 */
export type ChatMode = ConversationMode;

/**
 * List of valid modes for validation
 */
const VALID_MODES: ChatMode[] = ['consult', 'assessment', 'scoring'];

/**
 * Story 28.6.2: Assessment guidance text (DEPRECATED — UI renders AssessmentTypeSelector instead)
 * Kept for test reference only. Not emitted at runtime.
 */
const ASSESSMENT_GUIDANCE = `
**Assessment Mode Activated**

Please select your assessment approach (reply with 1, 2, or 3):

1. **Quick Assessment** (30-40 questions)
   Fast red-flag screening, ~15 minutes

2. **Comprehensive Assessment** (85-95 questions)
   Full coverage across all 10 risk dimensions

3. **Category-Focused Assessment**
   Tailored to your AI solution type

Reply with: **1**, **2**, or **3**
`.trim();

/**
 * Story 28.6.2: Guidance message for scoring mode
 * Instructs user to upload completed questionnaire
 */
export const SCORING_GUIDANCE = `
**Scoring Mode Activated**

Upload a completed vendor questionnaire for risk analysis.

**Important:** Only questionnaires exported from Guardian can be scored. These contain an embedded Assessment ID that links responses to your original assessment.

**How it works:**
1. Export a questionnaire from Guardian (Assessment Mode -> Generate -> Download)
2. Send it to the vendor to complete
3. Upload the completed questionnaire here

**Supported formats:** PDF or Word (.docx)

Once uploaded, I'll analyze the responses and provide:
- Composite risk score (0-100)
- Per-dimension breakdown
- Executive summary
- Recommendation (Approve/Conditional/Decline)

**Drag & drop** your file or click the upload button to begin.
`.trim();

/**
 * switch_mode event payload
 * CRITICAL: Both conversationId and mode are REQUIRED
 */
export interface SwitchModePayload {
  /** Conversation ID to switch mode for (REQUIRED - NO socket fallback) */
  conversationId?: string;
  /** Target mode to switch to (REQUIRED) */
  mode?: ChatMode;
}

/**
 * conversation_mode_updated event payload
 */
export interface ModeSwitchedPayload {
  /** Conversation ID that was updated */
  conversationId: string;
  /** New mode (or current mode if already in requested mode) */
  mode: ChatMode;
}

/**
 * ModeSwitchHandler - Manages conversation mode switching
 *
 * Responsibilities:
 * 1. Validate mode is one of: consult, assessment, scoring
 * 2. Validate conversation exists and is owned by user
 * 3. Persist mode change via ConversationService
 * 4. Emit conversation_mode_updated event
 *
 * Idempotency:
 * - If already in requested mode, still emits conversation_mode_updated
 * - No mode change occurs, but event fires (allows UI sync)
 *
 * Security:
 * - Requires explicit conversationId (NO socket.conversationId fallback)
 * - Ownership validation prevents cross-user access
 * - Security warnings logged for unauthorized access attempts
 *
 * Error handling:
 * - Unauthenticated users receive error with event name
 * - Invalid modes receive descriptive error
 * - Service errors are sanitized before sending to client
 */
export class ModeSwitchHandler {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  /**
   * Handle switch_mode event
   *
   * Switches a conversation to a new mode (consult, assessment, or scoring).
   *
   * CRITICAL: conversationId is REQUIRED - does NOT fallback to socket.conversationId
   * CRITICAL: Uses switchMode() (NOT updateMode())
   * CRITICAL: Idempotent - emits event even if already in requested mode
   *
   * @param socket - Authenticated socket
   * @param payload - Switch mode payload with conversationId and mode
   */
  async handleSwitchMode(
    socket: IAuthenticatedSocket,
    payload: SwitchModePayload
  ): Promise<void> {
    try {
      // Auth check - must have userId
      if (!socket.userId) {
        socket.emit('error', {
          event: 'switch_mode',
          message: 'User not authenticated',
        });
        return;
      }

      const { conversationId, mode } = payload;

      // Both conversationId and mode are required (NO socket.conversationId fallback)
      if (!conversationId || !mode) {
        socket.emit('error', {
          event: 'switch_mode',
          message: 'conversationId and mode are required',
        });
        return;
      }

      // Validate mode is one of the allowed values
      if (!VALID_MODES.includes(mode)) {
        socket.emit('error', {
          event: 'switch_mode',
          message: `Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(', ')}`,
        });
        return;
      }

      // Get conversation for ownership validation
      const conversation = await this.conversationService.getConversation(conversationId);

      if (!conversation) {
        socket.emit('error', {
          event: 'switch_mode',
          message: `Conversation ${conversationId} not found`,
        });
        return;
      }

      // Ownership validation - user must own the conversation
      if (conversation.userId !== socket.userId) {
        console.warn(
          `[ModeSwitchHandler] SECURITY: User ${socket.userId} attempted to access ` +
          `conversation ${conversationId} owned by ${conversation.userId}`
        );
        socket.emit('error', {
          event: 'switch_mode',
          message: 'Unauthorized: You do not have access to this conversation',
        });
        return;
      }

      // Idempotent: if already in requested mode, just emit event (no DB call)
      if (conversation.mode === mode) {
        console.log(`[ModeSwitchHandler] Conversation ${conversationId} already in ${mode} mode - emitting event`);
        socket.emit('conversation_mode_updated', {
          conversationId,
          mode,
        });
        return;
      }

      // Switch mode via service (uses switchMode, NOT updateMode)
      await this.conversationService.switchMode(conversationId, mode);

      console.log(`[ModeSwitchHandler] Switched conversation ${conversationId} to ${mode} mode`);

      // Emit success event
      socket.emit('conversation_mode_updated', {
        conversationId,
        mode,
      });

      // Story 28.6.2: Send guidance message for assessment/scoring modes (not consult)
      // Only sent when mode actually changed (not idempotent case)
      await this.sendGuidanceMessage(socket, conversationId, mode);
    } catch (error) {
      console.error('[ModeSwitchHandler] Error switching mode:', error);
      socket.emit('error', {
        event: 'switch_mode',
        message: sanitizeErrorForClient(error, 'Failed to switch mode'),
      });
    }
  }

  /**
   * Story 28.6.2: Send guidance message for mode switches
   *
   * Persists and emits guidance for assessment/scoring modes.
   * No guidance sent for consult mode (default mode).
   *
   * CRITICAL: Only call this when mode actually changes (not idempotent case)
   *
   * @param socket - Authenticated socket to emit message on
   * @param conversationId - Conversation to send guidance to
   * @param mode - The mode that was switched to
   */
  private async sendGuidanceMessage(
    socket: IAuthenticatedSocket,
    conversationId: string,
    mode: ChatMode
  ): Promise<void> {
    let guidanceText: string | null = null;

    // Assessment guidance suppressed — frontend renders AssessmentTypeSelector component inline
    if (mode === 'scoring') {
      guidanceText = SCORING_GUIDANCE;
    }

    // No guidance for consult mode
    if (!guidanceText) {
      return;
    }

    // Persist as assistant message
    const guidanceMessage = await this.conversationService.sendMessage({
      conversationId,
      role: 'assistant',
      content: { text: guidanceText },
    });

    console.log(`[ModeSwitchHandler] Sent guidance message for ${mode} mode in conversation ${conversationId}`);

    // Emit via standard message event (NOT separate guidance event)
    socket.emit('message', {
      id: guidanceMessage.id,
      conversationId: guidanceMessage.conversationId,
      role: guidanceMessage.role,
      content: guidanceMessage.content,
      createdAt: guidanceMessage.createdAt,
    });
  }
}
