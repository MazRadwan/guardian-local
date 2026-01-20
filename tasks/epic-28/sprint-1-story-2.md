# Story 28.1.2: Extend sanitize.ts with isValidVendorName()

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Extract the `isValidVendorName()` function from ChatServer.ts and add it to `utils/sanitize.ts`. This validates vendor names to reject invalid values like "1" or single characters that come from user selecting menu options instead of typing vendor names.

---

## Acceptance Criteria

- [ ] `isValidVendorName(value: string | null | undefined): boolean` function added to `utils/sanitize.ts`
- [ ] Rejects: null, undefined, empty strings, numeric-only values, single characters
- [ ] Accepts: valid vendor names like "Acme Corp", "AWS", "Microsoft Azure"
- [ ] Unit tests cover all validation cases
- [ ] ChatServer.ts continues to compile

---

## Technical Approach

```typescript
// In utils/sanitize.ts

/**
 * Validate vendor name for title generation
 *
 * Rejects invalid values that come from user selecting menu options
 * (like "1", "2", "3") instead of actual vendor names.
 *
 * @param value - The vendor name to validate
 * @returns true if valid vendor name, false otherwise
 */
export function isValidVendorName(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  // Reject empty strings
  if (trimmed.length === 0) {
    return false;
  }

  // Reject single characters (likely menu option tokens)
  if (trimmed.length === 1) {
    return false;
  }

  // Reject numeric-only values (menu selections like "1", "2", "3")
  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  return true;
}
```

---

## Files Touched

- `packages/backend/src/utils/sanitize.ts` - Add isValidVendorName function
- `packages/backend/__tests__/unit/utils/sanitize.test.ts` - Add unit tests

---

## Tests Required

```typescript
// __tests__/unit/utils/sanitize.test.ts

describe('isValidVendorName', () => {
  describe('rejects invalid values', () => {
    it('should reject null', () => {
      expect(isValidVendorName(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidVendorName(undefined)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidVendorName('')).toBe(false);
      expect(isValidVendorName('   ')).toBe(false);
    });

    it('should reject single characters', () => {
      expect(isValidVendorName('1')).toBe(false);
      expect(isValidVendorName('A')).toBe(false);
    });

    it('should reject numeric-only values', () => {
      expect(isValidVendorName('123')).toBe(false);
      expect(isValidVendorName('42')).toBe(false);
    });
  });

  describe('accepts valid vendor names', () => {
    it('should accept normal vendor names', () => {
      expect(isValidVendorName('Acme Corp')).toBe(true);
      expect(isValidVendorName('AWS')).toBe(true);
      expect(isValidVendorName('Microsoft Azure')).toBe(true);
    });

    it('should accept names with numbers', () => {
      expect(isValidVendorName('Web3 Solutions')).toBe(true);
      expect(isValidVendorName('24/7 Support Inc')).toBe(true);
    });

    it('should accept two-character names', () => {
      expect(isValidVendorName('AI')).toBe(true);
      expect(isValidVendorName('HP')).toBe(true);
    });
  });
});
```

---

## Definition of Done

- [ ] Code implemented and compiles
- [ ] Unit tests written and passing
- [ ] No regressions in existing tests
