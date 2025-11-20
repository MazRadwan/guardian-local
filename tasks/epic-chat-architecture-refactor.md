# Sidequest: Chat Architecture Refactor (Signal-Safe)

**Version:** 0.1  
**Created:** 2025-01-18  
**Status:** Planning  
**Priority:** High (blocks future assessment-mode UX work)  
**Target Branch:** `feature/chat-refactor-plan`  
**Reference Diagram:** `/Users/mazradwan/Downloads/chat-architecture.mermaid`

---

## Overview

`ChatInterface.tsx` has grown beyond 500 lines and currently mixes rendering, routing, storage persistence, websocket lifecycle management, and store orchestration. This sidequest formalizes the refactor into a modular architecture (UI Components → Controller Hooks → UI Services) so future features—especially consult/assessment mode signaling—can be added without destabilizing the chat experience.

The goal is to **rebuild the existing behavior exactly as-is** while moving logic into the layers described in the architecture diagram. No new UX features should ship during this refactor; parity is mandatory.

---

## Agent Workflow

Work on this sidequest is executed by the dedicated **Chat Architecture Agent** (`.claude/agents/chat-architecture-agent.md`). Each story below should be treated as a direct instruction set for that agent:

1. **Read** the relevant sections of this PRD plus the referenced architecture docs before starting a story.
2. **Implement** only the scope described in the current story—no skipping ahead.
3. **Document** progress and findings in `tasks/implementation-logs/chat-refactor-baseline.md` (or additional logs if needed).
4. **Open a review** after each story for validation (this ensures parity before moving forward).

If any ambiguity arises, pause and request clarification before continuing.

---

## Goals

1. **Modular UI:** Keep `ChatInterface.tsx` under 200 lines and focused on rendering + callbacks.
2. **Deterministic Controllers:** Encapsulate orchestration (history loading, URL sync, websocket events) inside dedicated hooks that expose a clean interface to the UI layer.
3. **Service Layer:** Wrap websocket + store operations in plain TypeScript classes (`ChatService`, `ConversationService`, `WebSocketAdapter`) for easier unit testing and reuse.
4. **Parity First:** Maintain all current chat features (multi-conversation switching, streaming, regen, abort, conversation CRUD) with no regressions.
5. **Testability:** Expand unit/integration coverage for new hooks/services and ensure existing tests are updated to the new interfaces.

---

## Constraints & Non-Goals

- **No breaking changes.** Every user-facing behavior must remain identical (composer focus, streaming states, URL persistence, history handling).
- **No API changes.** Websocket payload contracts stay the same; this is a frontend refactor only.
- **No new UX.** Do not introduce new controls, toggles, or mode interactions until parity is proven.
- **Session persistence parity.** localStorage/sessionStorage behavior must match current implementation.
- **Performance neutrality.** Refactor must not increase initial load or websocket latency.

---

## Success Metrics

- `ChatInterface.tsx` ≤ 200 lines and contains no `useEffect` hooks with business logic.
- New hook/service units reach ≥ 80% line coverage with Jest tests.
- Regression suite (existing chat component tests + new controller/service tests) passes without flakiness.
- Manual QA checklist (identical to current behavior) passes on Chrome + Safari.

---

## Architecture Summary

1. **UI Components Layer:** `ChatInterface`, `MessageList`, `Composer`, `Sidebar` stay presentational.
2. **Controller Hooks Layer:**  
   - `useChatController` – main orchestrator returning props/handlers.  
   - `useHistoryManager` – fetch history, debounce requests, handle timeouts.  
   - `useConversationSync` – keep URL, localStorage, and Zustand in sync.  
   - `useWebSocketEvents` – bind/unbind websocket callbacks using stable refs.
3. **UI Services Layer:**  
   - `ChatService` – send messages, streaming, regen, abort.  
   - `ConversationService` – create/delete/switch, persist metadata.  
   - `WebSocketAdapter` – wraps current `useWebSocket` client and exposes typed events.  
4. **Infrastructure:** Existing Zustand store, WebSocket client, router, and storage utilities remain untouched but get consumed via the new services.

---

## Implementation Plan (Epics → Sprints → Stories)

Each story should remain 1–2 days of work with tests. Sprints can be run sequentially or assigned in parallel if QA capacity allows.

### Epic A – Parity Guard Rails (Sprint 0)

