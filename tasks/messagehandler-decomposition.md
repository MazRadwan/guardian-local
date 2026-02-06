# MessageHandler Decomposition Plan

**Status:** Active - spans multiple epics
**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
**Current LOC:** 1,319 (limit: 300)
**Branch context:** `epic/34-extract-tool-loop` (active), but decomposition is cross-cutting

> **NEXT SESSION:** A detailed plan for the first extraction (Title Generation) is at
> `.claude/plans/gleaming-swimming-perlis.md`. The user is creating an epic from this plan.
> Read that file first, then check `tasks/task-overview.md` for the new epic number.

---

## Why This Is Multi-Epic

The services bound into MessageHandler are tied to features that took weeks of refactoring, benchmarking, and optimization:
- File upload + enrichment pipeline
- Export flow
- Assessment mode tool handling
- Scoring mode bypass
- Consult mode web search (Epic 33)
- Tool loop extraction (Epic 34, in progress)

**Each extraction must be surgically tested against its parent feature.** This is not a single-epic refactor.

---

## Known Open Issues

### Regeneration Bug (Epic 34)
- Retry/regenerate fails in consult mode
- Investigation started in session `d282c2da` but not completed
- Root cause TBD - may be related to tool loop gating or message history construction
- **Deferred for now** - isolate before fixing

### Multi-Tool-Call Limitation (Epic 33)
- Claude sometimes doesn't complete second search call
- v1 design: one tool call per query, continuation doesn't include tools
- Search indicator position when text precedes tool_use (may be correct UX)

---

## Constructor Dependencies (10 services)

| # | Dependency | Type | Layer | Used By Methods |
|---|-----------|------|-------|-----------------|
| 1 | `ConversationService` | Concrete | Application | validation, saveUserMessage, titleGen, autoSummarize |
| 2 | `IFileRepository` | Interface | Application | validation, enrichment, autoSummarize, waitForFileRecords |
| 3 | `RateLimiter` | Concrete | Infrastructure | validation only |
| 4 | `FileContextBuilder` | Concrete | Infrastructure | buildFileContext, autoSummarize |
| 5 | `IClaudeClient` | Interface | Application | streamClaudeResponse, autoSummarize |
| 6 | `IFileStorage` | Interface | Application | enrichInBackground only |
| 7 | `IIntakeDocumentParser` | Interface | Application | enrichInBackground only |
| 8 | `ITitleGenerationService` | Interface | Application | generateTitleIfNeeded only |
| 9 | `ToolUseRegistry` | Concrete | Infrastructure | streamClaudeResponse (tool loop gating) |
| 10 | `IConsultToolLoopService` | Interface | Infrastructure | streamClaudeResponse (tool loop delegation) |

---

## 8 Responsibilities in One File

| # | Responsibility | Methods | Approx LOC | Dependencies Used |
|---|---------------|---------|------------|-------------------|
| 1 | **Payload validation** | `validateSendMessage`, `validateAndEnrichAttachments`, `waitForFileRecords`, `validateConversationOwnership` | ~220 | ConversationService, IFileRepository, RateLimiter |
| 2 | **File context building** | `buildFileContext` | ~30 | FileContextBuilder |
| 3 | **Mode routing** | `getModeConfig`, `shouldBypassClaude`, `shouldAutoSummarize` | ~80 | None (pure logic) |
| 4 | **Claude streaming + tool loop** | `streamClaudeResponse` | ~170 | IClaudeClient, ToolUseRegistry, IConsultToolLoopService, ConversationService |
| 5 | **Message persistence + events** | `saveUserMessageAndEmit` | ~30 | ConversationService |
| 6 | **Background enrichment** | `enrichInBackground` | ~75 | IFileStorage, IIntakeDocumentParser, IFileRepository |
| 7 | **Title generation** | `generateTitleIfNeeded`, `updateScoringTitle` | ~110 | ITitleGenerationService, ConversationService |
| 8 | **Auto-summarization** | `autoSummarizeDocuments`, `buildAutoSummarizePrompt` | ~100 | IClaudeClient, FileContextBuilder, IFileRepository, ConversationService |

**Types/interfaces at top:** ~200 LOC

---

## Extraction Risk Matrix

### Safe (isolated deps, fire-and-forget)
| Module | Risk | Reason |
|--------|------|--------|
| `enrichInBackground` | LOW | Only uses fileStorage + intakeParser + fileRepo. Nothing else calls these. Fire-and-forget. |
| Title generation | LOW | Self-contained. Fire-and-forget. Only needs ConversationService + TitleGenerationService + socket emit. |
| Mode routing | LOW | Pure functions, zero deps. Can extract to standalone module immediately. |

