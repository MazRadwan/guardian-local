# Story 36.1.3: Move Tests, Update Imports, Regression Verification

## Description

Move validation tests to a new test file for `SendMessageValidator`, update all test imports affected by the constructor signature change, and verify zero regressions via full test suite + browser QA.

## Acceptance Criteria

- [ ] New test file: `SendMessageValidator.test.ts` with all validation + waitForFileRecords tests
- [ ] Log string assertions updated: `[MessageHandler]` → `[SendMessageValidator]`
- [ ] All test files that instantiate MessageHandler updated for new 5-param constructor
- [ ] `pnpm --filter @guardian/backend test:unit` passes (all 2053+ tests)
- [ ] `pnpm --filter @guardian/backend test:integration` passes
- [ ] Browser QA: consult mode text message — response streams
- [ ] Browser QA: consult mode file upload without text — placeholder appears, response streams
- [ ] Browser QA: assessment mode file upload — enrichment runs (check backend logs)
- [ ] Browser QA: scoring mode file upload — bypasses Claude, triggers scoring

## Technical Approach

### 1. Create SendMessageValidator test file

**File:** `packages/backend/__tests__/unit/infrastructure/websocket/services/SendMessageValidator.test.ts`

Move these test blocks from `MessageHandler.test.ts`:
- `describe('validateSendMessage')` — all tests (lines 228-900+)
- `describe('waitForFileRecords (Epic 31)')` — 9 tests (lines 908-1033)
- `describe('file_processing_error integration (Epic 31.2)')` — all tests (lines 1046-1181)

Update in moved tests:
- Import `SendMessageValidator` instead of `MessageHandler`
- Create validator with 3-param constructor: `new SendMessageValidator(mockConversationService, mockFileRepository, mockRateLimiter)`
- Update all `handler.validateSendMessage(...)` → `validator.validateSendMessage(...)`
- Update all `handler.waitForFileRecords(...)` → `validator.waitForFileRecords(...)`
- Update log assertion strings: `[MessageHandler]` → `[SendMessageValidator]`

### 2. Update MessageHandler.test.ts

**File:** `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts`

- Remove validation test blocks (moved to SendMessageValidator.test.ts)
- Keep: `describe('buildFileContext')`, `describe('streamClaudeResponse')` and any remaining tests
- Update MessageHandler constructor calls: remove `fileRepository` and `rateLimiter` params (now 5-param)
- Update imports: remove `SendMessagePayload`, `SendMessageValidationResult` if no longer needed

### 3. Update other test files (constructor signature change)

These files instantiate MessageHandler with the old 7-param constructor. Update to 5-param:

**Files:**
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`

In each file:
- Remove `mockFileRepository` and `mockRateLimiter` from constructor call
- Update type imports if any reference validation types (import from `types/SendMessage.ts`)

### 4. Verify ChatServer.attachmentValidation.test.ts

**File:** `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`

This is an integration-style test that tests the full send_message flow through ChatServer. It should NOT need changes because it creates ChatServer (which internally creates the validator). Just verify it passes.

### 5. Run full test suite

```bash
pnpm --filter @guardian/backend test:unit
pnpm --filter @guardian/backend test:integration
```

All tests must pass. Zero regressions.

### 6. Browser QA (Chrome DevTools MCP)

Test ALL mode paths because validation is shared:

1. **Consult mode text message** — send "Hello", verify response streams normally
2. **Consult mode file upload** — upload a file with no text, verify placeholder text and response
3. **Assessment mode file upload** — upload vendor doc, verify enrichment in backend logs: `[BackgroundEnrichment] Background enrichment completed`
4. **Scoring mode file upload** — upload YAML/doc, verify scoring triggers (bypasses Claude)

**What to check in logs:**
- `[SendMessageValidator] validateSendMessage` timing logs appear (not `[MessageHandler]`)
- No console errors
- `mode=consult|assessment|scoring` confirmed in logs

## Files Touched

- `packages/backend/__tests__/unit/infrastructure/websocket/services/SendMessageValidator.test.ts` - CREATE
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - MODIFY (remove validation tests, update constructor)
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts` - MODIFY (constructor)
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts` - MODIFY (constructor)
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts` - MODIFY (constructor)
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts` - MODIFY (constructor)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story. Verification:
- `pnpm --filter @guardian/backend test:unit` — all pass
- `pnpm --filter @guardian/backend test:integration` — all pass
- Browser QA — all 4 mode paths verified

## Definition of Done

- [ ] Validation tests in new file, passing
- [ ] All constructor signatures updated
- [ ] Full unit suite passes (2053+ tests)
- [ ] Integration tests pass
- [ ] Browser QA all 4 paths verified
- [ ] No console errors in backend logs
- [ ] Log prefixes show `[SendMessageValidator]`
