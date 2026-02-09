# Epic 36: MessageHandler Final Decomposition — Overview

**Status:** Ready to execute (all story specs complete)
**Branch:** `epic/36-messagehandler-final-decomp` (create from current)
**Tracking doc:** `tasks/messagehandler-decomposition.md`

---

## Sprints

| Sprint | Focus | Stories | Risk | Prerequisite |
|--------|-------|---------|------|--------------|
| Sprint 1 | Extract validation → SendMessageValidator | 36.1.1 - 36.1.3 | MEDIUM | None |
| Sprint 2 | Extract streaming → ClaudeStreamingService | 36.2.1 - 36.2.3 | HIGH | Sprint 1 |
| Sprint 3 | Extract orchestration → SendMessageOrchestrator | 36.3.1 - 36.3.3 | MEDIUM | Sprint 2 |

**Total:** 9 stories across 3 sprints
**Sequential:** Each sprint depends on the previous
**All story specs:** Fully written with detailed technical approach, traps, and acceptance criteria

---

## Sprint 1 Stories — Extract Validation

| Story | Name | Agent |
|-------|------|-------|
| 36.1.1 | Create shared types + SendMessageValidator service | backend-agent |
| 36.1.2 | Wire validator into ChatServer, remove from MessageHandler | backend-agent |
| 36.1.3 | Move tests, update imports, regression verification | backend-agent |

## Sprint 2 Stories — Extract Streaming

| Story | Name | Agent |
|-------|------|-------|
| 36.2.1 | Create ClaudeStreamingService + move streaming types | backend-agent |
| 36.2.2 | Wire service into ChatServer, remove from MessageHandler | backend-agent |
| 36.2.3 | Move streaming tests, rename test files, regression verification | backend-agent |

## Sprint 3 Stories — Extract Orchestration + Delete MessageHandler

| Story | Name | Agent |
|-------|------|-------|
| 36.3.1 | Create SendMessageOrchestrator with deps interface, lift 7-step pipeline | backend-agent |
| 36.3.2 | Wire into ChatServer, delete MessageHandler.ts, move buildFileContext tests | backend-agent |
| 36.3.3 | Orchestrator tests (~25 cases) + full regression browser QA (9 scenarios, all modes) | backend-agent |

---

## Quality Gates

| Gate | When | What |
|------|------|------|
| Unit tests | After each story | `pnpm --filter @guardian/backend test:unit` |
| Integration tests | After each sprint | `pnpm --filter @guardian/backend test:integration` |
| Browser QA | After each sprint | All 3 modes + abort + regenerate |
| Codex review | After each sprint | Verify implementation matches spec, catch drift early |
| LOC verification | After Sprint 3 | All new files under 300 LOC |
| Decomposition doc | After Sprint 3 | Final status update |

---

## End State

| File | LOC | Role |
|------|-----|------|
| ChatServer.ts | ~180 | Event routing only |
| SendMessageOrchestrator.ts | ~150 | Pipeline orchestration |
| SendMessageValidator.ts | ~250 | Validation service |
| ClaudeStreamingService.ts | ~250 | Streaming service |
| types/SendMessage.ts | ~90 | Shared types |
| MessageHandler.ts | DELETED | — |
