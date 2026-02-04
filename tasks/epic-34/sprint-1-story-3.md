# Story 34.1.3: Wire Service into MessageHandler

## Description

Wire `ConsultToolLoopService` into MessageHandler and ChatServer. Remove the old inline methods from MessageHandler and replace with service call.

## Acceptance Criteria

- [ ] MessageHandler constructor accepts `IConsultToolLoopService` parameter
- [ ] ChatServer instantiates `ConsultToolLoopService` and passes to MessageHandler
- [ ] `executeConsultToolLoop()` method REMOVED from MessageHandler
- [ ] `buildAugmentedMessages()` method REMOVED from MessageHandler
- [ ] `MAX_TOOL_ITERATIONS` constant REMOVED from MessageHandler
- [ ] Call site in `streamClaudeResponse()` updated to use service
- [ ] All existing tests still pass

## Technical Approach

### Step 1: Update MessageHandler Constructor

```typescript
// MessageHandler.ts - Add to constructor parameters

constructor(
  // ... existing parameters ...
  private readonly titleGenerationService?: ITitleGenerationService,
  private readonly toolRegistry?: ToolUseRegistry,
  private readonly consultToolLoopService?: IConsultToolLoopService  // ADD THIS
) {}
```

### Step 2: Update Call Site in streamClaudeResponse()

Note: `streamClaudeResponse` signature is:
```typescript
streamClaudeResponse(socket, conversationId, messages, systemPrompt, options)
```

The `systemPrompt` is a separate parameter, not part of `options`.

Find the call to `executeConsultToolLoop()` (around line 807) and change:

```typescript
// BEFORE
const toolLoopResult = await this.executeConsultToolLoop(
  socket,
  conversationId,
  messages,
  fullResponse,
  toolUseBlocks,
  systemPrompt,  // separate parameter passed to streamClaudeResponse
  { tools: options.tools }
);

// AFTER
const toolLoopResult = await this.consultToolLoopService!.execute({
  socket,
  conversationId,
  originalMessages: messages,
  firstResponse: fullResponse,
  toolUseBlocks,
  systemPrompt,  // use the parameter directly, not options.systemPrompt
  claudeOptions: { tools: options.tools },
});
```

### Step 3: Remove Old Methods from MessageHandler

DELETE these sections:
- Line 72: `const MAX_TOOL_ITERATIONS = 3;`
- Lines 917-1172: `executeConsultToolLoop()` method
- Lines 1186-1222: `buildAugmentedMessages()` method

### Step 4: Update ChatServer to Inject Service

```typescript
// ChatServer.ts - In constructor, create service and pass to MessageHandler

import { ConsultToolLoopService } from '../../application/services/ConsultToolLoopService.js';

// Inside constructor:
const consultToolLoopService = new ConsultToolLoopService(
  claudeClient,
  this.toolRegistry,
  conversationService
);

this.messageHandler = new MessageHandler(
  conversationService,
  fileRepository,
  rateLimiter,
  fileContextBuilder,
  claudeClient,
  fileStorage,
  intakeParser,
  titleGenerationService,
  this.toolRegistry,
  consultToolLoopService  // ADD THIS
);
```

## CRITICAL: Only Modify These Sections

**MessageHandler.ts:**
- Constructor signature (add parameter)
- Call site in `streamClaudeResponse()` (change to service call)
- DELETE `MAX_TOOL_ITERATIONS`, `executeConsultToolLoop()`, `buildAugmentedMessages()`

**ChatServer.ts:**
- Constructor (instantiate and inject service)

**DO NOT MODIFY any other methods or files.**

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - MODIFY
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - MODIFY

**Test files requiring mock updates (add consultToolLoopService to constructor):**
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts`
- `packages/backend/__tests__/unit/ChatServer.toolStatus.test.ts`
- `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`

## Tests Required

Update mocks in all listed test files to include new `consultToolLoopService` constructor parameter. Mock can return a simple jest mock object since tool loop behavior is tested separately in Story 34.1.4.

## Agent Assignment

- [x] backend-agent

## Definition of Done

- [ ] MessageHandler accepts service via constructor
- [ ] ChatServer creates and injects service
- [ ] Old methods removed from MessageHandler (~300 lines removed)
- [ ] Call site uses service
- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] `pnpm test:unit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
