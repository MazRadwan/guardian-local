# Story 28.9.4: Extract MessageHandler.ts (mode-specific routing)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add mode-specific routing logic to MessageHandler. Different modes (consult, assessment, scoring) have different behaviors for message processing, including tool enablement and scoring mode bypass.

---

## Acceptance Criteria

- [ ] `getModeConfig()` method returns mode-specific settings
- [ ] **Consult mode:** enableTools=false (NO tools), autoSummarize for empty file-only messages
- [ ] **Assessment mode:** enableTools=true (ONLY mode with tools), background enrichment for files
- [ ] **Scoring mode:** enableTools=false, bypassClaude=true (triggers `triggerScoringOnSend` instead)
- [ ] `shouldBypassClaude()` method for scoring mode detection
- [ ] Unit tests cover all mode configurations

---

## Technical Approach

```typescript
// Add to MessageHandler.ts

export interface ModeConfig {
  mode: 'consult' | 'assessment' | 'scoring';
  enableTools: boolean;           // ONLY true in assessment mode
  autoSummarize: boolean;         // Auto-summarize empty file-only messages in consult
  backgroundEnrich: boolean;      // Background enrichment in assessment mode
  bypassClaude: boolean;          // Scoring mode bypasses Claude entirely
}

/**
 * Get mode-specific configuration for message processing
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Tools are ONLY enabled in assessment mode (shouldUseTool = mode === 'assessment')
 * 2. Scoring mode bypasses Claude entirely - triggers triggerScoringOnSend instead
 * 3. Consult mode auto-summarizes empty file-only messages
 * 4. Assessment mode does background enrichment for files
 */
getModeConfig(mode: string): ModeConfig {
  switch (mode) {
    case 'assessment':
      return {
        mode: 'assessment',
        enableTools: true,         // ONLY assessment mode has tools
        autoSummarize: false,
        backgroundEnrich: true,    // Enrich files in background
        bypassClaude: false,
      };

    case 'scoring':
      return {
        mode: 'scoring',
        enableTools: false,        // No tools in scoring
        autoSummarize: false,
        backgroundEnrich: false,
        bypassClaude: true,        // Bypass Claude, trigger scoring directly
      };

    case 'consult':
    default:
      return {
        mode: 'consult',
        enableTools: false,        // No tools in consult
        autoSummarize: true,       // Auto-summarize empty file messages
        backgroundEnrich: false,
        bypassClaude: false,
      };
  }
}

/**
 * Check if Claude should be bypassed for this mode
 *
 * CRITICAL: In scoring mode with attachments, we bypass Claude entirely
 * and trigger scoring directly. This is the "trigger-on-send" pattern.
 */
shouldBypassClaude(
  mode: string,
  hasAttachments: boolean
): { bypass: boolean; reason?: 'scoring' } {
  const config = this.getModeConfig(mode);

  if (config.bypassClaude && hasAttachments) {
    return { bypass: true, reason: 'scoring' };
  }

  return { bypass: false };
}

/**
 * Check if auto-summarize should trigger
 *
 * CRITICAL: In consult mode, when user sends files without text,
 * auto-generate a summary to kickstart the conversation.
 */
shouldAutoSummarize(
  mode: string,
  hasText: boolean,
  hasAttachments: boolean
): boolean {
  const config = this.getModeConfig(mode);
  return config.autoSummarize && !hasText && hasAttachments;
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Add methods
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('getModeConfig', () => {
  it('should return consult config with NO tools', () => {
    const config = handler.getModeConfig('consult');
    expect(config.mode).toBe('consult');
    expect(config.enableTools).toBe(false);  // CRITICAL: No tools in consult
    expect(config.autoSummarize).toBe(true);
    expect(config.bypassClaude).toBe(false);
  });

  it('should return assessment config as ONLY mode with tools', () => {
    const config = handler.getModeConfig('assessment');
    expect(config.mode).toBe('assessment');
    expect(config.enableTools).toBe(true);   // CRITICAL: ONLY assessment has tools
    expect(config.backgroundEnrich).toBe(true);
    expect(config.bypassClaude).toBe(false);
  });

  it('should return scoring config with Claude bypass', () => {
    const config = handler.getModeConfig('scoring');
    expect(config.mode).toBe('scoring');
    expect(config.enableTools).toBe(false);  // No tools in scoring
    expect(config.bypassClaude).toBe(true);  // Bypass Claude
  });

  it('should default to consult for unknown mode', () => {
    const config = handler.getModeConfig('unknown');
    expect(config.mode).toBe('consult');
    expect(config.enableTools).toBe(false);
  });
});

describe('shouldBypassClaude', () => {
  it('should bypass Claude in scoring mode with attachments', () => {
    const result = handler.shouldBypassClaude('scoring', true);
    expect(result.bypass).toBe(true);
    expect(result.reason).toBe('scoring');
  });

  it('should NOT bypass Claude in scoring mode without attachments', () => {
    const result = handler.shouldBypassClaude('scoring', false);
    expect(result.bypass).toBe(false);
  });

  it('should NOT bypass Claude in assessment mode even with attachments', () => {
    const result = handler.shouldBypassClaude('assessment', true);
    expect(result.bypass).toBe(false);
  });

  it('should NOT bypass Claude in consult mode', () => {
    const result = handler.shouldBypassClaude('consult', true);
    expect(result.bypass).toBe(false);
  });
});

describe('shouldAutoSummarize', () => {
  it('should auto-summarize in consult mode with files and no text', () => {
    expect(handler.shouldAutoSummarize('consult', false, true)).toBe(true);
  });

  it('should NOT auto-summarize in consult mode with text', () => {
    expect(handler.shouldAutoSummarize('consult', true, true)).toBe(false);
  });

  it('should NOT auto-summarize in assessment mode', () => {
    expect(handler.shouldAutoSummarize('assessment', false, true)).toBe(false);
  });

  it('should NOT auto-summarize in scoring mode', () => {
    expect(handler.shouldAutoSummarize('scoring', false, true)).toBe(false);
  });
});
```

---

## Important Note: Tool Enablement

The original ChatServer.ts code is explicit about tool enablement:

```typescript
// Line 1641 in ChatServer.ts
const shouldUseTool = mode === 'assessment';
```

This means:
- **Assessment mode:** Tools enabled (questionnaire_ready tool)
- **Consult mode:** NO tools (just conversation)
- **Scoring mode:** NO tools (bypasses Claude entirely)

Do NOT add tools to consult mode. The original implementation is intentional.

---

## Definition of Done

- [ ] getModeConfig implemented with correct tool settings
- [ ] Tools ONLY enabled in assessment mode
- [ ] Scoring mode bypasses Claude (bypassClaude=true)
- [ ] shouldBypassClaude() method implemented
- [ ] shouldAutoSummarize() method implemented
- [ ] Unit tests passing
