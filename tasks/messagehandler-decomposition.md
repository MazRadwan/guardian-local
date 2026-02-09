# MessageHandler Decomposition Plan

**Status:** Active - spans multiple epics
**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
**Current LOC:** 893 (limit: 300) — down from 1,319
**Completed:** Epic 34 (tool loop), Epic 35 (title generation), auto-summarize removal, message persistence inline, dead modes/ cleanup — removed ~390 LOC from MessageHandler + 1,330 LOC dead code deleted

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

### ~~Auto-Summarize Bug: Empty Messages Array (Pre-existing)~~ — RESOLVED
- **Was:** `MessageHandler.ts:1016` passed `messages: []` to Claude API → 400 error → silent failure
- **Was dead since birth:** Epic 18 (commit `f81d94d`) — never produced a summary in production
- **Fix (commit `5a6f8c4`):** Removed the entire auto-summarize feature. Consult file-only uploads now fall through to the normal streaming path (Steps 5-7), which gives them: real Claude responses, title generation, and web_search tool support — all for free.
- **Why removal over patching:** Auto-summarize was a separate code path (~156 LOC) that duplicated what Steps 5-7 already do, while missing title gen, tool support, and enrichment. Removing it eliminated the broken branch AND reduced MessageHandler LOC.
- **Impact:** Zero. Assessment/scoring pipelines untouched (autoSummarize was always `false` for both). Only consult file-only uploads changed: from broken error fallback → working Claude response.

**Lesson preserved:** Audit must trace CONTROL FLOW BRANCHES in the orchestrator, not just dependency graphs. Each `return` creates a distinct pipeline path.

### ~~Dead Code: `modes/` Strategy Pattern (Epic 28)~~ — DELETED
- **Was:** `packages/backend/src/infrastructure/websocket/modes/` — 5 production files + 4 test files (~950 LOC total)
- **What it was:** Full Strategy Pattern (GoF) with `preProcess()`, `postProcess()`, `enhanceSystemPrompt()` per mode, plus `ModeStrategyFactory`. Fully implemented, fully tested in isolation.
- **Why it was dead:** Created in Epic 28 (commit `0f6deaf`, sprint 6 "optional" stories) alongside the simpler `getModeConfig()` switch. The agent implemented both approaches in a single 79-file commit — wired the switch, never wired the strategy pattern. Zero imports from `modes/` anywhere in production code.
- **Fix (commit `c854231`):** Deleted all 9 files. The 30-line `getModeConfig()` switch is sufficient for 3 modes with simple config flags.
- **Lesson:** "Optional" in a spec should mean "evaluate then decide," not "build both and leave one dead." Mega-commits (79 files, 44 stories) are impossible to review for unused code.

---

## Constructor Dependencies (9 services — was 10)

| # | Dependency | Type | Layer | Used By Methods |
|---|-----------|------|-------|-----------------|
| 1 | `ConversationService` | Concrete | Application | validation |
| 2 | `IFileRepository` | Interface | Application | validation, enrichment, waitForFileRecords |
| 3 | `RateLimiter` | Concrete | Infrastructure | validation only |
| 4 | `FileContextBuilder` | Concrete | Infrastructure | buildFileContext |
| 5 | `IClaudeClient` | Interface | Application | streamClaudeResponse |
| 6 | `IFileStorage` | Interface | Application | enrichInBackground only |
| 7 | `IIntakeDocumentParser` | Interface | Application | enrichInBackground only |
| ~~8~~ | ~~`ITitleGenerationService`~~ | ~~Interface~~ | ~~Application~~ | ~~**Removed** — Epic 35~~ |
| 8 | `ToolUseRegistry` | Concrete | Infrastructure | streamClaudeResponse (tool loop gating) |
| 9 | `IConsultToolLoopService` | Interface | Infrastructure | streamClaudeResponse (tool loop delegation) |

---

## Remaining Responsibilities (4 of 8 — 4 removed)

