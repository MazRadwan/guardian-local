# Story 28.3.3: Refactor ChatServer to use ChatContext object

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Refactor ChatServer to use the new `ChatContext` object instead of individual class properties. This prepares for handler extraction by formalizing the shared state that will be passed to handlers.

---

## Acceptance Criteria

- [ ] ChatServer creates ChatContext in constructor using `createChatContext()`
- [ ] `pendingConversationCreations` Map moved to ChatContext
- [ ] `abortedStreams` Set moved to ChatContext
- [ ] All references updated to use `this.chatContext.*`
- [ ] No behavioral changes
- [ ] All existing tests pass

---

## Technical Approach

1. Add import:
```typescript
import { ChatContext, createChatContext } from './ChatContext';
```

2. Replace individual properties:
```typescript
// Before:
private pendingConversationCreations = new Map<string, { conversationId: string; timestamp: number }>();
private abortedStreams = new Set<string>();

// After:
private readonly chatContext: ChatContext;
```

3. Initialize in constructor:
```typescript
constructor(...) {
  // ...existing initialization...
  this.chatContext = createChatContext(this.rateLimiter, this.promptCacheManager);
}
```

4. Update all references:
```typescript
// Before:
this.pendingConversationCreations.get(userId)
this.abortedStreams.has(conversationId)

// After:
this.chatContext.pendingCreations.get(userId)
this.chatContext.abortedStreams.has(conversationId)
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Use ChatContext

---

## Tests Required

No new tests - existing tests verify behavior is preserved.

```bash
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] ChatContext created in constructor
- [ ] All Map/Set references updated
- [ ] All 13 existing ChatServer tests pass
- [ ] No behavioral changes
