# Story 28.1.3: Remove duplicate sanitizeForPrompt from ChatServer

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

ChatServer.ts has a private `sanitizeForPrompt()` method that duplicates functionality in `utils/sanitize.ts`. Remove this duplicate and import from the canonical location to ensure consistent security behavior.

---

## Acceptance Criteria

- [ ] Private `sanitizeForPrompt()` method removed from ChatServer.ts
- [ ] ChatServer imports `sanitizeForPrompt` from `../../utils/sanitize`
- [ ] All call sites updated to use imported function
- [ ] No behavioral changes (same sanitization logic)
- [ ] All existing ChatServer tests pass

---

## Technical Approach

1. Add import at top of ChatServer.ts:
```typescript
import { sanitizeForPrompt } from '../../utils/sanitize';
```

2. Remove private method (around lines 130-150):
```typescript
// DELETE THIS:
private sanitizeForPrompt(str: string | null, maxLength?: number): string {
  // ... duplicate implementation
}
```

3. Update call sites to remove `this.` prefix:
```typescript
// Before:
this.sanitizeForPrompt(file.filename, 100)

// After:
sanitizeForPrompt(file.filename, { maxLength: 100 })
```

Note: The existing `utils/sanitize.ts` uses an options object, so call sites need adjustment.

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Remove duplicate, add import, update call sites

---

## Tests Required

No new tests needed - existing ChatServer tests verify behavior is preserved.

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
