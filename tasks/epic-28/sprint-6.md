# Sprint 6: Final Integration (Phases 10-11)

**Epic:** 28 - ChatServer.ts Modular Refactoring
**Goal:** Optional mode strategies and final orchestrator cleanup.
**Agent:** backend-agent

---

## Stories

| ID | Title | Status |
|----|-------|--------|
| 28.10.1 | Define IModeStrategy interface (optional) | Pending |
| 28.10.2 | Extract ConsultModeStrategy.ts (optional) | Pending |
| 28.10.3 | Extract AssessmentModeStrategy.ts (optional) | Pending |
| 28.10.4 | Extract ScoringModeStrategy.ts (optional) | Pending |
| 28.11.1 | Inject TitleGenerationService | Pending |
| 28.11.2 | Refactor ChatServer to slim orchestrator | Pending |
| 28.11.3 | Update index.ts wiring | Pending |
| 28.11.4 | Final verification and documentation | Pending |

---

## Sprint Acceptance Criteria

- [ ] TitleGenerationService injected (no hidden instantiation)
- [ ] ChatServer is ~200 lines (thin orchestrator)
- [ ] All handlers properly wired
- [ ] Public API preserved (emitToConversation, streamMessage)
- [ ] All dependencies explicitly injected
- [ ] Full test suite passes (unit, integration, E2E)
- [ ] Architecture constraints verified

---

## Architecture Constraints (Preserved from Earlier Phases)

- ChatContext is infrastructure-only, no Socket.IO leakage
- Handlers receive IAuthenticatedSocket interface
- Tool registry in infrastructure, services via constructor DI
- user:{userId} room join preserved

---

## Dependencies

- Sprint 5 must be complete

---

## Risk Assessment

**Low-Medium Risk** - Final cleanup and integration. Mode strategies are optional enhancement.
