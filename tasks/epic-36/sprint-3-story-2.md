# Story 36.3.2: Wire Orchestrator into ChatServer, Delete MessageHandler

## Description

Wire `SendMessageOrchestrator` into ChatServer, replace `handleSendMessage()` with a one-line delegation, delete MessageHandler.ts, and move remaining `buildFileContext` tests.

## Acceptance Criteria

- [ ] ChatServer creates `SendMessageOrchestrator` in constructor
- [ ] ChatServer `send_message` handler delegates to `this.orchestrator.execute(socket, payload)`
- [ ] `handleSendMessage()` method REMOVED from ChatServer
- [ ] `MessageHandler` class no longer instantiated in ChatServer
- [ ] `MessageHandler.ts` file DELETED
- [ ] `buildFileContext` tests moved from MessageHandler.test.ts → `SendMessageOrchestrator.test.ts` (wrapper logic belongs with orchestrator)
- [ ] ChatServer imports cleaned up (no more MessageHandler import)
- [ ] ChatServer under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. ChatServer constructor — create orchestrator

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

Add import:
```typescript
import { SendMessageOrchestrator, type SendMessageOrchestratorDeps } from './services/SendMessageOrchestrator.js';
```

Remove:
```typescript
// DELETE this import
import { MessageHandler } from './handlers/MessageHandler.js';
```

In constructor, replace MessageHandler creation with orchestrator:
```typescript
// DELETE:
this.messageHandler = new MessageHandler(conversationService, fileContextBuilder);

// ADD:
const orchestratorDeps: SendMessageOrchestratorDeps = {
  validator: this.validator,
  streamingService: this.streamingService,
  conversationService,
  contextBuilder: this.contextBuilder,
  fileContextBuilder,
  scoringHandler: this.scoringHandler,
  toolRegistry: this.toolRegistry,
  titleUpdateService: this.titleUpdateService,
  backgroundEnrichmentService: this.backgroundEnrichmentService,
  webSearchEnabled: this.webSearchEnabled,
};
this.orchestrator = new SendMessageOrchestrator(orchestratorDeps);
```

### 2. Replace handleSendMessage with delegation

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

```typescript
// BEFORE (lines 195-201):
socket.on('send_message', async (payload: SendMessagePayload) => {
  try {
    await this.handleSendMessage(socket, payload);
  } catch (error) {
    console.error('[ChatServer] Error sending message:', error);
    socket.emit('error', { event: 'send_message', message: sanitizeErrorForClient(error, 'Failed to send message') });
  }
});

// AFTER:
socket.on('send_message', async (payload: SendMessagePayload) => {
  try {
    await this.orchestrator.execute(socket as IAuthenticatedSocket, payload);
  } catch (error) {
    console.error('[ChatServer] Error sending message:', error);
    socket.emit('error', { event: 'send_message', message: sanitizeErrorForClient(error, 'Failed to send message') });
  }
});
```

**CRITICAL:** Keep the try/catch wrapper in ChatServer. The orchestrator may throw on unexpected errors. The top-level error handler stays as the safety net.

### 3. Remove from ChatServer

- Delete `private handleSendMessage()` method (lines 237-345, ~108 LOC)
- Delete `private readonly messageHandler: MessageHandler` field
- Remove `MessageHandler` import
- Remove `FileContextBuilder` from ChatServer's local usage (it's now only in orchestrator deps)

### 4. Delete MessageHandler.ts

**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` — DELETE

After Sprint 1 (validation extracted) and Sprint 2 (streaming extracted), MessageHandler only contains `buildFileContext()` (~61 LOC) which is now inlined into the orchestrator.

### 5. Move buildFileContext tests

**File:** `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts`

After Sprint 1 removed validation tests and Sprint 2 removed streaming tests, only `describe('buildFileContext')` remains (~20 tests).

These tests verify:
- No FileContextBuilder → empty result
- No attachments → all conversation files (passes `undefined` for scopeToFileIds)
- Empty attachments → all conversation files (passes `undefined`)
- Mode gating for Vision API (consult + assessment only, not scoring)
- Error handling

**IMPORTANT:** Original tests for "specific attachments → scoped file IDs" must be ADAPTED, not moved as-is. The orchestrator always passes `undefined` for `scopeToFileIds` (ALL conversation files). Test should verify that even with attachments present, `undefined` is passed — not scoped IDs.

**Move to:** `packages/backend/__tests__/unit/infrastructure/websocket/services/SendMessageOrchestrator.test.ts`

These tests verify wrapper logic (null-builder handling, mode gating, always-undefined scoping) which is now inlined in the orchestrator. They belong with the orchestrator tests, not FileContextBuilder tests.

After moving tests, DELETE `MessageHandler.test.ts`.

### 6. Clean up ChatServer.attachmentValidation.test.ts

**File:** `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`

This test creates a full ChatServer. After this story, ChatServer no longer has MessageHandler. Verify:
- The test still passes (ChatServer internally creates orchestrator which creates validator)
- No direct references to MessageHandler in the test
- The test exercises the full send_message flow, which now goes through orchestrator

### 7. Expected ChatServer after cleanup (~180 LOC)

```
ChatServer.ts:
├── Imports (~20 lines)
├── Interface + type defs (~10 lines)
├── Class declaration + fields (~15 lines)
├── Constructor: dependency wiring (~60 lines)
├── startCleanupInterval() (~7 lines)
├── setupNamespace(): event routing (~45 lines)
│   ├── send_message → orchestrator.execute()
│   ├── get_history, get_conversations, etc → conversationHandler
│   ├── switch_mode → modeSwitchHandler
│   ├── vendor_selected → scoringHandler
│   ├── generate_questionnaire → questionnaireHandler
│   ├── abort_stream → inline (3 lines)
│   └── disconnect → connectionHandler
├── emitToConversation() (~3 lines)
└── streamMessage() (~3 lines)
```

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - MODIFY (major: remove handleSendMessage, wire orchestrator)
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - DELETE
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - DELETE (after moving remaining tests)
- `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts` - VERIFY (may need minor updates)

## Agent Assignment

- [x] backend-agent

## Tests Required

TypeScript compilation + existing tests must pass. New orchestrator tests in Story 36.3.3.

## Definition of Done

- [ ] Orchestrator wired into ChatServer
- [ ] handleSendMessage removed from ChatServer
- [ ] MessageHandler.ts DELETED
- [ ] MessageHandler.test.ts DELETED (tests moved)
- [ ] buildFileContext tests moved to appropriate home
- [ ] ChatServer under 300 LOC
- [ ] TypeScript compiles
- [ ] No orphaned imports or dead references