| # | Responsibility | Methods | Approx LOC | Dependencies Used | Status |
|---|---------------|---------|------------|-------------------|--------|
| 1 | **Payload validation** | `validateSendMessage`, `validateAndEnrichAttachments`, `waitForFileRecords`, `validateConversationOwnership` | ~220 | ConversationService, IFileRepository, RateLimiter | **Remaining** |
| 2 | **File context building** | `buildFileContext` | ~30 | FileContextBuilder | **Remaining** |
| 3 | **Mode routing** | `getModeConfig`, `shouldBypassClaude` | ~60 | None (pure logic) | **Remaining** |
| 4 | ~~**Claude streaming + tool loop**~~ | ~~`streamClaudeResponse`~~ | ~~~170~~ | — | **Extracted** → Epic 34 |
| 5 | ~~**Message persistence + events**~~ | ~~`saveUserMessageAndEmit`~~ | ~~~30~~ | — | **Inlined** into ChatServer |
| 6 | **Background enrichment** | `enrichInBackground` | ~75 | IFileStorage, IIntakeDocumentParser, IFileRepository | **Remaining** |
| 7 | ~~**Title generation**~~ | ~~`generateTitleIfNeeded`, `updateScoringTitle`~~ | ~~~110~~ | — | **Extracted** → Epic 35 |
| 8 | ~~**Auto-summarization**~~ | ~~`autoSummarizeDocuments`, `buildAutoSummarizePrompt`~~ | ~~~156~~ | — | **Removed** — dead code since Epic 18, consult file-only now uses normal path |

**Types/interfaces at top:** ~200 LOC

### What Remains in MessageHandler (929 LOC)

| Category | LOC | Extractable? |
|----------|-----|-------------|
| Types/interfaces/imports | ~180 | Partially (move to shared types file) |
| Payload validation | ~220 | Yes → `MessageValidator.ts` |
| Mode routing | ~60 | Yes → `ModeRouter.ts` (pure functions) |
| File context building | ~30 | Small, could stay or merge |
| Claude streaming | ~170 | Partially extracted (tool loop out, streaming core remains) |
| Background enrichment | ~75 | Yes → `BackgroundEnrichmentService.ts` |
| Constructor + boilerplate | ~194 | Stays |

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
| ~~Auto-summarization~~ | — | **REMOVED** — dead code since birth, consult file-only now uses normal path |
| Validation | MEDIUM | Already almost standalone. But `waitForFileRecords` and attachment enrichment are tightly coupled to the validation flow. Other code depends on the validation result types. |

### Dangerous (interleaved state)
| Module | Risk | Reason |
|--------|------|--------|
| ~~Streaming + tool loop~~ | ~~HIGH~~ | ~~**Partially done** — tool loop extracted in Epic 34, streaming core remains~~ |

---

## Cross-Cutting Concerns

### Socket Threading
`socket` (IAuthenticatedSocket) is passed through: streaming, events, title updates. Any extracted module needs socket access or a callback pattern.

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
| 3 | Message persistence | — | ✅ **Complete** | 57 | Inlined into ChatServer (commit `14fdbf5`) |
| 4 | Auto-summarization | — | ✅ **Removed** | 156 | Dead code since birth — removed, not extracted (commit `5a6f8c4`) |
| 5 | Dead `modes/` strategy pattern | — | ✅ **Deleted** | 1,330 | Never-wired Epic 28 dead code — 9 files deleted (commit `c854231`) |
| 6 | `shouldBypassClaude` dead method | — | ✅ **Deleted** | 36 | Never called — ChatServer reads `modeConfig.bypassClaude` directly (commit `7c0b61f`) |
| 7 | Mode routing | TBD | ⬜ **Audit complete** | ~60 | `ModeRouter.ts` — audit found no hidden bindings, ready for extraction |
| 8 | enrichInBackground | TBD | ⬜ Pending | ~75 | `BackgroundEnrichmentService.ts` |
| 9 | Validation | TBD | ⬜ Pending | ~220 | `MessageValidator.ts` |

**MessageHandler removed:** ~727 LOC (1319→893) | **Codebase dead code deleted:** 1,330 LOC | **Remaining extractable:** ~355 LOC | **Will stay:** ~194 LOC (constructor/boilerplate) + ~144 LOC (types, after BypassClaudeResult removal)

## Next Extraction Candidates (by risk)

Pick one for the next epic:

| Priority | Module | Risk | LOC | Deps | Why This Order |
|----------|--------|------|-----|------|----------------|
| **A** | Mode routing | LOW | ~60 | None (pure functions) | **Audit complete.** Zero deps, zero risk. Design note: ChatServer also has inline `mode ===` checks (lines 297, 310) — cosmetic split, not a blocker. Gets MH to ~833. |
| **B** | enrichInBackground | LOW | ~75 | fileStorage, intakeParser, fileRepo | Fire-and-forget, isolated. Removes 2 constructor deps (IFileStorage, IIntakeDocumentParser). Gets MH to ~818. |
| **C** | Validation | MEDIUM | ~220 | conversationService, fileRepo, rateLimiter | Biggest LOC win but types/interfaces used across codebase. Gets MH to ~673. |
| ~~D~~ | ~~Auto-summarization~~ | — | ~~156~~ | — | **Done** — removed (commit `5a6f8c4`) |
| ~~E~~ | ~~Message persistence~~ | — | ~~57~~ | — | **Done** — inlined into ChatServer (commit `14fdbf5`) |

