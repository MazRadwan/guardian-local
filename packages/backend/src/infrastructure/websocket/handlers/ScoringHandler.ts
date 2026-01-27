/**
 * ScoringHandler - WebSocket handler for scoring operations
 *
 * Story 28.7.1: Extract triggerScoringOnSend() from ChatServer.ts
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Handles scoring trigger when user sends message in Scoring mode
 * - Dependency gate: Requires BOTH scoringService AND fileStorage
 * - Vendor clarification flow for multi-vendor files
 * - Idempotency via tryStartParsing()
 * - NOT_A_QUESTIONNAIRE short-circuit for document type
 * - Progress events: scoring_started, scoring_progress, scoring_complete, scoring_error
 * - Post-score behaviors: narrative persistence, assessment linking, follow-up query flow
 *
 * CRITICAL BEHAVIORS:
 * 1. Dependency gate: BOTH scoringService AND fileStorage required
 * 2. Vendor clarification stored in socket.data.pendingVendorClarifications (Map<conversationId, PendingClarification>)
 * 3. tryStartParsing() provides idempotency - skips if already processing
 * 4. NOT_A_QUESTIONNAIRE short-circuit for detectedDocType === 'document'
 * 5. scoring_progress events include fileId for tracking
 * 6. scoring_error includes code field for frontend handling
 * 7. scoring_complete resultData includes batchId + assessmentId
 * 8. Narrative message persistence (NO components - card from scoring_complete)
 * 9. conversationService.linkAssessment() (non-fatal on failure)
 * 10. Follow-up query flow when userQuery provided
 */

import type { IScoringService, ScoringInput } from '../../../application/interfaces/IScoringService.js';
import type { IFileRepository, FileRecord } from '../../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage.js';
import type { IClaudeClient, ClaudeMessage } from '../../../application/interfaces/IClaudeClient.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { VendorValidationService } from '../../../application/services/VendorValidationService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ScoringProgressEvent, ScoringReportData } from '../../../domain/scoring/types.js';
import type { ConversationContextBuilder } from '../context/ConversationContextBuilder.js';

/**
 * Pending vendor clarification data stored in socket.data
 */
export interface PendingVendorClarification {
  conversationId: string;
  userId: string;
  fileIds: string[];
  userQuery?: string;
  vendors: Array<{ name: string; fileCount: number; fileIds: string[] }>;
}

/**
 * Context builder function type for follow-up queries
 */
export type BuildConversationContext = (
  conversationId: string
) => Promise<{ messages: ClaudeMessage[]; systemPrompt: string }>;

/**
 * ScoringHandler - Manages scoring operations via WebSocket
 *
 * Responsibilities:
 * 1. Validate dependencies (scoringService, fileStorage)
 * 2. Handle multi-vendor clarification flow
 * 3. Run scoring with progress events
 * 4. Persist narrative and link assessment
 * 5. Handle follow-up user queries
 */
export class ScoringHandler {
  constructor(
    private readonly scoringService: IScoringService | undefined,
    private readonly fileRepository: IFileRepository,
    private readonly fileStorage: IFileStorage | undefined,
    private readonly conversationService: ConversationService,
    private readonly claudeClient: IClaudeClient,
    private readonly vendorValidationService?: VendorValidationService,
    private readonly contextBuilder?: ConversationContextBuilder
  ) {}

