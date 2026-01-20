# Story 28.4.1: Extract ConnectionHandler.ts (auth middleware)

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract JWT authentication middleware from ChatServer into ConnectionHandler. This is the first part of connection handling extraction.

---

## Acceptance Criteria

- [ ] `IAuthenticatedSocket.ts` created at `infrastructure/websocket/IAuthenticatedSocket.ts` (if not already exists)
- [ ] `ConnectionHandler.ts` created at `infrastructure/websocket/handlers/ConnectionHandler.ts`
- [ ] Contains `createAuthMiddleware()` method
- [ ] JWT verification logic preserved exactly
- [ ] Uses `IAuthenticatedSocket` interface (NOT Socket.IO module augmentation)
- [ ] Socket augmented with userId, userEmail, userRole
- [ ] **Auth failure cases preserve error propagation**:
  - Missing token → Error with message "Authentication token required"
  - Invalid/expired token → Error with message "Invalid authentication token"
  - Malformed token → Error with message "Invalid authentication token"
- [ ] Unit tests cover valid/invalid/missing/expired/malformed tokens
- [ ] Existing auth tests pass
- [ ] **Architecture constraint**: No Socket.IO types leak outside infrastructure layer

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/ConnectionHandler.ts

import jwt from 'jsonwebtoken';
import { ConversationService } from '../../../application/services/ConversationService';
import { IAuthenticatedSocket } from '../IAuthenticatedSocket';

interface JWTPayload {
  userId: string;
  email?: string;
  role?: string;
}

/**
 * Socket.IO middleware function type
 * Uses unknown socket type to avoid Socket.IO dependency in the interface
 */
type SocketMiddleware = (socket: unknown, next: (err?: Error) => void) => void;

export class ConnectionHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly jwtSecret: string
  ) {}

  /**
   * Create Socket.IO authentication middleware
   *
   * Verifies JWT from socket.handshake.auth.token and augments
   * socket with user information.
   *
   * ARCHITECTURE NOTE: Uses IAuthenticatedSocket interface instead of
   * Socket.IO module augmentation to keep infrastructure boundary clean.
   * The socket is cast to IAuthenticatedSocket after auth succeeds.
   */
  createAuthMiddleware(): SocketMiddleware {
    return (rawSocket: unknown, next: (err?: Error) => void) => {
      // Cast to access handshake - this is infrastructure layer so Socket.IO awareness is OK
      const socket = rawSocket as IAuthenticatedSocket & {
        handshake: { auth: { token?: string } };
      };

      const token = socket.handshake?.auth?.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;
        next();
      } catch (error) {
        console.error('[ConnectionHandler] Authentication failed:', error);
        next(new Error('Invalid authentication token'));
      }
    };
  }
}
```

**NOTE:** This story depends on Story 28.3.0 which creates `IAuthenticatedSocket` interface at `infrastructure/websocket/IAuthenticatedSocket.ts`. The interface should be:

```typescript
// infrastructure/websocket/IAuthenticatedSocket.ts

/**
 * IAuthenticatedSocket - Infrastructure interface for authenticated WebSocket connections
 *
 * ARCHITECTURE: This interface abstracts Socket.IO specifics so that handlers
 * can work with a clean interface. The actual Socket.IO Socket is cast to this
 * interface after authentication succeeds.
 *
 * This keeps Socket.IO types from leaking into application/domain layers.
 */
export interface IAuthenticatedSocket {
  /** User ID from JWT (set by auth middleware) */
  userId?: string;
  /** User email from JWT (set by auth middleware) */
  userEmail?: string;
  /** User role from JWT (set by auth middleware) */
  userRole?: string;
  /** Current active conversation ID */
  conversationId?: string;

  /** Emit an event to this socket */
  emit(event: string, data: unknown): void;
  /** Join a room */
  join(room: string): void;
  /** Leave a room */
  leave(room: string): void;
  /** Subscribe to an event */
  on(event: string, handler: (...args: unknown[]) => void): void;
  /** Get socket ID */
  readonly id: string;
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/IAuthenticatedSocket.ts` - Create interface (if not already created by Story 28.3.0)
- `packages/backend/src/infrastructure/websocket/handlers/ConnectionHandler.ts` - Create new file
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ConnectionHandler.test.ts` - Create tests

## Dependencies

- **Story 28.3.0** (if exists) or this story should create `IAuthenticatedSocket.ts` first

---

## Tests Required

```typescript
describe('ConnectionHandler', () => {
  let handler: ConnectionHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  const jwtSecret = 'test-secret';

  beforeEach(() => {
    mockConversationService = {} as any;
    handler = new ConnectionHandler(mockConversationService, jwtSecret);
  });

  describe('createAuthMiddleware', () => {
    it('should authenticate valid token', () => {
      const middleware = handler.createAuthMiddleware();
      const token = jwt.sign({ userId: 'user-1', email: 'test@example.com' }, jwtSecret);
      const socket = { handshake: { auth: { token } } } as any;
      const next = jest.fn();

      middleware(socket, next);

      expect(socket.userId).toBe('user-1');
      expect(socket.userEmail).toBe('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject missing token', () => {
      const middleware = handler.createAuthMiddleware();
      const socket = { handshake: { auth: {} } } as any;
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('token required');
    });

    it('should reject invalid token', () => {
      const middleware = handler.createAuthMiddleware();
      const socket = { handshake: { auth: { token: 'invalid' } } } as any;
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Invalid');
    });

    it('should reject expired token', () => {
      const middleware = handler.createAuthMiddleware();
      // Create token that expired 1 hour ago
      const expiredToken = jwt.sign(
        { userId: 'user-1', exp: Math.floor(Date.now() / 1000) - 3600 },
        jwtSecret
      );
      const socket = { handshake: { auth: { token: expiredToken } } } as any;
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Invalid authentication token');
    });

    it('should reject malformed token', () => {
      const middleware = handler.createAuthMiddleware();
      const socket = { handshake: { auth: { token: 'not.a.valid.jwt.format' } } } as any;
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Invalid authentication token');
    });

    it('should reject token signed with wrong secret', () => {
      const middleware = handler.createAuthMiddleware();
      const wrongSecretToken = jwt.sign({ userId: 'user-1' }, 'wrong-secret');
      const socket = { handshake: { auth: { token: wrongSecretToken } } } as any;
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Invalid authentication token');
    });
  });
});
```

---

## Definition of Done

- [ ] ConnectionHandler.ts created with auth middleware
- [ ] Unit tests passing
- [ ] TypeScript compiles
