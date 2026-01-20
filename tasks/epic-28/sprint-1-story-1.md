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
- [ ] **SQL-leak suppression**: Filters patterns like `SELECT`, `INSERT`, `UPDATE`, `DELETE` from error messages
- [ ] Unit tests cover all branches (Error, string, unknown) AND SQL suppression
- [ ] ChatServer.ts continues to compile (will use in later story)
- [ ] No behavioral changes to existing functionality
- [ ] **CONSTRAINT**: `utils/sanitize.ts` remains dependency-free (no application-layer imports)

---

## Technical Approach

```typescript
// In utils/sanitize.ts

/**
 * Sanitize error message for client
 * Prevents SQL queries and internal details from leaking to clients
 *
 * Sprint 17.3 Security Fix: Raw SQL was being sent to clients in error messages
 *
 * IMPORTANT: Only handles Error instances - all other types return fallback.
 * This matches ChatServer.ts:242-275 behavior exactly.
 *
 * @param error - The caught error (any type)
 * @param fallbackMessage - Default message if error is not an Error instance
 * @returns Safe error message string (max 200 chars)
 */
export function sanitizeErrorForClient(
  error: unknown,
  fallbackMessage: string
): string {
  // ONLY handle Error instances - strings and other types return fallback
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const message = error.message;

  // Detect SQL/database errors (contains SQL keywords or query patterns)
  // FULL pattern list from ChatServer.ts:250-263
  const sqlPatterns = [
    /\bSELECT\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bDELETE\b/i,
    /\bFROM\b.*\bWHERE\b/i,
    /\$\d+/,  // PostgreSQL parameter placeholders
    /params:/i,
    /Failed query:/i,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /duplicate key/i,
    /violates.*constraint/i,
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(message)) {
      // Log the full error server-side, return generic message to client
      console.error('[sanitizeErrorForClient] Suppressed SQL error from client:', message);
      return fallbackMessage;
    }
  }

  // Safe to return (but still truncate for safety - max 200 chars)
  return message.slice(0, 200);
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
  describe('type handling (ONLY Error instances)', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Database connection failed');
      expect(sanitizeErrorForClient(error, 'fallback')).toBe('Database connection failed');
    });

    it('should return fallback for string errors (NOT Error instance)', () => {
      // NOTE: Unlike some sanitizers, this ONLY handles Error instances
      expect(sanitizeErrorForClient('Custom error', 'fallback')).toBe('fallback');
    });

    it('should return fallback for unknown types', () => {
      expect(sanitizeErrorForClient({ code: 500 }, 'Something went wrong')).toBe('Something went wrong');
      expect(sanitizeErrorForClient(null, 'Something went wrong')).toBe('Something went wrong');
      expect(sanitizeErrorForClient(undefined, 'Something went wrong')).toBe('Something went wrong');
      expect(sanitizeErrorForClient(42, 'Something went wrong')).toBe('Something went wrong');
    });
  });

  describe('SQL leak suppression (full pattern list)', () => {
    it('should suppress errors containing SELECT', () => {
      const error = new Error('Error: SELECT * FROM users WHERE id = 1');
      expect(sanitizeErrorForClient(error, 'Database error')).toBe('Database error');
    });

    it('should suppress errors containing INSERT/UPDATE/DELETE', () => {
      expect(sanitizeErrorForClient(new Error('INSERT INTO table'), 'fallback')).toBe('fallback');
      expect(sanitizeErrorForClient(new Error('UPDATE users SET'), 'fallback')).toBe('fallback');
      expect(sanitizeErrorForClient(new Error('DELETE FROM table'), 'fallback')).toBe('fallback');
    });

    it('should suppress errors containing FROM...WHERE pattern', () => {
      expect(sanitizeErrorForClient(new Error('FROM users WHERE active = true'), 'fallback')).toBe('fallback');
    });

    it('should suppress PostgreSQL parameter placeholders ($1, $2)', () => {
      expect(sanitizeErrorForClient(new Error('Error at $1'), 'fallback')).toBe('fallback');
      expect(sanitizeErrorForClient(new Error('params: $1, $2, $3'), 'fallback')).toBe('fallback');
    });

    it('should suppress params: and Failed query: patterns', () => {
      expect(sanitizeErrorForClient(new Error('params: [1, 2]'), 'fallback')).toBe('fallback');
      expect(sanitizeErrorForClient(new Error('Failed query: some query'), 'fallback')).toBe('fallback');
    });

    it('should suppress connection errors (ECONNREFUSED, ETIMEDOUT)', () => {
      expect(sanitizeErrorForClient(new Error('ECONNREFUSED 127.0.0.1:5432'), 'fallback')).toBe('fallback');
      expect(sanitizeErrorForClient(new Error('ETIMEDOUT on connection'), 'fallback')).toBe('fallback');
    });

    it('should suppress constraint violations', () => {
      expect(sanitizeErrorForClient(new Error('duplicate key value violates unique constraint'), 'fallback')).toBe('fallback');
      expect(sanitizeErrorForClient(new Error('violates foreign key constraint'), 'fallback')).toBe('fallback');
    });

    it('should allow non-SQL error messages', () => {
      const error = new Error('Connection timeout');
      expect(sanitizeErrorForClient(error, 'fallback')).toBe('Connection timeout');
    });
  });

  describe('message truncation (200 char limit)', () => {
    it('should truncate messages longer than 200 characters', () => {
      const longMessage = 'A'.repeat(300);
      const error = new Error(longMessage);
      const result = sanitizeErrorForClient(error, 'fallback');
      expect(result.length).toBe(200);
      expect(result).toBe('A'.repeat(200));
    });

    it('should not truncate messages under 200 characters', () => {
      const shortMessage = 'Short error message';
      const error = new Error(shortMessage);
      expect(sanitizeErrorForClient(error, 'fallback')).toBe(shortMessage);
    });
  });
});
```

---

## Definition of Done

- [ ] Code implemented and compiles
- [ ] Unit tests written and passing
- [ ] No regressions in existing tests
