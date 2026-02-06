# Epic 35: Extract Title Generation from MessageHandler

## Goal

Extract `generateTitleIfNeeded()` and `updateScoringTitle()` from MessageHandler.ts into a dedicated `TitleUpdateService`. This is the ONLY scope of this epic.

## Problem Statement

MessageHandler.ts is a 1,319 LOC god module (limit: 300). Title generation is an isolated concern — single dependency (`ITitleGenerationService`), fire-and-forget pattern, zero coupling to streaming/validation/tool loop.

The regeneration bug (Epic 34) showed how tightly-coupled features cascade failures. Extracting title logic prevents it from being affected by future changes to streaming or tool loop code.

This is the second extraction in the multi-epic MessageHandler decomposition (`tasks/messagehandler-decomposition.md`).

## Scope - EXPLICIT BOUNDARIES

**IN SCOPE (this epic):**
- Extract `generateTitleIfNeeded()` method (~100 LOC, lines 1040-1141)
- Extract `updateScoringTitle()` method (~37 LOC, lines 1282-1318)
- Remove `ITitleGenerationService` from MessageHandler constructor
- Remove `TitleContext`, `isPlaceholderTitle` imports from MessageHandler
- Create `ITitleUpdateService` interface in infrastructure layer
- Create `TitleUpdateService` implementation in infrastructure layer
- Add `formatScoringTitle()` to `ITitleGenerationService` interface (already on concrete class)
- Wire `TitleUpdateService` into ChatServer directly (not through MessageHandler)
- Tests for new service
- Update test mocks for MessageHandler constructor signature change

**OUT OF SCOPE (do NOT touch):**
- `validateSendMessage()` - DO NOT MODIFY
- `validateAndEnrichAttachments()` - DO NOT MODIFY
- `waitForFileRecords()` - DO NOT MODIFY
- `buildFileContext()` - DO NOT MODIFY
- `saveUserMessageAndEmit()` - DO NOT MODIFY
- `streamClaudeResponse()` - DO NOT MODIFY
- `autoSummarizeDocuments()` - DO NOT MODIFY
- `enrichInBackground()` - DO NOT MODIFY
- `getModeConfig()` - DO NOT MODIFY
- `shouldBypassClaude()` - DO NOT MODIFY
- `shouldAutoSummarize()` - DO NOT MODIFY
- `generatePlaceholderText()` - DO NOT MODIFY
- Any other MessageHandler methods - DO NOT MODIFY
- QuestionnaireHandler - DO NOT TOUCH
- ScoringHandler - DO NOT TOUCH
- ConsultToolLoopService - DO NOT TOUCH
- File upload flows - DO NOT TOUCH
- Export flows - DO NOT TOUCH

## Success Criteria

- [ ] `TitleUpdateService` exists and implements `ITitleUpdateService`
- [ ] ChatServer calls `this.titleUpdateService.generateTitleIfNeeded()` directly
- [ ] ChatServer calls `this.titleUpdateService.updateScoringTitle()` directly
- [ ] `generateTitleIfNeeded()` removed from MessageHandler
- [ ] `updateScoringTitle()` removed from MessageHandler
- [ ] `ITitleGenerationService` removed from MessageHandler constructor
- [ ] `formatScoringTitle()` exposed on `ITitleGenerationService` interface
- [ ] All existing tests pass (zero regressions)
- [ ] Net LOC reduction in MessageHandler: ~140 lines (1,319 -> ~1,179)

## Technical Approach

### What Moves to TitleUpdateService

```
FROM MessageHandler.ts:
├── generateTitleIfNeeded()          (lines 1040-1141)
└── updateScoringTitle()             (lines 1282-1318)

TO TitleUpdateService.ts:
├── generateTitleIfNeeded()          (same name, same logic)
└── updateScoringTitle()             (delegates truncation to formatScoringTitle)
```

### Dependencies (Injected into New Service)

```typescript
constructor(
  private readonly conversationService: ConversationService,
  private readonly titleGenerationService?: ITitleGenerationService
)
```

### What Stays in MessageHandler

Nothing title-related. The `ITitleGenerationService` constructor parameter is removed entirely.

### Call Site Changes in ChatServer

