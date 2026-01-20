# Story 28.8.1: Extract QuestionnaireHandler.ts (generate_questionnaire)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create QuestionnaireHandler and implement `handleGenerateQuestionnaire()`. This handles the questionnaire generation event with streaming markdown output, phase progress events, and title upgrade logic.

---

## Acceptance Criteria

- [ ] `QuestionnaireHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] Uses `QuestionnaireGenerationService` (NOT QuestionnaireService)
- [ ] Validates ownership via `validateConversationOwnership()`
- [ ] Persists user action message: `[System: User clicked Generate Questionnaire button]`
- [ ] Emits `assistant_stream_start` before generation
- [ ] Emits `generation_phase` events with phaseId: 'context' | 'generating' | 'validating' | 'saving'
- [ ] Persists assistant response after streaming
- [ ] Emits `export_ready` with assessmentId, questionCount, formats
- [ ] Implements title upgrade via `updateTitleIfNotManuallyEdited()` with `isValidVendorName()` validation
- [ ] Preserves public method interface for test compatibility
- [ ] Unit tests cover generation flow, phases, and title upgrade

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/QuestionnaireHandler.ts

import type { QuestionnaireGenerationService } from '../../../application/services/QuestionnaireGenerationService';
import type { ConversationService } from '../../../application/services/ConversationService';
import type { IAuthenticatedSocket } from '../ChatContext';
import type { GenerationPhasePayload, GenerationPhaseId } from '@guardian/shared';
import { sanitizeErrorForClient, isValidVendorName } from '../../../utils/sanitize';

export class QuestionnaireHandler {
  constructor(
    private readonly questionnaireGenerationService: QuestionnaireGenerationService,
    private readonly conversationService: ConversationService
  ) {}

  /**
   * Emit a generation phase event to the client
   */
  private emitGenerationPhase(
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

  /**
   * Handle questionnaire generation request
   *
   * CRITICAL BEHAVIORS TO PRESERVE:
   * 1. Ownership validation via validateConversationOwnership
   * 2. User action message persisted BEFORE generation
   * 3. assistant_stream_start emitted for UX consistency
   * 4. Four generation phases: context(0), generating(1), validating(2), saving(3)
   * 5. Assistant response persisted AFTER streaming
   * 6. export_ready emitted with assessmentId from service result
   * 7. Title upgrade with isValidVendorName validation
   *
   * Public method preserved for test compatibility with
   * ChatServer.handleGenerateQuestionnaire.test.ts
   */
  public async handleGenerateQuestionnaire(
    socket: IAuthenticatedSocket,
    payload: {
      conversationId: string;
      assessmentType?: string;
      vendorName?: string;
      solutionName?: string;
      contextSummary?: string;
      selectedCategories?: string[];
    },
    userId: string
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

      // Emit stream start for UX consistency
      socket.emit('assistant_stream_start', { conversationId });

      // Phase 0: Context ready
      this.emitGenerationPhase(socket, conversationId, 0, 'context');

      // Delegate to service (single Claude call, returns schema + markdown)
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

      // Phase 2: Validation complete
      this.emitGenerationPhase(socket, conversationId, 2, 'validating');

      // Stream pre-rendered markdown to chat (simulated streaming for UX)
      await this.streamMarkdownToSocket(socket, result.markdown, conversationId);

      // Save assistant response
      await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: result.markdown },
      });

      // Phase 3: Persistence complete
      this.emitGenerationPhase(socket, conversationId, 3, 'saving');

      // Emit export ready
      socket.emit('export_ready', {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
        formats: ['pdf', 'word', 'excel'],
      });

      // Title upgrade: Use post-generation metadata with validation
      const postGenVendor = result.schema.metadata.vendorName;
      const postGenSolution = result.schema.metadata.solutionName;

      // Validate vendor/solution name - reject numeric-only, single chars, option tokens
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
          socket.emit('conversation_title_updated', {
            conversationId,
            title: newTitle,
          });
          console.log(`[QuestionnaireHandler] Updated assessment title: "${newTitle}"`);
        }
      } else if (postGenVendor || postGenSolution) {
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
        message: error instanceof Error ? error.message : 'Failed to generate questionnaire',
      });
    }
  }

  /**
   * Validate conversation ownership
   */
  private async validateConversationOwnership(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    if (conversation.userId !== userId) {
      throw new Error('Unauthorized access to conversation');
    }
  }

  /**
   * Stream markdown to socket with simulated typing effect
   */
  private async streamMarkdownToSocket(
    socket: IAuthenticatedSocket,
    markdown: string,
    conversationId: string
  ): Promise<void> {
    const chunks = this.chunkMarkdown(markdown, 80);

    for (const chunk of chunks) {
      socket.emit('assistant_token', {
        conversationId,
        token: chunk,
      });
      await this.sleep(20);
    }

    socket.emit('assistant_done', {
      conversationId,
      fullText: markdown,
    });
  }

  /**
   * Split markdown into chunks for simulated streaming
   */
  private chunkMarkdown(markdown: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let remaining = markdown;

    while (remaining.length > 0) {
      let end = Math.min(chunkSize, remaining.length);
      if (end < remaining.length) {
        const lastSpace = remaining.lastIndexOf(' ', end);
        if (lastSpace > chunkSize * 0.5) {
          end = lastSpace + 1;
        }
      }
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }

    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/QuestionnaireHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('QuestionnaireHandler', () => {
  describe('handleGenerateQuestionnaire', () => {
    const mockResult = {
      markdown: '# Questionnaire\n\n1. Question one?',
      assessmentId: 'assessment-123',
      schema: {
        metadata: {
          questionCount: 10,
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
        },
      },
    };

    it('should validate ownership before generation', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'other-user' });

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Unauthorized'),
      }));
      expect(mockQuestionnaireGenerationService.generate).not.toHaveBeenCalled();
    });

    it('should persist user action message before generation', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockQuestionnaireGenerationService.generate.mockResolvedValue(mockResult);

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'user',
        content: { text: '[System: User clicked Generate Questionnaire button]' },
      });
    });

    it('should emit assistant_stream_start and generation_phase events', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockQuestionnaireGenerationService.generate.mockResolvedValue(mockResult);

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', { conversationId: 'conv-1' });
      expect(mockSocket.emit).toHaveBeenCalledWith('generation_phase', expect.objectContaining({
        conversationId: 'conv-1',
        phase: 0,
        phaseId: 'context',
      }));
      expect(mockSocket.emit).toHaveBeenCalledWith('generation_phase', expect.objectContaining({
        phase: 3,
        phaseId: 'saving',
      }));
    });

    it('should emit export_ready with assessmentId and questionCount', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockQuestionnaireGenerationService.generate.mockResolvedValue(mockResult);

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('export_ready', {
        conversationId: 'conv-1',
        assessmentId: 'assessment-123',
        questionCount: 10,
        formats: ['pdf', 'word', 'excel'],
      });
    });

    it('should update title with validated vendor name', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockQuestionnaireGenerationService.generate.mockResolvedValue(mockResult);
      mockConversationService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      expect(mockConversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-1',
        'Assessment: Test Vendor'
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-1',
        title: 'Assessment: Test Vendor',
      });
    });

    it('should skip title upgrade for invalid vendor names (numeric-only)', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockQuestionnaireGenerationService.generate.mockResolvedValue({
        ...mockResult,
        schema: {
          metadata: { questionCount: 10, vendorName: '1', solutionName: null },
        },
      });

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      expect(mockConversationService.updateTitleIfNotManuallyEdited).not.toHaveBeenCalled();
    });

    it('should persist assistant response after streaming', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockQuestionnaireGenerationService.generate.mockResolvedValue(mockResult);

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, 'user-1');

      // Should be called twice: once for user action, once for assistant response
      expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockConversationService.sendMessage).toHaveBeenLastCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: mockResult.markdown },
      });
    });
  });
});
```

---

## Definition of Done

- [ ] QuestionnaireHandler created
- [ ] Uses QuestionnaireGenerationService (correct service name)
- [ ] Ownership validation via validateConversationOwnership
- [ ] User action message persisted
- [ ] assistant_stream_start emitted
- [ ] All 4 generation_phase events emitted
- [ ] export_ready emitted with correct payload
- [ ] Title upgrade with isValidVendorName validation
- [ ] Unit tests passing
- [ ] Existing ChatServer.handleGenerateQuestionnaire.test.ts passes
