# Epic 28: ChatServer.ts Modular Refactoring

**Status:** Planning
**Branch:** `epic/28-chat-server-refactor`
**Target File:** `/packages/backend/src/infrastructure/websocket/ChatServer.ts` (~2700 lines)

---

## Problem Statement

ChatServer.ts is a "God Class" with 18 dependencies (17 explicit + 1 hidden) and 13+ responsibilities:
- Socket.IO namespace setup and authentication
- Connection handling (auth, resume, rooms, disconnect)
- Message handling (send_message, get_history)
- Conversation management (CRUD, mode switching)
- Scoring orchestration (trigger-on-send, vendor clarification)
- File context building (intake context, excerpts, S3 fallback)
- Background enrichment (assessment mode)
- Title generation (LLM-based, created internally - violates DI)
- Questionnaire generation (streaming markdown)
- Tool use handling (hard-coded, doesn't use IToolUseHandler pattern)
- Auto-summarization (consult mode)
- Utility functions (duplicate sanitization, validation, chunking)

**Pain Points:**
- Constructor has 17 explicit dependencies + TitleGenerationService created internally
- Mode-specific logic scattered throughout (~500+ lines)
- `send_message` handler alone is ~400 lines
- Duplicate sanitization: `sanitizeForPrompt` exists in both ChatServer and `utils/sanitize.ts`
- Duplicate vendor validation: `isValidVendorName` duplicated in QuestionnaireReadyService
- Tool handling hard-codes `questionnaire_ready` instead of using `IToolUseHandler` registry
- Shared state (pendingConversationCreations, abortedStreams) not formally modeled

---

## Goals

1. **Modular Architecture**: Split into focused handler classes with single responsibilities
2. **Zero Regressions**: All existing tests pass (unit, integration, AND E2E)
3. **Testable**: Each extracted module independently testable with mocked dependencies
4. **Pattern Compliant**: Follow existing patterns (IToolUseHandler, sanitize.ts, service DI)
5. **Incremental Delivery**: Each phase can be merged independently
6. **Clean DI**: Inject all dependencies, no hidden instantiation

---

## Target Architecture

```
infrastructure/websocket/
├── ChatServer.ts              # Slim orchestrator (~200 lines)
├── ChatContext.ts             # Shared state interface (infrastructure-only)
├── handlers/
│   ├── ConnectionHandler.ts   # Auth, connect, resume, rooms, disconnect
│   ├── MessageHandler.ts      # send_message, tool use routing
│   ├── ConversationHandler.ts # CRUD, get_history
│   ├── ModeSwitchHandler.ts   # switch_mode, guidance messages
│   ├── ScoringHandler.ts      # Scoring flow, vendor clarification
│   └── QuestionnaireHandler.ts # Generation, export status
├── context/
│   ├── ConversationContextBuilder.ts # buildConversationContext
│   └── FileContextBuilder.ts         # buildFileContext, formatting
├── modes/
│   ├── IModeStrategy.ts
│   ├── ConsultModeStrategy.ts   # Auto-summarize, file context
│   ├── AssessmentModeStrategy.ts # Background enrichment, tools
│   └── ScoringModeStrategy.ts   # Scoring trigger logic
└── StreamingHandler.ts        # Simulated streaming, chunking (matches docs)
```

**Notes:**
- Sanitization utilities extend existing `packages/backend/src/utils/sanitize.ts` (no new file)
- `StreamingHandler.ts` name matches `docs/design/architecture/implementation-guide.md`

---

## Shared State Model

```typescript
// ChatContext.ts - Cross-cutting shared state (INFRASTRUCTURE LAYER ONLY)
// Per architecture-layers.md: No Socket.IO types, no WebSocket concerns leak to application/domain
export interface ChatContext {
  /** Idempotency guard for conversation creation */
  pendingCreations: Map<string, { conversationId: string; timestamp: number }>;

  /** Stream abort tracking */
  abortedStreams: Set<string>;

  /** Rate limiter instance */
  rateLimiter: RateLimiter;

  /** Prompt cache manager */
  promptCache: PromptCacheManager;
}

// Socket abstraction - handlers receive this interface, not concrete Socket type
export interface IAuthenticatedSocket {
  readonly id: string;
  readonly userId: string;
  readonly userEmail?: string;
  readonly userRole?: string;
  conversationId?: string;
  data: Record<string, unknown>;
  emit(event: string, data: unknown): void;
  join(room: string): void;
}
```

**Architecture Constraints:**
- `ChatContext` is infrastructure-only, not passed to application/domain layers
- Handlers receive `IAuthenticatedSocket` interface, not concrete Socket.IO type
- Application services injected via interfaces (not via ChatContext - avoid service locator)

---

## Implementation Phases

### Phase 1: Consolidate Utilities (Lowest Risk)
**Stories:**
- 28.1.1: Extend `utils/sanitize.ts` with `sanitizeErrorForClient()` and `isValidVendorName()`
- 28.1.2: Remove duplicate `sanitizeForPrompt` from ChatServer (use existing)
- 28.1.3: Remove duplicate `isValidVendorName` from QuestionnaireReadyService
- 28.1.4: Extract `StreamingHandler.ts` (chunkMarkdown, streamToSocket, sleep) - name matches docs
- 28.1.5: Update ChatServer to import consolidated utilities

**Acceptance Criteria:**
- Single source of truth for sanitization in `utils/sanitize.ts`
- All existing ChatServer tests pass
- New unit tests for StreamingHandler
- No changes to index.ts wiring
- Naming aligns with `docs/design/architecture/implementation-guide.md`

---

### Phase 2: Extract Context Builders
**Stories:**
- 28.2.1: Extract `ConversationContextBuilder.ts`
- 28.2.2: Extract `FileContextBuilder.ts`
- 28.2.3: Update ChatServer to use context builders

**Acceptance Criteria:**
- Context builders have dedicated unit tests
- ChatServer constructor creates builders internally
- All existing tests pass

---

### Phase 3: Define Shared State (ChatContext)
**Stories:**
- 28.3.1: Create `ChatContext.ts` interface
- 28.3.2: Refactor ChatServer to use ChatContext object
- 28.3.3: Pass ChatContext to handlers (prep for extraction)

**Acceptance Criteria:**
- Shared state formally modeled
- No behavioral changes
- All tests pass

---

### Phase 4: Extract Connection Handler
**Stories:**
- 28.4.1: Extract `ConnectionHandler.ts` (auth middleware, resume logic, room join)
- 28.4.2: Handle `connection_ready` emission
- 28.4.3: Handle `disconnect` event
- 28.4.4: Update ChatServer to delegate connection events

**Acceptance Criteria:**
- ConnectionHandler has unit tests
- Auth middleware preserved (JWT verification)
- Resume conversation logic works
- **CRITICAL: `user:{userId}` room join preserved** - DocumentUploadController depends on this for:
  - `upload_progress` events
  - `intake_context_ready` events
  - `scoring_parse_ready` events
- `connection_ready` event emits with correct payload (userId, conversationId, resumed flag)
- E2E websocket tests pass

---

### Phase 5: Extract Conversation Handlers
**Stories:**
- 28.5.1: Extract `ConversationHandler.ts` (get_conversations, start_new, delete, get_history)
- 28.5.2: Centralize ownership validation
- 28.5.3: Update ChatServer to delegate conversation events

**Acceptance Criteria:**
- ConversationHandler has unit tests
- Ownership validation centralized
- Handler receives ChatContext for pendingCreations

---

### Phase 6: Extract Mode Switch Handler
**Stories:**
- 28.6.1: Extract `ModeSwitchHandler.ts` (switch_mode event)
- 28.6.2: Include assessment/scoring guidance messages

**Acceptance Criteria:**
- ModeSwitchHandler has unit tests
- Assessment/scoring guidance messages preserved

---

### Phase 7: Extract Scoring Handler
**Stories:**
- 28.7.1: Extract `ScoringHandler.ts` (triggerScoringOnSend, vendor_selected)
- 28.7.2: Extract buildScoringFollowUpContext
- 28.7.3: Handle vendor clarification flow

**Acceptance Criteria:**
- ScoringHandler has unit tests
- Vendor clarification tests pass
- Scoring progress events emit correctly

---

### Phase 8: Extract Questionnaire Handler
**Stories:**
- 28.8.1: Extract `QuestionnaireHandler.ts` (generate_questionnaire, get_export_status)
- 28.8.2: Preserve public method interfaces for test compatibility

**Acceptance Criteria:**
- Existing `ChatServer.handleGenerateQuestionnaire.test.ts` passes
- New handler unit tests
- Phase emission logic works correctly

---

### Phase 9: Extract Message Handler + Tool Use Registry
**Stories:**
- 28.9.1: Extract `MessageHandler.ts` (send_message event)
- 28.9.2: Implement tool use registry using `IToolUseHandler` pattern
- 28.9.3: Register QuestionnaireReadyService via registry (not hard-coded)
- 28.9.4: Mode-specific routing (consult/assessment/scoring)

**Architecture Constraints:**
- Tool registry lives in **infrastructure layer** (not application/domain)
- Application services (QuestionnaireReadyService) injected via constructor, not via ChatContext
- ChatContext is for shared state only - **NOT a service locator**

**Acceptance Criteria:**
- All existing ChatServer tests pass
- MessageHandler has comprehensive unit tests
- Tool handlers registered by name, extensible for future tools
- Mode-specific callbacks work correctly
- Clean architecture maintained: infrastructure → application (not vice versa)

---

### Phase 10: Extract Mode Strategies (Optional Enhancement)
**Stories:**
- 28.10.1: Define `IModeStrategy` interface
- 28.10.2: Extract `ConsultModeStrategy.ts` (auto-summarize)
- 28.10.3: Extract `AssessmentModeStrategy.ts` (background enrichment)
- 28.10.4: Extract `ScoringModeStrategy.ts` (scoring trigger)

**Acceptance Criteria:**
- Mode strategies implement common interface
- Strategy selection based on conversation mode
- All tests pass

---

### Phase 11: Slim Orchestrator + Clean DI
**Stories:**
- 28.11.1: Inject TitleGenerationService (remove hidden instantiation)
- 28.11.2: Refactor ChatServer to ~200 lines
- 28.11.3: Ensure all handlers properly wired
- 28.11.4: Preserve public API (emitToConversation, streamMessage)
- 28.11.5: Update index.ts to wire TitleGenerationService

**Acceptance Criteria:**
- ChatServer is a thin orchestrator
- All dependencies injected (no hidden instantiation)
- All integration points work
- Full test suite passes

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| ChatServer.ts lines | ~2700 | ~200 |
| Constructor dependencies | 18 (17 + 1 hidden) | 10-12 (all explicit) |
| Testable modules | 1 | 12+ |
| Unit test files | 13 | 25+ |
| Duplicate sanitization | 2 locations | 1 canonical location |
| Tool handler pattern | Hard-coded | Registry-based |

---

## Risk Mitigation

1. **Test-First Refactoring**: Write new unit tests before extraction
2. **Incremental PRs**: Each phase is a separate PR
3. **CI Gate**: All existing tests must pass before merge
4. **Type Safety**: Strict TypeScript interfaces at all boundaries
5. **Rollback Plan**: Each phase revertible via git
6. **Security Consolidation**: Single sanitization source prevents divergent behavior

---

## Dependencies

- Existing `IToolUseHandler` interface at `src/application/interfaces/IToolUseHandler.ts`
- Existing `sanitizeForPrompt` at `src/utils/sanitize.ts`
- Test infrastructure already in place (Jest, test database)

---

## Verification Checklist (Per Phase)

- [ ] `pnpm --filter @guardian/backend test:unit` - all pass
- [ ] `pnpm --filter @guardian/backend test:integration` - all pass
- [ ] `pnpm --filter @guardian/backend test:e2e` - all pass
- [ ] `pnpm --filter @guardian/backend test` - full suite passes
- [ ] `pnpm --filter @guardian/backend build` - no TypeScript errors
- [ ] Manual test: WebSocket connection works
- [ ] Manual test: send_message works
- [ ] Manual test: mode switching works
- [ ] Manual test: questionnaire generation works
- [ ] Manual test: scoring flow works

---

## Reviewer Feedback Incorporated

### Round 1

| Feedback | Resolution |
|----------|------------|
| Missing ConnectionHandler phase | Added Phase 4 for connection/auth extraction |
| Constructor deps 14+ → 5-6 unrealistic | Updated to 18 → 10-12, all explicit |
| Duplicate sanitization | Phase 1 consolidates to existing utils/sanitize.ts |
| Shared state not modeled | Added Phase 3 for ChatContext interface |
| Missing E2E in verification | Added test:e2e and full test suite to checklist |
| Hard-coded tool use | Phase 9 implements IToolUseHandler registry pattern |
| TitleGenerationService hidden | Phase 11 injects it explicitly |

### Round 2

| Feedback | Resolution |
|----------|------------|
| ChatContext transport-agnostic | Added architecture constraints: infrastructure-only, IAuthenticatedSocket interface |
| Naming alignment (StreamingHandler vs MarkdownStreamer) | Renamed to `StreamingHandler.ts` to match implementation-guide.md |
| ConnectionHandler must preserve room join | Added CRITICAL note: `user:{userId}` room join for DocumentUploadController events |
| IToolUseHandler registry not a service locator | Added architecture constraints: registry in infrastructure, services via constructor DI |
