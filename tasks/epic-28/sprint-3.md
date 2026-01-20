# Sprint 3: Conversation Management (Phases 5-6)

**Epic:** 28 - ChatServer.ts Modular Refactoring
**Goal:** Extract conversation CRUD and mode switching handlers.
**Agent:** backend-agent

---

## Stories

| ID | Title | Status |
|----|-------|--------|
| 28.5.1 | Extract ConversationHandler.ts (get_conversations) | Pending |
| 28.5.2 | Extract ConversationHandler.ts (start_new, delete) | Pending |
| 28.5.3 | Extract ConversationHandler.ts (get_history) | Pending |
| 28.5.4 | Centralize ownership validation | Pending |
| 28.5.5 | Update ChatServer to delegate conversation events | Pending |
| 28.6.1 | Extract ModeSwitchHandler.ts (switch_mode) | Pending |
| 28.6.2 | Extract ModeSwitchHandler.ts (guidance messages) | Pending |
| 28.6.3 | Update ChatServer to delegate mode switch | Pending |

---

## Sprint Acceptance Criteria

- [ ] ConversationHandler has comprehensive unit tests
- [ ] ModeSwitchHandler has unit tests
- [ ] Ownership validation centralized and tested
- [ ] Conversation idempotency preserved (pendingCreations)
- [ ] Mode guidance messages preserved
- [ ] All existing tests pass

---

## Dependencies

- Sprint 2 must be complete (ChatContext, ConnectionHandler)

---

## Risk Assessment

**Low-Medium Risk** - CRUD operations are well-defined. Mode guidance messages must be preserved exactly.
