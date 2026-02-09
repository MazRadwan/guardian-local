# Story 36.1.2: Wire Validator into ChatServer, Remove from MessageHandler

## Description

Wire `SendMessageValidator` into ChatServer and remove validation methods + types from MessageHandler. This is the critical wiring story — after this, ChatServer calls the validator directly.

## Acceptance Criteria

- [ ] ChatServer creates `SendMessageValidator` in constructor
- [ ] ChatServer stores as `private readonly validator: SendMessageValidator`
- [ ] ChatServer line 239 calls `this.validator.validateSendMessage()` instead of `this.messageHandler.validateSendMessage()`
- [ ] ChatServer imports `SendMessagePayload` from `types/SendMessage.ts` (not MessageHandler)
- [ ] Error handling block (lines 240-251) UNCHANGED — same field checks, same event emissions
- [ ] `validateSendMessage()` removed from MessageHandler
- [ ] `validateAndEnrichAttachments()` removed from MessageHandler
- [ ] `validateConversationOwnership()` removed from MessageHandler
- [ ] `waitForFileRecords()` removed from MessageHandler
- [ ] `SendMessagePayload`, `ValidationError`, `SendMessageValidationResult` removed from MessageHandler
- [ ] MessageHandler constructor loses `IFileRepository` and `RateLimiter` params
- [ ] MessageHandler constructor KEEPS `ConversationService` (used by `streamClaudeResponse`)
- [ ] MessageHandler constructor KEEPS `ToolUseRegistry` (dead param — remove in Sprint 2, keeping now to minimize changes)
- [ ] `IFileRepository` and `RateLimiter` imports removed from MessageHandler
- [ ] No TypeScript errors

## Technical Approach

### 1. ChatServer constructor changes

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

Add import:
```typescript
import { SendMessageValidator } from './services/SendMessageValidator.js';
import type { SendMessagePayload } from './types/SendMessage.js';
```

Remove from existing import:
```typescript
// BEFORE
import { MessageHandler, type SendMessagePayload } from './handlers/MessageHandler.js';
// AFTER
import { MessageHandler } from './handlers/MessageHandler.js';
```

In constructor, create validator:
```typescript
this.validator = new SendMessageValidator(conversationService, fileRepository, rateLimiter);
```

Update MessageHandler instantiation (line 169-172) — remove `fileRepository` and `rateLimiter`:
```typescript
// BEFORE
this.messageHandler = new MessageHandler(
  conversationService, fileRepository, rateLimiter, fileContextBuilder, claudeClient,
  this.toolRegistry, consultToolLoopService
);

// AFTER
this.messageHandler = new MessageHandler(
  conversationService, fileContextBuilder, claudeClient,
  this.toolRegistry, consultToolLoopService
);
```

### 2. handleSendMessage wiring change

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts` line 239

```typescript
// BEFORE
const validation = await this.messageHandler.validateSendMessage(socket as IAuthenticatedSocket, payload);

// AFTER
const validation = await this.validator.validateSendMessage(socket as IAuthenticatedSocket, payload);
```

**CRITICAL:** Lines 240-251 (error handling with `emitFileProcessingError` branch) stay EXACTLY as-is. Do not touch.

### 3. Remove from MessageHandler

**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`

Remove:
- Lines 52-97: `SendMessagePayload`, `ValidationError`, `SendMessageValidationResult` type definitions
- Lines 190-302: `validateSendMessage()` method
- Lines 320-387: `validateAndEnrichAttachments()` method
- Lines 401-409: `validateConversationOwnership()` method
- Lines 422-454: `waitForFileRecords()` method
- Imports: `IFileRepository`, `RateLimiter`

Update constructor:
```typescript
// BEFORE (7 params)
constructor(
  private readonly conversationService: ConversationService,
  private readonly fileRepository: IFileRepository,
  private readonly rateLimiter: RateLimiter,
  private readonly fileContextBuilder?: FileContextBuilder,
  private readonly claudeClient?: IClaudeClient,
  private readonly toolRegistry?: ToolUseRegistry,
  private readonly consultToolLoopService?: IConsultToolLoopService
) {}

// AFTER (5 params — toolRegistry is dead but kept for now, removed in Sprint 2)
constructor(
  private readonly conversationService: ConversationService,
  private readonly fileContextBuilder?: FileContextBuilder,
  private readonly claudeClient?: IClaudeClient,
  private readonly toolRegistry?: ToolUseRegistry,
  private readonly consultToolLoopService?: IConsultToolLoopService
) {}
```

### 4. TRAPS

- **Do NOT modify ChatServer lines 240-251** (error handling) — same field destructuring, same event emissions
- **Do NOT modify ChatServer line 254** (`const { conversationId, messageText, enrichedAttachments } = validation`) — same destructuring from same return type
- **MessageHandler still needs ConversationService** — `streamClaudeResponse` uses it at lines 666 and 697 to save messages
- **ChatServer already has `conversationService`** — pass it to both validator and MessageHandler

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - MODIFY (import + constructor + wiring)
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - MODIFY (remove methods, types, constructor params)

## Agent Assignment

- [x] backend-agent

## Tests Required

TypeScript compilation must pass. Test updates are in Story 36.1.3.

## Definition of Done

- [ ] ChatServer creates and uses SendMessageValidator
- [ ] Validation methods + types removed from MessageHandler
- [ ] Constructor params updated
- [ ] TypeScript compiles with zero errors
- [ ] No logic changes anywhere — only code movement and wiring
