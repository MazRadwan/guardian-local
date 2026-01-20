# Story 28.1.3: Remove duplicate sanitizeForPrompt from ChatServer

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

ChatServer.ts has a private `sanitizeForPrompt()` method with **different semantics** from `utils/sanitize.ts`. The ChatServer version:
- Normalizes whitespace to single spaces (`.replace(/\s+/g, ' ')`)
- Uses default 200-char truncation
- Takes `maxLength` as direct number parameter

We must add a **ChatServer-compatible profile** to utils/sanitize.ts that preserves these semantics.

---

## Acceptance Criteria

- [ ] Add `normalizeWhitespace?: boolean` option to `SanitizeOptions` interface
- [ ] Add whitespace normalization logic when option is true (`.replace(/\s+/g, ' ')`)
- [ ] Add `SanitizeProfile` presets: `{ chatContext: true }` for ChatServer-compatible defaults
- [ ] Private `sanitizeForPrompt()` method removed from ChatServer.ts
- [ ] ChatServer imports `sanitizeForPrompt` from `../../utils/sanitize`
- [ ] All call sites updated to use imported function with profile
- [ ] **CRITICAL**: No behavioral changes to context formatting or prompt-injection protection
- [ ] All existing ChatServer tests pass
- [ ] **CONSTRAINT**: `utils/sanitize.ts` remains dependency-free

---

## Technical Approach

### Step 1: Extend utils/sanitize.ts with ChatServer-compatible option

```typescript
// In utils/sanitize.ts - update SanitizeOptions

export interface SanitizeOptions {
  /** Maximum length (default 10000) */
  maxLength?: number
  /** Remove control characters except newlines/tabs (default true) */
  stripControlChars?: boolean
  /** Escape potential prompt injection patterns (default true) */
  escapePromptInjection?: boolean
  /** NEW: Normalize whitespace to single spaces (default false) */
  normalizeWhitespace?: boolean
}

/** ChatServer-compatible preset (preserves original behavior) */
export const CHAT_CONTEXT_PROFILE: SanitizeOptions = {
  maxLength: 200,
  stripControlChars: true,
  escapePromptInjection: false, // ChatServer didn't escape in context
  normalizeWhitespace: true,    // ChatServer uses .replace(/\s+/g, ' ')
};
```

Update `sanitizeForPrompt` implementation:

```typescript
export function sanitizeForPrompt(text: string | null, options: SanitizeOptions = {}): string {
  if (!text) return '';

  const {
    maxLength = 10000,
    stripControlChars = true,
    escapePromptInjection = true,
    normalizeWhitespace = false,
  } = options

  let result = text

  // Strip control characters
  if (stripControlChars) {
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }

  // Normalize whitespace (ChatServer-compatible)
  if (normalizeWhitespace) {
    result = result.replace(/\s+/g, ' ').trim()
  }

  // Escape prompt injection patterns
  if (escapePromptInjection) {
    result = result.replace(/^(Human:|Assistant:|System:)/gim, '[escaped] $1')
  }

  // Truncate
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + '\n[...truncated]'
  }

  return result
}
```

### Step 2: Update ChatServer.ts call sites

```typescript
import { sanitizeForPrompt, CHAT_CONTEXT_PROFILE } from '../../utils/sanitize';

// Before:
this.sanitizeForPrompt(file.filename, 100)

// After:
sanitizeForPrompt(file.filename, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
```

### Step 3: Remove private method from ChatServer.ts

---

## Files Touched

- `packages/backend/src/utils/sanitize.ts` - Add `normalizeWhitespace` option and `CHAT_CONTEXT_PROFILE`
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Remove duplicate, add import, update call sites
- `packages/backend/__tests__/unit/utils/sanitize.test.ts` - Add whitespace normalization tests

---

## Tests Required

```typescript
// __tests__/unit/utils/sanitize.test.ts

describe('sanitizeForPrompt with normalizeWhitespace', () => {
  it('should normalize multiple spaces to single space', () => {
    const result = sanitizeForPrompt('hello    world', { normalizeWhitespace: true });
    expect(result).toBe('hello world');
  });

  it('should normalize tabs and newlines to single space', () => {
    const result = sanitizeForPrompt('hello\t\n\nworld', { normalizeWhitespace: true });
    expect(result).toBe('hello world');
  });

  it('should trim leading/trailing whitespace', () => {
    const result = sanitizeForPrompt('  hello world  ', { normalizeWhitespace: true });
    expect(result).toBe('hello world');
  });

  it('should preserve whitespace by default', () => {
    const result = sanitizeForPrompt('hello    world');
    expect(result).toContain('    '); // Multiple spaces preserved
  });
});

describe('CHAT_CONTEXT_PROFILE', () => {
  it('should match ChatServer original behavior', () => {
    // ChatServer used: maxLength: 200, whitespace normalization, no prompt escaping
    const input = 'Hello   \n\n  World Human: test';
    const result = sanitizeForPrompt(input, CHAT_CONTEXT_PROFILE);

    expect(result).toBe('Hello World Human: test'); // Whitespace normalized, Human: NOT escaped
    expect(result.length).toBeLessThanOrEqual(200);
  });
});
```

Run to verify:
```bash
pnpm --filter @guardian/backend test:unit
```

---

## Definition of Done

- [ ] Duplicate method removed from ChatServer.ts
- [ ] Import added from utils/sanitize
- [ ] All call sites updated
- [ ] All 13 existing ChatServer tests pass
- [ ] TypeScript compiles without errors