  /**
   * Trigger scoring for uploaded files in scoring mode
   *
   * CRITICAL BEHAVIORS TO PRESERVE:
   * 1. Dependency gate: BOTH scoringService AND fileStorage required
   * 2. Vendor clarification stored in socket.data.pendingVendorClarifications (Map<conversationId, PendingClarification>)
   * 3. tryStartParsing() provides idempotency - skips if already processing
   * 4. NOT_A_QUESTIONNAIRE short-circuit for detectedDocType === 'document'
   * 5. scoring_progress events include fileId for tracking
   * 6. scoring_error includes code field for frontend handling
   * 7. scoring_complete resultData includes batchId + assessmentId
   * 8. Narrative message persistence (NO components - card from scoring_complete)
   * 9. conversationService.linkAssessment() (non-fatal on failure)
   * 10. Follow-up query flow when userQuery provided
   *
   * @param socket - Authenticated socket to emit events to
   * @param conversationId - Conversation being scored
   * @param userId - User who initiated scoring
   * @param fileIds - Files to parse and score
   * @param userQuery - Optional user query to address after scoring (Epic 18.4.3)
   * @param buildConversationContext - Optional context builder for follow-up queries
   */
  async triggerScoringOnSend(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userId: string,
    fileIds: string[],
    userQuery?: string,
    buildConversationContext?: BuildConversationContext
  ): Promise<void> {
    // CRITICAL: Check BOTH dependencies
    if (!this.scoringService || !this.fileStorage) {
      console.warn('[ScoringHandler] Scoring service or file storage not configured');
      socket.emit('scoring_error', {
        conversationId,
        error: 'Scoring is not available',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    // Epic 18.4.2a: Validate single vendor before scoring
    if (this.vendorValidationService && fileIds.length > 0) {
      const validationResult = await this.vendorValidationService.validateSingleVendor(fileIds);

      if (!validationResult.valid && validationResult.vendors) {
        console.log(
          `[ScoringHandler] Multiple vendors detected (${validationResult.vendors.length}), requesting clarification`
        );

        // Initialize pending clarifications map if not exists (stores by conversationId)
        if (!socket.data.pendingVendorClarifications) {
          socket.data.pendingVendorClarifications = new Map();
        }

        // Store pending scoring request keyed by conversationId
        const pendingMap = socket.data.pendingVendorClarifications as Map<string, PendingVendorClarification>;
        pendingMap.set(conversationId, {
          conversationId,
          userId,
          fileIds,
          userQuery,
          vendors: validationResult.vendors,
        });

        // Emit clarification event
        socket.emit('vendor_clarification_needed', {
          conversationId,
          vendors: validationResult.vendors,
          message: `I found documents from ${validationResult.vendors.length} different vendors. Which vendor would you like to score first?`,
        });

        return; // Wait for user selection
      }
    }

    for (const fileId of fileIds) {
      try {
        const file = await this.fileRepository.findById(fileId);
        if (!file) {
          console.warn(`[ScoringHandler] File ${fileId} not found for scoring`);
          continue;
        }

        // SHORT-CIRCUIT: Non-questionnaire documents
        if (file.detectedDocType === 'document') {
          console.log(`[ScoringHandler] File ${fileId} classified as 'document', not a questionnaire`);
          socket.emit('scoring_error', {
            conversationId,
            fileId,
            error: 'This appears to be a general document (like a product brief or marketing material), not a completed questionnaire. Questionnaires exported from Guardian have a specific format with numbered questions and vendor responses. Try uploading in Consult mode to discuss this document, or Assessment mode to start a new vendor assessment.',
            code: 'NOT_A_QUESTIONNAIRE',
          });
          await this.fileRepository.updateParseStatus(fileId, 'pending');
          continue;
        }

        // Check if already completed (idempotency)
        if (file.parseStatus === 'completed') {
          console.log(`[ScoringHandler] File ${fileId} already parsed`);
          continue;
        }

        // IDEMPOTENCY: Try to start parsing (atomic check)
        const started = await this.fileRepository.tryStartParsing(fileId);
        if (!started) {
          console.log(`[ScoringHandler] File ${fileId} already being processed`);
          socket.emit('scoring_progress', {
            conversationId,
            fileId,
            status: 'parsing',
            message: 'Document is already being processed...',
          } as ScoringProgressEvent);
          continue;
        }

        // Emit initial progress
        socket.emit('scoring_progress', {
          conversationId,
          fileId,
          status: 'parsing',
          progress: 10,
          message: 'Analyzing questionnaire responses...',
        } as ScoringProgressEvent);

        // Emit scoring started
        socket.emit('scoring_started', {
          fileId,
          conversationId,
        });

        // Build scoring input
        const scoringInput: ScoringInput = {
          conversationId,
          fileId,
          userId,
        };

        // Run scoring with progress callback
        const scoringResult = await this.scoringService.score(
          scoringInput,
          (event: ScoringProgressEvent) => {
            console.log(`[ScoringHandler] Scoring progress: ${event.status} - ${event.message}`);
            socket.emit('scoring_progress', {
              conversationId,
              fileId,
              status: event.status,
              message: event.message,
              progress: event.progress,
            });
          }
        );

        if (scoringResult.success && scoringResult.report) {
          // Epic 18: Get assessmentId from the scoring report (extracted from document)
          const assessmentId = scoringResult.report.assessmentId;

          // Build result data for frontend - MUST include batchId + assessmentId
          const resultData = {
            compositeScore: scoringResult.report.payload.compositeScore,
            recommendation: scoringResult.report.payload.recommendation,
            overallRiskRating: scoringResult.report.payload.overallRiskRating,
            executiveSummary: scoringResult.report.payload.executiveSummary,
            keyFindings: scoringResult.report.payload.keyFindings,
            dimensionScores: scoringResult.report.payload.dimensionScores.map(ds => ({
              dimension: ds.dimension,
              score: ds.score,
              riskRating: ds.riskRating,
            })),
            batchId: scoringResult.batchId,  // CRITICAL: Include batchId
            assessmentId,                     // CRITICAL: Include assessmentId
          };

          // Emit scoring complete with results
          socket.emit('scoring_complete', {
            conversationId,
            result: resultData,
            narrativeReport: scoringResult.report.narrativeReport,
          });

          // Mark file as completed
          await this.fileRepository.updateParseStatus(fileId, 'completed');

          // =========================================================
          // CRITICAL: Post-score behaviors
          // =========================================================

          // 1. Save narrative report as assistant message
          // Note: Don't include scoring_result component here - it's already displayed
          // from the store state set by scoring_complete event. Including it would cause
          // duplicate card rendering.
          const narrativeText = scoringResult.report.narrativeReport ||
            `Risk assessment complete. Composite score: ${scoringResult.report.payload.compositeScore}/100. ` +
            `Overall risk: ${scoringResult.report.payload.overallRiskRating}. ` +
            `Recommendation: ${scoringResult.report.payload.recommendation}.`;

          const reportMessage = await this.conversationService.sendMessage({
            conversationId,
            role: 'assistant',
            content: {
              text: narrativeText,
              // No components - scoring card rendered from store state via scoring_complete event
            },
          });

          // 2. Emit the message for display (narrative only, card is from scoring_complete)
          socket.emit('message', {
            id: reportMessage.id,
            conversationId: reportMessage.conversationId,
            role: reportMessage.role,
            content: reportMessage.content,
            createdAt: reportMessage.createdAt,
          });

          // 3. Epic 22.1.1: Link assessment to conversation for rehydration
          // Non-fatal - scoring already succeeded, don't emit scoring_error if this fails
          try {
            await this.conversationService.linkAssessment(conversationId, assessmentId);
          } catch (linkError) {
            console.warn(`[ScoringHandler] Failed to link assessment (non-fatal):`, linkError);
          }

          console.log(`[ScoringHandler] Scoring completed: assessmentId=${assessmentId}, score=${scoringResult.report.payload.compositeScore}`);

          // =========================================================
          // 4. Epic 18.4.3: Address user query after scoring
          // =========================================================
          if (userQuery && userQuery.trim().length > 0 && buildConversationContext) {
            await this.handleFollowUpQuery(
              socket,
              conversationId,
              userQuery,
              scoringResult.report,
              buildConversationContext
            );
          }
        } else {
          // Scoring failed
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          socket.emit('scoring_error', {
            conversationId,
            error: scoringResult.error || 'Scoring failed',
            code: scoringResult.code || 'SCORING_FAILED',
          });

          // Save error as system message
          await this.conversationService.sendMessage({
            conversationId,
            role: 'system',
            content: { text: `[System: Scoring failed - ${scoringResult.error || 'Unknown error'}]` },
          });
        }
      } catch (err) {
        console.error(`[ScoringHandler] Error during scoring for file ${fileId}:`, err);
        await this.fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
        socket.emit('scoring_error', {
          conversationId,
          error: err instanceof Error ? err.message : 'Scoring failed',
          code: 'SCORING_FAILED',
        });
      }
    }
  }

  /**
   * Epic 18.4.3: Handle follow-up user query after scoring
   *
   * Streams a Claude response addressing the user's question using
   * the scoring results as context.
   *
   * @param socket - Socket to emit streaming events
   * @param conversationId - Conversation ID
   * @param userQuery - User's question to address
   * @param report - Scoring report for context
   * @param buildConversationContext - Context builder function
   */
  private async handleFollowUpQuery(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userQuery: string,
    report: ScoringReportData,
    buildConversationContext: BuildConversationContext
  ): Promise<void> {
    console.log(`[ScoringHandler] Addressing user query after scoring: "${userQuery.slice(0, 50)}..."`);

    try {
      // Build context with scoring results
      const scoringContext = this.buildScoringFollowUpContext(report);

      // Get conversation history (includes scoring narrative)
      const { messages, systemPrompt } = await buildConversationContext(conversationId);

      // Build enhanced prompt with scoring context
      const enhancedPrompt = `${systemPrompt}

${scoringContext}

The user submitted this questionnaire with a question. The scoring has completed.
Now address their question using the scoring results above as context.
Be specific and reference actual scores and findings from the assessment.
If they asked about a specific dimension or topic, focus your answer on that area.`;

      // Emit typing indicator
      socket.emit('assistant_stream_start', { conversationId });

      // Stream Claude response
      let fullResponse = '';

      for await (const chunk of this.claudeClient.streamMessage(messages, { systemPrompt: enhancedPrompt })) {
        if (!chunk.isComplete && chunk.content) {
          fullResponse += chunk.content;
          socket.emit('assistant_token', {
            conversationId,
            token: chunk.content,
          });
        }
      }

      // Save assistant response
      const followUpMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: fullResponse },
      });

      // Emit stream complete
      socket.emit('assistant_done', {
        conversationId,
        messageId: followUpMessage.id,
        fullText: fullResponse,
      });

      console.log(`[ScoringHandler] User query addressed (${fullResponse.length} chars)`);
    } catch (error) {
      console.error('[ScoringHandler] Failed to address user query:', error);
      // Non-fatal - scoring already completed
      socket.emit('message', {
        role: 'assistant',
        content: "I've completed the scoring. I tried to address your question but encountered an issue. Feel free to ask again.",
        conversationId,
      });
    }
  }

