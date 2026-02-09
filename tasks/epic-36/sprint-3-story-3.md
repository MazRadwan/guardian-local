# Story 36.3.3: Orchestrator Tests + Full Regression (All Modes Browser QA)

## Description

Write unit tests for `SendMessageOrchestrator` covering every pipeline branch. Run full test suite. Perform comprehensive browser QA across all 3 modes, abort, regenerate, rate limiting, and file upload scenarios.

This is the final story of the epic. After this, the decomposition is complete.

## Acceptance Criteria

- [ ] Orchestrator unit test file created
- [ ] Tests cover: scoring bypass, tool loop gating, enrichment gating, abort suppression, emitFileProcessingError branch, regenerate path, placeholder text
- [ ] `pnpm --filter @guardian/backend test:unit` — ALL pass
- [ ] `pnpm --filter @guardian/backend test:integration` — ALL pass
- [ ] Browser QA: consult text message — response streams
- [ ] Browser QA: consult file upload (no text) — placeholder text, response streams
- [ ] Browser QA: consult web search — tool triggers, indicator shows, results stream
- [ ] Browser QA: consult stop button — partial saved, no assistant_done
- [ ] Browser QA: consult regenerate — old response deleted, new response streams
- [ ] Browser QA: assessment file upload — enrichment runs (check logs)
- [ ] Browser QA: assessment message — tools enabled, response streams
- [ ] Browser QA: scoring file upload — bypasses Claude, scoring triggers
- [ ] Browser QA: rate limiting — send rapid messages, verify error
- [ ] `tasks/messagehandler-decomposition.md` updated with final status
- [ ] All files under 300 LOC verified

## Technical Approach

### 1. Create orchestrator tests

**File:** `packages/backend/__tests__/unit/infrastructure/websocket/services/SendMessageOrchestrator.test.ts`

Mock all deps:
```typescript
const mockDeps: SendMessageOrchestratorDeps = {
  validator: { validateSendMessage: jest.fn() },
  streamingService: { streamClaudeResponse: jest.fn() },
  conversationService: { sendMessage: jest.fn(), getHistory: jest.fn(), deleteMessage: jest.fn() },
  contextBuilder: { build: jest.fn() },
  fileContextBuilder: { buildWithImages: jest.fn() },
  scoringHandler: { triggerScoringOnSend: jest.fn() },
  toolRegistry: { dispatch: jest.fn() },
  titleUpdateService: { generateTitleIfNeeded: jest.fn(), updateScoringTitle: jest.fn() },
  backgroundEnrichmentService: { enrichInBackground: jest.fn() },
  webSearchEnabled: true,
};
```

### 2. Test cases (from Codex recommendations + audit findings)

**Validation branch tests:**
- `should emit error when validation fails`
- `should emit file_processing_error when emitFileProcessingError is true`
- `should include missingFileIds in file_processing_error payload`
- `should NOT proceed to Step 2 when validation fails`

**Message persistence tests:**
- `should save user message and emit message_sent for normal messages`
- `should emit enrichedAttachments in message_sent (not DB return)`
- `should skip save and delete old assistant message on regenerate`
- `should handle regenerate when last message is not assistant`

**Placeholder text tests:**
- `should generate placeholder text for file-only messages`
- `should use messageText when both text and attachments present`

**Scoring bypass tests:**
- `should bypass Claude when bypassClaude AND hasAttachments`
- `should NOT bypass when bypassClaude but no attachments`
- `should call updateScoringTitle with first filename`
- `should compute userQuery excluding placeholder text`
- `should NOT proceed to Steps 5-7 after scoring bypass`

**File context tests:**
- `should pass undefined for scopeToFileIds (all conversation files)`
- `should skip file context for scoring mode`
- `should build file context for consult and assessment modes`
- `should handle missing fileContextBuilder gracefully`

**Streaming + tool selection tests:**
- `should pass consult tools when webSearchEnabled is true`
- `should pass undefined tools when webSearchEnabled is false in consult mode`
- `should pass assessment tools in assessment mode`
- `should pass prompt cache through to streaming options`

**Post-streaming tests:**
- `should dispatch tool use blocks when not aborted`
- `should NOT dispatch tools when aborted`
- `should run background enrichment for assessment mode with attachments`
- `should NOT run background enrichment for consult mode`
- `should call title generation for all modes (fire-and-forget)`
- `should catch and log title generation errors`
- `should catch and log enrichment errors`

### 3. Run full test suite

```bash
pnpm --filter @guardian/backend test:unit
pnpm --filter @guardian/backend test:integration
```

### 4. Browser QA (Chrome DevTools MCP) — comprehensive

**Consult mode (4 tests):**
1. Text message — send "What is HIPAA?", verify response streams, title generates after 2 messages
2. File upload without text — upload a PDF, verify placeholder text appears, Claude responds with file context
3. Web search — "Search for latest AI healthcare regulations 2026", verify tool_status events (searching → reading → idle), results stream
4. Stop button — start long response, click stop, verify partial saved, can send new message

**Assessment mode (2 tests):**
5. File upload — upload vendor doc in assessment mode, verify enrichment in backend logs: `[BackgroundEnrichment]`
6. Text message — send "Analyze this vendor", verify tools enabled, response streams

**Scoring mode (1 test):**
7. File upload — upload YAML/doc in scoring mode, verify Claude bypassed, scoring triggers

**Cross-cutting (2 tests):**
8. Regenerate — in consult mode, click retry on a response, verify old response deleted, new response streams, no duplicate user message
9. Rate limiting — send 11+ rapid messages, verify rate limit error appears

**What to check in backend logs for each test:**
- `[SendMessageValidator]` — validation logs
- `[ClaudeStreamingService]` — streaming logs
- `[SendMessageOrchestrator]` — any orchestrator logs (errors only expected)
- No `[MessageHandler]` prefix anywhere
- No console errors

### 5. Update decomposition doc

**File:** `tasks/messagehandler-decomposition.md`

Update:
- Mark validation extraction COMPLETE
- Mark streaming extraction COMPLETE
- Mark orchestrator extraction COMPLETE
- Mark MessageHandler DELETED
- Update LOC table with final counts
- Note: all files under 300 LOC

### 6. Verify all files under 300 LOC

```bash
wc -l packages/backend/src/infrastructure/websocket/ChatServer.ts
wc -l packages/backend/src/infrastructure/websocket/services/SendMessageValidator.ts
wc -l packages/backend/src/infrastructure/websocket/services/ClaudeStreamingService.ts
wc -l packages/backend/src/infrastructure/websocket/services/SendMessageOrchestrator.ts
wc -l packages/backend/src/infrastructure/websocket/types/SendMessage.ts
```

All must be under 300.

## Files Touched

- `packages/backend/__tests__/unit/infrastructure/websocket/services/SendMessageOrchestrator.test.ts` - CREATE
- `tasks/messagehandler-decomposition.md` - MODIFY (final status update)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test + QA story:
- New orchestrator tests (~25 test cases)
- `pnpm --filter @guardian/backend test:unit` — all pass
- `pnpm --filter @guardian/backend test:integration` — all pass
- Browser QA — 9 scenarios across all modes
- LOC verification — all files under 300

## Definition of Done

- [ ] Orchestrator tests created and passing
- [ ] Full unit suite passes
- [ ] Integration tests pass
- [ ] Browser QA all 9 scenarios verified
- [ ] No `[MessageHandler]` log prefix anywhere in backend logs
- [ ] No console errors
- [ ] All new files under 300 LOC
- [ ] Decomposition doc updated with COMPLETE status
- [ ] MessageHandler.ts confirmed DELETED
- [ ] Epic 36 complete
