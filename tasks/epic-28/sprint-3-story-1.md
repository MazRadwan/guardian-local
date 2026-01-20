# Story 28.5.1: Extract ConversationHandler.ts (get_conversations)

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create ConversationHandler and implement `handleGetConversations()` to list user's conversations.

---

## Acceptance Criteria

- [ ] `ConversationHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] `handleGetConversations()` implemented
- [ ] Returns conversations with titles and metadata
- [ ] Auth check preserved
- [ ] Unit tests cover success and auth failure

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/ConversationHandler.ts

import { ConversationService } from '../../../application/services/ConversationService';
import { IAuthenticatedSocket, ChatContext } from '../ChatContext';
import { sanitizeErrorForClient } from '../../../utils/sanitize';

export class ConversationHandler {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  async handleGetConversations(socket: IAuthenticatedSocket): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', {
          event: 'get_conversations',
          message: 'User not authenticated',
        });
        return;
      }

      console.log(`[ConversationHandler] Fetching conversations for user ${socket.userId}`);

      const conversations = await this.conversationService.getUserConversations(socket.userId);

      const conversationsWithMetadata = await Promise.all(
        conversations.map(async (conv) => {
          const title = await this.conversationService.getConversationTitle(conv.id);
          return {
            id: conv.id,
            title,
            createdAt: conv.startedAt,
            updatedAt: conv.lastActivityAt,
            mode: conv.mode,
          };
        })
      );

      socket.emit('conversations_list', { conversations: conversationsWithMetadata });
    } catch (error) {
      console.error('[ConversationHandler] Error fetching conversations:', error);
      socket.emit('error', {
        event: 'get_conversations',
        message: sanitizeErrorForClient(error, 'Failed to fetch conversations'),
      });
    }
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ConversationHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ConversationHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('ConversationHandler', () => {
  describe('handleGetConversations', () => {
    it('should return user conversations', async () => {
      mockConversationService.getUserConversations.mockResolvedValue([
        { id: 'conv-1', mode: 'consult', startedAt: new Date(), lastActivityAt: new Date() },
      ]);
      mockConversationService.getConversationTitle.mockResolvedValue('Test Chat');

      await handler.handleGetConversations(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('conversations_list', {
        conversations: expect.arrayContaining([
          expect.objectContaining({ id: 'conv-1', title: 'Test Chat' }),
        ]),
      });
    });

    it('should emit error if not authenticated', async () => {
      const unauthSocket = { ...mockSocket, userId: undefined };
      await handler.handleGetConversations(unauthSocket as any);

      expect(unauthSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'get_conversations',
      }));
    });
  });
});
```

---

## Definition of Done

- [ ] ConversationHandler created
- [ ] handleGetConversations implemented
- [ ] Unit tests passing
