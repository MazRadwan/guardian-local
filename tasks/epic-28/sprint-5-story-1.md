# Story 28.9.1: Extract MessageHandler.ts (send_message validation)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create MessageHandler and implement the validation logic for `send_message` event. This includes rate limiting, conversation validation, and input sanitization.

---

## Acceptance Criteria

- [ ] `MessageHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] Rate limit check using ChatContext.rateLimiter
- [ ] Conversation ID validation (required, exists, owned by user)
- [ ] Message content validation (non-empty, sanitized)
- [ ] Unit tests cover all validation scenarios

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/MessageHandler.ts

import { ConversationService } from '../../../application/services/ConversationService';
import { IAuthenticatedSocket, ChatContext } from '../ChatContext';
import { sanitizeForPrompt, sanitizeErrorForClient } from '../../../utils/sanitize';

export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  /**
   * Validate send_message request
   *
   * @returns null if valid, error message if invalid
   */
  async validateSendMessage(
    socket: IAuthenticatedSocket,
    payload: { conversationId?: string; message?: string },
    chatContext: ChatContext
  ): Promise<string | null> {
    // Auth check
    if (!socket.userId) {
      return 'User not authenticated';
    }

    // Rate limit check
    const { allowed, retryAfter } = chatContext.rateLimiter.check(socket.userId);
    if (!allowed) {
      return `Rate limited. Try again in ${retryAfter} seconds.`;
    }

    // Conversation ID required
    const conversationId = payload.conversationId || socket.conversationId;
    if (!conversationId) {
      return 'No conversation ID provided';
    }

    // Verify conversation exists and is owned
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      return `Conversation ${conversationId} not found`;
    }
    if (conversation.userId !== socket.userId) {
      return 'You do not have access to this conversation';
    }

    // Message content required
    if (!payload.message || typeof payload.message !== 'string') {
      return 'Message content is required';
    }

    const trimmed = payload.message.trim();
    if (trimmed.length === 0) {
      return 'Message cannot be empty';
    }

    return null; // Valid
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('MessageHandler', () => {
  describe('validateSendMessage', () => {
    it('should pass valid request', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockChatContext.rateLimiter.check.mockReturnValue({ allowed: true });

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', message: 'Hello' },
        mockChatContext
      );

      expect(result).toBeNull();
    });

    it('should reject unauthenticated user', async () => {
      mockSocket.userId = undefined;
      const result = await handler.validateSendMessage(mockSocket, {}, mockChatContext);
      expect(result).toContain('not authenticated');
    });

    it('should reject rate limited user', async () => {
      mockChatContext.rateLimiter.check.mockReturnValue({ allowed: false, retryAfter: 30 });
      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', message: 'Hello' },
        mockChatContext
      );
      expect(result).toContain('Rate limited');
    });

    it('should reject missing conversation ID', async () => {
      mockSocket.conversationId = undefined;
      const result = await handler.validateSendMessage(mockSocket, { message: 'Hello' }, mockChatContext);
      expect(result).toContain('No conversation ID');
    });

    it('should reject empty message', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockChatContext.rateLimiter.check.mockReturnValue({ allowed: true });

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', message: '   ' },
        mockChatContext
      );
      expect(result).toContain('empty');
    });
  });
});
```

---

## Definition of Done

- [ ] MessageHandler created
- [ ] validateSendMessage implemented
- [ ] Unit tests passing