  /**
   * Story 28.7.2: Build scoring context for follow-up questions
   *
   * CRITICAL: This is a synchronous pure formatting function that takes the report
   * directly - it does NOT call any service to fetch scoring state.
   *
   * Only called when userQuery exists after scoring completes.
   * Made public for direct unit testing.
   *
   * @param report - Scoring report data with payload containing scores and findings
   * @returns Formatted scoring context string
   */
  buildScoringFollowUpContext(report: { payload: ScoringReportData['payload'] }): string {
    const { payload } = report;

    // Format dimension scores for context
    const dimensionSummary = payload.dimensionScores
      .map(ds => `- ${ds.dimension}: ${ds.score}/100 (${ds.riskRating})`)
      .join('\n');

    return `
## Scoring Results Context

**Composite Score:** ${payload.compositeScore}/100
**Overall Risk Rating:** ${payload.overallRiskRating}
**Recommendation:** ${payload.recommendation}

### Dimension Scores:
${dimensionSummary}

### Key Findings:
${payload.keyFindings.map(f => `- ${f}`).join('\n')}

### Executive Summary:
${payload.executiveSummary}
`;
  }

  /**
   * Story 28.7.3: Handle vendor selection after clarification prompt
   *
   * When multiple vendors are detected during scoring, the user selects one
   * via `vendor_selected` event. This method validates the selection and
   * resumes scoring with only that vendor's files.
   *
   * CRITICAL BEHAVIORS TO PRESERVE:
   * 1. Lookup by conversationId in socket.data.pendingVendorClarifications Map
   * 2. Normalize vendor name with trim() and toLowerCase() for comparison
   * 3. Clear pending clarification for this conversation after selection
   * 4. Emit confirmation message before resuming scoring
   *
   * @param socket - Authenticated socket to emit events to
   * @param payload - Contains conversationId and selected vendorName
   */
  async handleVendorSelected(
    socket: IAuthenticatedSocket,
    payload: {
      conversationId: string;
      vendorName: string;
    }
  ): Promise<void> {
    const userId = socket.userId;
    if (!userId) {
      console.error('[ScoringHandler] vendor_selected called without authenticated user');
      socket.emit('error', { event: 'vendor_selected', message: 'Not authenticated' });
      return;
    }

    // Guard: Validate vendorName is present and non-empty
    if (!payload.vendorName || typeof payload.vendorName !== 'string' || payload.vendorName.trim().length === 0) {
      console.warn('[ScoringHandler] vendor_selected called with missing/empty vendorName');
      socket.emit('error', {
        event: 'vendor_selected',
        message: 'Vendor name is required',
      });
      return;
    }

    // Guard: Validate conversationId is present
    if (!payload.conversationId || typeof payload.conversationId !== 'string') {
      console.warn('[ScoringHandler] vendor_selected called with missing conversationId');
      socket.emit('error', {
        event: 'vendor_selected',
        message: 'Conversation ID is required',
      });
      return;
    }

    // Look up pending clarification by conversationId (Map-based storage)
    const pendingMap = socket.data.pendingVendorClarifications as Map<string, PendingVendorClarification> | undefined;
    const pending = pendingMap?.get(payload.conversationId);

    if (!pending) {
      console.warn(`[ScoringHandler] vendor_selected called without pending clarification for conversation ${payload.conversationId}`);
      socket.emit('error', {
        event: 'vendor_selected',
        message: 'No pending vendor clarification for this conversation',
      });
      return;
    }

    // Find the selected vendor's files (normalize with trim() and toLowerCase() for comparison)
    const normalizedVendorName = payload.vendorName.trim().toLowerCase();
    const selectedVendor = pending.vendors.find(
      v => v.name.trim().toLowerCase() === normalizedVendorName
    );

    if (!selectedVendor) {
      console.warn(`[ScoringHandler] Unknown vendor selected: ${payload.vendorName}`);
      socket.emit('error', {
        event: 'vendor_selected',
        message: `Unknown vendor: ${payload.vendorName}`,
      });
      return;
    }

    console.log(
      `[ScoringHandler] User selected vendor "${selectedVendor.name}" with ${selectedVendor.fileIds.length} files`
    );

    // Clear pending clarification for this conversation
    pendingMap?.delete(payload.conversationId);

    // Emit confirmation message
    socket.emit('message', {
      role: 'assistant',
      content: `Starting scoring for ${selectedVendor.name}...`,
      conversationId: pending.conversationId,
    });

    // Resume scoring with only the selected vendor's files
    // CRITICAL: Pass context builder for follow-up query support (Epic 18.4.3)
    const buildContext = this.contextBuilder
      ? (id: string) => this.contextBuilder!.build(id)
      : undefined;

    await this.triggerScoringOnSend(
      socket,
      pending.conversationId,
      pending.userId,
      selectedVendor.fileIds,
      pending.userQuery,
      buildContext
    );
  }
}
