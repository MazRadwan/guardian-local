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
- [ ] **Story 26.2 behavior lock-in**: Tests explicitly document the exact validation rules used for title generation
- [ ] Unit tests cover all validation cases
- [ ] ChatServer.ts continues to compile
- [ ] **CONSTRAINT**: `utils/sanitize.ts` remains dependency-free (no application-layer imports)

---

## Technical Approach

```typescript
// In utils/sanitize.ts

/**
 * Validate vendor/solution name - rejects invalid values like numeric-only, single chars, etc.
 * Story 26.2 fix: Prevent bad tool input like "1" from becoming "Assessment: 1"
 *
 * Invalid values:
 * - Numeric-only strings ("1", "123")
 * - Single character strings
 * - Assessment option tokens ("option1", "choice_a", etc.)
 * - null/undefined/empty
 *
 * This matches ChatServer.ts:289-305 behavior exactly.
 *
 * @param value - The vendor name to validate
 * @returns true if valid vendor name, false otherwise
 */
export function isValidVendorName(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  // Reject numeric-only values
  if (/^\d+$/.test(trimmed)) return false;

  // Reject single character values
  if (trimmed.length < 2) return false;

  // Reject assessment option tokens (option1, choice_a, etc.)
  // Pattern from ChatServer.ts:302
  if (/^(option|choice|select|item|answer)[_\-]?\d*[a-z]?$/i.test(trimmed)) return false;

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

/**
 * Story 26.2 Behavior Lock-In:
 * These tests document the exact validation rules used for vendor name
 * validation in title generation. Any changes to validation logic should
 * be considered breaking changes and reviewed carefully.
 *
 * This matches ChatServer.ts:289-305 behavior exactly.
 */
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

    describe('option token rejection (ChatServer.ts:302)', () => {
      it('should reject "option" variants', () => {
        expect(isValidVendorName('option1')).toBe(false);
        expect(isValidVendorName('option_1')).toBe(false);
        expect(isValidVendorName('option-1')).toBe(false);
        expect(isValidVendorName('optiona')).toBe(false);
        expect(isValidVendorName('OPTION1')).toBe(false);
      });

      it('should reject "choice" variants', () => {
        expect(isValidVendorName('choice_a')).toBe(false);
        expect(isValidVendorName('choice-a')).toBe(false);
        expect(isValidVendorName('choice1')).toBe(false);
        expect(isValidVendorName('choiceb')).toBe(false);
        expect(isValidVendorName('CHOICE_A')).toBe(false);
      });

      it('should reject "select" variants', () => {
        expect(isValidVendorName('select_2')).toBe(false);
        expect(isValidVendorName('select2')).toBe(false);
        expect(isValidVendorName('selectb')).toBe(false);
      });

      it('should reject "item" variants', () => {
        expect(isValidVendorName('item3')).toBe(false);
        expect(isValidVendorName('item_3')).toBe(false);
        expect(isValidVendorName('itemc')).toBe(false);
      });

      it('should reject "answer" variants', () => {
        expect(isValidVendorName('answer_b')).toBe(false);
        expect(isValidVendorName('answer1')).toBe(false);
        expect(isValidVendorName('answerc')).toBe(false);
      });
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

    it('should accept names containing option/choice words but not as tokens', () => {
      // These are valid because they contain additional text
      expect(isValidVendorName('Option Plus Inc')).toBe(true);
      expect(isValidVendorName('First Choice Software')).toBe(true);
      expect(isValidVendorName('Select Medical')).toBe(true);
    });
  });
});
```

---

## Definition of Done

- [ ] Code implemented and compiles
- [ ] Unit tests written and passing
- [ ] No regressions in existing tests
