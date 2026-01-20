# Story 28.7.1: Extract ScoringHandler.ts (triggerScoringOnSend)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create ScoringHandler and implement the `triggerScoringOnSend()` logic that processes documents in scoring mode, including multi-vendor clarification, idempotency checks, progress events, and **complete post-score handling** (narrative persistence, assessment linking, follow-up query flow).

---

## Acceptance Criteria

- [ ] `ScoringHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] **Dependency gate**: Requires BOTH `scoringService` AND `fileStorage` - emit `scoring_error` with `SERVICE_UNAVAILABLE` if either missing
- [ ] Vendor clarification flow implemented with `socket.data.pendingVendorClarifications` Map
- [ ] `tryStartParsing()` idempotency check used before processing
- [ ] `NOT_A_QUESTIONNAIRE` short-circuit for `file.detectedDocType === 'document'`
- [ ] All scoring events emitted: `scoring_started`, `scoring_progress` (with fileId), `scoring_complete`, `scoring_error` (with code)
- [ ] **scoring_complete payload**: `{ conversationId, result: { ...dimensionScores, batchId, assessmentId }, narrativeReport }`
- [ ] **Narrative message persistence**: Save narrative as assistant message + emit 'message' event (NO components - card rendered from scoring_complete)
- [ ] **conversationService.linkAssessment()**: Non-fatal (log warning if fails)
- [ ] **Follow-up query flow**: When `userQuery` provided, build follow-up context from report + stream Claude response
- [ ] Progress callback signature matches `(event: ScoringProgressEvent) => void`
- [ ] Unit tests cover trigger conditions, vendor clarification, post-score behaviors, and error paths

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/ScoringHandler.ts

import type { IScoringService, ScoringInput } from '../../../application/interfaces/IScoringService';
import type { VendorValidationService } from '../../../application/services/VendorValidationService';
import type { IFileRepository } from '../../../application/interfaces/IFileRepository';
import type { IConversationService } from '../../../application/interfaces/IConversationService';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage';
import type { IClaudeClient } from '../../../application/interfaces/IClaudeClient';
import type { IAuthenticatedSocket } from '../ChatContext';
import type { ScoringProgressEvent } from '../../../domain/scoring/types';

export class ScoringHandler {
  constructor(
    private readonly scoringService: IScoringService | undefined,
    private readonly fileRepository: IFileRepository,
    private readonly fileStorage: IFileStorage | undefined,  // REQUIRED for scoring
    private readonly conversationService: IConversationService,
    private readonly claudeClient: IClaudeClient,
    private readonly vendorValidationService?: VendorValidationService
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
   */
  async triggerScoringOnSend(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userId: string,
    fileIds: string[],
    userQuery?: string,  // Epic 18.4.3: Optional user query to address after scoring
    buildConversationContext?: (conversationId: string) => Promise<{ messages: Message[]; systemPrompt: string }>
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
        socket.data.pendingVendorClarifications.set(conversationId, {
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
            console.log(`[ScoringHandler] Addressing user query after scoring: "${userQuery.slice(0, 50)}..."`);

            try {
              // Build context with scoring results
              const scoringContext = this.buildScoringFollowUpContext(scoringResult.report);

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
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('ScoringHandler', () => {
  describe('triggerScoringOnSend', () => {
    it('should emit scoring_started and scoring_progress with fileId', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 'file-1', parseStatus: 'pending' });
      mockFileRepository.tryStartParsing.mockResolvedValue(true);
      mockScoringService.score.mockResolvedValue({ success: true, report: mockReport, batchId: 'batch-1' });

      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_started', {
        fileId: 'file-1',
        conversationId: 'conv-1',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
        fileId: 'file-1',
        status: 'parsing',
      }));
    });

    it('should emit scoring_error with SERVICE_UNAVAILABLE when scoringService missing', async () => {
      const handlerNoService = new ScoringHandler(
        null as any,    // scoringService missing
        mockFileRepository,
        mockFileStorage,
        mockConversationService,
        mockClaudeClient
      );

      await handlerNoService.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
        conversationId: 'conv-1',
        error: 'Scoring is not available',
        code: 'SERVICE_UNAVAILABLE',
      });
    });

    it('should emit scoring_error with SERVICE_UNAVAILABLE when fileStorage missing', async () => {
      const handlerNoStorage = new ScoringHandler(
        mockScoringService,
        mockFileRepository,
        null as any,    // fileStorage missing
        mockConversationService,
        mockClaudeClient
      );

      await handlerNoStorage.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
        conversationId: 'conv-1',
        error: 'Scoring is not available',
        code: 'SERVICE_UNAVAILABLE',
      });
    });

    it('should short-circuit with NOT_A_QUESTIONNAIRE for document type', async () => {
      mockFileRepository.findById.mockResolvedValue({
        id: 'file-1',
        detectedDocType: 'document',
      });

      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', expect.objectContaining({
        code: 'NOT_A_QUESTIONNAIRE',
        fileId: 'file-1',
      }));
      expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'pending');
    });

    it('should skip file if tryStartParsing returns false (idempotency)', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 'file-1', parseStatus: 'pending' });
      mockFileRepository.tryStartParsing.mockResolvedValue(false);

      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
        message: 'Document is already being processed...',
      }));
      expect(mockScoringService.score).not.toHaveBeenCalled();
    });

    it('should request vendor clarification for multiple vendors', async () => {
      mockVendorValidationService.validateSingleVendor.mockResolvedValue({
        valid: false,
        vendors: [
          { name: 'Vendor A', fileCount: 1, fileIds: ['f1'] },
          { name: 'Vendor B', fileCount: 1, fileIds: ['f2'] },
        ],
      });

      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['f1', 'f2']);

      expect(mockSocket.emit).toHaveBeenCalledWith('vendor_clarification_needed', expect.objectContaining({
        conversationId: 'conv-1',
      }));
      expect(socket.data.pendingVendorClarifications.get('conv-1')).toBeDefined();
    });

    it('should emit scoring_complete with batchId and assessmentId', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 'file-1', parseStatus: 'pending' });
      mockFileRepository.tryStartParsing.mockResolvedValue(true);
      mockScoringService.score.mockResolvedValue({
        success: true,
        batchId: 'batch-123',
        report: {
          assessmentId: 'assess-456',
          narrativeReport: 'Test narrative',
          payload: {
            compositeScore: 72,
            recommendation: 'Proceed',
            overallRiskRating: 'Moderate',
            executiveSummary: 'Summary',
            keyFindings: ['Finding 1'],
            dimensionScores: [{ dimension: 'Security', score: 8, riskRating: 'Low' }],
          },
        },
      });

      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', {
        conversationId: 'conv-1',
        result: expect.objectContaining({
          batchId: 'batch-123',
          assessmentId: 'assess-456',
          compositeScore: 72,
        }),
        narrativeReport: 'Test narrative',
      });
    });

    it('should persist narrative message and emit message event', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 'file-1', parseStatus: 'pending' });
      mockFileRepository.tryStartParsing.mockResolvedValue(true);
      mockScoringService.score.mockResolvedValue({ success: true, report: mockReport, batchId: 'batch-1' });
      mockConversationService.sendMessage.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: 'Test narrative' },
        createdAt: new Date(),
      });

      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      // Verify narrative persisted
      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: expect.objectContaining({
          text: expect.any(String),
          // NO components - card rendered from scoring_complete
        }),
      });

      // Verify message event emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        id: 'msg-1',
        role: 'assistant',
      }));
    });

    it('should call linkAssessment (non-fatal on failure)', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 'file-1', parseStatus: 'pending' });
      mockFileRepository.tryStartParsing.mockResolvedValue(true);
      mockScoringService.score.mockResolvedValue({ success: true, report: mockReport, batchId: 'batch-1' });
      mockConversationService.linkAssessment.mockRejectedValue(new Error('Link failed'));

      // Should not throw
      await handler.triggerScoringOnSend(mockSocket, 'conv-1', 'user-1', ['file-1']);

      expect(mockConversationService.linkAssessment).toHaveBeenCalledWith('conv-1', mockReport.assessmentId);
      // Scoring complete should still have been emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', expect.anything());
    });

    it('should stream follow-up response when userQuery provided', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 'file-1', parseStatus: 'pending' });
      mockFileRepository.tryStartParsing.mockResolvedValue(true);
      mockScoringService.score.mockResolvedValue({ success: true, report: mockReport, batchId: 'batch-1' });

      const mockBuildContext = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Test prompt',
      });

      // Mock async iterator
      const mockStream = (async function* () {
        yield { content: 'Response ', isComplete: false };
        yield { content: 'text', isComplete: false };
        yield { content: '', isComplete: true };
      })();
      mockClaudeClient.streamMessage.mockReturnValue(mockStream);

      await handler.triggerScoringOnSend(
        mockSocket,
        'conv-1',
        'user-1',
        ['file-1'],
        'What about security?',
        mockBuildContext
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', { conversationId: 'conv-1' });
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', expect.objectContaining({
        conversationId: 'conv-1',
        token: expect.any(String),
      }));
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', expect.objectContaining({
        conversationId: 'conv-1',
        fullText: 'Response text',
      }));
    });
  });
});
```

---

## Definition of Done

- [ ] ScoringHandler created with correct constructor dependencies (scoringService, fileRepository, fileStorage, conversationService, claudeClient)
- [ ] Dependency gate: Requires BOTH scoringService AND fileStorage
- [ ] Vendor clarification flow with socket.data.pendingVendorClarifications Map
- [ ] tryStartParsing idempotency check
- [ ] NOT_A_QUESTIONNAIRE short-circuit
- [ ] scoring_complete emitted with batchId + assessmentId in result
- [ ] Narrative message persisted and 'message' event emitted (NO components)
- [ ] conversationService.linkAssessment() called (non-fatal on failure)
- [ ] Follow-up query flow when userQuery provided
- [ ] Unit tests passing for all behaviors
