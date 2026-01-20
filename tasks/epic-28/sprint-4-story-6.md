# Story 28.8.2: Extract QuestionnaireHandler.ts (get_export_status)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add `handleGetExportStatus()` method to QuestionnaireHandler for checking export status of a questionnaire. This restores download buttons on session resume.

---

## Acceptance Criteria

- [ ] `handleGetExportStatus()` implemented
- [ ] Validates conversationId (non-empty string)
- [ ] Validates user authentication
- [ ] Validates conversation ownership
- [ ] Emits `export_status_not_found` when no assessment linked
- [ ] Emits `export_status_error` for validation failures (with specific error messages)
- [ ] Emits `export_ready` when assessment exists with questions
- [ ] Unit tests cover success, not found, and error cases

---

## Technical Approach

```typescript
// Add to QuestionnaireHandler.ts

/**
 * Handle export status query
 *
 * Returns existing export if questionnaire was already generated for conversation.
 * Used to restore download buttons on session resume.
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Early validation of conversationId (non-empty string)
 * 2. Auth validation (userId must be present)
 * 3. Ownership validation (conversation.userId === userId)
 * 4. Three distinct outcomes:
 *    - export_status_not_found: no assessment or no questions
 *    - export_status_error: validation failures
 *    - export_ready: assessment exists with questions
 */
public async handleGetExportStatus(
  socket: IAuthenticatedSocket,
  data: { conversationId: string }
): Promise<void> {
  const { conversationId } = data;
  const userId = socket.userId;

  // Early validation: conversationId must be a non-empty string
  if (!conversationId || typeof conversationId !== 'string' || conversationId.trim() === '') {
    console.log(`[QuestionnaireHandler] get_export_status invalid input: conversationId=${conversationId}`);
    socket.emit('export_status_error', {
      conversationId: conversationId ?? '',
      error: 'Invalid conversation ID',
    });
    return;
  }

  // Early validation: userId must be present
  if (!userId) {
    console.log(`[QuestionnaireHandler] get_export_status auth error: conversationId=${conversationId}, reason=Not authenticated`);
    socket.emit('export_status_error', {
      conversationId,
      error: 'Not authenticated',
    });
    return;
  }

  console.log(`[QuestionnaireHandler] get_export_status request: conversationId=${conversationId}, userId=${userId}`);

  try {
    // 1. Get conversation and verify ownership
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      console.log(`[QuestionnaireHandler] export_status auth error: conversationId=${conversationId}, reason=Conversation not found`);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Conversation not found',
      });
      return;
    }

    if (conversation.userId !== userId) {
      console.log(`[QuestionnaireHandler] export_status auth error: conversationId=${conversationId}, reason=Unauthorized`);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Unauthorized',
      });
      return;
    }

    // 2. Check if conversation has a linked assessment
    if (!conversation.assessmentId) {
      console.log(`[QuestionnaireHandler] export_status not found: conversationId=${conversationId}`);
      socket.emit('export_status_not_found', { conversationId });
      return;
    }

    // 3. Verify assessment exists
    const assessment = await this.assessmentService.getAssessment(conversation.assessmentId);
    if (!assessment) {
      console.log(`[QuestionnaireHandler] export_status not found: conversationId=${conversationId}`);
      socket.emit('export_status_not_found', { conversationId });
      return;
    }

    // 4. Count questions for this assessment
    const questionCount = await this.questionService.getQuestionCount(assessment.id);

    if (questionCount === 0) {
      console.log(`[QuestionnaireHandler] export_status not found: conversationId=${conversationId}`);
      socket.emit('export_status_not_found', { conversationId });
      return;
    }

    // 5. Emit export_ready payload (reuses existing frontend handler)
    socket.emit('export_ready', {
      conversationId,
      assessmentId: assessment.id,
      questionCount,
      formats: ['word', 'pdf', 'excel'],
    });

    console.log(`[QuestionnaireHandler] export_status found: assessmentId=${assessment.id}, questions=${questionCount}`);

  } catch (error) {
    console.error(`[QuestionnaireHandler] get_export_status error:`, error);
    socket.emit('export_status_error', {
      conversationId,
      error: 'Internal server error',
    });
  }
}
```

---

## Dependencies

QuestionnaireHandler now needs additional services:
- `AssessmentService` - for `getAssessment()`
- `QuestionService` - for `getQuestionCount()`

Update constructor:

```typescript
export class QuestionnaireHandler {
  constructor(
    private readonly questionnaireGenerationService: QuestionnaireGenerationService,
    private readonly conversationService: ConversationService,
    private readonly assessmentService: AssessmentService,
    private readonly questionService: QuestionService
  ) {}
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/QuestionnaireHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('handleGetExportStatus', () => {
  it('should emit export_ready when assessment exists with questions', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      userId: 'user-1',
      assessmentId: 'assessment-123',
    });
    mockAssessmentService.getAssessment.mockResolvedValue({ id: 'assessment-123' });
    mockQuestionService.getQuestionCount.mockResolvedValue(15);

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_ready', {
      conversationId: 'conv-1',
      assessmentId: 'assessment-123',
      questionCount: 15,
      formats: ['word', 'pdf', 'excel'],
    });
  });

  it('should emit export_status_not_found when no assessmentId', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      userId: 'user-1',
      assessmentId: null,
    });

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_not_found', {
      conversationId: 'conv-1',
    });
  });

  it('should emit export_status_not_found when no questions', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      userId: 'user-1',
      assessmentId: 'assessment-123',
    });
    mockAssessmentService.getAssessment.mockResolvedValue({ id: 'assessment-123' });
    mockQuestionService.getQuestionCount.mockResolvedValue(0);

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_not_found', {
      conversationId: 'conv-1',
    });
  });

  it('should emit export_status_error for invalid conversationId', async () => {
    await handler.handleGetExportStatus(mockSocket, { conversationId: '' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
      conversationId: '',
      error: 'Invalid conversation ID',
    });
  });

  it('should emit export_status_error for empty string conversationId', async () => {
    await handler.handleGetExportStatus(mockSocket, { conversationId: '   ' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', expect.objectContaining({
      error: 'Invalid conversation ID',
    }));
  });

  it('should emit export_status_error when not authenticated', async () => {
    mockSocket.userId = undefined;

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
      conversationId: 'conv-1',
      error: 'Not authenticated',
    });
  });

  it('should emit export_status_error when conversation not found', async () => {
    mockConversationService.getConversation.mockResolvedValue(null);

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
      conversationId: 'conv-1',
      error: 'Conversation not found',
    });
  });

  it('should emit export_status_error when unauthorized', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      userId: 'other-user',
      assessmentId: 'assessment-123',
    });

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
      conversationId: 'conv-1',
      error: 'Unauthorized',
    });
  });

  it('should emit export_status_error on internal error', async () => {
    mockConversationService.getConversation.mockRejectedValue(new Error('DB error'));

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status_error', {
      conversationId: 'conv-1',
      error: 'Internal server error',
    });
  });
});
```

---

## Definition of Done

- [ ] handleGetExportStatus implemented
- [ ] Validates conversationId (non-empty string)
- [ ] Auth and ownership validation
- [ ] Correct event emitted for each outcome
- [ ] Unit tests passing
