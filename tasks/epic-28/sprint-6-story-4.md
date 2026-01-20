# Story 28.10.4: Extract ScoringModeStrategy.ts (optional)

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Implement ScoringModeStrategy for scoring mode behavior (trigger scoring after response).

**Note:** This story is optional. Skip if time is limited.

---

## Acceptance Criteria

- [ ] `ScoringModeStrategy.ts` created at `infrastructure/websocket/modes/`
- [ ] Implements IModeStrategy
- [ ] Scoring trigger in postProcess
- [ ] System prompt enhancement for scoring
- [ ] Unit tests cover strategy behavior

---

## Technical Approach

```typescript
// infrastructure/websocket/modes/ScoringModeStrategy.ts

import { IModeStrategy, ModeContext, PreProcessResult, PostProcessResult } from './IModeStrategy';

export class ScoringModeStrategy implements IModeStrategy {
  readonly mode = 'scoring' as const;

  async preProcess(context: ModeContext): Promise<PreProcessResult> {
    return {};
  }

  async postProcess(context: ModeContext, response: string): Promise<PostProcessResult> {
    // Trigger scoring if documents present
    return {
      triggerScoring: context.hasDocuments,
    };
  }

  async enhanceSystemPrompt(basePrompt: string, context: ModeContext): Promise<string> {
    return `${basePrompt}

## Scoring Mode Instructions
Analyze completed vendor questionnaires using the Guardian rubric. Provide:
- Composite risk score (0-100)
- Per-dimension breakdown
- Executive summary
- Recommendation (Approve/Conditional/Decline)`;
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
