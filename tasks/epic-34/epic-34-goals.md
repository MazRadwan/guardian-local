# Epic 34: Extract Consult Tool Loop Service

## Goal

Extract `executeConsultToolLoop()` and `buildAugmentedMessages()` from MessageHandler.ts into a dedicated `ConsultToolLoopService`. This is the ONLY scope of this epic.

## Problem Statement

The Consult Tool Loop (~350 LOC) is inline in MessageHandler.ts. It should be a dedicated service because:
- It's a distinct, isolated concern (multi-search orchestration)
- It's not working great and needs iteration
- Extracting it reduces MessageHandler by ~300 lines toward the 300 LOC limit

## Scope - EXPLICIT BOUNDARIES

**IN SCOPE (this epic):**
- Extract `executeConsultToolLoop()` method
- Extract `buildAugmentedMessages()` helper
- Move `MAX_TOOL_ITERATIONS` constant
- Create `IConsultToolLoopService` interface
- Create `ConsultToolLoopService` implementation
- Wire service into MessageHandler
- Tests for new service

**OUT OF SCOPE (do NOT touch):**
- `validateSendMessage()` - DO NOT MODIFY
- `validateAndEnrichAttachments()` - DO NOT MODIFY
- `waitForFileRecords()` - DO NOT MODIFY
- `buildFileContext()` - DO NOT MODIFY
- `saveUserMessageAndEmit()` - DO NOT MODIFY
- `generateTitleIfNeeded()` - DO NOT MODIFY
- `autoSummarizeDocuments()` - DO NOT MODIFY
- `enrichInBackground()` - DO NOT MODIFY
- `updateScoringTitle()` - DO NOT MODIFY
- `getModeConfig()` - DO NOT MODIFY
- `shouldBypassClaude()` - DO NOT MODIFY
- `shouldAutoSummarize()` - DO NOT MODIFY
- `generatePlaceholderText()` - DO NOT MODIFY
- Any other MessageHandler methods - DO NOT MODIFY
- QuestionnaireHandler - DO NOT TOUCH
- ScoringHandler - DO NOT TOUCH
- File upload flows - DO NOT TOUCH
- Export flows - DO NOT TOUCH

## Success Criteria

- [ ] `ConsultToolLoopService` exists and implements `IConsultToolLoopService`
- [ ] MessageHandler calls `this.consultToolLoopService.execute()` instead of inline method
- [ ] `executeConsultToolLoop()` removed from MessageHandler
- [ ] `buildAugmentedMessages()` removed from MessageHandler
- [ ] All existing tests pass (zero regressions)
- [ ] Consult mode web search works identically
- [ ] Multi-search (2-3 iterations) works identically
- [ ] Abort handling works identically
- [ ] Max iterations graceful degradation works identically

## Technical Approach

### What Moves to ConsultToolLoopService

```
FROM MessageHandler.ts:
├── MAX_TOOL_ITERATIONS = 3           (line 72)
├── executeConsultToolLoop()          (lines 917-1172)
└── buildAugmentedMessages()          (lines 1186-1222)

TO ConsultToolLoopService.ts:
├── MAX_TOOL_ITERATIONS = 3
├── execute()                         (renamed from executeConsultToolLoop)
└── buildAugmentedMessages()          (private helper)
```

### Dependencies (Injected into New Service)

```typescript
constructor(
  private readonly claudeClient: IClaudeClient,
  private readonly toolRegistry: ToolUseRegistry,
  private readonly conversationService: ConversationService
)
```

### What Stays in MessageHandler

The call site in `streamClaudeResponse()` changes from:

```typescript
// BEFORE (inline call)
const toolLoopResult = await this.executeConsultToolLoop(...);
```

To:

```typescript
// AFTER (delegate to service)
const toolLoopResult = await this.consultToolLoopService.execute(...);
```

## Critical Behaviors to Preserve

These MUST work identically after extraction:

1. **MAX_TOOL_ITERATIONS = 3** - Loop limit
2. **is_error graceful degradation** - Send `is_error: true` when max hit
3. **Abort handling** - Check `socket.data.abortRequested` at every stage
4. **tool_status events** - Emit `searching`, `reading`, `idle`
5. **Context accumulation** - `buildAugmentedMessages()` logic unchanged
6. **Final message saving** - Save to DB via conversationService
7. **assistant_done suppression** - Don't emit if aborted
8. **Error handling** - Emit idle, send error message
9. **assistant_token streaming** - Emit tokens during tool loop continuations
10. **ToolUseContext fields** - Preserve `userId`, `assessmentId: null`, `mode: 'consult'`
11. **Loop exit gating** - Exit when `stopReason !== 'tool_use'` or no tool blocks
12. **firstResponse parameter** - Currently unused in loop body, preserve this behavior

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking tool loop behavior | Exact code move, comprehensive tests |
| Breaking abort handling | Test abort scenarios explicitly |
| Missing dependency injection | Document all `this.` usages |

## Sprints

| Sprint | Focus | Stories |
|--------|-------|---------|
| Sprint 1 | Extract Consult Tool Loop | 34.1.1-34.1.4 (4 stories) |

**Total Stories:** 4

## Files Touched

**Create:**
- `packages/backend/src/application/interfaces/IConsultToolLoopService.ts`
- `packages/backend/src/application/services/ConsultToolLoopService.ts`
- `packages/backend/__tests__/unit/ConsultToolLoopService.test.ts`

**Modify:**
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
  - Remove `executeConsultToolLoop()` method
  - Remove `buildAugmentedMessages()` method
  - Remove `MAX_TOOL_ITERATIONS` constant
  - Add `consultToolLoopService` constructor parameter
  - Change call site in `streamClaudeResponse()` to use service
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
  - Instantiate and inject `ConsultToolLoopService`
- `packages/backend/src/application/services/index.ts`
  - Export new service
- `packages/backend/src/application/interfaces/index.ts`
  - Export new interface

**Test files requiring mock updates (constructor signature change):**
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts`
- `packages/backend/__tests__/unit/ChatServer.toolStatus.test.ts`
- `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`

**DO NOT MODIFY (business logic in these files):**
- Validation methods in MessageHandler (logic unchanged, only constructor signature)
- QuestionnaireHandler.ts
- ScoringHandler.ts
- DocumentUploadController.ts
- Export controllers

## References

- `docs/design/architecture/websocket-handlers.md` - Current MessageHandler documentation
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts:917-1222` - Code to extract
