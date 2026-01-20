/**
 * QuestionnaireHandler - WebSocket handler for questionnaire generation and export status
 *
 * Story 28.8.1: Extract handleGenerateQuestionnaire from ChatServer.ts
 * Story 28.8.2: Add handleGetExportStatus for session resume
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Handles generate_questionnaire event
 * - Handles get_export_status event (session resume)
 * - Uses QuestionnaireGenerationService (NOT QuestionnaireService)
 * - Validates ownership via validateConversationOwnership()
 * - Persists user action message: [System: User clicked Generate Questionnaire button]
 * - Emits assistant_stream_start before generation
 * - Emits generation_phase events with phaseId: 'context' | 'generating' | 'validating' | 'saving'
 * - Persists assistant response after streaming
 * - Emits export_ready with assessmentId, questionCount, formats
 * - Emits export_status_not_found when no assessment or questions
 * - Emits export_status_error for validation failures
 * - Implements title upgrade via updateTitleIfNotManuallyEdited() with isValidVendorName() validation
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Ownership validation before generation
 * 2. User action message persistence before generation
 * 3. Four generation phases: context(0), generating(1), validating(2), saving(3)
 * 4. export_ready emission with assessmentId from service result
 * 5. Title upgrade with isValidVendorName validation (reject numeric-only, single chars)
 * 6. Streaming via StreamingHandler for simulated typing effect
 * 7. Export status check validates auth, ownership, assessment, and question count
 */

import type { QuestionnaireGenerationService } from '../../../application/services/QuestionnaireGenerationService.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { AssessmentService } from '../../../application/services/AssessmentService.js';
import type { QuestionService } from '../../../application/services/QuestionService.js';
import type { IAuthenticatedSocket, ChatContext } from '../ChatContext.js';
import type { StreamingHandler } from '../StreamingHandler.js';
import type { GenerationPhasePayload, GenerationPhaseId } from '@guardian/shared';
import { sanitizeErrorForClient, isValidVendorName } from '../../../utils/sanitize.js';

/**
 * Payload for generate_questionnaire event
 */
export interface GenerateQuestionnairePayload {
  conversationId: string;
  assessmentType?: string;
  vendorName?: string;
  solutionName?: string;
  contextSummary?: string;
  selectedCategories?: string[];
}

/**
 * Payload for export_ready event
 */
export interface ExportReadyPayload {
  conversationId: string;
  assessmentId: string;
  questionCount: number;
  formats: string[];
}

/**
 * Payload for get_export_status event
 */
export interface GetExportStatusPayload {
  conversationId: string;
}

/**
 * Payload for export_status_error event
 */
export interface ExportStatusErrorPayload {
  conversationId: string;
  error: string;
}

/**
 * Payload for export_status_not_found event
 */
export interface ExportStatusNotFoundPayload {
  conversationId: string;
}

/**
 * QuestionnaireHandler - Manages questionnaire generation via WebSocket
 *
 * Responsibilities:
 * 1. Validate conversation ownership
 * 2. Persist user action message
 * 3. Emit generation phase events
 * 4. Delegate to QuestionnaireGenerationService
 * 5. Stream markdown response
 * 6. Persist assistant response
 * 7. Emit export_ready with assessmentId
 * 8. Update title with vendor name (with validation)
 * 9. Check export status on session resume (Story 28.8.2)
 */
export class QuestionnaireHandler {
  constructor(
    private readonly questionnaireGenerationService: QuestionnaireGenerationService,
    private readonly conversationService: ConversationService,
    private readonly streamingHandler: StreamingHandler,
    private readonly assessmentService?: AssessmentService,
    private readonly questionService?: QuestionService
  ) {}

