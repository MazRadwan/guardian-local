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
- [ ] Contains id (readonly), userId (optional, writable - set after auth)
- [ ] Contains userEmail, userRole (optional)
- [ ] Contains conversationId (mutable)
- [ ] Contains `handshake.auth` shape with `token` and `conversationId` for connection handlers
- [ ] Contains data record for socket.data
- [ ] Contains emit() and join() methods
- [ ] No import from socket.io types
- [ ] **Lifecycle-aware**: userId is optional before auth, writable during auth middleware

---

## Technical Approach

```typescript
// Add to infrastructure/websocket/ChatContext.ts

/**
 * Handshake auth shape - passed during socket connection
 * This avoids leaking Socket.IO types while providing type-safe access
 */
export interface ISocketHandshakeAuth {
  /** JWT token for authentication */
  token?: string;
  /** Conversation ID for resume requests */
  conversationId?: string;
}

/**
 * IAuthenticatedSocket - Abstract socket interface for handlers
 *
 * ARCHITECTURE: Handlers receive this interface, not concrete Socket.IO type.
 * This enables:
 * - Unit testing with mock sockets
 * - Transport abstraction (could support other protocols)
 * - Clear contract for handler dependencies
 *
 * LIFECYCLE: userId is optional before auth middleware runs.
 * Auth middleware sets userId after JWT verification.
 */
export interface IAuthenticatedSocket {
  /** Unique socket connection ID */
  readonly id: string;

  /**
   * Authenticated user ID
   * - Optional: undefined before auth middleware runs
   * - Writable: auth middleware sets this after JWT verification
   */
  userId?: string;

  /** User email from JWT (optional) */
  userEmail?: string;

  /** User role from JWT (optional) */
  userRole?: string;

  /** Current conversation ID (mutable, updated on conversation switch) */
  conversationId?: string;

  /** Socket data store for custom properties */
  data: Record<string, unknown>;

  /**
   * Handshake auth data - used by connection handler
   * Provides type-safe access without importing Socket.IO
   */
  handshake: {
    auth: ISocketHandshakeAuth;
  };

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
 * Type guard to check if socket has completed authentication
 * NOTE: Checks userId is present (not just that socket matches interface)
 */
export function isAuthenticatedSocket(socket: unknown): socket is IAuthenticatedSocket & { userId: string } {
  return (
    typeof socket === 'object' &&
    socket !== null &&
    'id' in socket &&
    'userId' in socket &&
    typeof (socket as IAuthenticatedSocket).userId === 'string' &&
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
  it('should return true for authenticated socket with userId', () => {
    const socket = {
      id: 'socket-1',
      userId: 'user-1',
      emit: jest.fn(),
      join: jest.fn(),
      data: {},
      handshake: { auth: { token: 'jwt-token' } },
    };
    expect(isAuthenticatedSocket(socket)).toBe(true);
  });

  it('should return false for socket without userId (pre-auth)', () => {
    const socket = {
      id: 'socket-1',
      userId: undefined, // Not yet authenticated
      emit: jest.fn(),
      handshake: { auth: { token: 'jwt-token' } },
    };
    expect(isAuthenticatedSocket(socket)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isAuthenticatedSocket(null)).toBe(false);
    expect(isAuthenticatedSocket('string')).toBe(false);
  });
});

describe('ISocketHandshakeAuth', () => {
  it('should provide type-safe access to auth token', () => {
    const socket: IAuthenticatedSocket = {
      id: 'socket-1',
      emit: jest.fn(),
      join: jest.fn(),
      data: {},
      handshake: { auth: { token: 'jwt-token', conversationId: 'conv-1' } },
    };
    expect(socket.handshake.auth.token).toBe('jwt-token');
    expect(socket.handshake.auth.conversationId).toBe('conv-1');
  });
});
```

---

## Definition of Done

- [ ] IAuthenticatedSocket interface added
- [ ] Type guard function added
- [ ] Unit tests passing
- [ ] TypeScript compiles without errors
