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

### Epic B – Controller Extraction (Sprint 1)

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **B1.1 Introduce `useChatController`** | Move all logic from `ChatInterface.tsx` into a new hook that returns the same props the component currently assembles. No new functionality; the hook simply consolidates the existing hooks/effects. | ✅ `ChatInterface.tsx` imports `useChatController` and shrinks significantly<br>✅ All tests pass with zero behavioral changes |
| **B1.2 Specialized Hooks Skeleton** | Create empty shells for `useHistoryManager`, `useConversationSync`, and `useWebSocketEvents`. Wire them into `useChatController` but keep logic inline for now. | ✅ Files exist with unit test placeholders<br>✅ Hook APIs defined with TypeScript interfaces |

### Epic C – Move Responsibilities into Specialized Hooks (Sprint 2)

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **C2.1 History Manager Extraction** | Relocate history loading, timeout handling, and scroll restoration into `useHistoryManager`. Add unit tests simulating success/error/timeouts. | ✅ No history logic remains in `useChatController`<br>✅ Hook unit tests cover success + timeout paths |
| **C2.2 Conversation Sync Extraction** | Move URL/localStorage/sessionStorage syncing into `useConversationSync`. Handle Strict Mode double-mount guards via hook state. | ✅ Hook API exposes setter + `handleConversationChange` callback<br>✅ Tests verify URL updates and storage writes |
| **C2.3 WebSocket Event Hook** | `useWebSocketEvents` takes the adapter instance + callback refs, binds events on mount, unbinds on unmount, and keeps references stable. | ✅ Event registration code removed from controller/UI<br>✅ Tests assert cleanup occurs |

### Epic D – Service Layer Introduction (Sprint 3)

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **D3.1 WebSocket Adapter** | Implement `WebSocketAdapter` class that wraps the existing `useWebSocket` client. Provide methods for `connect`, `disconnect`, `sendMessage`, `requestHistory`, etc., with typed payloads. | ✅ adapter tested with mock socket client<br>✅ Controller uses adapter instead of raw hook |
| **D3.2 Chat Service** | Build `ChatService` class that coordinates adapter + Zustand mutations for sending, streaming, and aborting messages. Include Jest tests using mocks/fakes. | ✅ `useChatController` calls `chatService.sendMessage()` etc. <br>✅ Service unit tests cover success/error paths |
| **D3.3 Conversation Service** | Build `ConversationService` (create/delete/switch/update titles). Ensure it writes to Zustand and storage through adapter callbacks. | ✅ Controller invokes service methods for relevant actions<br>✅ Tests cover auto-create + deletion edge cases |

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

- [ ] `tasks/implementation-logs/*` updated with baseline + QA results.
- [ ] New hooks/services (`useChatController`, `useHistoryManager`, `useConversationSync`, `useWebSocketEvents`, `ChatService`, `ConversationService`, `WebSocketAdapter`) with TypeScript types and tests.
- [ ] `ChatInterface.tsx` simplified to presentation logic.
- [ ] Jest coverage report stored for reference.
- [ ] Documentation updates (`agent-workflow.md` and/or `task-overview.md`) pointing to this sidequest.

---

**Next Steps:** Treat this document as the authoritative PRD for the refactor. Work through stories sequentially, ensuring parity after each epic before branching back into the main epic’s UX efforts.
