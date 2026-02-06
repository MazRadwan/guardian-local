# Story 35.1.3: Tests and Regression Verification

## Description

Write unit tests for the new `TitleUpdateService` and verify no regressions across all title generation scenarios. `ChatServer.titleGeneration.test.ts` stays unchanged — it tests mock functions and remains valid. The new test file tests the real `TitleUpdateService` class.

## Acceptance Criteria

- [ ] `TitleUpdateService.test.ts` created with comprehensive unit tests
- [ ] Tests cover `generateTitleIfNeeded()` for all modes (consult, assessment, scoring)
- [ ] Tests cover all guard conditions (scoring skip, message count, manual edit, placeholder detection)
- [ ] Tests cover vendor info update path (assessment at 5 messages)
- [ ] Tests cover `updateScoringTitle()` with filename truncation
- [ ] Tests cover error handling (non-fatal, logged, not thrown)
- [ ] Tests verify `conversation_title_updated` socket event emission
- [ ] Tests verify fire-and-forget pattern (no unhandled rejections)
- [ ] All existing tests still pass
- [ ] `pnpm --filter @guardian/backend test:unit` green

## Technical Approach

### 1. Create TitleUpdateService.test.ts

**File:** `packages/backend/__tests__/unit/infrastructure/websocket/services/TitleUpdateService.test.ts`

Test the **real** `TitleUpdateService` class with mocked dependencies:

```typescript
import { TitleUpdateService } from '../../../../../src/infrastructure/websocket/services/TitleUpdateService';

// Mock dependencies
const mockConversationService = {
  getMessageCount: jest.fn(),
  getConversation: jest.fn(),
  getFirstUserMessage: jest.fn(),
  getHistory: jest.fn(),
  updateTitleIfNotManuallyEdited: jest.fn(),
};

const mockTitleGenerationService = {
  generateModeAwareTitle: jest.fn(),
  formatScoringTitle: jest.fn(),
};

const mockSocket = {
  emit: jest.fn(),
} as unknown as IAuthenticatedSocket;
```

### 2. Test Coverage Matrix

**generateTitleIfNeeded guards:**
| Test | Condition | Expected |
|------|-----------|----------|
| Skip if no titleGenerationService | constructor arg undefined | Returns without calling anything |
| Skip for scoring mode | mode === 'scoring' | Returns without checking message count |
| Skip if message count wrong (consult) | count !== 2 | No title generation |
| Skip if message count wrong (assessment) | count not in [3, 5] | No title generation |
| Skip if conversation not found | getConversation returns null | No title generation |
| Skip if title manually edited | titleManuallyEdited === true | No title generation |
| Skip if title already set (not placeholder) | title is real, not vendor update | No title generation |

**generateTitleIfNeeded success paths:**
| Test | Condition | Expected |
|------|-----------|----------|
| Consult mode at 2 messages | Placeholder title, first user message exists | generateModeAwareTitle called, event emitted |
| Assessment mode at 3 messages | Placeholder title | Same |
| Assessment mode at 5 messages (vendor update) | Real title OK to overwrite | Second user message used, event emitted |
| Title update returns false (race) | updateTitleIfNotManuallyEdited returns false | No event emitted |

**updateScoringTitle:**
| Test | Condition | Expected |
|------|-----------|----------|
| Normal filename | Short filename | "Scoring: filename.yaml" title, event emitted |
| Long filename truncation | >41 char filename | Truncated with extension preserved |
| Delegates to formatScoringTitle | titleGenerationService exists | Calls formatScoringTitle instead of inline logic |
| Manual edit protection | updateTitleIfNotManuallyEdited returns false | No event emitted |

**Error handling:**
| Test | Condition | Expected |
|------|-----------|----------|
| Title service throws | generateModeAwareTitle rejects | Error caught, logged, not thrown |
| DB error | getConversation rejects | Error caught, logged, not thrown |

**Output parity regression (Codex recommendation):**
| Test | Condition | Expected |
|------|-----------|----------|
| Scoring title matches original behavior | Representative filename with extension | Output identical to what MessageHandler.updateScoringTitle produced |

### 3. Verify existing test coverage

Run full test suite and confirm:
- `ChatServer.titleGeneration.test.ts` still passes (tests mock functions, not class — still valid)
- `ChatServer.isRegenerate.test.ts` still passes
- All MessageHandler tests pass with updated constructor

## Files Touched

- `packages/backend/__tests__/unit/infrastructure/websocket/services/TitleUpdateService.test.ts` - CREATE

## Tests Affected

None — this story only creates a new test file. All existing tests should already pass after Story 35.1.2.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Guard: skip if no titleGenerationService
- [ ] Guard: skip for scoring mode
- [ ] Guard: skip if wrong message count (consult)
- [ ] Guard: skip if wrong message count (assessment)
- [ ] Guard: skip if conversation not found
- [ ] Guard: skip if title manually edited
- [ ] Guard: skip if title already set (not placeholder, not vendor update)
- [ ] Success: consult mode title at 2 messages
- [ ] Success: assessment mode title at 3 messages
- [ ] Success: assessment vendor update at 5 messages
- [ ] Success: title update race (no event emitted)
- [ ] Scoring: normal filename
- [ ] Scoring: long filename truncation with extension
- [ ] Scoring: delegates to formatScoringTitle
- [ ] Scoring: manual edit protection
- [ ] Error: title service throws → caught and logged
- [ ] Error: DB error → caught and logged
- [ ] Regression: scoring title output parity with original MessageHandler behavior
- [ ] Full suite: `pnpm --filter @guardian/backend test:unit` green

## Definition of Done

- [ ] TitleUpdateService.test.ts created with 15+ test cases
- [ ] All test cases passing
- [ ] Full unit test suite green
- [ ] No TypeScript errors
- [ ] No lint errors
