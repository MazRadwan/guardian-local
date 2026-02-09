# Sprint 1: Extract Validation → SendMessageValidator

**Epic:** 36 - MessageHandler Final Decomposition
**Stories:** 36.1.1 - 36.1.3 (3 stories)
**Agent:** `backend-agent`
**Risk:** MEDIUM

---

## Objective

Extract the 4 validation methods + 3 validation types from MessageHandler.ts into `SendMessageValidator` service. Wire into ChatServer. Zero behavioral change.

**MessageHandler LOC after this sprint:** ~393 (723 → 393)

---

## Stories

| Story | Name | Dependencies |
|-------|------|--------------|
| 36.1.1 | Create shared types + SendMessageValidator service | None |
| 36.1.2 | Wire validator into ChatServer, remove from MessageHandler | 36.1.1 |
| 36.1.3 | Move tests, update imports, regression verification | 36.1.2 |

**Sequential execution** — each story depends on the previous.

---

## What Moves

```
FROM MessageHandler.ts:
├── Types (lines 52-97):
│   ├── SendMessagePayload         → types/SendMessage.ts
│   ├── ValidationError            → types/SendMessage.ts
│   └── SendMessageValidationResult → types/SendMessage.ts
│
├── Methods (lines 190-454):
│   ├── validateSendMessage()           → SendMessageValidator.ts
│   ├── validateAndEnrichAttachments()  → SendMessageValidator.ts (remove dead socket param)
│   ├── validateConversationOwnership() → SendMessageValidator.ts
│   └── waitForFileRecords()            → SendMessageValidator.ts (keep public)
│
└── Constructor deps (3 of 7):
    ├── ConversationService   → moves to validator
    ├── IFileRepository       → moves to validator
    └── RateLimiter           → moves to validator
```

## What Stays in MessageHandler (after this sprint)

```
MessageHandler.ts (~393 LOC):
├── StreamingResult type        (stays — streaming concern)
├── StreamingOptions type       (stays — streaming concern)
├── Constructor (4 params):     claudeClient, conversationService*, fileContextBuilder, consultToolLoopService
├── buildFileContext()          (~61 LOC)
└── streamClaudeResponse()     (~204 LOC)

* ConversationService stays because streamClaudeResponse uses it to save messages
```

## Critical Behaviors to Preserve

1. **`emitFileProcessingError` return shape** — `{ valid: false, emitFileProcessingError: true, missingFileIds: [...], conversationId, error }` — ChatServer branches on this at line 242
2. **Rate limiter single-call** — `isRateLimited()` increments counter. Must be called once per request, only in the validator.
3. **3-layer security model** — file exists → file in conversation → user owns file → replace client metadata
4. **`conversationId` from payload** — never socket. Security decision.
5. **`waitForFileRecords` public** — 9 tests call it directly
6. **Timing logs** — `[TIMING] MessageHandler validateSendMessage` → update to `[TIMING] SendMessageValidator validateSendMessage`

## ChatServer Wiring Change

```typescript
// BEFORE
const validation = await this.messageHandler.validateSendMessage(socket as IAuthenticatedSocket, payload);

// AFTER
const validation = await this.validator.validateSendMessage(socket as IAuthenticatedSocket, payload);
```

Error handling block (lines 240-251) stays EXACTLY as-is — same field checks, same event emissions.

---

## Exit Criteria

- [ ] `types/SendMessage.ts` exists with 3 validation types
- [ ] `SendMessageValidator.ts` exists with 4 methods, under 300 LOC
- [ ] ChatServer calls `this.validator.validateSendMessage()` directly
- [ ] Validation methods removed from MessageHandler
- [ ] 3 constructor params removed from MessageHandler (ConversationService stays for streaming)
- [ ] All existing tests pass (zero regressions)
- [ ] Validation tests moved to new test file with updated imports
- [ ] Log prefixes updated: `[SendMessageValidator]`
- [ ] Browser QA: consult text message
- [ ] Browser QA: consult file upload without text
- [ ] Browser QA: assessment file upload
- [ ] Browser QA: scoring file upload (bypass)
