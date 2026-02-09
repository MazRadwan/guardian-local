# Epic 36: MessageHandler Final Decomposition

## Goal

Decompose MessageHandler.ts (723 LOC) into properly separated services and extract the `handleSendMessage` orchestration from ChatServer (357 LOC). End state: every file under 300 LOC, controllers control, services serve.

This is the final decomposition epic. After completion, MessageHandler.ts is deleted.

## Problem Statement

MessageHandler.ts contains 3 services disguised as controller methods:
1. **Validation** (~280 LOC) — payload validation, auth, rate limiting, attachment enrichment
2. **Streaming** (~204 LOC) — Claude streaming with abort handling and tool loop delegation
3. **File context building** (~61 LOC) — thin delegation to FileContextBuilder

ChatServer.ts (357 LOC, also over limit) contains `handleSendMessage()` — a 108-line, 7-step orchestration pipeline that should be its own service.

Previous epics extracted the easy modules (tool loop, title gen, enrichment, mode routing). What remains has cross-mode bindings, security protocols, and optimized features from multiple refactor cycles.

## Scope - EXPLICIT BOUNDARIES

**IN SCOPE (this epic):**
- Sprint 1: Extract validation → `SendMessageValidator`
- Sprint 2: Extract streaming → `ClaudeStreamingService`
- Sprint 3: Extract orchestration → `SendMessageOrchestrator`, delete MessageHandler

**OUT OF SCOPE (do NOT touch):**
- `ConsultToolLoopService` — DO NOT MODIFY
- `BackgroundEnrichmentService` — DO NOT MODIFY
- `TitleUpdateService` — DO NOT MODIFY
- `ScoringHandler` — DO NOT MODIFY (but orchestrator calls it)
- `QuestionnaireHandler` — DO NOT MODIFY
- `FileContextBuilder` — DO NOT MODIFY
- Frontend code — DO NOT TOUCH
- Database schema — DO NOT TOUCH

## Context from Deep Audit + Codex Review

### Cross-Mode Binding Table (CRITICAL)

| Behavior | Consult | Assessment | Scoring |
|----------|---------|------------|---------|
| Validation (full pipeline) | Yes | Yes | Yes |
| File context + Vision API | Yes | Yes | No (bypasses Claude) |
| Claude streaming | Yes | Yes | No (bypassClaude) |
| Tool loop (web_search) | Yes (5-condition gate) | No | No |
| Tool dispatch (questionnaire_ready) | No | Yes | No |
| Background enrichment | No | Yes | No |
| Scoring bypass | No | No | Yes (early return) |
| Title generation | Claude-based | Claude-based | Filename-based |

Every extraction must be tested against ALL three mode paths.

### Traps to Avoid (from audit + Codex review)

1. **Rate limiter side effect** — `isRateLimited()` increments counter. Must be called ONCE per request. If validator and orchestrator both call it = double-count.
2. **File context scoping** — ChatServer passes `undefined` for attachments (loads ALL conversation files). Do NOT accidentally pass `enrichedAttachments` — that limits Claude to only just-attached files.
3. **`emitFileProcessingError` protocol** — 4-layer signaling chain: `waitForFileRecords` → `validateAndEnrichAttachments` → `validateSendMessage` → ChatServer error branch. Return shape must be preserved exactly.
4. **Tool loop double-dispatch** — `streamClaudeResponse` returns empty `toolUseBlocks` when tool loop handles internally. If this breaks, ChatServer dispatches tools twice.
5. **Abort semantics** — Save partial response on abort BUT suppress `assistant_done`. Both behaviors must stay coupled in the streaming service.
6. **Scoring bypass early return** — Prevents steps 5-7 from executing. If orchestrator sequencing changes, scoring could fall through into streaming.
7. **`conversationId` from payload not socket** — Explicit security decision. Never fall back to `socket.conversationId`.
8. **Log prefixes** — Update from `[MessageHandler]` to new service names. Fix test assertions that match log strings.

### Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Types location | Shared `types/SendMessage.ts` | Prevents circular deps, ChatServer imports types without importing services |
| Log prefixes | Update to new class names | 10 min find-replace vs ongoing confusion in prod |
| buildFileContext fate | Inline into orchestrator | Thin wrapper, ChatServer calls `FileContextBuilder.buildWithImages()` directly |
| Duplicate `validateConversationOwnership` | Leave QuestionnaireHandler's copy as-is | Different error messages + security logging, consolidation risks behavior change |
| Dead `socket` param | Remove from `validateAndEnrichAttachments` during move | Cleanup opportunity, zero risk |
| `waitForFileRecords` visibility | Keep public on validator | 9 direct test calls, public API preserves test coverage |

## Success Criteria

- [ ] MessageHandler.ts DELETED
- [ ] ChatServer.ts under 300 LOC (event routing only)
- [ ] `SendMessageValidator.ts` under 300 LOC
- [ ] `ClaudeStreamingService.ts` under 300 LOC
- [ ] `SendMessageOrchestrator.ts` under 300 LOC
- [ ] `types/SendMessage.ts` created with shared types
- [ ] All 2053+ unit tests pass
- [ ] All integration tests pass
- [ ] Browser QA: consult text message
- [ ] Browser QA: consult file upload (no text)
- [ ] Browser QA: consult web search triggers
- [ ] Browser QA: consult stop button (abort)
- [ ] Browser QA: assessment file upload + enrichment
- [ ] Browser QA: scoring file upload + bypass
- [ ] Browser QA: regenerate in consult mode
- [ ] Browser QA: rate limiting error

## Sprints

| Sprint | Focus | Stories | Risk |
|--------|-------|---------|------|
| Sprint 1 | Extract validation → SendMessageValidator | 36.1.1 - 36.1.3 | MEDIUM |
| Sprint 2 | Extract streaming → ClaudeStreamingService | 36.2.1 - 36.2.3 | HIGH |
| Sprint 3 | Extract orchestration → SendMessageOrchestrator | 36.3.1 - 36.3.3 | MEDIUM |

**Total Stories:** 9
**Sequential execution:** Each sprint depends on the previous. Do NOT parallelize sprints.

## Architecture — End State

```
ChatServer.ts (~180 LOC) — Event routing only
  │
  └── socket.on('send_message') → this.orchestrator.execute(socket, payload)

SendMessageOrchestrator.ts (~150 LOC) — Pipeline orchestration
  │
  ├── Step 1: this.validator.validateSendMessage(socket, payload)
  ├── Step 2: Save user message + emit message_sent
  ├── Step 3: this.contextBuilder.build(conversationId)
  ├── Step 4: IF scoring → this.scoringHandler.triggerScoringOnSend() → RETURN
  ├── Step 5: this.fileContextBuilder.buildWithImages(conversationId, undefined, { mode })
  ├── Step 6: this.streamingService.streamClaudeResponse(socket, ...)
  └── Step 7: Post-streaming (tool dispatch, enrichment, title)

SendMessageValidator.ts (~250 LOC) — Validation service
  ├── validateSendMessage()
  ├── validateAndEnrichAttachments()
  ├── validateConversationOwnership()
  └── waitForFileRecords()

ClaudeStreamingService.ts (~250 LOC) — Streaming service
  └── streamClaudeResponse()

types/SendMessage.ts (~90 LOC) — Shared types
  ├── SendMessagePayload
  ├── ValidationError
  ├── SendMessageValidationResult
  ├── StreamingResult
  └── StreamingOptions
```

## Files Touched (All Sprints)

**CREATE:**
- `packages/backend/src/infrastructure/websocket/types/SendMessage.ts`
- `packages/backend/src/infrastructure/websocket/services/SendMessageValidator.ts`
- `packages/backend/src/infrastructure/websocket/services/ClaudeStreamingService.ts`
- `packages/backend/src/infrastructure/websocket/services/SendMessageOrchestrator.ts`

**DELETE:**
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`

**MODIFY:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`

**TEST FILES (import updates):**
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` — split/renamed
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`
- `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`

**VERIFY (must still pass, no modifications):**
- `packages/backend/__tests__/integration/attachment-flow.test.ts`
- `packages/backend/__tests__/e2e/websocket-chat.test.ts`

## References

- `tasks/messagehandler-decomposition.md` — Master decomposition tracking doc
- Codex review: confirmed plan, flagged file_processing_error protocol + tool loop double-dispatch + abort semantics as HIGH risk
- Confidence score: 0.92 (8% risk = human error on file context scoping or log assertions)