**Goal:** Capture current behavior so regressions are detected early.

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **A0.1 Baseline Behavior Snapshot** | Document the current user flows (new chat, switch chat, regen, abort, delete, reconnect). Create manual QA checklist and attach console/network logs for reference. | ✅ Checklist lives in `tasks/implementation-logs/`<br>✅ Includes reproduction steps + expected UI states |
| **A0.2 Regression Harness** | Augment existing Jest tests for `ChatInterface`, `Composer`, `ModeSelector`, and `MessageList` to cover key behaviors (streaming indicator, composer focus) before refactor. Capture current snapshots for later comparison. | ✅ Tests fail if behavior changes <br>✅ No new lint warnings |

### Epic B – Controller Extraction (Sprint 1) ✅ COMPLETE

**Status:** ✅ Complete (2025-11-19)
**Stories:** 2/2 complete
**Test Coverage:** 445 tests (63 new), 96.8% hook coverage

| Story | Status | Description | Acceptance Criteria |
|-------|--------|-------------|---------------------|
| **B1.1 Introduce `useChatController`** | ✅ | Move all logic from `ChatInterface.tsx` into a new hook that returns the same props the component currently assembles. No new functionality; the hook simply consolidates the existing hooks/effects. | ✅ `ChatInterface.tsx` imports `useChatController` and shrinks significantly (639→99 lines, -84.5%)<br>✅ All tests pass with zero behavioral changes (445/445) |
| **B1.2 Add Tests for `useChatController`** | ✅ | Create comprehensive test suite covering all handlers, effects, WebSocket event callbacks, guard flags, and edge cases. Target ≥80% coverage. | ✅ 63 tests created covering all aspects<br>✅ 96.8% coverage (exceeds 80% target)<br>✅ All 445 tests pass |

### Epic C – Move Responsibilities into Specialized Hooks (Sprint 2) ✅ COMPLETE

**Status:** ✅ Complete (2025-11-19)
**Stories:** 3/3 complete
**Test Coverage:** 551 tests (106 new), 100% hook coverage

| Story | Status | Description | Acceptance Criteria |
|-------|--------|-------------|---------------------|
| **C2.1 History Manager Extraction** | ✅ | Relocate history loading, timeout handling, and scroll restoration into `useHistoryManager`. Add unit tests simulating success/error/timeouts. | ✅ No history logic remains in `useChatController`<br>✅ Hook unit tests cover success + timeout paths<br>✅ 29 tests created, 100% coverage<br>✅ All 474 tests pass (zero regressions) |
| **C2.2 Conversation Sync Extraction** | ✅ | Move URL/localStorage/sessionStorage syncing into `useConversationSync`. Handle Strict Mode double-mount guards via hook state. | ✅ Hook API exposes setter + `handleConversationChange` callback<br>✅ Tests verify URL updates and storage writes<br>✅ 100% coverage |
| **C2.3 WebSocket Event Hook** | ✅ | `useWebSocketEvents` takes the adapter instance + callback refs, binds events on mount, unbinds on unmount, and keeps references stable. | ✅ Event registration code removed from controller/UI<br>✅ Tests assert cleanup occurs<br>✅ 100% coverage |

### Epic D – Service Layer Introduction (Sprint 3) ✅ COMPLETE

**Status:** ✅ Complete (2025-11-19)
**Stories:** 3/3 complete
**Test Coverage:** 622 tests (71 new), 100% service coverage

| Story | Status | Description | Acceptance Criteria |
|-------|--------|-------------|---------------------|
| **D3.1 WebSocket Adapter Hook** | ✅ | Implement `useWebSocketAdapter` hook that wraps the existing `useWebSocket` client with a clean, stable interface. Provide methods for `connect`, `disconnect`, `sendMessage`, `requestHistory`, etc., with typed payloads. Returns `WebSocketAdapterInterface` for service layer consumption. | ✅ Hook tested with mock socket client<br>✅ 26 tests created, 100% coverage<br>✅ All 577 tests pass (zero regressions)<br>✅ Typed interface ready for service classes |
| **D3.2 Chat Service** | ✅ | Build `ChatService` class that coordinates adapter + Zustand mutations for sending, streaming, and aborting messages. Include Jest tests using mocks/fakes. | ✅ Plain TypeScript class (no React deps)<br>✅ 21 tests created, 100% coverage<br>✅ Service unit tests cover success/error paths<br>✅ All 598 tests pass (zero regressions) |
| **D3.3 Conversation Service** | ✅ | Build `ConversationService` (create/delete/switch/fetch). Ensures clean separation from React hooks. | ✅ Plain TypeScript class (no React deps)<br>✅ 24 tests created, 100% coverage<br>✅ Tests cover create, delete, switch, fetch operations<br>✅ All 622 tests pass (zero regressions) |

