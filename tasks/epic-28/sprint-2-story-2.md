# Story 28.3.2: Create IAuthenticatedSocket interface

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Create the `IAuthenticatedSocket` interface to abstract Socket.IO's concrete socket type. Handlers will receive this interface instead of the concrete type, enabling testability and preventing transport coupling.

---

## Acceptance Criteria

- [ ] `IAuthenticatedSocket` interface added to `ChatContext.ts`
- [ ] Contains id, userId, userEmail, userRole properties
- [ ] Contains conversationId (mutable)
- [ ] Contains data record for socket.data
- [ ] Contains emit() and join() methods
- [ ] No import from socket.io types

---

## Technical Approach

```typescript
// Add to infrastructure/websocket/ChatContext.ts

/**
 * IAuthenticatedSocket - Abstract socket interface for handlers
 *
 * ARCHITECTURE: Handlers receive this interface, not concrete Socket.IO type.
 * This enables:
 * - Unit testing with mock sockets
 * - Transport abstraction (could support other protocols)
 * - Clear contract for handler dependencies
 */
export interface IAuthenticatedSocket {
  /** Unique socket connection ID */
  readonly id: string;

  /** Authenticated user ID (set after JWT verification) */
  readonly userId: string;

  /** User email from JWT (optional) */
  readonly userEmail?: string;

  /** User role from JWT (optional) */
  readonly userRole?: string;

  /** Current conversation ID (mutable, updated on conversation switch) */
  conversationId?: string;

  /** Socket data store for custom properties */
  data: Record<string, unknown>;

  /**
   * Emit event to this socket
   * @param event - Event name
   * @param data - Event payload
   */
  emit(event: string, data: unknown): void;

  /**
   * Join a room for targeted broadcasts
   * @param room - Room name (e.g., "user:{userId}")
   */
  join(room: string): void;
}

/**
 * Type guard to check if socket has required auth properties
 */
export function isAuthenticatedSocket(socket: unknown): socket is IAuthenticatedSocket {
  return (
    typeof socket === 'object' &&
    socket !== null &&
    'id' in socket &&
    'userId' in socket &&
    typeof (socket as IAuthenticatedSocket).emit === 'function'
  );
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatContext.ts` - Add IAuthenticatedSocket interface

---

## Tests Required

```typescript
// Add to __tests__/unit/infrastructure/websocket/ChatContext.test.ts

describe('isAuthenticatedSocket', () => {
  it('should return true for valid socket', () => {
    const socket = {
      id: 'socket-1',
      userId: 'user-1',
      emit: jest.fn(),
      join: jest.fn(),
      data: {},
    };
    expect(isAuthenticatedSocket(socket)).toBe(true);
  });

  it('should return false for missing userId', () => {
    const socket = { id: 'socket-1', emit: jest.fn() };
    expect(isAuthenticatedSocket(socket)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isAuthenticatedSocket(null)).toBe(false);
    expect(isAuthenticatedSocket('string')).toBe(false);
  });
});
```

---

## Definition of Done

- [ ] IAuthenticatedSocket interface added
- [ ] Type guard function added
- [ ] Unit tests passing
- [ ] TypeScript compiles without errors
