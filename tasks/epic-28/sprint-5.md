# Sprint 5: Core Message Flow (Phase 9)

**Epic:** 28 - ChatServer.ts Modular Refactoring
**Goal:** Extract message handler and implement tool use registry.
**Agent:** backend-agent

---

## Stories

| ID | Title | Status |
|----|-------|--------|
| 28.9.1 | Extract MessageHandler.ts (send_message validation) | Pending |
| 28.9.2 | Extract MessageHandler.ts (attachment processing) | Pending |
| 28.9.3 | Implement ToolUseRegistry with IToolUseHandler pattern | Pending |
| 28.9.4 | Extract MessageHandler.ts (mode-specific routing) | Pending |
| 28.9.5 | Extract MessageHandler.ts (Claude streaming) | Pending |
| 28.9.6 | Update ChatServer to delegate send_message | Pending |

---

## Sprint Acceptance Criteria

- [ ] MessageHandler has comprehensive unit tests
- [ ] ToolUseRegistry implemented using IToolUseHandler pattern
- [ ] QuestionnaireReadyService registered via registry (not hard-coded)
- [ ] Mode-specific routing works (consult/assessment/scoring)
- [ ] Claude streaming preserved
- [ ] Attachment validation preserved
- [ ] All 13 existing ChatServer tests pass
- [ ] Clean architecture: infrastructure → application (not vice versa)

---

## Architecture Constraints

- Tool registry lives in **infrastructure layer**
- Application services injected via constructor, not ChatContext
- ChatContext is for shared state only - **NOT a service locator**

---

## Dependencies

- Sprint 4 must be complete

---

## Risk Assessment

**High Risk** - This is the most complex handler (~400 lines). Careful extraction needed.
