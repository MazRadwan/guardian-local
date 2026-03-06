/**
 * ScoringHandler - WebSocket handler for scoring operations
 *
 * Story 28.7.1: Extract triggerScoringOnSend() from ChatServer.ts
 * Story 39.4.5: Post-score behaviors extracted to ScoringPostProcessor.ts
 *
 * Responsibilities: dependency gate, vendor clarification, idempotency,
 * progress events, NOT_A_QUESTIONNAIRE short-circuit.
 * Post-score behaviors (narrative, assessment linking, follow-up) delegated
 * to ScoringPostProcessor.
 */

import type { IScoringService, ScoringInput } from '../../../application/interfaces/IScoringService.js';
import type { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage.js';
import type { IClaudeClient } from '../../../application/interfaces/IClaudeClient.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { VendorValidationService } from '../../../application/services/VendorValidationService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ScoringProgressEvent } from '../../../domain/scoring/types.js';
import type { ConversationContextBuilder } from '../context/ConversationContextBuilder.js';
import { ScoringPostProcessor, type BuildConversationContext } from './ScoringPostProcessor.js';

// Re-export for backward compatibility (type was originally defined here)
export type { BuildConversationContext } from './ScoringPostProcessor.js';

/** Pending vendor clarification data stored in socket.data */
export interface PendingVendorClarification {
  conversationId: string;
  userId: string;
  fileIds: string[];
  userQuery?: string;
  vendors: Array<{ name: string; fileCount: number; fileIds: string[] }>;
}

export class ScoringHandler {
  private readonly postProcessor: ScoringPostProcessor;

  constructor(
    private readonly scoringService: IScoringService | undefined,
    private readonly fileRepository: IFileRepository,
    private readonly fileStorage: IFileStorage | undefined,
    private readonly conversationService: ConversationService,
    private readonly claudeClient: IClaudeClient,
    private readonly vendorValidationService?: VendorValidationService,
    private readonly contextBuilder?: ConversationContextBuilder
  ) {
    this.postProcessor = new ScoringPostProcessor(conversationService, fileRepository, claudeClient);
  }