### Epic E – Final Integration & QA (Sprint 4)

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **E4.1 Controller Clean-up** | Ensure `useChatController` only composes hooks/services and exposes a typed interface (props, handlers, derived state). | ✅ No direct store/router/websocket usage inside the component<br>✅ Hook API documented |
| **E4.2 Comprehensive Testing + Docs** | Update component tests to mock controller outputs. Add new unit tests for hooks/services. Update `agent-workflow.md` with instructions on using the new architecture. | ✅ ≥80% coverage on new modules<br>✅ Documentation updated |
| **E4.3 Manual QA & Sign-off** | Run the Sprint 0 checklist to confirm parity. Log results in `tasks/implementation-logs`. | ✅ QA log attached<br>✅ No regressions found (or blockers resolved) |

---

## Risk Mitigation

- **Parallel Development Risk:** Freeze feature work touching chat while refactor branch is active.
- **Testing Debt:** Enforce unit tests per story to avoid last-minute coverage gaps.
- **Merge Conflicts:** Rebase frequently; document new files so future features import from controllers/services rather than reverting to old patterns.
- **Knowledge Transfer:** Include diagrams + README updates so other agents understand the new layers quickly.

---

## Deliverables Checklist

**Epic B (Sprint 1):**
- ✅ `tasks/implementation-logs/chat-refactor-b1.1-controller-extraction.md` created with complete documentation
- ✅ `useChatController` hook created (617 lines) with TypeScript interface
- ✅ `ChatInterface.tsx` simplified to presentation logic (639 → 99 lines, -84.5%)
- ✅ Comprehensive tests created (`useChatController.test.tsx`, 2,164 lines, 63 tests)
- ✅ Jest coverage report: 96.8% (exceeds 80% target)
- ✅ All 445 tests passing (zero regressions)

**Epic C (Sprint 2) - Complete:**
- ✅ **C2.1:** `useHistoryManager` hook created (92 lines) with TypeScript interface
- ✅ `tasks/implementation-logs/chat-refactor-c2.1-history-manager.md` created with complete documentation
- ✅ Comprehensive tests created (`useHistoryManager.test.ts`, 644 lines, 29 tests)
- ✅ **C2.2:** `useConversationSync` hook created (92 lines) with TypeScript interface
- ✅ Comprehensive tests created (`useConversationSync.test.ts`, 48 tests)
- ✅ **C2.3:** `useWebSocketEvents` hook created (298 lines) with TypeScript interface
- ✅ Comprehensive tests created (`useWebSocketEvents.test.ts`, 29 tests)
- ✅ Jest coverage report: 100% on all hooks (exceeds 80% target)
- ✅ All 551 tests passing (106 new hooks tests, zero regressions)
- ✅ History loading, URL/localStorage syncing, and WebSocket event logic extracted from `useChatController`

**Epic D (Sprint 3) - Complete:**
- ✅ **D3.1:** `useWebSocketAdapter` hook created (169 lines) with typed interface
- ✅ `tasks/implementation-logs/chat-refactor-d3.1-websocket-adapter.md` created with complete documentation
- ✅ Comprehensive tests created (`useWebSocketAdapter.test.tsx`, 543 lines, 26 tests)
- ✅ **D3.2:** `ChatService` class created (154 lines) - plain TypeScript, no React deps
- ✅ `tasks/implementation-logs/chat-refactor-d3.2-chat-service.md` created with complete documentation
- ✅ Comprehensive tests created (`ChatService.test.ts`, 515 lines, 21 tests)
- ✅ **D3.3:** `ConversationService` class created (180 lines) - plain TypeScript, no React deps
- ✅ `tasks/implementation-logs/chat-refactor-d3.3-conversation-service.md` created with complete documentation
- ✅ Comprehensive tests created (`ConversationService.test.ts`, 460 lines, 24 tests)
- ✅ Jest coverage report: 100% on all services (exceeds 80% target)
- ✅ All 622 tests passing (71 new service tests, zero regressions)
- ✅ Service layer fully integrated with adapter interface

**Epic E (Sprint 4) - Pending:**
- [ ] Controller clean-up and final integration
- [ ] Documentation updates (`agent-workflow.md` and/or `task-overview.md`)
- [ ] Manual QA + sign-off

---

**Next Steps:** Treat this document as the authoritative PRD for the refactor. Work through stories sequentially, ensuring parity after each epic before branching back into the main epic’s UX efforts.
