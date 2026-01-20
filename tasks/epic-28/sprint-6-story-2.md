# Story 28.10.2: Extract ConsultModeStrategy.ts (optional)

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Implement ConsultModeStrategy for consult mode behavior (auto-summarize documents).

**Note:** This story is optional. Skip if time is limited.

---

## Acceptance Criteria

- [ ] `ConsultModeStrategy.ts` created at `infrastructure/websocket/modes/`
- [ ] Implements IModeStrategy
- [ ] Auto-summarize logic in postProcess
- [ ] Unit tests cover strategy behavior

---

## Technical Approach

```typescript
// infrastructure/websocket/modes/ConsultModeStrategy.ts

import { IModeStrategy, ModeContext, PreProcessResult, PostProcessResult } from './IModeStrategy';

export class ConsultModeStrategy implements IModeStrategy {
  readonly mode = 'consult' as const;

  async preProcess(context: ModeContext): Promise<PreProcessResult> {
    // No special pre-processing for consult mode
    return {};
  }

  async postProcess(context: ModeContext, response: string): Promise<PostProcessResult> {
    // Trigger auto-summarize if documents present
    return {
      autoSummarize: context.hasDocuments,
    };
  }

  async enhanceSystemPrompt(basePrompt: string, context: ModeContext): Promise<string> {
    // No additions for consult mode
    return basePrompt;
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/modes/ConsultModeStrategy.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/modes/ConsultModeStrategy.test.ts` - Create

---

## Tests Required

```typescript
describe('ConsultModeStrategy', () => {
  it('should trigger auto-summarize when documents present', async () => {
    const strategy = new ConsultModeStrategy();
    const result = await strategy.postProcess(
      { conversationId: 'conv-1', userId: 'user-1', fileIds: ['f1'], hasDocuments: true },
      'Response text'
    );
    expect(result.autoSummarize).toBe(true);
  });

  it('should not trigger auto-summarize when no documents', async () => {
    const strategy = new ConsultModeStrategy();
    const result = await strategy.postProcess(
      { conversationId: 'conv-1', userId: 'user-1', fileIds: [], hasDocuments: false },
      'Response text'
    );
    expect(result.autoSummarize).toBe(false);
  });
});
```

---

## Definition of Done

- [ ] ConsultModeStrategy created
- [ ] Unit tests passing
