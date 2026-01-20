# Story 28.1.1: Extend sanitize.ts with sanitizeErrorForClient()

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Extract the `sanitizeErrorForClient()` function from ChatServer.ts and add it to the existing `utils/sanitize.ts` module. This centralizes error sanitization logic that prevents leaking internal error details to clients.

---

## Acceptance Criteria

- [ ] `sanitizeErrorForClient(error: unknown, fallbackMessage: string): string` function added to `utils/sanitize.ts`
- [ ] Function handles Error instances, strings, and unknown types
- [ ] Unit tests cover all branches (Error, string, unknown)
- [ ] ChatServer.ts continues to compile (will use in later story)
- [ ] No behavioral changes to existing functionality

---

## Technical Approach

```typescript
// In utils/sanitize.ts

/**
 * Sanitize error for client response
 *
 * Prevents leaking internal error details while providing
 * meaningful feedback to users.
 *
 * @param error - The caught error (any type)
 * @param fallbackMessage - Default message if error is not an Error instance
 * @returns Safe error message string
 */
export function sanitizeErrorForClient(
  error: unknown,
  fallbackMessage: string
): string {
  if (error instanceof Error) {
    // Only expose message, not stack trace
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallbackMessage;
}
```

---

## Files Touched

- `packages/backend/src/utils/sanitize.ts` - Add sanitizeErrorForClient function
- `packages/backend/__tests__/unit/utils/sanitize.test.ts` - Add unit tests (create if doesn't exist)

---

## Tests Required

```typescript
// __tests__/unit/utils/sanitize.test.ts

describe('sanitizeErrorForClient', () => {
  it('should extract message from Error instance', () => {
    const error = new Error('Database connection failed');
    expect(sanitizeErrorForClient(error, 'fallback')).toBe('Database connection failed');
  });

  it('should return string errors directly', () => {
    expect(sanitizeErrorForClient('Custom error', 'fallback')).toBe('Custom error');
  });

  it('should return fallback for unknown types', () => {
    expect(sanitizeErrorForClient({ code: 500 }, 'Something went wrong')).toBe('Something went wrong');
    expect(sanitizeErrorForClient(null, 'Something went wrong')).toBe('Something went wrong');
    expect(sanitizeErrorForClient(undefined, 'Something went wrong')).toBe('Something went wrong');
  });
});
```

---

## Definition of Done

- [ ] Code implemented and compiles
- [ ] Unit tests written and passing
- [ ] No regressions in existing tests
