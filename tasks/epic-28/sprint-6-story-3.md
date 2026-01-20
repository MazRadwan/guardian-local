# Story 28.10.3: Extract AssessmentModeStrategy.ts (optional)

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Implement AssessmentModeStrategy for assessment mode behavior (background enrichment).

**Note:** This story is optional. Skip if time is limited.

---

## Acceptance Criteria

- [ ] `AssessmentModeStrategy.ts` created at `infrastructure/websocket/modes/`
- [ ] Implements IModeStrategy
- [ ] Background enrichment in postProcess
- [ ] System prompt enhancement for assessment
- [ ] Unit tests cover strategy behavior

---

## Technical Approach

```typescript
// infrastructure/websocket/modes/AssessmentModeStrategy.ts

import { IModeStrategy, ModeContext, PreProcessResult, PostProcessResult } from './IModeStrategy';

export class AssessmentModeStrategy implements IModeStrategy {
  readonly mode = 'assessment' as const;

  async preProcess(context: ModeContext): Promise<PreProcessResult> {
    return {};
  }

  async postProcess(context: ModeContext, response: string): Promise<PostProcessResult> {
    // Trigger background enrichment if documents present
    return {
      enrichInBackground: context.hasDocuments,
    };
  }

  async enhanceSystemPrompt(basePrompt: string, context: ModeContext): Promise<string> {
    return `${basePrompt}

## Assessment Mode Instructions
Help the user evaluate AI vendor solutions using the Guardian assessment framework. Guide them through:
1. Uploading vendor documentation
2. Identifying key capabilities and risks
3. Generating comprehensive questionnaires`;
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/modes/AssessmentModeStrategy.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/modes/AssessmentModeStrategy.test.ts` - Create

---

## Tests Required

```typescript
describe('AssessmentModeStrategy', () => {
  it('should trigger background enrichment when documents present', async () => {
    const strategy = new AssessmentModeStrategy();
    const result = await strategy.postProcess(
      { conversationId: 'conv-1', userId: 'user-1', fileIds: ['f1'], hasDocuments: true },
      'Response text'
    );
    expect(result.enrichInBackground).toBe(true);
  });

  it('should enhance system prompt', async () => {
    const strategy = new AssessmentModeStrategy();
    const enhanced = await strategy.enhanceSystemPrompt(
      'Base prompt',
      { conversationId: 'conv-1', userId: 'user-1', fileIds: [], hasDocuments: false }
    );
    expect(enhanced).toContain('Assessment Mode');
    expect(enhanced).toContain('Guardian assessment framework');
  });
});
```

---

## Definition of Done

- [ ] AssessmentModeStrategy created
- [ ] Unit tests passing
