# MessageHandler Decomposition Plan

**Status:** Active - spans multiple epics
**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
**Current LOC:** 1,085 (limit: 300) — down from 1,319
**Completed:** Epic 34 (tool loop), Epic 35 (title generation) — removed ~177 LOC so far

---

## Why This Is Multi-Epic

The services bound into MessageHandler are tied to features that took weeks of refactoring, benchmarking, and optimization:
- File upload + enrichment pipeline
- Export flow
- Assessment mode tool handling
- Scoring mode bypass
- Consult mode web search (Epic 33)
- Tool loop extraction (Epic 34, complete)
- Title generation extraction (Epic 35, complete)

**Each extraction must be surgically tested against its parent feature.** This is not a single-epic refactor.

---

## Known Open Issues

### ~~Regeneration Bug (Epic 34)~~ — FIXED
- ~~Retry/regenerate fails in consult mode~~
- **Fixed** in Epic 34 (commit `d560f54`) — duplicate user message on regenerate
- Root cause: `handleSendMessage` saved user message even on regenerate, creating duplicates

### Multi-Tool-Call Limitation (Epic 33)
- Claude sometimes doesn't complete second search call
- v1 design: one tool call per query, continuation doesn't include tools
- Search indicator position when text precedes tool_use (may be correct UX)

### Auto-Summarize Bug: Empty Messages Array (Pre-existing)
- **Location:** `MessageHandler.ts:1016` — `const messages: ClaudeMessage[] = [];`
- **Error:** Claude API returns 400: `"messages: at least one message is required"`
- **Impact:** File-only uploads in consult mode get NO automatic summary. The user sees the main streaming response instead (which falls through to Step 6-7 in the pipeline? **NO** — see below).

**CRITICAL CONTEXT: Auto-summarize is NOT an isolated feature.**

`autoSummarizeDocuments` is the **primary response path** for file-only uploads in consult mode. In `ChatServer.handleSendMessage`, the pipeline has branching paths:

```
handleSendMessage pipeline (ChatServer lines 248-344):
  Step 1: Validate payload
  Step 2: Save user message + emit message_sent
  Step 3: Build context + get mode config
  Step 4: IF scoring + attachments → scoring bypass → RETURN
  Step 5: IF shouldAutoSummarize (consult + no text + has attachments) → autoSummarizeDocuments → RETURN
  Step 6-7: Normal path: build file context, stream Claude response
  Step 8: Post-streaming: tool dispatch, enrichment, title generation
```

**Step 5 has a `return` (ChatServer line 296).** When auto-summarize triggers, Steps 6-8 are SKIPPED entirely — no normal streaming, no tool dispatch, no background enrichment, no title generation.

**The finely orchestrated upload pipeline:**
1. File upload triggers background extraction (async, ~31ms for DOCX)
2. `tryStartParsing()` atomic CAS prevents duplicate extraction
3. User hits send → validation waits for extraction to complete (`waitForFileRecords`)
4. Message saved to DB with placeholder text `[Uploaded file for analysis: filename]`
5. `shouldAutoSummarize` returns true (consult + no text + has attachments)
6. `autoSummarizeDocuments` is called — this IS the response for file-only uploads
7. It builds file context (10K chars), constructs a summarization system prompt
8. **BUG:** Passes `messages: []` to Claude API → 400 error → caught by `.catch()` → logged but user gets no response

**Fix required:** Add a user message to the array:
```typescript
const messages: ClaudeMessage[] = [
  { role: 'user', content: `Please summarize ${fileLabel}.` }
];
```

**Why the audit missed this:** The blast radius audit for `saveUserMessageAndEmit` focused on the persistence and event emission paths. Auto-summarize was treated as a separate module (which it is structurally) but the audit did not trace the BRANCHING CONTROL FLOW in `handleSendMessage` to discover that auto-summarize is an alternative pipeline path, not an addon. The file-only upload path was never tested during browser QA because the bug prevented it from producing a visible regression — it failed silently via `.catch()`.

**Lesson for future extractions:** Audit must trace not just dependency graphs but CONTROL FLOW BRANCHES in the orchestrator (`handleSendMessage`). Each `return` statement creates a distinct pipeline path that may skip downstream steps.

