# Story 28.9.4: Extract MessageHandler.ts (mode-specific routing)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add mode-specific routing logic to MessageHandler. Different modes (consult, assessment, scoring) have different behaviors for message processing.

---

## Acceptance Criteria

- [ ] `getModeConfig()` method returns mode-specific settings
- [ ] Consult mode: auto-summarize documents, standard tools
- [ ] Assessment mode: background enrichment, assessment tools
- [ ] Scoring mode: scoring trigger after response
- [ ] Unit tests cover all mode configurations

---

## Technical Approach

```typescript
// Add to MessageHandler.ts

export interface ModeConfig {
  mode: 'consult' | 'assessment' | 'scoring';
  enableTools: boolean;
  autoSummarize: boolean;
  backgroundEnrich: boolean;
  triggerScoringOnResponse: boolean;
  systemPromptAdditions?: string;
}

/**
 * Get mode-specific configuration for message processing
 */
getModeConfig(mode: string): ModeConfig {
  switch (mode) {
    case 'assessment':
      return {
        mode: 'assessment',
        enableTools: true,
        autoSummarize: false,
        backgroundEnrich: true,
        triggerScoringOnResponse: false,
        systemPromptAdditions: 'Help the user evaluate AI vendor solutions using the Guardian assessment framework.',
      };

    case 'scoring':
      return {
        mode: 'scoring',
        enableTools: false,
        autoSummarize: false,
        backgroundEnrich: false,
        triggerScoringOnResponse: true,
        systemPromptAdditions: 'Analyze completed vendor questionnaires and provide risk scoring.',
      };

    case 'consult':
    default:
      return {
        mode: 'consult',
        enableTools: true,
        autoSummarize: true,
        backgroundEnrich: false,
        triggerScoringOnResponse: false,
      };
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('getModeConfig', () => {
  it('should return consult config with auto-summarize', () => {
    const config = handler.getModeConfig('consult');
    expect(config.mode).toBe('consult');
    expect(config.autoSummarize).toBe(true);
    expect(config.triggerScoringOnResponse).toBe(false);
  });

  it('should return assessment config with background enrich', () => {
    const config = handler.getModeConfig('assessment');
    expect(config.mode).toBe('assessment');
    expect(config.backgroundEnrich).toBe(true);
    expect(config.enableTools).toBe(true);
  });

  it('should return scoring config with scoring trigger', () => {
    const config = handler.getModeConfig('scoring');
    expect(config.mode).toBe('scoring');
    expect(config.triggerScoringOnResponse).toBe(true);
    expect(config.enableTools).toBe(false);
  });

  it('should default to consult for unknown mode', () => {
    const config = handler.getModeConfig('unknown');
    expect(config.mode).toBe('consult');
  });
});
```

---

## Definition of Done

- [ ] getModeConfig implemented
- [ ] All mode configurations correct
- [ ] Unit tests passing
