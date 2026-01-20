# Story 28.4.1: Extract ConnectionHandler.ts (auth middleware)

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract JWT authentication middleware from ChatServer into ConnectionHandler. This is the first part of connection handling extraction.

---

## Acceptance Criteria

- [ ] `ConnectionHandler.ts` created at `infrastructure/websocket/handlers/ConnectionHandler.ts`
- [ ] Contains `createAuthMiddleware()` method
- [ ] JWT verification logic preserved exactly
- [ ] Socket augmented with userId, userEmail, userRole
- [ ] Unit tests cover valid/invalid/missing tokens
- [ ] Existing auth tests pass

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/ConnectionHandler.ts

import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { ConversationService } from '../../../application/services/ConversationService';

interface JWTPayload {
  userId: string;
  email?: string;
  role?: string;
}

// Extend Socket for auth properties
declare module 'socket.io' {
  interface Socket {
    userId?: string;
    userEmail?: string;
    userRole?: string;
    conversationId?: string;
  }
}

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
   */
  createAuthMiddleware() {
    return (socket: Socket, next: (err?: Error) => void) => {
      const token = socket.handshake.auth.token;

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

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ConnectionHandler.ts` - Create new file
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ConnectionHandler.test.ts` - Create tests

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
  });
});
```

---

## Definition of Done

- [ ] ConnectionHandler.ts created with auth middleware
- [ ] Unit tests passing
- [ ] TypeScript compiles