### Dead Code: `modes/` Strategy Pattern (Epic 28)
- **Location:** `packages/backend/src/infrastructure/websocket/modes/`
- **Files:** `IModeStrategy.ts`, `AssessmentModeStrategy.ts`, `ConsultModeStrategy.ts`, `ScoringModeStrategy.ts`, `ModeStrategyFactory.ts`, `index.ts` + 4 test files
- **What:** Full Strategy Pattern (GoF) with `preProcess()`, `postProcess()`, `enhanceSystemPrompt()` per mode. Includes a `ModeStrategyFactory`. Fully implemented, fully tested in isolation.
- **Problem:** Never wired into ChatServer. No production code outside `modes/` imports from it. Created in the Epic 28 monolith refactor (`0f6deaf`) alongside the simpler `getModeConfig()` switch in MessageHandler. The switch was extracted from the original monolith logic and worked — the strategy system was aspirational architecture that was never connected.
- **Current state:** `ChatServer` uses `messageHandler.getModeConfig(mode)` (30-line switch). The `modes/` directory is dead code.
- **Decision:** The switch is sufficient for 3 modes with simple config flags. Strategy Pattern would be over-engineering. **Revisit after MessageHandler decomposition is complete** — if mode-specific behavior grows more complex, wire the strategies then. Otherwise delete the dead code in a cleanup pass.
- **Duplicate flag:** `AssessmentModeStrategy.postProcess()` returns `enrichInBackground: context.hasDocuments` but ChatServer uses the hardcoded `modeConfig.backgroundEnrich: true` from `getModeConfig()` instead. Two decision points for the same thing — only one is live.

---

## Constructor Dependencies (9 services — was 10)

| # | Dependency | Type | Layer | Used By Methods |
|---|-----------|------|-------|-----------------|
| 1 | `ConversationService` | Concrete | Application | validation, saveUserMessage, autoSummarize |
| 2 | `IFileRepository` | Interface | Application | validation, enrichment, autoSummarize, waitForFileRecords |
| 3 | `RateLimiter` | Concrete | Infrastructure | validation only |
| 4 | `FileContextBuilder` | Concrete | Infrastructure | buildFileContext, autoSummarize |
| 5 | `IClaudeClient` | Interface | Application | streamClaudeResponse, autoSummarize |
| 6 | `IFileStorage` | Interface | Application | enrichInBackground only |
| 7 | `IIntakeDocumentParser` | Interface | Application | enrichInBackground only |
| ~~8~~ | ~~`ITitleGenerationService`~~ | ~~Interface~~ | ~~Application~~ | ~~**Removed** — Epic 35~~ |
| 8 | `ToolUseRegistry` | Concrete | Infrastructure | streamClaudeResponse (tool loop gating) |
| 9 | `IConsultToolLoopService` | Interface | Infrastructure | streamClaudeResponse (tool loop delegation) |

---

## Remaining Responsibilities (6 of 8 — 2 extracted)

| # | Responsibility | Methods | Approx LOC | Dependencies Used | Status |
|---|---------------|---------|------------|-------------------|--------|
| 1 | **Payload validation** | `validateSendMessage`, `validateAndEnrichAttachments`, `waitForFileRecords`, `validateConversationOwnership` | ~220 | ConversationService, IFileRepository, RateLimiter | **Remaining** |
| 2 | **File context building** | `buildFileContext` | ~30 | FileContextBuilder | **Remaining** |
| 3 | **Mode routing** | `getModeConfig`, `shouldBypassClaude`, `shouldAutoSummarize` | ~80 | None (pure logic) | **Remaining** |
| 4 | ~~**Claude streaming + tool loop**~~ | ~~`streamClaudeResponse`~~ | ~~~170~~ | — | **Extracted** → Epic 34 |
| 5 | **Message persistence + events** | `saveUserMessageAndEmit` | ~30 | ConversationService | **Remaining** |
| 6 | **Background enrichment** | `enrichInBackground` | ~75 | IFileStorage, IIntakeDocumentParser, IFileRepository | **Remaining** |
| 7 | ~~**Title generation**~~ | ~~`generateTitleIfNeeded`, `updateScoringTitle`~~ | ~~~110~~ | — | **Extracted** → Epic 35 |
| 8 | **Auto-summarization** | `autoSummarizeDocuments`, `buildAutoSummarizePrompt` | ~100 | IClaudeClient, FileContextBuilder, IFileRepository, ConversationService | **Remaining** |

**Types/interfaces at top:** ~200 LOC

### What Remains in MessageHandler (1,142 LOC)

