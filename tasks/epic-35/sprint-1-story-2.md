# Story 35.1.2: Wire TitleUpdateService into ChatServer, Remove from MessageHandler

## Description

Wire the new `TitleUpdateService` into ChatServer and remove title generation methods and dependencies from MessageHandler. ChatServer already calls these methods — this removes the indirection through MessageHandler.

This is the riskiest story in the epic: it touches the orchestrator (ChatServer) and modifies MessageHandler's constructor signature, which breaks test mocks.

## Acceptance Criteria

- [ ] `TitleUpdateService` created in ChatServer constructor
- [ ] `private readonly titleUpdateService` stored on ChatServer
- [ ] ChatServer line 267 calls `this.titleUpdateService.updateScoringTitle()` instead of `this.messageHandler.updateScoringTitle()`
- [ ] ChatServer line 323 calls `this.titleUpdateService.generateTitleIfNeeded()` instead of `this.messageHandler.generateTitleIfNeeded()`
- [ ] `titleGenerationService` removed from MessageHandler constructor call in ChatServer
- [ ] `generateTitleIfNeeded()` method removed from MessageHandler
- [ ] `updateScoringTitle()` method removed from MessageHandler
- [ ] `ITitleGenerationService` import removed from MessageHandler
- [ ] `TitleContext` import removed from MessageHandler
- [ ] `isPlaceholderTitle` import removed from MessageHandler
- [ ] All test mocks updated for new MessageHandler constructor signature (9 params instead of 10)
- [ ] All existing tests pass (zero regressions)

## Technical Approach

### 1. Update ChatServer constructor

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

Add import:
```typescript
import { TitleUpdateService } from './services/TitleUpdateService.js';
```

Add private field:
```typescript
private readonly titleUpdateService: TitleUpdateService;
```

In constructor, after `consultToolLoopService` creation (~line 152):
```typescript
// Epic 35: Create TitleUpdateService for title generation (extracted from MessageHandler)
this.titleUpdateService = new TitleUpdateService(
  conversationService,
  titleGenerationService
);
```

### 2. Update ChatServer call sites

**Line 267** (scoring mode title):
```typescript
// BEFORE
if (enrichedAttachments![0]?.filename) await this.messageHandler.updateScoringTitle(socket as IAuthenticatedSocket, conversationId!, enrichedAttachments![0].filename);

// AFTER
if (enrichedAttachments![0]?.filename) await this.titleUpdateService.updateScoringTitle(socket as IAuthenticatedSocket, conversationId!, enrichedAttachments![0].filename);
```

**Line 323** (post-streaming title gen):
```typescript
// BEFORE
this.messageHandler.generateTitleIfNeeded(socket as IAuthenticatedSocket, conversationId!, mode, result.fullResponse).catch(e => console.error('[ChatServer] Title generation failed:', e));

// AFTER
this.titleUpdateService.generateTitleIfNeeded(socket as IAuthenticatedSocket, conversationId!, mode, result.fullResponse).catch(e => console.error('[ChatServer] Title generation failed:', e));
```

### 3. Remove titleGenerationService from MessageHandler constructor call

**ChatServer line 158** (MessageHandler instantiation):
```typescript
// BEFORE (10 params)
this.messageHandler = new MessageHandler(
  conversationService, fileRepository, rateLimiter, fileContextBuilder, claudeClient,
  fileStorage, intakeParser, titleGenerationService, this.toolRegistry, consultToolLoopService
);

// AFTER (9 params - titleGenerationService removed)
this.messageHandler = new MessageHandler(
  conversationService, fileRepository, rateLimiter, fileContextBuilder, claudeClient,
  fileStorage, intakeParser, this.toolRegistry, consultToolLoopService
);
```

### 4. Remove title code from MessageHandler

**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`

Remove these imports (lines 42-44):
```typescript
import type { ITitleGenerationService } from '../../../application/interfaces/ITitleGenerationService.js';
import type { TitleContext } from '../../../application/services/TitleGenerationService.js';
import { isPlaceholderTitle } from '../../../application/services/TitleGenerationService.js';
```

Remove `titleGenerationService` from constructor parameter list (8th parameter becomes `toolUseRegistry`).

Update constructor to match new 9-param signature.

Remove methods:
- `generateTitleIfNeeded()` (lines 1040-1141, ~100 LOC)
- `updateScoringTitle()` (lines 1282-1318, ~37 LOC)

### 5. Update test mocks for MessageHandler constructor

**CRITICAL:** MessageHandler constructor changes from 10 to 9 params. All test files that create `new MessageHandler(...)` need the `titleGenerationService` parameter removed.

**Files to update (only those that instantiate MessageHandler with full 10-arg signature):**
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`

**Pattern:** In each test, find the `new MessageHandler(...)` call and remove the 8th positional argument (which was `titleGenerationService` or its mock). The `toolUseRegistry` and `consultToolLoopService` shift from positions 9,10 to 8,9.

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - MODIFY: Add TitleUpdateService, change call sites, remove from MessageHandler params
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - MODIFY: Remove title methods, imports, constructor param (~140 LOC removed)
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts` - MODIFY: Update mock constructor (10-arg → 9-arg)
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts` - MODIFY: Update mock constructor (10-arg → 9-arg)
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts` - MODIFY: Update mock constructor (10-arg → 9-arg)
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts` - MODIFY: Update mock constructor (10-arg → 9-arg)

## Tests Affected

Existing tests that will break from constructor signature change (only those that instantiate MessageHandler with full 10-arg signature):
- `MessageHandler.toolLoop.test.ts` - Creates MessageHandler with 10 params, needs 9
- `MessageHandler.assistantDoneGating.test.ts` - Same
- `MessageHandler.assistantDoneGating.abort.test.ts` - Same
- `MessageHandler.assistantDoneGating.edgeCases.test.ts` - Same

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] All 4 affected test files updated and passing
- [ ] `pnpm --filter @guardian/backend test:unit` passes with zero failures

## Definition of Done

- [ ] ChatServer creates and uses TitleUpdateService
- [ ] MessageHandler has no title-related code
- [ ] MessageHandler constructor is 9 params (down from 10)
- [ ] All 4 test mock files updated
- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Net ~140 LOC removed from MessageHandler
