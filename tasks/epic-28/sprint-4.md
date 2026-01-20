# Sprint 4: Business Logic Handlers (Phases 7-8)

**Epic:** 28 - ChatServer.ts Modular Refactoring
**Goal:** Extract scoring and questionnaire handlers.
**Agent:** backend-agent

---

## Stories

| ID | Title | Status |
|----|-------|--------|
| 28.7.1 | Extract ScoringHandler.ts (triggerScoringOnSend) | Pending |
| 28.7.2 | Extract ScoringHandler.ts (buildScoringFollowUpContext) | Pending |
| 28.7.3 | Extract ScoringHandler.ts (vendor clarification flow) | Pending |
| 28.7.4 | Update ChatServer to delegate scoring events | Pending |
| 28.8.1 | Extract QuestionnaireHandler.ts (generate_questionnaire) | Pending |
| 28.8.2 | Extract QuestionnaireHandler.ts (get_export_status) | Pending |
| 28.8.3 | Update ChatServer to delegate questionnaire events | Pending |

---

## Sprint Acceptance Criteria

- [ ] ScoringHandler has comprehensive unit tests
- [ ] QuestionnaireHandler has unit tests
- [ ] Vendor clarification flow preserved
- [ ] Scoring progress events work correctly
- [ ] Export status API preserved
- [ ] Existing ChatServer.handleGenerateQuestionnaire.test.ts passes
- [ ] All existing tests pass

---

## Dependencies

- Sprint 3 must be complete

---

## Risk Assessment

**Medium Risk** - Complex business logic. Scoring flow and vendor clarification have many edge cases.