  /** Trigger scoring for uploaded files in scoring mode */
  async triggerScoringOnSend(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userId: string,
    fileIds: string[],
    userQuery?: string,
    buildConversationContext?: BuildConversationContext
  ): Promise<void> {
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
        console.log(`[ScoringHandler] Multiple vendors detected (${validationResult.vendors.length}), requesting clarification`);
        if (!socket.data.pendingVendorClarifications) {
          socket.data.pendingVendorClarifications = new Map();
        }
        const pendingMap = socket.data.pendingVendorClarifications as Map<string, PendingVendorClarification>;
        pendingMap.set(conversationId, { conversationId, userId, fileIds, userQuery, vendors: validationResult.vendors });
        socket.emit('vendor_clarification_needed', {
          conversationId,
          vendors: validationResult.vendors,
          message: `I found documents from ${validationResult.vendors.length} different vendors. Which vendor would you like to score first?`,
        });
        return;
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

        if (file.parseStatus === 'completed') {
          console.log(`[ScoringHandler] File ${fileId} already parsed`);
          continue;
        }

        // IDEMPOTENCY: Try to start parsing (atomic check)
        const started = await this.fileRepository.tryStartParsing(fileId);
        if (!started) {
          console.log(`[ScoringHandler] File ${fileId} already being processed`);
          socket.emit('scoring_progress', {
            conversationId, fileId, status: 'parsing',
            message: 'Document is already being processed...',
          } as ScoringProgressEvent);
          continue;
        }

        socket.emit('scoring_progress', {
          conversationId, fileId, status: 'parsing', progress: 2,
          message: 'Analyzing questionnaire responses...',
        } as ScoringProgressEvent);

        socket.nsp.to(`user:${socket.userId}`).emit('scoring_started', { fileId, conversationId });

        const scoringInput: ScoringInput = { conversationId, fileId, userId };
        const scoringResult = await this.scoringService.score(
          scoringInput,
          (event: ScoringProgressEvent) => {
            console.log(`[ScoringHandler] Scoring progress: ${event.status} - ${event.message}`);
            socket.emit('scoring_progress', {
              conversationId, fileId,
              status: event.status, message: event.message, progress: event.progress,
            });
          }
        );

        // Delegate post-score behaviors to ScoringPostProcessor
        if (scoringResult.success && scoringResult.report) {
          await this.postProcessor.processSuccess(
            socket, conversationId, fileId, scoringResult,
            userQuery, buildConversationContext
          );
        } else {
          await this.postProcessor.processFailure(
            socket, conversationId, fileId,
            scoringResult.error || 'Unknown error',
            scoringResult.code || 'SCORING_FAILED'
          );
        }
      } catch (err) {
        console.error(`[ScoringHandler] Error during scoring for file ${fileId}:`, err);
        await this.fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
        socket.nsp.to(`user:${socket.userId}`).emit('scoring_error', {
          conversationId,
          error: err instanceof Error ? err.message : 'Scoring failed',
          code: 'SCORING_FAILED',
        });
      }
    }
  }

  /**
   * Build scoring context for follow-up questions.
   * Delegates to ScoringPostProcessor. Kept for backward compatibility.
   */
  buildScoringFollowUpContext(report: { payload: import('../../../domain/scoring/types.js').ScoringReportData['payload'] }): string {
    return this.postProcessor.buildScoringFollowUpContext(report);
  }

  /** Handle vendor selection after clarification prompt (Story 28.7.3) */
  async handleVendorSelected(
    socket: IAuthenticatedSocket,
    payload: { conversationId: string; vendorName: string }
  ): Promise<void> {
    const userId = socket.userId;
    if (!userId) {
      console.error('[ScoringHandler] vendor_selected called without authenticated user');
      socket.emit('error', { event: 'vendor_selected', message: 'Not authenticated' });
      return;
    }

    if (!payload.vendorName || typeof payload.vendorName !== 'string' || payload.vendorName.trim().length === 0) {
      console.warn('[ScoringHandler] vendor_selected called with missing/empty vendorName');
      socket.emit('error', { event: 'vendor_selected', message: 'Vendor name is required' });
      return;
    }

    if (!payload.conversationId || typeof payload.conversationId !== 'string') {
      console.warn('[ScoringHandler] vendor_selected called with missing conversationId');
      socket.emit('error', { event: 'vendor_selected', message: 'Conversation ID is required' });
      return;
    }

    const pendingMap = socket.data.pendingVendorClarifications as Map<string, PendingVendorClarification> | undefined;
    const pending = pendingMap?.get(payload.conversationId);

    if (!pending) {
      console.warn(`[ScoringHandler] vendor_selected called without pending clarification for conversation ${payload.conversationId}`);
      socket.emit('error', { event: 'vendor_selected', message: 'No pending vendor clarification for this conversation' });
      return;
    }

    const normalizedVendorName = payload.vendorName.trim().toLowerCase();
    const selectedVendor = pending.vendors.find(v => v.name.trim().toLowerCase() === normalizedVendorName);

    if (!selectedVendor) {
      console.warn(`[ScoringHandler] Unknown vendor selected: ${payload.vendorName}`);
      socket.emit('error', { event: 'vendor_selected', message: `Unknown vendor: ${payload.vendorName}` });
      return;
    }

    console.log(`[ScoringHandler] User selected vendor "${selectedVendor.name}" with ${selectedVendor.fileIds.length} files`);
    pendingMap?.delete(payload.conversationId);

    socket.emit('message', {
      role: 'assistant',
      content: `Starting scoring for ${selectedVendor.name}...`,
      conversationId: pending.conversationId,
    });

    const buildContext = this.contextBuilder
      ? (id: string) => this.contextBuilder!.build(id)
      : undefined;

    await this.triggerScoringOnSend(
      socket, pending.conversationId, pending.userId,
      selectedVendor.fileIds, pending.userQuery, buildContext
    );
  }
}