```typescript
// BEFORE (through MessageHandler)
this.messageHandler.generateTitleIfNeeded(socket, conversationId, mode, result.fullResponse)
this.messageHandler.updateScoringTitle(socket, conversationId, filename)

// AFTER (direct to TitleUpdateService)
this.titleUpdateService.generateTitleIfNeeded(socket, conversationId, mode, result.fullResponse)
this.titleUpdateService.updateScoringTitle(socket, conversationId, filename)
```

### Architecture

```
ChatServer (orchestrator)
  │
  ├── TitleUpdateService (NEW - infrastructure layer)
  │     ├── ConversationService (application)
  │     └── ITitleGenerationService (application interface)
  │           └── TitleGenerationService (application - unchanged)
  │
  └── MessageHandler (MODIFIED - title deps removed)
```

**Key decision:** TitleUpdateService is injected into ChatServer directly (NOT through MessageHandler). ChatServer already calls these methods at lines 267 and 323 — removing the indirection through MessageHandler is cleaner.

## Critical Behaviors to Preserve

These MUST work identically after extraction:

1. **Scoring mode skip** - `generateTitleIfNeeded()` returns early for scoring mode
2. **Message count triggers** - Consult: 2 messages, Assessment: 3 or 5 messages
3. **Vendor info update** - Assessment at message 5 fetches second user message for title context
4. **Manual edit protection** - Skip if `conversation.titleManuallyEdited === true`
5. **Placeholder detection** - Only generate if current title is a placeholder (`isPlaceholderTitle()`)
6. **conversation_title_updated event** - Emitted via `socket.emit()` after successful title update
7. **Non-fatal error handling** - Title gen errors are caught and logged, never thrown
8. **Fire-and-forget pattern** - ChatServer calls with `.catch()`, does not await result
9. **Scoring title truncation** - Preserves file extension while truncating to 50 chars max
10. **updateTitleIfNotManuallyEdited** - Atomic DB check prevents race with manual edits

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking title gen for any mode | Exact code move, comprehensive tests |
| Missing event emission | Tests verify socket.emit called with correct payload |
| Constructor signature change breaks tests | Story 35.1.2 lists all affected test files |
| Scoring title truncation regression | Existing test coverage + new unit tests |

## Sprints

| Sprint | Focus | Stories |
|--------|-------|---------|
| Sprint 1 | Extract Title Update Service | 35.1.1-35.1.3 (3 stories) |

**Total Stories:** 3

## Files Touched

**Create:**
- `packages/backend/src/infrastructure/websocket/services/ITitleUpdateService.ts`
- `packages/backend/src/infrastructure/websocket/services/TitleUpdateService.ts`
- `packages/backend/__tests__/unit/infrastructure/websocket/services/TitleUpdateService.test.ts`

**Modify:**
- `packages/backend/src/application/interfaces/ITitleGenerationService.ts`
  - Add `formatScoringTitle(filename: string): string` to interface
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
  - Remove `generateTitleIfNeeded()` method
  - Remove `updateScoringTitle()` method
  - Remove `ITitleGenerationService` constructor parameter
  - Remove imports: `ITitleGenerationService`, `TitleContext`, `isPlaceholderTitle`
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
  - Create `TitleUpdateService` in constructor
  - Store as `private readonly titleUpdateService`
  - Change call sites at lines 267 and 323
  - Remove `titleGenerationService` from MessageHandler constructor call
- `packages/backend/src/infrastructure/websocket/services/index.ts`
  - Export new service and interface

**Test files requiring mock updates (constructor signature change — these instantiate MessageHandler with full 10-arg signature):**
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`

**DO NOT MODIFY (business logic in these files):**
- Validation methods in MessageHandler (logic unchanged, only constructor signature)
- QuestionnaireHandler.ts
- ScoringHandler.ts
- ConsultToolLoopService.ts
- DocumentUploadController.ts

## References

- `tasks/messagehandler-decomposition.md` - Cross-cutting decomposition plan
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts:1040-1141` - generateTitleIfNeeded
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts:1282-1318` - updateScoringTitle
- `packages/backend/src/infrastructure/websocket/ChatServer.ts:267,323` - Call sites
- `packages/backend/src/infrastructure/websocket/services/IConsultToolLoopService.ts` - Pattern reference
- `packages/backend/__tests__/unit/ChatServer.titleGeneration.test.ts` - Existing test coverage
