# Story 28.5.2: Extract ConversationHandler.ts (start_new, delete)

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add `handleStartNewConversation()` and `handleDeleteConversation()` methods to ConversationHandler. These handle conversation creation with idempotency and soft-delete.

---

## Acceptance Criteria

- [ ] `handleStartNewConversation()` implemented with idempotency guard
- [ ] Uses `chatContext.pendingCreations` for deduplication
- [ ] `handleDeleteConversation()` implemented with ownership validation
- [ ] Emits correct events: `conversation_started`, `conversation_deleted`
- [ ] Unit tests cover success, auth failure, and idempotency

---

## Technical Approach

```typescript
// Add to ConversationHandler.ts

async handleStartNewConversation(
  socket: IAuthenticatedSocket,
  payload: { pendingConversationId?: string },
  chatContext: ChatContext
): Promise<void> {
  try {
    if (!socket.userId) {
      socket.emit('error', { event: 'start_new_conversation', message: 'User not authenticated' });
      return;
    }

    const userId = socket.userId;

    // Idempotency guard - check for recent pending creation
    const pending = chatContext.pendingCreations.get(userId);
    if (pending && Date.now() - pending.timestamp < 5000) {
      console.log(`[ConversationHandler] Returning existing pending conversation for ${userId}`);
      socket.conversationId = pending.conversationId;
      socket.emit('conversation_started', {
        conversationId: pending.conversationId,
        isDuplicate: true,
      });
      return;
    }

    // Create new conversation
    const conversation = await this.conversationService.createConversation(userId);

    // Track for idempotency
    chatContext.pendingCreations.set(userId, {
      conversationId: conversation.id,
      timestamp: Date.now(),
    });

    // Clean up after 10 seconds
    setTimeout(() => chatContext.pendingCreations.delete(userId), 10000);

    socket.conversationId = conversation.id;
    socket.emit('conversation_started', {
      conversationId: conversation.id,
      isDuplicate: false,
    });
  } catch (error) {
    console.error('[ConversationHandler] Error creating conversation:', error);
    socket.emit('error', {
      event: 'start_new_conversation',
      message: sanitizeErrorForClient(error, 'Failed to create conversation'),
    });
  }
}

async handleDeleteConversation(
  socket: IAuthenticatedSocket,
  payload: { conversationId: string }
): Promise<void> {
  try {
    if (!socket.userId) {
      socket.emit('error', { event: 'delete_conversation', message: 'User not authenticated' });
      return;
    }

    const { conversationId } = payload;

    // Validate ownership
    await this.validateOwnership(conversationId, socket.userId);

    await this.conversationService.deleteConversation(conversationId);

    socket.emit('conversation_deleted', { conversationId });
    console.log(`[ConversationHandler] Deleted conversation ${conversationId}`);
  } catch (error) {
    console.error('[ConversationHandler] Error deleting conversation:', error);
    socket.emit('error', {
      event: 'delete_conversation',
      message: sanitizeErrorForClient(error, 'Failed to delete conversation'),
    });
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ConversationHandler.ts` - Add methods
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ConversationHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('handleStartNewConversation', () => {
  it('should create new conversation', async () => {
    mockConversationService.createConversation.mockResolvedValue({ id: 'new-conv-1' });

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_started', {
      conversationId: 'new-conv-1',
      isDuplicate: false,
    });
  });

  it('should return existing pending conversation for idempotency', async () => {
    mockChatContext.pendingCreations.set('user-1', {
      conversationId: 'pending-conv',
      timestamp: Date.now(),
    });

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockConversationService.createConversation).not.toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_started', {
      conversationId: 'pending-conv',
      isDuplicate: true,
    });
  });
});

describe('handleDeleteConversation', () => {
  it('should delete owned conversation', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });

    await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

    expect(mockConversationService.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_deleted', { conversationId: 'conv-1' });
  });

  it('should reject deletion of conversation owned by other user', async () => {
    mockConversationService.getConversation.mockResolvedValue({ userId: 'other-user' });

    await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
  });
});
```

---

## Definition of Done

- [ ] handleStartNewConversation implemented with idempotency
- [ ] handleDeleteConversation implemented with ownership check
- [ ] Unit tests passing
