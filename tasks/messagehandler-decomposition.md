# MessageHandler Decomposition Plan

**Status:** Active - spans multiple epics
**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
**Current LOC:** 1,142 (limit: 300) — down from 1,319
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
| 7 | Message persistence | TBD | ⬜ Pending | ~30 | stays or merges |

**Total extracted:** ~478 LOC | **Remaining extractable:** ~505 LOC | **Will stay:** ~237 LOC (orchestration) + ~200 LOC (types)

## Next Extraction Candidates (by risk)

Pick one for the next epic:

| Priority | Module | Risk | LOC | Deps | Why This Order |
|----------|--------|------|-----|------|----------------|
| **A** | Mode routing | LOW | ~80 | None (pure functions) | Zero deps, zero risk, quick win. Gets MH to ~1,062. |
| **B** | enrichInBackground | LOW | ~75 | fileStorage, intakeParser, fileRepo | Fire-and-forget, isolated. Removes 2 constructor deps (IFileStorage, IIntakeDocumentParser). Gets MH to ~987. |
| **C** | Auto-summarization | MEDIUM | ~100 | claudeClient, fileContextBuilder, fileRepo, conversationService | Distinct flow but shares deps with streaming. Gets MH to ~887. |
| **D** | Validation | MEDIUM | ~220 | conversationService, fileRepo, rateLimiter | Biggest LOC win but types/interfaces used across codebase. Gets MH to ~667. |
| **E** | Message persistence | LOW | ~30 | conversationService | Tiny, could bundle with another extraction. |

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
   - `autoSummarizeDocuments` → context builder for questionnaire generation
   - `buildFileContext` → chat context when generating questions
   - `validateAndEnrichAttachments` → file upload flow across all modes
   - `getModeConfig` / `shouldBypassClaude` → scoring bypass, assessment tool routing
   - These are NOT generic utilities — they are feature-critical paths.

3. **Identify shared state and ordering constraints** — some modules have implicit sequencing that isn't visible from the interface alone. Enrichment feeds context building. Validation produces types consumed downstream. Moving code without preserving execution order breaks features silently.

4. **Audit existing test coverage for the target module** — identify what's actually tested vs what's assumed working. Coverage gaps = extraction risk. If a module has thin test coverage, write the missing tests BEFORE extracting (tests against the current working code become the regression safety net).

**The two completed extractions (tool loop, title gen) were the easy ones** — isolated, fire-and-forget, single dependency. Everything remaining has cross-cutting feature dependencies. Do not assume the same level of ease.

---

## Notes for Future Sessions

- Read this file FIRST when working on any MessageHandler extraction
- Read the Extraction Protocol section above BEFORE any new extraction
- Regeneration bug is FIXED (Epic 34, commit d560f54)
- Each extraction = its own epic with passing tests
- Target: get MessageHandler under 300 LOC (currently 1,142 — need to remove ~842 more)
