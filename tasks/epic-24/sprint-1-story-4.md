# Story 24.4: Update Scoring Progress Text

## Description

Change the verbose progress text "Analyzing responses against rubric..." to the more concise "Analyzing scoring...".

**Why:** The current text is unnecessarily verbose. "Analyzing scoring..." is cleaner and conveys the same meaning.

## Acceptance Criteria

- [ ] Progress message changed from "Analyzing responses against rubric..." to "Analyzing scoring..."
- [ ] No other progress text regressions
- [ ] Backend unit test updated
- [ ] **Browser QA:** Trigger scoring, verify new text displays

## Technical Approach

### Backend Change

**Single line change (`packages/backend/src/application/services/ScoringService.ts:196`):**

```typescript
// Before:
onProgress?.({ status: 'scoring', message: 'Analyzing responses against rubric...' });

// After:
onProgress?.({ status: 'scoring', message: 'Analyzing scoring...' });
```

## Files Touched

- `packages/backend/src/application/services/ScoringService.ts:196` - Update progress message text

## Agent Assignment

**backend-agent**

## Tests Required

### Unit Tests

**`packages/backend/src/application/services/__tests__/ScoringService.test.ts`:**
```typescript
describe('score progress messages', () => {
  it('should emit "Analyzing scoring..." message', async () => {
    const onProgress = jest.fn();

    await scoringService.score(validInput, onProgress);

    // Find the scoring status progress call
    const scoringCall = onProgress.mock.calls.find(
      call => call[0].status === 'scoring' && !call[0].message.includes('Claude')
    );

    expect(scoringCall[0].message).toBe('Analyzing scoring...');
    expect(scoringCall[0].message).not.toContain('rubric');
  });
});
```

If there's an existing test asserting the old text, update it:
```typescript
// Before:
expect(progressMessages).toContain('Analyzing responses against rubric...');

// After:
expect(progressMessages).toContain('Analyzing scoring...');
```

## Browser QA Required

**Steps for Playwright MCP verification:**

1. Navigate to chat interface
2. Switch to Scoring mode
3. Upload a completed Guardian questionnaire
4. Wait for the "Analyzing scoring..." progress message
5. Take screenshot showing the new text

**Screenshot naming:**
- `24.4-analyzing-scoring-text.png`

**Success criteria:** Text MUST say "Analyzing scoring..." (NOT "Analyzing responses against rubric...")
