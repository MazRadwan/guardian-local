# Story 28.8.1: Extract QuestionnaireHandler.ts (generate_questionnaire)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create QuestionnaireHandler and implement `handleGenerateQuestionnaire()`. This handles the questionnaire generation event with streaming markdown output.

---

## Acceptance Criteria

- [ ] `QuestionnaireHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] `handleGenerateQuestionnaire()` implemented
- [ ] Preserves public method interface for existing tests
- [ ] Streaming markdown via StreamingHandler
- [ ] Phase progress events emitted
- [ ] Unit tests cover generation flow

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/QuestionnaireHandler.ts

import { QuestionnaireService } from '../../../application/services/QuestionnaireService';
import { IAuthenticatedSocket, ChatContext } from '../ChatContext';
import { StreamingHandler } from '../StreamingHandler';
import { sanitizeErrorForClient } from '../../../utils/sanitize';

export class QuestionnaireHandler {
  constructor(
    private readonly questionnaireService: QuestionnaireService,
    private readonly streamingHandler: StreamingHandler
  ) {}

  /**
   * Handle questionnaire generation request
   *
   * Public method preserved for test compatibility with
   * ChatServer.handleGenerateQuestionnaire.test.ts
   */
  async handleGenerateQuestionnaire(
    socket: IAuthenticatedSocket,
    payload: {
      conversationId: string;
      assessmentType?: string;
      vendorName?: string;
      solutionName?: string;
      categories?: string[];
    },
    chatContext: ChatContext
  ): Promise<void> {
    const { conversationId } = payload;

    try {
      console.log(`[QuestionnaireHandler] Generating questionnaire for ${conversationId}`);

      // Emit phase start
      socket.emit('questionnaire_generation_phase', {
        conversationId,
        phase: 'starting',
        message: 'Starting questionnaire generation...',
      });

      // Check for abort
      const isAborted = () => chatContext.abortedStreams.has(conversationId);

      if (isAborted()) {
        console.log(`[QuestionnaireHandler] Generation aborted before start`);
        return;
      }

      // Generate questionnaire
      const result = await this.questionnaireService.generateQuestionnaire({
        conversationId,
        assessmentType: payload.assessmentType || 'comprehensive',
        vendorName: payload.vendorName,
        solutionName: payload.solutionName,
        categories: payload.categories,
      });

      if (isAborted()) {
        console.log(`[QuestionnaireHandler] Generation aborted during processing`);
        return;
      }

      // Emit phase progress
      socket.emit('questionnaire_generation_phase', {
        conversationId,
        phase: 'streaming',
        message: 'Streaming questionnaire...',
      });

      // Stream the result
      await this.streamingHandler.streamToSocket(
        socket,
        result.markdown,
        conversationId,
        isAborted,
        () => {
          chatContext.abortedStreams.delete(conversationId);
          socket.emit('assistant_aborted', { conversationId });
        }
      );

      // Emit completion
      socket.emit('questionnaire_generation_phase', {
        conversationId,
        phase: 'complete',
        questionCount: result.questionCount,
      });
    } catch (error) {
      console.error('[QuestionnaireHandler] Generation error:', error);
      socket.emit('error', {
        event: 'generate_questionnaire',
        message: sanitizeErrorForClient(error, 'Failed to generate questionnaire'),
      });
    }
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
    it('should generate and stream questionnaire', async () => {
      mockQuestionnaireService.generateQuestionnaire.mockResolvedValue({
        markdown: '# Questionnaire\n\n1. Question one?',
        questionCount: 10,
      });

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, mockChatContext);

      expect(mockSocket.emit).toHaveBeenCalledWith('questionnaire_generation_phase', expect.objectContaining({
        phase: 'starting',
      }));
      expect(mockSocket.emit).toHaveBeenCalledWith('questionnaire_generation_phase', expect.objectContaining({
        phase: 'complete',
      }));
    });

    it('should handle abort', async () => {
      mockChatContext.abortedStreams.add('conv-1');

      await handler.handleGenerateQuestionnaire(mockSocket, {
        conversationId: 'conv-1',
      }, mockChatContext);

      expect(mockQuestionnaireService.generateQuestionnaire).not.toHaveBeenCalled();
    });
  });
});
```

---

## Definition of Done

- [ ] QuestionnaireHandler created
- [ ] handleGenerateQuestionnaire implemented
- [ ] Streaming works with StreamingHandler
- [ ] Unit tests passing
- [ ] Existing ChatServer.handleGenerateQuestionnaire.test.ts passes