| Category | LOC | Extractable? |
|----------|-----|-------------|
| Types/interfaces/imports | ~200 | Partially (move to shared types file) |
| Payload validation | ~220 | Yes → `MessageValidator.ts` |
| Mode routing | ~80 | Yes → `ModeRouter.ts` (pure functions) |
| File context building | ~30 | Small, could stay or merge |
| Claude streaming | ~170 | Partially extracted (tool loop out, streaming core remains) |
| Message persistence | ~30 | Small, could stay or merge |
| Background enrichment | ~75 | Yes → `BackgroundEnrichmentService.ts` |
| Auto-summarization | ~100 | Yes → `AutoSummarizeService.ts` |
| `handleSendMessage` orchestration | ~237 | Stays (this IS MessageHandler's job) |

---

## Extraction Risk Matrix

### Safe (isolated deps, fire-and-forget)
| Module | Risk | Reason |
|--------|------|--------|
| `enrichInBackground` | LOW | Only uses fileStorage + intakeParser + fileRepo. Nothing else calls these. Fire-and-forget. |
| ~~Title generation~~ | ~~LOW~~ | ~~**DONE** — Epic 35~~ |
| Mode routing | LOW | Pure functions, zero deps. Can extract to standalone module immediately. |

### Moderate (shared deps but distinct flows)
| Module | Risk | Reason |
|--------|------|--------|
| Auto-summarization | MEDIUM | Shares claudeClient and fileContextBuilder with streaming, but is a completely separate flow. Socket emit coupling. |
| Validation | MEDIUM | Already almost standalone. But `waitForFileRecords` and attachment enrichment are tightly coupled to the validation flow. Other code depends on the validation result types. |

### Dangerous (interleaved state)
| Module | Risk | Reason |
|--------|------|--------|
| ~~Streaming + tool loop~~ | ~~HIGH~~ | ~~**Partially done** — tool loop extracted in Epic 34, streaming core remains~~ |

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

| # | Module | Epic | Status | LOC Removed | Service Created |
|---|--------|------|--------|-------------|-----------------|
| 1 | Streaming + tool loop (consult) | Epic 34 | ✅ **Complete** | ~300 | `ConsultToolLoopService.ts` |
| 2 | Title generation | Epic 35 | ✅ **Complete** | 178 | `TitleUpdateService.ts` |
| 3 | Mode routing | TBD | ⬜ Pending | ~80 | `ModeRouter.ts` |
| 4 | enrichInBackground | TBD | ⬜ Pending | ~75 | `BackgroundEnrichmentService.ts` |
| 5 | Auto-summarization | TBD | ⬜ Pending | ~100 | `AutoSummarizeService.ts` |
| 6 | Validation | TBD | ⬜ Pending | ~220 | `MessageValidator.ts` |
| 7 | Message persistence | — | ✅ **Complete** | 57 | Inlined into ChatServer (no service needed) |

**Total extracted:** ~535 LOC | **Remaining extractable:** ~475 LOC | **Will stay:** ~237 LOC (orchestration) + ~200 LOC (types)

## Next Extraction Candidates (by risk)

Pick one for the next epic:

| Priority | Module | Risk | LOC | Deps | Why This Order |
|----------|--------|------|-----|------|----------------|
| **A** | Mode routing | LOW | ~80 | None (pure functions) | Zero deps, zero risk, quick win. Gets MH to ~1,062. |
| **B** | enrichInBackground | LOW | ~75 | fileStorage, intakeParser, fileRepo | Fire-and-forget, isolated. Removes 2 constructor deps (IFileStorage, IIntakeDocumentParser). Gets MH to ~987. |
| **C** | Auto-summarization | MEDIUM | ~100 | claudeClient, fileContextBuilder, fileRepo, conversationService | Distinct flow but shares deps with streaming. Gets MH to ~887. |
| **D** | Validation | MEDIUM | ~220 | conversationService, fileRepo, rateLimiter | Biggest LOC win but types/interfaces used across codebase. Gets MH to ~667. |
| ~~E~~ | ~~Message persistence~~ | ~~LOW~~ | ~~30~~ | — | **Done** — inlined into ChatServer |

**Combo suggestion:** A+B together = ~155 LOC removed, 2 constructor deps eliminated, both LOW risk. Could be a single epic with 2 sprints.

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

## ⚠️ Extraction Protocol — READ BEFORE ANY NEW EXTRACTION

The remaining modules are **battle-hardened production code**. Doc upload/extract, assessment flow, questionnaire context building, and scoring each went through multiple refactor cycles, benchmarking, and optimization to reach their current working state. A failing test isn't just a red CI — it's regressing weeks of stabilization work.

**Before proposing or starting any extraction, you MUST:**

1. **Map the real dependency graph** — not just constructor params, but runtime call chains. Trace which methods call which, in what order, with what data flowing through. Constructor deps alone don't tell you about implicit sequencing (e.g., enrichment must complete before context building can use the results).

2. **Understand the feature bindings** — each module is tied to a user-facing feature that was carefully tuned:
   - `enrichInBackground` → doc upload/extract pipeline (assessment + scoring)
   - `autoSummarizeDocuments` → **PRIMARY response path** for file-only uploads in consult mode (not an addon — replaces normal streaming via `return` at Step 5)
   - `buildFileContext` → chat context when generating questions
   - `validateAndEnrichAttachments` → file upload flow across all modes
   - `getModeConfig` / `shouldBypassClaude` → scoring bypass, assessment tool routing
   - These are NOT generic utilities — they are feature-critical paths.

3. **Identify shared state and ordering constraints** — some modules have implicit sequencing that isn't visible from the interface alone. Enrichment feeds context building. Validation produces types consumed downstream. Moving code without preserving execution order breaks features silently.

4. **Audit existing test coverage for the target module** — identify what's actually tested vs what's assumed working. Coverage gaps = extraction risk. If a module has thin test coverage, write the missing tests BEFORE extracting (tests against the current working code become the regression safety net).

5. **Trace the orchestrator's control flow branches** — `ChatServer.handleSendMessage` is a branching pipeline with multiple `return` statements. Each branch creates a completely different execution path:
   - Step 4: `bypassClaude` → scoring path (skips Claude entirely)
   - Step 5: `shouldAutoSummarize` → auto-summarize path (skips normal streaming, enrichment, title gen)
   - Step 6-8: Normal streaming path

   A module that looks "isolated" may actually be the PRIMARY response handler for an entire user flow. Auto-summarize is not a fire-and-forget addon — it IS the response for file-only uploads in consult mode. **Any audit must map which user scenarios hit which branch**, not just which methods call which dependencies.

6. **Test every distinct pipeline branch during browser QA** — the message persistence refactor passed QA for the normal streaming path (text messages, regenerate) but did not exercise the auto-summarize branch (file-only upload in consult mode). The auto-summarize bug was pre-existing but was only discovered because the QA happened to test file upload. **QA must cover all branches in the orchestrator, not just the happy path.**

**The three completed extractions (tool loop, title gen, message persistence inline) were the easy ones** — isolated, fire-and-forget, single dependency. Everything remaining has cross-cutting feature dependencies. Do not assume the same level of ease.

---

## Notes for Future Sessions

- Read this file FIRST when working on any MessageHandler extraction
- Read the Extraction Protocol section above BEFORE any new extraction
- **Read the "Auto-Summarize Bug" in Known Open Issues** — this is a pre-existing bug (empty messages array) that blocks file-only uploads in consult mode. Must be fixed before or during auto-summarize extraction.
- Regeneration bug is FIXED (Epic 34, commit d560f54)
- Each extraction = its own epic with passing tests
- Target: get MessageHandler under 300 LOC (currently 1,085 — need to remove ~785 more)

### handleSendMessage Pipeline Map (READ THIS)

```
ChatServer.handleSendMessage (lines 220-345):
  ├─ Step 1: Validate payload (MessageHandler.validateSendMessage)
  ├─ Step 2: Save user message + emit message_sent
  ├─ Step 3: Build context + get mode config
  ├─ Step 4: IF scoring + attachments → scoringHandler → RETURN
  ├─ Step 5: IF consult + no text + attachments → autoSummarizeDocuments → RETURN
  │          ⚠️ BUG: passes empty messages[] to Claude API → 400 error
  ├─ Step 6: Build enhanced prompt with file context
  ├─ Step 7: Stream Claude response (+ tool loop for consult/assessment)
  └─ Step 8: Post-streaming
      ├─ Tool dispatch (questionnaire_ready, web_search)
      ├─ Background enrichment (assessment mode only)
      └─ Title generation (all modes)
```

Each `RETURN` is a completely different user experience. Extraction of ANY module must verify which branches it participates in.
