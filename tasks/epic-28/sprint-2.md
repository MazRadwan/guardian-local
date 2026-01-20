# Sprint 2: Infrastructure (Phases 3-4)

**Epic:** 28 - ChatServer.ts Modular Refactoring
**Goal:** Define shared state model and extract connection handling.
**Agent:** backend-agent

---

## Stories

| ID | Title | Status |
|----|-------|--------|
| 28.3.1 | Create ChatContext.ts interface | Pending |
| 28.3.2 | Create IAuthenticatedSocket interface | Pending |
| 28.3.3 | Refactor ChatServer to use ChatContext object | Pending |
| 28.4.1 | Extract ConnectionHandler.ts (auth middleware) | Pending |
| 28.4.2 | Extract ConnectionHandler.ts (connection + resume) | Pending |
| 28.4.3 | Extract ConnectionHandler.ts (disconnect) | Pending |
| 28.4.4 | Update ChatServer to delegate connection events | Pending |

---

## Sprint Acceptance Criteria

- [ ] ChatContext interface defined (infrastructure-only)
- [ ] IAuthenticatedSocket interface abstracts Socket.IO
- [ ] ConnectionHandler has comprehensive unit tests
- [ ] **CRITICAL: `user:{userId}` room join preserved**
- [ ] `connection_ready` event works correctly
- [ ] Resume conversation logic preserved
- [ ] All existing tests pass
- [ ] Integration tests pass:
  - `__tests__/integration/attachment-flow.test.ts`
  - `__tests__/e2e/websocket-chat.test.ts`

---

## Dependencies

- Sprint 1 must be complete

---

## Risk Assessment

**Medium Risk** - Connection handling is critical path. Must preserve:
- JWT authentication
- Room joining for DocumentUploadController
- Resume conversation flow
