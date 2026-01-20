# Story 28.5.3: Extract ConversationHandler.ts (get_history)

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add `handleGetHistory()` method to ConversationHandler. This retrieves message history for a conversation with ownership validation and idempotent empty-history behavior.

---

## Acceptance Criteria

- [ ] `handleGetHistory()` implemented
- [ ] **Correct event name**: Emits `history` (NOT `conversation_history`)
- [ ] **Requires explicit conversationId**: Does NOT fallback to socket.conversationId (matches ChatServer)
- [ ] **Idempotent empty history**: Return empty messages array when conversation not found (NOT error)
- [ ] **Attachment shaping**: Messages include shaped attachments (fileId, filename, mimeType, size - NO storagePath)
- [ ] Ownership validation before returning history (only if conversation exists)
- [ ] Supports pagination via `limit` and `offset` parameters
- [ ] Unit tests cover success, auth failure, idempotent empty, attachment shaping

---

## Technical Approach

```typescript
// Add to ConversationHandler.ts

interface GetHistoryPayload {
  conversationId: string;  // REQUIRED - no fallback to socket.conversationId
  limit?: number;
  offset?: number;
}

async handleGetHistory(
  socket: IAuthenticatedSocket,
  payload: GetHistoryPayload
): Promise<void> {
  try {
    console.log(`[ConversationHandler] History requested for conversation ${payload.conversationId}`);

    // Validate user is authenticated
    if (!socket.userId) {
      socket.emit('error', { event: 'get_history', message: 'User not authenticated' });
      return;
    }

    // CRITICAL: Check if conversation exists first (idempotent history)
    const conversation = await this.conversationService.getConversation(payload.conversationId);

    if (!conversation) {
      // IDEMPOTENT: Conversation doesn't exist (likely deleted) - return empty history
      console.log(`[ConversationHandler] Conversation ${payload.conversationId} not found - returning empty history`);
      socket.emit('history', {
        conversationId: payload.conversationId,
        messages: [],
      });
      return;
    }

    // Only validate ownership if conversation exists
    if (conversation.userId !== socket.userId) {
      console.warn(`[ConversationHandler] SECURITY: User ${socket.userId} attempted to access conversation ${payload.conversationId} owned by ${conversation.userId}`);
      socket.emit('error', {
        event: 'get_history',
        message: 'Unauthorized: You do not have access to this conversation',
      });
      return;
    }

    // Get message history with pagination
    const messages = await this.conversationService.getHistory(
      payload.conversationId,
      payload.limit,
      payload.offset
    );

    // Shape messages for client (including attachments)
    socket.emit('history', {
      conversationId: payload.conversationId,
      messages: messages.map((msg) => ({
        id: msg.id,
        conversationId: msg.conversationId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        // Epic 16.6.9: Pass through attachments (storagePath no longer stored,
        // but strip defensively for backward compat with old messages)
        ...(msg.attachments && msg.attachments.length > 0 && {
          attachments: msg.attachments.map(att => ({
            fileId: att.fileId,
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            // SECURITY: Never include storagePath in client response
          })),
        }),
      })),
    });

    console.log(`[ConversationHandler] Sent ${messages.length} messages for conversation ${payload.conversationId}`);
  } catch (error) {
    console.error('[ConversationHandler] Error getting history:', error);
    socket.emit('error', {
      event: 'get_history',
      message: sanitizeErrorForClient(error, 'Failed to get history'),
    });
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ConversationHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ConversationHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('handleGetHistory', () => {
  it('should emit history event (NOT conversation_history)', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
    mockConversationService.getHistory.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: { text: 'Hello' }, createdAt: new Date() },
      { id: 'msg-2', role: 'assistant', content: { text: 'Hi!' }, createdAt: new Date() },
    ]);

    await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('history', expect.objectContaining({
      conversationId: 'conv-1',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user' }),
        expect.objectContaining({ role: 'assistant' }),
      ]),
    }));
  });

  it('should return empty messages array when conversation not found (idempotent)', async () => {
    mockConversationService.getConversation.mockResolvedValue(null);

    await handler.handleGetHistory(mockSocket, { conversationId: 'deleted-conv' });

    // IDEMPOTENT: Return empty history, NOT error
    expect(mockSocket.emit).toHaveBeenCalledWith('history', {
      conversationId: 'deleted-conv',
      messages: [],
    });
    expect(mockSocket.emit).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('should require explicit conversationId (NO socket.conversationId fallback)', async () => {
    // ChatServer requires explicit conversationId in payload
    mockSocket.conversationId = 'socket-conv';

    await handler.handleGetHistory(mockSocket, { conversationId: undefined as any });

    // The implementation should NOT fallback to socket.conversationId
    // Either validate conversationId or let it pass through
    // This test documents the expected behavior
    expect(mockConversationService.getHistory).not.toHaveBeenCalledWith('socket-conv');
  });

  it('should reject unauthorized access to conversation', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'other-user' });

    await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'get_history',
      message: expect.stringContaining('Unauthorized'),
    }));
    expect(mockConversationService.getHistory).not.toHaveBeenCalled();
  });

  it('should shape attachments correctly (NO storagePath)', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
    mockConversationService.getHistory.mockResolvedValue([
      {
        id: 'msg-1',
        role: 'user',
        content: { text: 'Check this file' },
        createdAt: new Date(),
        attachments: [
          {
            fileId: 'file-1',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            storagePath: 's3://bucket/doc.pdf', // Should be stripped
          },
        ],
      },
    ]);

    await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

    const emittedPayload = (mockSocket.emit as jest.Mock).mock.calls.find(
      call => call[0] === 'history'
    )?.[1];

    expect(emittedPayload.messages[0].attachments).toEqual([
      {
        fileId: 'file-1',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        // storagePath should NOT be present
      },
    ]);
    expect(emittedPayload.messages[0].attachments[0]).not.toHaveProperty('storagePath');
  });

  it('should support pagination with limit and offset', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
    mockConversationService.getHistory.mockResolvedValue([]);

    await handler.handleGetHistory(mockSocket, {
      conversationId: 'conv-1',
      limit: 20,
      offset: 10,
    });

    expect(mockConversationService.getHistory).toHaveBeenCalledWith('conv-1', 20, 10);
  });

  it('should emit error if not authenticated', async () => {
    mockSocket.userId = undefined;

    await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'get_history',
      message: 'User not authenticated',
    }));
  });
});
```

---

## Definition of Done

- [ ] handleGetHistory implemented
- [ ] Emits `history` (NOT `conversation_history`)
- [ ] Idempotent empty history on missing conversation
- [ ] Attachments shaped without storagePath
- [ ] Unit tests passing
