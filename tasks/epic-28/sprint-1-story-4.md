# Story 28.1.4: Consolidate vendor name validation in QuestionnaireReadyService

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

QuestionnaireReadyService has a `validateVendorName()` method that performs similar validation to the new `isValidVendorName()` in `utils/sanitize.ts`. However, the signatures differ:
- `isValidVendorName(value): boolean` - pure validation check
- `validateVendorName(value): string | null` - validates AND sanitizes

We need to refactor to use the shared validation while preserving the sanitization behavior.

---

## Acceptance Criteria

- [ ] QuestionnaireReadyService uses `isValidVendorName` from utils/sanitize for validation
- [ ] `validateVendorName()` method updated to use shared validation + existing sanitization
- [ ] **Story 26.2 parity test**: QuestionnaireReadyService still rejects numeric/option-token vendor names ("1", "2", "123") via shared `isValidVendorName`
- [ ] No behavioral changes (same outputs for same inputs)
- [ ] Existing tests pass

---

## Technical Approach

The current `validateVendorName` in QuestionnaireReadyService (line 78):
```typescript
private validateVendorName(value: unknown): string | null {
  const sanitized = this.sanitizeString(value);
  if (!sanitized) return null;

  // Reject numeric-only values
  if (/^\d+$/.test(sanitized)) return null;

  // Reject single character values
  if (sanitized.length < 2) return null;

  return sanitized;
}
```

Refactored approach:
```typescript
import { isValidVendorName } from '../../utils/sanitize';

private validateVendorName(value: unknown): string | null {
  const sanitized = this.sanitizeString(value);
  if (!sanitized) return null;

  // Use shared validation from utils/sanitize
  if (!isValidVendorName(sanitized)) {
    console.log(`[QuestionnaireReadyService] Rejecting invalid vendor name: "${sanitized}"`);
    return null;
  }

  return sanitized;
}
```

This preserves the sanitization step and return type while using the shared validation logic.

---

## Files Touched

- `packages/backend/src/application/services/QuestionnaireReadyService.ts` - Add import, update validateVendorName

---

## Tests Required

```typescript
// Verify Story 26.2 parity - QuestionnaireReadyService rejects via shared validation
describe('QuestionnaireReadyService validateVendorName', () => {
  it('should reject numeric-only values via isValidVendorName', () => {
    // These must still be rejected after consolidation
    expect(service.validateVendorName('1')).toBeNull();
    expect(service.validateVendorName('123')).toBeNull();
    expect(service.validateVendorName('42')).toBeNull();
  });

  it('should reject single character option tokens', () => {
    expect(service.validateVendorName('A')).toBeNull();
    expect(service.validateVendorName('B')).toBeNull();
  });

  it('should accept valid vendor names after sanitization', () => {
    expect(service.validateVendorName('Acme Corp')).toBe('Acme Corp');
    expect(service.validateVendorName('  AWS  ')).toBe('AWS'); // sanitized
  });
});
```

Run to verify:
```bash
pnpm --filter @guardian/backend test:unit
```

---

## Definition of Done

- [ ] Import added from utils/sanitize
- [ ] validateVendorName uses isValidVendorName for validation
- [ ] Sanitization step preserved
- [ ] All existing tests pass
- [ ] TypeScript compiles without errors
