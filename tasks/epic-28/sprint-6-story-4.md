# Story 28.10.4: Extract ScoringModeStrategy.ts (optional)

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Implement ScoringModeStrategy for scoring mode behavior.

**Note:** This story is optional. Skip if time is limited.

**IMPORTANT - Scoring Mode with Attachments Bypass:**
In the current ChatServer implementation (lines 1508-1576), scoring mode with attachments **bypasses Claude entirely** and triggers `triggerScoringOnSend()` directly. This means:
- The ScoringModeStrategy's `postProcess` will NOT be called when attachments are present
- The strategy only applies to scoring mode **without** attachments (follow-up questions)
- The actual scoring is triggered synchronously in the send_message handler, not via strategy

This strategy should handle **follow-up scoring questions** (text-only, no new attachments).

---

## Acceptance Criteria

- [ ] `ScoringModeStrategy.ts` created at `infrastructure/websocket/modes/`
- [ ] Implements IModeStrategy
- [ ] **Handles follow-up questions only** (scoring with attachments bypasses strategy)
- [ ] System prompt enhancement for scoring context
- [ ] Unit tests cover strategy behavior for follow-up scenarios

---

## Technical Approach

```typescript
// infrastructure/websocket/modes/ScoringModeStrategy.ts

import { IModeStrategy, ModeContext, PreProcessResult, PostProcessResult } from './IModeStrategy';

export class ScoringModeStrategy implements IModeStrategy {
  readonly mode = 'scoring' as const;

  /**
   * Pre-process for scoring mode.
   * Note: Messages WITH attachments bypass Claude entirely (trigger-on-send pattern).
   * This strategy only handles follow-up questions (text-only).
   */
  async preProcess(context: ModeContext): Promise<PreProcessResult> {
    // No pre-processing needed - scoring with attachments is handled directly
    return {};
  }

  /**
   * Post-process for scoring mode follow-up questions.
   * Note: This is NOT called for initial scoring (attachments trigger scoring directly).
   */
  async postProcess(context: ModeContext, response: string): Promise<PostProcessResult> {
    // For follow-up questions, we don't re-trigger scoring
    // The original scoring results are already in conversation history
    return {
      triggerScoring: false,  // Follow-ups don't re-trigger
    };
  }

  async enhanceSystemPrompt(basePrompt: string, context: ModeContext): Promise<string> {
    return `${basePrompt}

## Scoring Mode Context
You are in scoring mode. The user may ask follow-up questions about:
- A previous scoring analysis
- Specific dimension scores
- Risk recommendations
- Vendor evaluation details

Refer to the conversation history for the original scoring results.`;
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/modes/ScoringModeStrategy.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/modes/ScoringModeStrategy.test.ts` - Create

---

## Tests Required

```typescript
describe('ScoringModeStrategy', () => {
  it('should trigger scoring when documents present', async () => {
    const strategy = new ScoringModeStrategy();
    const result = await strategy.postProcess(
      { conversationId: 'conv-1', userId: 'user-1', fileIds: ['f1'], hasDocuments: true },
      'Response text'
    );
    expect(result.triggerScoring).toBe(true);
  });

  it('should enhance system prompt for scoring', async () => {
    const strategy = new ScoringModeStrategy();
    const enhanced = await strategy.enhanceSystemPrompt(
      'Base prompt',
      { conversationId: 'conv-1', userId: 'user-1', fileIds: [], hasDocuments: false }
    );
    expect(enhanced).toContain('Scoring Mode');
    expect(enhanced).toContain('Guardian rubric');
  });
});
```

---

## Definition of Done

- [ ] ScoringModeStrategy created
- [ ] Unit tests passing
