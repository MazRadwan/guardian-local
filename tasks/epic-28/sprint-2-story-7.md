# Story 28.4.4: Update ChatServer to delegate connection events

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Update ChatServer to use ConnectionHandler for auth middleware, connection, and disconnect events. Remove the extracted code from ChatServer.

---

## Acceptance Criteria

- [ ] ChatServer creates ConnectionHandler in constructor
- [ ] Auth middleware uses ConnectionHandler
- [ ] Connection event delegates to ConnectionHandler
- [ ] Disconnect event delegates to ConnectionHandler
- [ ] All connection-related code removed from ChatServer
- [ ] All existing tests pass
- [ ] **Integration tests pass:**
  - `__tests__/integration/attachment-flow.test.ts`
  - `__tests__/e2e/websocket-chat.test.ts`

---

## Technical Approach

1. Add import:
```typescript
import { ConnectionHandler } from './handlers/ConnectionHandler';
```

2. Add property and initialize in constructor:
```typescript
private readonly connectionHandler: ConnectionHandler;

constructor(...) {
  // ...
  this.connectionHandler = new ConnectionHandler(
    this.conversationService,
    this.jwtSecret
  );
}
```

3. Update setupNamespace():
```typescript
private setupNamespace(): void {
  const chatNamespace = this.io.of('/chat');

  // Use ConnectionHandler for auth
  chatNamespace.use(this.connectionHandler.createAuthMiddleware());

  chatNamespace.on('connection', async (socket) => {
    // Delegate to ConnectionHandler
    const { conversation } = await this.connectionHandler.handleConnection(
      socket as IAuthenticatedSocket,
      this.chatContext
    );

    // ... rest of event handlers ...

    socket.on('disconnect', (reason) => {
      this.connectionHandler.handleDisconnect(socket as IAuthenticatedSocket, reason);
    });
  });
}
```

4. Remove from ChatServer:
- Auth middleware inline code
- Connection handling inline code
- Resume logic inline code
- Disconnect handler inline code

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to ConnectionHandler

---

## Tests Required

Run full test suite to verify no regressions:

```bash
# Unit tests
pnpm --filter @guardian/backend test:unit

# Integration tests (critical for room join verification)
pnpm --filter @guardian/backend test:integration

# E2E tests
pnpm --filter @guardian/backend test:e2e
```

---

## Definition of Done

- [ ] ConnectionHandler integrated into ChatServer
- [ ] Auth middleware delegated
- [ ] Connection/disconnect handlers delegated
- [ ] All inline code removed
- [ ] All 13 ChatServer unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] DocumentUploadController events still work (verified via attachment-flow test)
