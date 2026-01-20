# Story 28.8.2: Extract QuestionnaireHandler.ts (get_export_status)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add `handleGetExportStatus()` method to QuestionnaireHandler for checking export status of a questionnaire.

---

## Acceptance Criteria

- [ ] `handleGetExportStatus()` implemented
- [ ] Returns status, available formats, download URLs
- [ ] Handles non-existent questionnaires gracefully
- [ ] Unit tests cover success and error cases

---

## Technical Approach

```typescript
// Add to QuestionnaireHandler.ts

/**
 * Handle export status check
 */
async handleGetExportStatus(
  socket: IAuthenticatedSocket,
  payload: { conversationId: string }
): Promise<void> {
  try {
    const { conversationId } = payload;

    const status = await this.questionnaireService.getExportStatus(conversationId);

    if (!status) {
      socket.emit('export_status', {
        conversationId,
        available: false,
        message: 'No questionnaire found for this conversation',
      });
      return;
    }

    socket.emit('export_status', {
      conversationId,
      available: true,
      formats: status.availableFormats,
      downloadUrls: status.downloadUrls,
      generatedAt: status.generatedAt,
    });
  } catch (error) {
    console.error('[QuestionnaireHandler] Export status error:', error);
    socket.emit('error', {
      event: 'get_export_status',
      message: sanitizeErrorForClient(error, 'Failed to get export status'),
    });
  }
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
  it('should return export status when available', async () => {
    mockQuestionnaireService.getExportStatus.mockResolvedValue({
      availableFormats: ['pdf', 'docx', 'xlsx'],
      downloadUrls: {
        pdf: 'https://example.com/q.pdf',
        docx: 'https://example.com/q.docx',
      },
      generatedAt: new Date(),
    });

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status', expect.objectContaining({
      available: true,
      formats: expect.arrayContaining(['pdf', 'docx']),
    }));
  });

  it('should return not available when no questionnaire', async () => {
    mockQuestionnaireService.getExportStatus.mockResolvedValue(null);

    await handler.handleGetExportStatus(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('export_status', expect.objectContaining({
      available: false,
    }));
  });
});
```

---

## Definition of Done

- [ ] handleGetExportStatus implemented
- [ ] Unit tests passing
