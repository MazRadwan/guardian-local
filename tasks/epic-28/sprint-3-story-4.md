# Story 28.5.4: Centralize ownership validation

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Create a centralized `validateOwnership()` method in ConversationHandler that can be reused across all methods. This ensures consistent ownership checking with proper error messages.

---

## Acceptance Criteria

- [ ] `validateOwnership(conversationId, userId)` method implemented
- [ ] Throws descriptive error if not owned
- [ ] Throws descriptive error if conversation not found
- [ ] All handler methods use this centralized validation
- [ ] Unit tests cover all validation cases

---

## Technical Approach

```typescript
// Add to ConversationHandler.ts

/**
 * Validate that a conversation exists and is owned by the given user
 *
 * @throws Error if conversation not found or not owned
 */
async validateOwnership(conversationId: string, userId: string): Promise<void> {
  const conversation = await this.conversationService.getConversation(conversationId);

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (conversation.userId !== userId) {
    console.warn(
      `[ConversationHandler] User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`
    );
    throw new Error('Unauthorized: You do not have access to this conversation');
  }
}
```

Update existing methods to use:
```typescript
// In handleGetHistory, handleDeleteConversation, etc.
await this.validateOwnership(conversationId, socket.userId);
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ConversationHandler.ts` - Add validateOwnership method

---

## Tests Required

```typescript
describe('validateOwnership', () => {
  it('should pass for owned conversation', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
    });

    await expect(handler.validateOwnership('conv-1', 'user-1')).resolves.toBeUndefined();
  });

  it('should throw for non-existent conversation', async () => {
    mockConversationService.getConversation.mockResolvedValue(null);

    await expect(handler.validateOwnership('invalid', 'user-1'))
      .rejects.toThrow('not found');
  });

  it('should throw for conversation owned by different user', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'other-user',
    });

    await expect(handler.validateOwnership('conv-1', 'user-1'))
      .rejects.toThrow('Unauthorized: You do not have access to this conversation');
  });
});
```

---

## Definition of Done

- [ ] validateOwnership implemented
- [ ] All handler methods use centralized validation
- [ ] Unit tests passing