**Combo suggestion:** A+B together = ~135 LOC removed, 2 constructor deps eliminated, both LOW risk. Could be a single epic with 2 sprints.

---

## Feature Regression Checklist

After each extraction, test:

- [ ] Consult mode: send message, receive response
- [ ] Consult mode: web search triggers, indicator shows, results stream
- [ ] Consult mode: file upload without text (now uses normal streaming path)
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
   - ~~`autoSummarizeDocuments`~~ → **REMOVED** — was dead code since birth, consult file-only now uses normal streaming path
   - `buildFileContext` → chat context when generating questions
   - `validateAndEnrichAttachments` → file upload flow across all modes
   - `getModeConfig` / `shouldBypassClaude` → scoring bypass, assessment tool routing
   - These are NOT generic utilities — they are feature-critical paths.

3. **Identify shared state and ordering constraints** — some modules have implicit sequencing that isn't visible from the interface alone. Enrichment feeds context building. Validation produces types consumed downstream. Moving code without preserving execution order breaks features silently.

4. **Audit existing test coverage for the target module** — identify what's actually tested vs what's assumed working. Coverage gaps = extraction risk. If a module has thin test coverage, write the missing tests BEFORE extracting (tests against the current working code become the regression safety net).

5. **Trace the orchestrator's control flow branches** — `ChatServer.handleSendMessage` is a branching pipeline with `return` statements. Each branch creates a completely different execution path:
   - Step 4: `bypassClaude` → scoring path (skips Claude entirely)
   - Steps 5-7: Normal streaming path (all other messages including consult file-only)

   **Lesson learned (auto-summarize removal):** A module that looks "isolated" may actually be the PRIMARY response handler for an entire user flow. The removed auto-summarize was a separate branch that skipped title gen, tool support, and enrichment. **Any audit must map which user scenarios hit which branch**, not just which methods call which dependencies.

6. **Test every distinct pipeline branch during browser QA** — the message persistence refactor passed QA for the normal streaming path (text messages, regenerate) but did not exercise the auto-summarize branch (file-only upload in consult mode). The auto-summarize bug was pre-existing but was only discovered because the QA happened to test file upload. **QA must cover all branches in the orchestrator, not just the happy path.**

**The three completed extractions (tool loop, title gen, message persistence inline) were the easy ones** — isolated, fire-and-forget, single dependency. Everything remaining has cross-cutting feature dependencies. Do not assume the same level of ease.

---

## Notes for Future Sessions

- Read this file FIRST when working on any MessageHandler extraction
- Read the Extraction Protocol section above BEFORE any new extraction
- Auto-summarize bug is RESOLVED — feature removed entirely (commit `5a6f8c4`), consult file-only now uses normal streaming path
- Regeneration bug is FIXED (Epic 34, commit d560f54)
- Each extraction = its own epic with passing tests
- Dead `modes/` strategy pattern is DELETED (commit `c854231`) — was ~950 LOC of never-wired code from Epic 28
- Dead `shouldBypassClaude` method + `BypassClaudeResult` type DELETED (commit `7c0b61f`) — never called, ChatServer reads modeConfig directly
- **Mode routing audit COMPLETE** — no hidden bindings found, ready for extraction next session
- Target: get MessageHandler under 300 LOC (currently 893 — need to remove ~593 more)

### handleSendMessage Pipeline Map (READ THIS)

```
ChatServer.handleSendMessage (lines 220-340):
  ├─ Step 1: Validate payload (MessageHandler.validateSendMessage)
  ├─ Step 2: Save user message + emit message_sent
  ├─ Step 3: Build context + get mode config
  ├─ Step 4: IF scoring + attachments → scoringHandler → RETURN
  ├─ Step 5: Build enhanced prompt with file context
  ├─ Step 6: Stream Claude response (+ tool loop for consult/assessment)
  └─ Step 7: Post-streaming
      ├─ Tool dispatch (questionnaire_ready, web_search)
      ├─ Background enrichment (assessment mode only)
      └─ Title generation (all modes)
```

Each `RETURN` is a completely different user experience. Extraction of ANY module must verify which branches it participates in.
