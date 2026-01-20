# Story 28.5.3: Extract ConversationHandler.ts (get_history)

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add `handleGetHistory()` method to ConversationHandler. This retrieves message history for a conversation with ownership validation.

---

## Acceptance Criteria

- [ ] `handleGetHistory()` implemented
- [ ] Ownership validation before returning history
- [ ] Returns messages in correct format
- [ ] Handles missing conversationId gracefully
- [ ] Unit tests cover success, auth failure, missing ID

---

## Technical Approach

```typescript
// Add to ConversationHandler.ts

async handleGetHistory(
  socket: IAuthenticatedSocket,
  payload: { conversationId?: string }
): Promise<void> {
  try {
    if (!socket.userId) {
      socket.emit('error', { event: 'get_history', message: 'User not authenticated' });
      return;
    }

    const conversationId = payload.conversationId || socket.conversationId;

    if (!conversationId) {
      socket.emit('error', {
        event: 'get_history',
        message: 'No conversation ID provided',
      });
      return;
    }

    // Validate ownership
    await this.validateOwnership(conversationId, socket.userId);

    const history = await this.conversationService.getHistory(conversationId);

    socket.emit('conversation_history', {
      conversationId,
      messages: history,
    });

    console.log(`[ConversationHandler] Sent ${history.length} messages for conversation ${conversationId}`);
  } catch (error) {
    console.error('[ConversationHandler] Error fetching history:', error);
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
  it('should return conversation history', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
    mockConversationService.getHistory.mockResolvedValue([
      { role: 'user', content: { text: 'Hello' } },
      { role: 'assistant', content: { text: 'Hi!' } },
    ]);

    await handler.handleGetHistory(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_history', {
      conversationId: 'conv-1',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user' }),
      ]),
    });
  });

  it('should use socket.conversationId if not provided in payload', async () => {
    mockSocket.conversationId = 'socket-conv';
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
    mockConversationService.getHistory.mockResolvedValue([]);

    await handler.handleGetHistory(mockSocket, {});

    expect(mockConversationService.getHistory).toHaveBeenCalledWith('socket-conv');
  });

  it('should emit error if no conversationId available', async () => {
    mockSocket.conversationId = undefined;

    await handler.handleGetHistory(mockSocket, {});

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'get_history',
      message: expect.stringContaining('No conversation ID'),
    }));
  });
});
```

---

## Definition of Done

- [ ] handleGetHistory implemented
- [ ] Unit tests passing