### Moderate (shared deps but distinct flows)
| Module | Risk | Reason |
|--------|------|--------|
| Auto-summarization | MEDIUM | Shares claudeClient and fileContextBuilder with streaming, but is a completely separate flow. Socket emit coupling. |
| Validation | MEDIUM | Already almost standalone. But `waitForFileRecords` and attachment enrichment are tightly coupled to the validation flow. Other code depends on the validation result types. |

### Dangerous (interleaved state)
| Module | Risk | Reason |
|--------|------|--------|
| Streaming + tool loop | HIGH | `streamClaudeResponse` does streaming AND tool loop AND message persistence AND abort handling AND event emission. Splitting requires careful state handoff. The regeneration bug may live here. |

---

## Cross-Cutting Concerns

### Socket Threading
`socket` (IAuthenticatedSocket) is passed through: streaming, events, title updates, auto-summarize. Any extracted module needs socket access or a callback pattern.

### ConversationService Ubiquity
Used by 5 of 8 responsibilities. Cannot eliminate this dependency from extracted modules — they'll need it injected.

### Abort Handling
`socket.data.abortRequested` is checked inside `streamClaudeResponse` and affects:
- Whether `assistant_done` is emitted
- Whether partial response is saved
- Tool loop termination

### Event Emission Contract
15 critical behaviors documented in file header. Any extraction must preserve:
- `message_sent` after saving user message
- `assistant_done` suppressed on abort
- `assistant_stream_start` before streaming
- `assistant_token` per chunk
- `conversation_title_updated` after title gen

---

## Extraction Progress

| # | Module | Epic | Status | LOC Removed |
|---|--------|------|--------|-------------|
| 1 | Streaming + tool loop (consult) | Epic 34 | 🔄 In Progress | ~300 |
| 2 | Title generation | **Epic 35** | 📋 Spec Created | ~140 (projected) |
| 3 | Mode routing | TBD | Pending | ~80 |
| 4 | enrichInBackground | TBD | Pending | ~75 |
| 5 | Auto-summarization | TBD | Pending | ~100 |
| 6 | Validation | TBD | Pending | ~220 |
| 7 | Message persistence | TBD | Pending | ~30 |

## Suggested Extraction Sequence

This is the recommended order. Each step should be its own epic with full feature regression testing.

1. ~~**Streaming + tool loop**~~ -> `ConsultToolLoopService.ts` (**Epic 34**, in progress)
2. ~~**Title generation**~~ -> `TitleUpdateService.ts` (**Epic 35**, spec created — see `tasks/epic-35/`)
3. **Mode routing** -> `ModeRouter.ts` (pure functions, zero risk)
4. **enrichInBackground** -> `BackgroundEnrichmentService.ts` (isolated deps)
5. **Auto-summarization** -> `AutoSummarizeService.ts` (distinct flow)
6. **Validation** -> `MessageValidator.ts` (types may need shared export)
7. **Message persistence** -> stays or merges with streaming

---

## Feature Regression Checklist

After each extraction, test:

- [ ] Consult mode: send message, receive response
- [ ] Consult mode: web search triggers, indicator shows, results stream
- [ ] Consult mode: file upload + auto-summarize
- [ ] Consult mode: stop button during streaming and tool loop
- [ ] Assessment mode: send message with tools enabled
- [ ] Assessment mode: file upload + background enrichment
- [ ] Scoring mode: file upload bypasses Claude, triggers scoring
- [ ] Title generation: consult (2 msgs), assessment (3 + 5 msgs), scoring (filename)
- [ ] Rate limiting: rate-limited user gets proper error
- [ ] Abort: partial response saved, assistant_done suppressed
- [ ] Regeneration: retry in consult mode (FIXED in Epic 34 - commit d560f54)

---

## Session References

- `d282c2da-2029-4bd2-9bda-bd6caed9599c` - Epic 33/34 troubleshooting session (search timeouts, regeneration bug investigation, tool loop gating)
- `tasks/epic-33/.session-handoff.md` - Handoff from Epic 33 with open issues

---

## Notes for Future Sessions

- Read this file FIRST when working on any MessageHandler extraction
- Do NOT attempt to decompose streaming + tool loop until all other extractions are stable
- The regeneration bug must be isolated BEFORE streaming refactor
- Each extraction = its own commit with passing tests
