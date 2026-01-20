# Story 28.2.3: Update ChatServer to use context builders

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Update ChatServer.ts to instantiate and use the newly created `ConversationContextBuilder` and `FileContextBuilder` classes. Remove the now-duplicate private methods. Also integrate `StreamingHandler`.

---

## Acceptance Criteria

- [ ] ChatServer creates ConversationContextBuilder in constructor
- [ ] ChatServer creates FileContextBuilder in constructor
- [ ] ChatServer creates StreamingHandler in constructor
- [ ] All private `build*Context` methods removed from ChatServer
- [ ] All private streaming methods removed from ChatServer
- [ ] All 13 existing ChatServer tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass

---

## Technical Approach

1. Add imports at top of ChatServer.ts:
```typescript
import { ConversationContextBuilder } from './context/ConversationContextBuilder';
import { FileContextBuilder } from './context/FileContextBuilder';
import { StreamingHandler } from './StreamingHandler';
```

2. Add class properties:
```typescript
private readonly contextBuilder: ConversationContextBuilder;
private readonly fileContextBuilder: FileContextBuilder;
private readonly streamingHandler: StreamingHandler;
```

3. Initialize in constructor:
```typescript
constructor(...existing deps...) {
  // ...existing initialization...

  // Create context builders
  this.contextBuilder = new ConversationContextBuilder(
    this.conversationService,
    this.promptCacheManager
  );
  this.fileContextBuilder = new FileContextBuilder(
    this.fileRepository,
    this.fileStorage,
    this.textExtractionService
  );
  this.streamingHandler = new StreamingHandler();
}
```

4. Update call sites:
```typescript
// Before:
const { messages, systemPrompt, promptCache, mode } = await this.buildConversationContext(conversationId);
const fileContext = await this.buildFileContext(conversationId);

// After:
const { messages, systemPrompt, promptCache, mode } = await this.contextBuilder.build(conversationId);
const fileContext = await this.fileContextBuilder.build(conversationId);
```

5. Update streaming:
```typescript
// Before:
await this.streamMarkdownToSocket(socket, markdown, conversationId);

// After:
await this.streamingHandler.streamToSocket(
  socket,
  markdown,
  conversationId,
  () => this.abortedStreams.has(conversationId),
  () => {
    this.abortedStreams.delete(conversationId);
    socket.emit('assistant_aborted', { conversationId });
  }
);
```

6. Delete private methods:
- `buildConversationContext()`
- `formatMessagesForClaude()`
- `getSystemPromptForMode()`
- `buildFileContext()`
- `formatIntakeContextFile()`
- `formatTextExcerptFile()`
- `extractExcerptFromStorage()`
- `streamMarkdownToSocket()`
- `chunkMarkdown()`
- `sleep()`

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Integrate builders, remove duplicate methods

---

## Tests Required

No new tests - existing ChatServer tests verify behavior is preserved.

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] Context builders integrated into ChatServer
- [ ] StreamingHandler integrated into ChatServer
- [ ] All duplicate methods removed from ChatServer
- [ ] All 13 existing ChatServer tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] ChatServer.ts reduced by ~400-500 lines
