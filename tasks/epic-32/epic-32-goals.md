# Epic 32: Questionnaire Progress Streaming

## Goal

Stream progress messages during questionnaire generation to provide real-time feedback to users. Replace the frozen 60-second stepper with live progress updates like "Analyzing risk dimensions..." and "Generating questions for Data Security...".

## Problem Statement

When users generate a questionnaire:
1. User clicks "Generate" button
2. Single Claude call begins (~32K tokens output)
3. **Stepper freezes for ~60 seconds** on Step 1
4. Steps 2-4 complete instantly (client-side navigation only)
5. User has no feedback during the long wait

**Impact:** Poor UX - users don't know if the system is working or stuck. Some abandon the process.

## Success Criteria

- [ ] Users see progress messages every 5-10 seconds during generation
- [ ] Progress messages are meaningful (not just "Processing...")
- [ ] Final questionnaire delivered as validated JSON (no change to output format)
- [ ] Progress events are ephemeral - not stored in database
- [ ] Reconnection handling: graceful degradation if connection drops
- [ ] No regression in questionnaire generation quality or reliability

## Technical Approach

### Architecture: Timer-Based Perceived Progress

**Key Design Decision:** Stream curated progress messages on a timer, NOT actual generation status.

**CRITICAL UNDERSTANDING:**

Since questionnaire generation is a **single Claude API call** (~60 seconds, ~32K tokens output), the backend **CANNOT know**:
- Which risk dimension Claude is currently processing
- Actual progress percentage
- When a specific dimension completes

Progress messages are **perceived progress** - curated messages emitted on a fixed timer interval (every ~5 seconds) to improve UX. They are NOT actual generation status. This is a common UX pattern for long-running operations where true progress cannot be measured.

**Key Design Decision:** Stream whitelisted progress messages, NOT actual content.

| What Streams | What Doesn't Stream |
|--------------|---------------------|
| Progress messages ("Analyzing Data Security...") | Questionnaire JSON |
| Step completion indicators | Question text |
| Error states | Scores or rationale |

### Progress Message Whitelist (Examples)

```typescript
const PROGRESS_MESSAGES = [
  'Analyzing risk dimensions...',
  'Generating questions for Data Security...',
  'Generating questions for Data Privacy...',
  'Generating questions for AI Governance...',
  // ... one per risk dimension
  'Validating questionnaire structure...',
  'Finalizing questionnaire...',
] as const;
```

### Data Flow

```
QuestionnaireGenerationService.generate()
    |
    +--> Emits progress events via IProgressEmitter
    |        |
    |        +--> socket.emit() to requesting client
    |                  |
    |                  +--> Stepper displays ephemeral text
    |
    +--> Returns final questionnaire JSON (unchanged)
```

### Key Components

| Component | Layer | Responsibility |
|-----------|-------|----------------|
| `IProgressEmitter` | Application | Interface for emitting progress |
| `QuestionnaireGenerationService` | Application | Calls emitter at timer intervals |
| `SocketProgressEmitter` | Infrastructure | Implements IProgressEmitter via direct socket.emit() |
| `QuestionnaireHandler` | Infrastructure | Wires emitter to requesting socket |
| `VerticalStepper` + `chatStore` | Frontend | Receives progress events, updates stepper display |

## Scope

**In Scope:**
- Backend progress event emission during questionnaire generation
- WebSocket protocol extension for progress events
- Frontend stepper progress display
- Reconnection handling (graceful degradation)

**Out of Scope:**
- Streaming actual questionnaire content (stays as final JSON delivery)
- Progress persistence (events are ephemeral)
- Retry/resume of partial generations
- Progress for other long-running operations (future epic)

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Message ordering issues | Low | Sequence numbers in events |
| Connection drops mid-generation | Medium | Client shows "Reconnecting..." and waits for completion |
| Progress messages misleading | Low | Test with real generation timing |
| Increased WebSocket traffic | Low | ~10 small events per generation |
| Backend complexity increase | Medium | Keep emitter interface minimal |

## Security Considerations

- Progress messages are generic, contain no user data
- No PHI or PII in progress events
- Events scoped to requesting socket only (direct socket.emit(), not broadcast)

## Dependencies

- Existing WebSocket infrastructure (Socket.IO)
- QuestionnaireGenerationService (current implementation)
- Frontend VerticalStepper + chatStore (existing chat-first architecture)

## Sprints

| Sprint | Focus | Stories | Agent |
|--------|-------|---------|-------|
| Sprint 1 | Backend Infrastructure | 3 stories | backend-agent |
| Sprint 2 | Frontend Integration | 3 stories | frontend-agent |

**Total Stories:** 6

---

## References

- QuestionnaireGenerationService: `packages/backend/src/application/services/QuestionnaireGenerationService.ts`
- WebSocket handlers: `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts`
- Frontend stepper: `apps/web/src/components/chat/VerticalStepper.tsx`
- Chat store: `apps/web/src/stores/chatStore.ts`
- WebSocket client: `apps/web/src/lib/websocket.ts`
