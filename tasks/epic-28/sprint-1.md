# Sprint 1: Foundation (Phases 1-2)

**Epic:** 28 - ChatServer.ts Modular Refactoring
**Goal:** Consolidate utilities and extract context builders as the foundation for further extraction.
**Agent:** backend-agent

---

## Stories

| ID | Title | Status |
|----|-------|--------|
| 28.1.1 | Extend sanitize.ts with sanitizeErrorForClient() | Pending |
| 28.1.2 | Extend sanitize.ts with isValidVendorName() | Pending |
| 28.1.3 | Remove duplicate sanitizeForPrompt from ChatServer | Pending |
| 28.1.4 | Remove duplicate isValidVendorName from QuestionnaireReadyService | Pending |
| 28.1.5 | Extract StreamingHandler.ts | Pending |
| 28.2.1 | Extract ConversationContextBuilder.ts | Pending |
| 28.2.2 | Extract FileContextBuilder.ts | Pending |
| 28.2.3 | Update ChatServer to use context builders | Pending |

---

## Sprint Acceptance Criteria

- [ ] Single source of truth for sanitization in `utils/sanitize.ts`
- [ ] All 13 existing ChatServer tests pass
- [ ] New unit tests for StreamingHandler
- [ ] New unit tests for ConversationContextBuilder
- [ ] New unit tests for FileContextBuilder
- [ ] No changes to index.ts wiring
- [ ] TypeScript compiles without errors

---

## Dependencies

- No external dependencies
- Must complete before Sprint 2

---

## Risk Assessment

**Low Risk** - Pure function extraction and module creation with no behavioral changes.
