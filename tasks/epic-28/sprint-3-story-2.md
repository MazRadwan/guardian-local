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
- [ ] **Idempotency behavior locked in**:
  - 200ms guard window for duplicate prevention
  - Clear pending map on error (prevents stuck state)
  - **Always create in 'consult' mode** regardless of payload (avoids carrying over prior mode)
- [ ] `handleDeleteConversation()` implemented with ownership validation
- [ ] **Delete idempotent success**:
  - Emit `conversation_deleted` even when conversation already deleted (not found)
  - Clear `socket.conversationId` when deleting the active conversation
- [ ] **Correct event name**: Emits `conversation_created` (NOT `conversation_started`)
- [ ] **Correct response payload**: `{ conversation: { id, title, createdAt, updatedAt, mode } }`
- [ ] Unit tests cover success, auth failure, idempotency, and error-state cleanup

---

## Technical Approach

```typescript
// Add to ConversationHandler.ts

async handleStartNewConversation(
  socket: IAuthenticatedSocket,
  payload: { mode?: 'consult' | 'assessment' },  // Payload ignored - always uses consult
  chatContext: ChatContext
): Promise<void> {
  try {
    if (!socket.userId) {
      socket.emit('error', { event: 'start_new_conversation', message: 'User not authenticated' });
      return;
    }

    const userId = socket.userId;

    // Idempotency guard - 200ms prevents accidental double-clicks
    const pending = chatContext.pendingCreations.get(userId);
    if (pending && Date.now() - pending.timestamp < 200) {
      console.log(`[ConversationHandler] Conversation creation already in progress for user ${userId}, returning pending conversation`);

      // Return the pending conversation info (it should have been emitted already)
      const existingConv = await this.conversationService.getConversation(pending.conversationId);
      if (existingConv) {
        socket.emit('conversation_created', {
          conversation: {
            id: existingConv.id,
            title: 'New Chat',
            createdAt: existingConv.startedAt,
            updatedAt: existingConv.lastActivityAt,
            mode: existingConv.mode,
          },
        });
      }
      return;
    }

    console.log(`[ConversationHandler] Starting new conversation for user ${userId}`);

    // Create new conversation - ALWAYS default to 'consult' mode
    // (avoids carrying over prior mode from payload)
    const conversation = await this.conversationService.createConversation({
      userId,
      mode: 'consult',
    });

    // Track this creation to prevent duplicates
    chatContext.pendingCreations.set(userId, {
      conversationId: conversation.id,
      timestamp: Date.now(),
    });

    // CRITICAL: Update socket's current conversation ID
    socket.conversationId = conversation.id;

    // Emit conversation_created event with full metadata
    socket.emit('conversation_created', {
      conversation: {
        id: conversation.id,
        title: 'New Chat',
        createdAt: conversation.startedAt,
        updatedAt: conversation.lastActivityAt,
        mode: conversation.mode,
      },
    });

    console.log(`[ConversationHandler] New conversation ${conversation.id} created and set as active`);

    // Clear pending after a short delay (allows accidental double-clicks to use cached value)
    setTimeout(() => {
      chatContext.pendingCreations.delete(userId);
    }, 200); // 200ms - only prevents true accidents, allows intentional rapid clicks

  } catch (error) {
    console.error('[ConversationHandler] Error creating conversation:', error);

    // Clear pending on error to prevent stuck state
    if (socket.userId) {
      chatContext.pendingCreations.delete(socket.userId);
    }

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
  if (!socket.userId) {
    socket.emit('error', { event: 'delete_conversation', message: 'User not authenticated' });
    return;
  }

  const { conversationId } = payload;

  if (!conversationId) {
    socket.emit('error', { event: 'delete_conversation', message: 'conversationId is required' });
    return;
  }

  try {
    console.log(`[ConversationHandler] Deleting conversation ${conversationId} for user ${socket.userId}`);

    // IDEMPOTENT: Check if conversation exists first
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      // Already deleted - return success (idempotent DELETE)
      console.log(`[ConversationHandler] Conversation ${conversationId} already deleted - returning success`);
      socket.emit('conversation_deleted', { conversationId });

      // Clear socket.conversationId if this was the active conversation
      if (socket.conversationId === conversationId) {
        socket.conversationId = undefined;
      }
      return;
    }

    // Validate ownership
    if (conversation.userId !== socket.userId) {
      socket.emit('error', { event: 'delete_conversation', message: 'Conversation not found' });
      return;
    }

    // Delete from database
    await this.conversationService.deleteConversation(conversationId);

    console.log(`[ConversationHandler] Successfully deleted conversation ${conversationId}`);

    // Emit confirmation to client
    socket.emit('conversation_deleted', { conversationId });

    // Clear socket.conversationId if this was the active conversation
    if (socket.conversationId === conversationId) {
      socket.conversationId = undefined;
    }
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
  it('should create new conversation in consult mode (always)', async () => {
    const newConversation = {
      id: 'new-conv-1',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      mode: 'consult',
    };
    mockConversationService.createConversation.mockResolvedValue(newConversation);

    // Even if payload has different mode, should create in consult
    await handler.handleStartNewConversation(mockSocket, { mode: 'assessment' }, mockChatContext);

    expect(mockConversationService.createConversation).toHaveBeenCalledWith({
      userId: 'user-1',
      mode: 'consult', // ALWAYS consult, never carries over from payload
    });
  });

  it('should emit conversation_created with full metadata (NOT conversation_started)', async () => {
    const newConversation = {
      id: 'new-conv-1',
      startedAt: new Date('2026-01-15'),
      lastActivityAt: new Date('2026-01-15'),
      mode: 'consult',
    };
    mockConversationService.createConversation.mockResolvedValue(newConversation);

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_created', {
      conversation: {
        id: 'new-conv-1',
        title: 'New Chat',
        createdAt: newConversation.startedAt,
        updatedAt: newConversation.lastActivityAt,
        mode: 'consult',
      },
    });
  });

  it('should return existing pending conversation within 200ms guard', async () => {
    const existingConv = {
      id: 'pending-conv',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      mode: 'consult',
    };
    mockChatContext.pendingCreations.set('user-1', {
      conversationId: 'pending-conv',
      timestamp: Date.now() - 100, // 100ms ago (within 200ms guard)
    });
    mockConversationService.getConversation.mockResolvedValue(existingConv);

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockConversationService.createConversation).not.toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_created', expect.objectContaining({
      conversation: expect.objectContaining({ id: 'pending-conv' }),
    }));
  });

  it('should create new conversation when pending is older than 200ms', async () => {
    mockChatContext.pendingCreations.set('user-1', {
      conversationId: 'old-pending-conv',
      timestamp: Date.now() - 300, // 300ms ago (outside 200ms guard)
    });
    mockConversationService.createConversation.mockResolvedValue({
      id: 'new-conv-1',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      mode: 'consult',
    });

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockConversationService.createConversation).toHaveBeenCalled();
  });

  it('should set socket.conversationId after creation', async () => {
    mockConversationService.createConversation.mockResolvedValue({
      id: 'new-conv-1',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      mode: 'consult',
    });

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockSocket.conversationId).toBe('new-conv-1');
  });

  it('should clear pending map on error to prevent stuck state', async () => {
    mockConversationService.createConversation.mockRejectedValue(new Error('DB error'));

    await handler.handleStartNewConversation(mockSocket, {}, mockChatContext);

    expect(mockChatContext.pendingCreations.has('user-1')).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
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
    expect(mockConversationService.deleteConversation).not.toHaveBeenCalled();
  });

  it('should emit conversation_deleted even when already deleted (idempotent)', async () => {
    mockConversationService.getConversation.mockResolvedValue(null); // Not found

    await handler.handleDeleteConversation(mockSocket, { conversationId: 'already-deleted' });

    // Should still emit success (idempotent DELETE)
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_deleted', { conversationId: 'already-deleted' });
    expect(mockConversationService.deleteConversation).not.toHaveBeenCalled();
  });

  it('should clear socket.conversationId when deleting active conversation', async () => {
    mockSocket.conversationId = 'conv-1'; // This is the active conversation
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });

    await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.conversationId).toBeUndefined();
  });

  it('should clear socket.conversationId on idempotent delete of active conversation', async () => {
    mockSocket.conversationId = 'conv-1';
    mockConversationService.getConversation.mockResolvedValue(null); // Already deleted

    await handler.handleDeleteConversation(mockSocket, { conversationId: 'conv-1' });

    expect(mockSocket.conversationId).toBeUndefined();
  });

  it('should NOT clear socket.conversationId when deleting different conversation', async () => {
    mockSocket.conversationId = 'active-conv';
    mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });

    await handler.handleDeleteConversation(mockSocket, { conversationId: 'other-conv' });

    expect(mockSocket.conversationId).toBe('active-conv');
  });
});
```

---

## Definition of Done

- [ ] handleStartNewConversation implemented with idempotency
- [ ] handleDeleteConversation implemented with ownership check
- [ ] Emits `conversation_created` (NOT `conversation_started`)
- [ ] Response includes full conversation metadata
- [ ] Unit tests passing
