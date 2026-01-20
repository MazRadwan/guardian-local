# Story 28.5.5: Update ChatServer to delegate conversation events

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Medium (1 file)

---

## Description

Update ChatServer to use ConversationHandler for all conversation-related events. Remove the extracted code from ChatServer.

---

## Acceptance Criteria

- [ ] ChatServer creates ConversationHandler in constructor
- [ ] `get_conversations` event delegates to handler
- [ ] `start_new_conversation` event delegates to handler
- [ ] `delete_conversation` event delegates to handler
- [ ] `get_history` event delegates to handler
- [ ] All inline conversation code removed from ChatServer
- [ ] All existing tests pass

---

## Technical Approach

1. Add import:
```typescript
import { ConversationHandler } from './handlers/ConversationHandler';
```

2. Add property and initialize:
```typescript
private readonly conversationHandler: ConversationHandler;

constructor(...) {
  // ...
  this.conversationHandler = new ConversationHandler(this.conversationService);
}
```

3. Update event handlers in setupNamespace():
```typescript
socket.on('get_conversations', async () => {
  await this.conversationHandler.handleGetConversations(socket as IAuthenticatedSocket);
});

socket.on('start_new_conversation', async (payload) => {
  await this.conversationHandler.handleStartNewConversation(
    socket as IAuthenticatedSocket,
    payload,
    this.chatContext
  );
});

socket.on('delete_conversation', async (payload) => {
  await this.conversationHandler.handleDeleteConversation(
    socket as IAuthenticatedSocket,
    payload
  );
});

socket.on('get_history', async (payload) => {
  await this.conversationHandler.handleGetHistory(
    socket as IAuthenticatedSocket,
    payload
  );
});
```

4. Remove from ChatServer:
- `handleGetConversations()` inline code
- `handleStartNewConversation()` inline code
- `handleDeleteConversation()` inline code
- `handleGetHistory()` inline code
- Any duplicate ownership validation code

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to ConversationHandler

---

## Tests Required

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] ConversationHandler integrated into ChatServer
- [ ] All conversation events delegated
- [ ] All inline code removed
- [ ] All 13 existing ChatServer tests pass
- [ ] TypeScript compiles without errors
