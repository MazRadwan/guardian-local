# Story 28.11.4: Final verification and documentation

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Medium (multiple files)

---

## Description

Final verification that all refactoring goals are met. Run full test suite, verify architecture constraints, and update documentation if needed.

---

## Acceptance Criteria

- [ ] ChatServer is ~200 lines
- [ ] All 13+ existing tests pass
- [ ] All new unit tests pass (25+)
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Architecture constraints verified:
  - ChatContext is infrastructure-only
  - Handlers receive IAuthenticatedSocket
  - Tool registry in infrastructure layer
  - user:{userId} room join preserved
- [ ] No hidden dependency instantiation
- [ ] Epic goals document updated with completion status

---

## Technical Approach

1. **Run full test suite:**
```bash
pnpm --filter @guardian/backend test:unit
pnpm --filter @guardian/backend test:integration
pnpm --filter @guardian/backend test:e2e
```

2. **Verify line count:**
```bash
wc -l packages/backend/src/infrastructure/websocket/ChatServer.ts
# Expected: ~200 lines (±50)
```

3. **Verify architecture constraints:**
- Check ChatContext.ts for no Socket.IO imports
- Check handlers for IAuthenticatedSocket usage
- Check ToolUseRegistry is in infrastructure/websocket/
- Grep for `socket.join(\`user:${userId}\`)` in ConnectionHandler

4. **Verify success metrics:**

| Metric | Before | After | Verified |
|--------|--------|-------|----------|
| ChatServer lines | ~2700 | ~200 | [ ] |
| Constructor deps | 18 | 10-12 | [ ] |
| Testable modules | 1 | 12+ | [ ] |
| Unit test files | 13 | 25+ | [ ] |

5. **Update epic goals:**
- Mark all phases complete
- Add final metrics

---

## Files Touched

- `tasks/epic-28/epic-28-goals.md` - Update with completion status
- `tasks/epic-28/sprint-*.md` - Mark stories complete

---

## Tests Required

Full verification suite:
```bash
# Full suite
pnpm --filter @guardian/backend test

# E2E
pnpm --filter @guardian/backend test:e2e

# Manual verification
# - WebSocket connection works
# - send_message works
# - mode switching works
# - questionnaire generation works
# - scoring flow works
```

---

## Definition of Done

- [ ] All tests pass
- [ ] Architecture constraints verified
- [ ] Success metrics met
- [ ] Epic goals document updated
- [ ] Ready for code review
