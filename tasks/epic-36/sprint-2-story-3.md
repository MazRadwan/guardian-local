# Story 36.2.3: Move Streaming Tests, Update Imports, Regression Verification

## Description

Move streaming tests to a new test file for `ClaudeStreamingService`, update all test imports for MessageHandler's reduced constructor, and verify zero regressions via full test suite + browser QA.

## Acceptance Criteria

- [ ] New test file: `ClaudeStreamingService.test.ts` with all streaming tests
- [ ] Log string assertions updated: `[MessageHandler]` → `[ClaudeStreamingService]`
- [ ] All test files that instantiate MessageHandler updated for new 2-param constructor (ConversationService + FileContextBuilder — or just FileContextBuilder if ConversationService removed)
- [ ] Streaming-specific test files updated to import from ClaudeStreamingService
- [ ] `pnpm --filter @guardian/backend test:unit` passes (all tests)
- [ ] `pnpm --filter @guardian/backend test:integration` passes
- [ ] Browser QA: consult message — response streams token by token
- [ ] Browser QA: consult web search — tool loop triggers, results stream, indicator shows
- [ ] Browser QA: consult stop button — partial response saved, no `assistant_done`, UI shows stopped state
- [ ] Browser QA: assessment message — response streams with tools enabled
- [ ] Browser QA: regenerate — clean context, new response streams

## Technical Approach

### 1. Create ClaudeStreamingService test file

**File:** `packages/backend/__tests__/unit/infrastructure/websocket/services/ClaudeStreamingService.test.ts`

Move streaming test blocks from `MessageHandler.test.ts`:
- `describe('streamClaudeResponse')` — all tests

Update in moved tests:
- Import `ClaudeStreamingService` instead of `MessageHandler`
- Create service with 3-param constructor: `new ClaudeStreamingService(mockClaudeClient, mockConversationService, mockConsultToolLoopService)`
- Update all `handler.streamClaudeResponse(...)` → `service.streamClaudeResponse(...)`
- Update log assertion strings: `[MessageHandler]` → `[ClaudeStreamingService]`

### 2. Move/update streaming-specific test files

These 4 files test streaming behavior and need import + constructor updates:

**`packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`**
- Rename to `ClaudeStreamingService.toolLoop.test.ts` (or update imports in place)
- Import `ClaudeStreamingService` and types from `types/SendMessage.ts`
- Constructor: `new ClaudeStreamingService(mockClaudeClient, mockConversationService, mockConsultToolLoopService)`

**`packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`**
- Rename to `ClaudeStreamingService.assistantDoneGating.test.ts` (or update imports)
- Same constructor update

**`packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`**
- Rename to `ClaudeStreamingService.assistantDoneGating.abort.test.ts` (or update imports)
- Same constructor update

**`packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`**
- Rename to `ClaudeStreamingService.assistantDoneGating.edgeCases.test.ts` (or update imports)
- Same constructor update

**Decision:** Rename files to match new service name. Old file names reference MessageHandler which will be deleted.

### 3. Update remaining MessageHandler.test.ts

After Sprint 1 removed validation tests and this sprint removes streaming tests, MessageHandler.test.ts should only contain:
- `describe('buildFileContext')` tests (~20 tests, lines 1193-1481)

Update constructor in these remaining tests to match MessageHandler's new signature (1-2 params).

### 4. Run full test suite

```bash
pnpm --filter @guardian/backend test:unit
pnpm --filter @guardian/backend test:integration
```

### 5. Browser QA (Chrome DevTools MCP)

Focus on streaming behavior since that's what was extracted:

1. **Consult text message** — "What is HIPAA?" → verify tokens stream one by one, `assistant_done` fires
2. **Consult web search** — "Search for latest AI healthcare regulations" → verify tool_status events (searching → reading → idle), results stream after search
3. **Consult stop button** — Start a long response, click stop → verify:
   - Partial response visible in chat
   - No `assistant_done` in network/console
   - Can send new message after stopping
4. **Assessment message** — Switch to assessment mode, send message → verify response streams with tools enabled
5. **Regenerate** — Click retry on a consult response → verify:
   - Old assistant message deleted
   - New response streams
   - No duplicate user message

**What to check in backend logs:**
- `[ClaudeStreamingService]` log prefix appears (not `[MessageHandler]`)
- Tool loop gating log: `mode=consult, source=user_input, stopReason=...`
- No console errors

## Files Touched

- `packages/backend/__tests__/unit/infrastructure/websocket/services/ClaudeStreamingService.test.ts` - CREATE
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - MODIFY (remove streaming tests, keep buildFileContext only)
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts` - RENAME + MODIFY → `ClaudeStreamingService.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts` - RENAME + MODIFY → `ClaudeStreamingService.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts` - RENAME + MODIFY → `ClaudeStreamingService.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts` - RENAME + MODIFY → `ClaudeStreamingService.assistantDoneGating.edgeCases.test.ts`

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story:
- `pnpm --filter @guardian/backend test:unit` — all pass
- `pnpm --filter @guardian/backend test:integration` — all pass
- Browser QA — 5 streaming scenarios verified

## Definition of Done

- [ ] Streaming tests in new files, passing
- [ ] All constructor signatures updated
- [ ] Old test files renamed to match new service
- [ ] Full unit suite passes
- [ ] Integration tests pass
- [ ] Browser QA all 5 streaming scenarios verified
- [ ] Log prefixes show `[ClaudeStreamingService]`
- [ ] No console errors in backend logs