  /**
   * Handle user clicking "Generate Questionnaire" button
   *
   * Epic 12.5: Hybrid flow - delegates to QuestionnaireGenerationService
   * which makes a single Claude call and returns JSON + pre-rendered markdown.
   *
   * @param socket - Authenticated socket to emit events to
   * @param payload - Generation parameters
   * @param userId - Authenticated user ID
   * @param chatContext - Shared chat context (for abort tracking)
   */
  async handleGenerateQuestionnaire(
    socket: IAuthenticatedSocket,
    payload: GenerateQuestionnairePayload,
    userId: string,
    chatContext: ChatContext
  ): Promise<void> {
    const {
      conversationId,
      assessmentType: rawAssessmentType = 'comprehensive',
      vendorName,
      solutionName,
      contextSummary,
      selectedCategories,
    } = payload;

    // Validate assessment type
    type ValidType = 'quick' | 'comprehensive' | 'category_focused';
    const validTypes: ValidType[] = ['quick', 'comprehensive', 'category_focused'];
    const assessmentType: ValidType = validTypes.includes(rawAssessmentType as ValidType)
      ? (rawAssessmentType as ValidType)
      : 'comprehensive';

    console.log(`[QuestionnaireHandler] Received generate_questionnaire from user ${userId} for conversation ${conversationId}`);

    try {
      // Validate ownership
      await this.validateConversationOwnership(conversationId, userId);

      // Save user action as message
      await this.conversationService.sendMessage({
        conversationId,
        role: 'user',
        content: { text: '[System: User clicked Generate Questionnaire button]' },
      });

      // Emit stream start for UX consistency (even though we're not streaming from Claude)
      socket.emit('assistant_stream_start', { conversationId });

      // Phase 0: Context ready (validation passed, about to call Claude)
      this.emitGenerationPhase(socket, conversationId, 0, 'context');

      // Delegate to service (single Claude call, returns schema + markdown)
      // NOTE: Service creates assessment - handler does NOT create assessments
      const result = await this.questionnaireGenerationService.generate({
        conversationId,
        userId,
        assessmentType,
        vendorName,
        solutionName,
        contextSummary,
        selectedCategories,
      });

      // Phase 1: Claude call complete
      this.emitGenerationPhase(socket, conversationId, 1, 'generating');

      // Phase 2: Validation complete (validation happens inside generate())
      this.emitGenerationPhase(socket, conversationId, 2, 'validating');

      // Stream pre-rendered markdown to chat (simulated streaming for UX)
      await this.streamingHandler.streamToSocket(
        socket,
        result.markdown,
        conversationId,
        () => chatContext.abortedStreams.has(conversationId),
        () => {
          chatContext.abortedStreams.delete(conversationId);
          socket.emit('assistant_aborted', { conversationId });
        }
      );

      // Save assistant response
      await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: result.markdown },
      });

      // Phase 3: Persistence complete
      this.emitGenerationPhase(socket, conversationId, 3, 'saving');

      // Emit export ready (no extraction needed - we have the assessmentId from service)
      // This signals phase 4 (complete) to the frontend
      socket.emit('export_ready', {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
        formats: ['pdf', 'word', 'excel'],
      });

      // Epic 25.3 / Story 26.2: Update conversation title with vendor/solution name
      // Two-phase title behavior:
      //   Phase 1 (Story 26.1): LLM generates title after first Q&A exchange
      //   Phase 2 (Story 26.2): Title upgrades to "Assessment: {vendor}" when questionnaire generated
      // Only if title hasn't been manually edited by user
      //
      // Story 26.2 fix: Use post-generation metadata for title (not pre-generation payload)
      // and validate vendor names to reject invalid values like "1"
      const postGenVendor = result.schema.metadata.vendorName;
      const postGenSolution = result.schema.metadata.solutionName;

      // Validate vendor/solution name - reject numeric-only, single chars, option tokens
      // Uses shared isValidVendorName from utils/sanitize.ts (consolidated in Story 28.11.4)
      const validatedVendor = isValidVendorName(postGenVendor) ? postGenVendor : null;
      const validatedSolution = isValidVendorName(postGenSolution) ? postGenSolution : null;

      if (validatedVendor || validatedSolution) {
        const titlePrefix = 'Assessment: ';
        const titleName = validatedVendor || validatedSolution || '';
        const maxTitleLength = 50;
        let newTitle = `${titlePrefix}${titleName}`;
        if (newTitle.length > maxTitleLength) {
          newTitle = newTitle.slice(0, maxTitleLength - 3) + '...';
        }

        const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
          conversationId,
          newTitle
        );

        if (titleUpdated) {
          // Emit WebSocket event for real-time sidebar update
          socket.emit('conversation_title_updated', {
            conversationId,
            title: newTitle,
          });
          console.log(`[QuestionnaireHandler] Updated assessment title: "${newTitle}"`);
        }
      } else if (postGenVendor || postGenSolution) {
        // Log when vendor name was rejected (for debugging)
        console.log(`[QuestionnaireHandler] Skipping title upgrade - invalid vendor/solution: vendor="${postGenVendor}", solution="${postGenSolution}"`);
      }

      console.log(`[QuestionnaireHandler] Questionnaire generation complete:`, {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
      });

    } catch (error) {
      console.error('[QuestionnaireHandler] Error in generate_questionnaire:', error);
      socket.emit('error', {
        event: 'generate_questionnaire',
        message: sanitizeErrorForClient(error, 'Failed to generate questionnaire'),
      });
    }
  }

  /**
   * Validate that a conversation belongs to the requesting user
   *
   * @param conversationId - Conversation to validate
   * @param userId - User requesting access
   * @throws Error if conversation not found or doesn't belong to user
   */
  async validateConversationOwnership(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      console.warn(`[QuestionnaireHandler] SECURITY: User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`);
      throw new Error('Unauthorized: You do not have access to this conversation');
    }
  }

  /**
   * Emit a generation phase event to the client (Story 13.5.2)
   *
   * @param socket - The client socket to emit to
   * @param conversationId - The conversation being processed
   * @param phase - The phase index (0-3)
   * @param phaseId - The phase identifier ('context' | 'generating' | 'validating' | 'saving')
   */
  emitGenerationPhase(
    socket: IAuthenticatedSocket,
    conversationId: string,
    phase: number,
    phaseId: GenerationPhaseId
  ): void {
    const payload: GenerationPhasePayload = {
      conversationId,
      phase,
      phaseId,
      timestamp: Date.now(),
    };
    socket.emit('generation_phase', payload);
    console.log(`[QuestionnaireHandler] Emitted generation_phase: phase=${phase}, phaseId=${phaseId}`);
  }

  // NOTE: isValidVendorName() is now imported from utils/sanitize.ts
  // Story 28.11.4 review fix: Consolidated to avoid drift risk

  /**
   * Handle get_export_status event for session resume
   *
   * Story 28.8.2: When a user reconnects to a conversation that previously
   * generated a questionnaire, this method checks if the export is ready.
   *
   * Validation:
   * 1. conversationId must be non-empty string
   * 2. User must be authenticated
   * 3. Conversation must exist and belong to user
   * 4. Conversation must have linked assessment with questions
   *
   * Emits:
   * - export_ready: Assessment exists with questions (can export)
   * - export_status_not_found: No assessment or no questions
   * - export_status_error: Validation failures
   *
   * @param socket - Authenticated socket to emit events to
   * @param data - Payload containing conversationId
   */
  async handleGetExportStatus(
    socket: IAuthenticatedSocket,
    data: GetExportStatusPayload
  ): Promise<void> {
    const { conversationId } = data;
    const userId = socket.userId;

    // Validate conversationId
    if (!conversationId || typeof conversationId !== 'string' || conversationId.trim() === '') {
      socket.emit('export_status_error', {
        conversationId: conversationId ?? '',
        error: 'Invalid conversation ID',
      } as ExportStatusErrorPayload);
      return;
    }

    // Validate authentication
    if (!userId) {
      socket.emit('export_status_error', {
        conversationId,
        error: 'Not authenticated',
      } as ExportStatusErrorPayload);
      return;
    }

    try {
      // Get and validate conversation
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        socket.emit('export_status_error', {
          conversationId,
          error: 'Conversation not found',
        } as ExportStatusErrorPayload);
        return;
      }

      if (conversation.userId !== userId) {
        console.warn(`[QuestionnaireHandler] SECURITY: User ${userId} attempted to access export status for conversation ${conversationId} owned by ${conversation.userId}`);
        socket.emit('export_status_error', {
          conversationId,
          error: 'Unauthorized',
        } as ExportStatusErrorPayload);
        return;
      }

      // Check linked assessment
      if (!conversation.assessmentId) {
        socket.emit('export_status_not_found', {
          conversationId,
        } as ExportStatusNotFoundPayload);
        return;
      }

      // Verify required services are available
      if (!this.assessmentService || !this.questionService) {
        console.error('[QuestionnaireHandler] AssessmentService or QuestionService not available for export status check');
        socket.emit('export_status_error', {
          conversationId,
          error: 'Internal server error',
        } as ExportStatusErrorPayload);
        return;
      }

      const assessment = await this.assessmentService.getAssessment(conversation.assessmentId);
      if (!assessment) {
        socket.emit('export_status_not_found', {
          conversationId,
        } as ExportStatusNotFoundPayload);
        return;
      }

      const questionCount = await this.questionService.getQuestionCount(assessment.id);
      if (questionCount === 0) {
        socket.emit('export_status_not_found', {
          conversationId,
        } as ExportStatusNotFoundPayload);
        return;
      }

      // Emit export ready
      socket.emit('export_ready', {
        conversationId,
        assessmentId: assessment.id,
        questionCount,
        formats: ['word', 'pdf', 'excel'],
      } as ExportReadyPayload);

      console.log(`[QuestionnaireHandler] Export status ready:`, {
        conversationId,
        assessmentId: assessment.id,
        questionCount,
      });

    } catch (error) {
      console.error('[QuestionnaireHandler] Error in get_export_status:', error);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Internal server error',
      } as ExportStatusErrorPayload);
    }
  }
}
