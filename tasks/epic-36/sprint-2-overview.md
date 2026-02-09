# Sprint 2: Extract Streaming → ClaudeStreamingService

**Epic:** 36 - MessageHandler Final Decomposition
**Stories:** 36.2.1 - 36.2.3 (3 stories)
**Agent:** `backend-agent`
**Risk:** HIGH
**Prerequisite:** Sprint 1 complete

---

## Objective

Extract `streamClaudeResponse()` + streaming types from MessageHandler into `ClaudeStreamingService`. After this sprint, MessageHandler contains only `buildFileContext()` (~61 LOC).

**MessageHandler LOC after this sprint:** ~160 (393 → 160)

---

## Stories

| Story | Name | Dependencies |
|-------|------|--------------|
| 36.2.1 | Create ClaudeStreamingService + move streaming types to shared types file | Sprint 1 complete |
| 36.2.2 | Wire service into ChatServer, remove from MessageHandler | 36.2.1 |
| 36.2.3 | Move tests, update imports, regression verification | 36.2.2 |

**Sequential execution.**

---

## What Moves

```
FROM MessageHandler.ts:
├── Types (move to types/SendMessage.ts):
│   ├── StreamingResult
│   └── StreamingOptions
│
├── Methods:
│   └── streamClaudeResponse()  → ClaudeStreamingService.ts
│
└── Constructor deps (3 of remaining 5):
    ├── IClaudeClient         → moves to streaming service
    ├── ConversationService   → shared (validator + streaming both need it)
    └── IConsultToolLoopService → moves to streaming service
```

## HIGH Risk Items (from Codex review)

1. **Tool loop double-dispatch prevention** — `streamClaudeResponse` returns empty `toolUseBlocks` when ConsultToolLoopService handles tools. If this breaks, ChatServer dispatches tools twice via `toolRegistry.dispatch()`.
2. **Abort semantics** — save partial response on abort + suppress `assistant_done`. Both must stay coupled.
3. **Streaming error recovery** — saves system error message to DB and emits to client. This is recovery behavior, not just logging.
4. **`assistant_stream_start` event** — emitted before streaming begins. Must stay in streaming service.

## Critical Behaviors to Preserve

1. `assistant_stream_start` emitted before streaming begins
2. `assistant_token` emitted per chunk during streaming
3. `assistant_done` emitted after streaming UNLESS abort
4. Partial response saved to DB even on abort
5. Tool loop gating: ALL 5 conditions must be true
6. Empty `toolUseBlocks` returned when tool loop handles internally
7. System error message saved to DB on Claude API failure
8. `stopReason` passed through in `StreamingResult`

## Browser QA Required

- [ ] Consult text message — response streams token by token
- [ ] Consult web search — tool loop triggers, results stream
- [ ] Consult stop button — partial response saved, no `assistant_done`
- [ ] Assessment message — tools enabled, response streams
- [ ] Regenerate — clean context, new response

---

