# Story 34.1.4: Tests and Regression Verification

## Description

Add unit tests for `ConsultToolLoopService` and verify no regressions in existing functionality. Includes a manual QA checklist for user verification.

## Acceptance Criteria

- [ ] Unit tests created for `ConsultToolLoopService`
- [ ] Tests cover: single search, multi-search, abort, max iterations, errors
- [ ] All existing tests pass
- [ ] Manual QA checklist completed by user

## Technical Approach

### Step 1: Create Unit Tests

```typescript
// FILE: packages/backend/__tests__/unit/ConsultToolLoopService.test.ts

import { ConsultToolLoopService } from '../../src/application/services/ConsultToolLoopService.js';
import type { IClaudeClient } from '../../src/application/interfaces/IClaudeClient.js';
import type { ToolUseRegistry } from '../../src/infrastructure/websocket/ToolUseRegistry.js';
import type { ConversationService } from '../../src/application/services/ConversationService.js';

describe('ConsultToolLoopService', () => {
  let service: ConsultToolLoopService;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockToolRegistry: jest.Mocked<ToolUseRegistry>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockSocket: any;

  beforeEach(() => {
    // Setup mocks
    mockClaudeClient = {
      continueWithToolResult: jest.fn(),
    } as any;

    mockToolRegistry = {
      dispatch: jest.fn(),
    } as any;

    mockConversationService = {
      sendMessage: jest.fn(),
    } as any;

    mockSocket = {
      emit: jest.fn(),
      data: { abortRequested: false },
      userId: 'test-user',
    };

    service = new ConsultToolLoopService(
      mockClaudeClient,
      mockToolRegistry,
      mockConversationService
    );
  });

  describe('execute', () => {
    // Test cases listed below
  });
});
```

### Test Cases to Implement

1. **Single search iteration**
   - Tool dispatched once
   - Result returned to Claude
   - Final response streamed
   - Message saved to DB

2. **Multi-search (2 iterations)**
   - First search returns, Claude requests second
   - Second search completes
   - Context accumulated correctly

3. **Max iterations (3) reached**
   - Three searches complete
   - Claude requests fourth
   - `is_error: true` tool_result sent
   - Claude concludes with available info

4. **Abort before tool execution**
   - `socket.data.abortRequested = true` before dispatch
   - Loop exits cleanly
   - `wasAborted: true` in result

5. **Abort during tool execution**
   - Abort set while tool running
   - Loop exits after current tool
   - Partial response preserved

6. **Abort during stream**
   - Abort set while streaming
   - Stream stops
   - Partial response saved

7. **Tool dispatch error**
   - `toolRegistry.dispatch` returns error
   - `is_error: true` tool_result sent
   - Claude handles gracefully

8. **tool_status events emitted correctly**
   - `searching` emitted before dispatch
   - `reading` emitted before continuation
   - `idle` emitted on completion

### Step 2: Run All Existing Tests

```bash
pnpm test:unit
pnpm test:integration
```

All must pass.

### Step 3: Manual QA Checklist

User must verify these scenarios work:

**Basic Web Search:**
- [ ] Ask "What are the latest PIPEDA changes in 2026?"
- [ ] Search indicator appears ("Searching the web...")
- [ ] Results appear with Sources section
- [ ] Response is complete and coherent

**Multi-Search:**
- [ ] Ask "Compare Canadian AI regulations to EU AI Act 2026 updates"
- [ ] Multiple searches may occur
- [ ] Context from first search informs second
- [ ] Final response synthesizes all results

**Abort During Search:**
- [ ] Start a search query
- [ ] Click Stop button while "Searching..."
- [ ] Search stops cleanly
- [ ] No error shown

**Max Iterations:**
- [ ] Ask a complex query that might need many searches
- [ ] After 3 searches, Claude concludes
- [ ] Response indicates it used available info
- [ ] No infinite loop

**Error Handling:**
- [ ] If Jina API fails, error message shown
- [ ] UI returns to normal state
- [ ] Can send new message

## Files Touched

- `packages/backend/__tests__/unit/ConsultToolLoopService.test.ts` - CREATE
- May need to update existing test mocks if they reference old MessageHandler methods

## Agent Assignment

- [x] backend-agent

## Definition of Done

- [ ] Unit tests created and passing
- [ ] All 8 test scenarios covered
- [ ] All existing tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Manual QA checklist provided to user
- [ ] User confirms manual QA passed
