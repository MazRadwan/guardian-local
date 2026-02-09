# Sprint 3: Extract Orchestration → SendMessageOrchestrator

**Epic:** 36 - MessageHandler Final Decomposition
**Stories:** 36.3.1 - 36.3.3 (3 stories)
**Agent:** `backend-agent`
**Risk:** MEDIUM
**Prerequisite:** Sprint 2 complete

---

## Objective

Extract `handleSendMessage()` from ChatServer into `SendMessageOrchestrator`. Delete MessageHandler.ts (only `buildFileContext` remains — inline into orchestrator). ChatServer becomes pure event routing (~180 LOC).

---

## Stories

| Story | Name | Dependencies |
|-------|------|--------------|
| 36.3.1 | Create SendMessageOrchestrator, lift handleSendMessage pipeline | Sprint 2 complete |
| 36.3.2 | Wire into ChatServer, delete MessageHandler, cleanup | 36.3.1 |
| 36.3.3 | Orchestrator tests + full regression (all modes browser QA) | 36.3.2 |

**Sequential execution.**

---

## What Moves

```
FROM ChatServer.ts:
└── handleSendMessage() (lines 237-345, ~108 LOC)
    ├── Step 1: validator.validateSendMessage()
    ├── Step 2: Save user message + emit message_sent
    ├── Step 3: contextBuilder.build()
    ├── Step 4: Scoring bypass → EARLY RETURN
    ├── Step 5: File context building (inline from MessageHandler.buildFileContext)
    ├── Step 6: streamingService.streamClaudeResponse()
    └── Step 7: Post-streaming (tool dispatch, enrichment, title)

FROM MessageHandler.ts (DELETED):
└── buildFileContext() → inlined into orchestrator Step 5
```

## Orchestrator Design

```typescript
export class SendMessageOrchestrator {
  constructor(
    private readonly validator: SendMessageValidator,
    private readonly streamingService: ClaudeStreamingService,
    private readonly conversationService: ConversationService,
    private readonly contextBuilder: ConversationContextBuilder,
    private readonly fileContextBuilder: FileContextBuilder,
    private readonly scoringHandler: ScoringHandler,
    private readonly toolRegistry: ToolUseRegistry,
    private readonly titleUpdateService: TitleUpdateService,
    private readonly backgroundEnrichmentService: BackgroundEnrichmentService,
    private readonly webSearchEnabled: boolean
  ) {}

  async execute(socket: IAuthenticatedSocket, payload: SendMessagePayload): Promise<void> {
    // Stateless — all request data flows through method args
    // Step ordering IDENTICAL to current ChatServer.handleSendMessage
  }
}
```

**Key:** Orchestrator is STATELESS. No request-scoped state stored on `this`.

## MEDIUM Risk Items

- **Scoring bypass early return** — must prevent fall-through into streaming
- **File context scoping** — pass `undefined` for scopeToFileIds (ALL conversation files), add comment
- **11 dependencies** — large constructor, but each is injected once in ChatServer

## New Tests Required (Story 36.3.3)

Orchestrator-specific tests (from Codex recommendation):
- Scoring bypass path (returns before streaming)
- Consult tool loop gating (empty toolUseBlocks when handled)
- Background enrichment gating (assessment mode only)
- `assistant_done` suppression on abort
- `emitFileProcessingError` branch (file_processing_error event)
- Title generation called for all modes

Plus full browser QA of all 3 modes.

---

## End State After Sprint 3

| File | LOC | Role |
|------|-----|------|
| ChatServer.ts | ~180 | Event routing only |
| SendMessageOrchestrator.ts | ~150 | Pipeline orchestration |
| SendMessageValidator.ts | ~250 | Validation service |
| ClaudeStreamingService.ts | ~250 | Streaming service |
| types/SendMessage.ts | ~90 | Shared types |
| MessageHandler.ts | DELETED | — |

All files under 300 LOC. Controllers control. Services serve.

---

## NOTE

Detailed story specs will be written after Sprint 2 is complete. Sprint 2 results may inform the orchestrator design, particularly around how streaming results flow back for post-streaming steps.

## Second Codex Review

Before executing Sprint 3, send the detailed story specs to Codex for a second review. Sprint 3 touches the most files and has the highest integration risk. Codex review should focus on:
- Constructor wiring correctness
- Step ordering preservation
- Scoring bypass safety
- Error handling completeness
