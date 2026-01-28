# Epic 32: Questionnaire Progress Streaming - Overview

## Summary

Stream progress messages during questionnaire generation to replace the frozen 60-second stepper with real-time feedback. Users will see updates like "Analyzing risk dimensions..." every 5-10 seconds while the questionnaire generates.

**Approach:** Progress event streaming (not content streaming). Final questionnaire delivered as validated JSON.

## Hard Requirements

| Requirement | Status |
|-------------|--------|
| **Progress every 5-10s**: Users see feedback during 60s generation | Encoded in Sprint 1 |
| **No content streaming**: Only progress messages, not questionnaire text | Design constraint |
| **Ephemeral events**: Progress not stored in database | Encoded in Sprint 1 |
| **Reconnection handling**: Graceful degradation on connection drop | Encoded in Sprint 2 |
| **No regression**: Questionnaire quality/format unchanged | Encoded in Sprint 2 |

## Implementation Guardrails

**CRITICAL: Follow these constraints during implementation.**

| Guardrail | Reason |
|-----------|--------|
| Do NOT reuse `assistant_token` event for progress | Would interfere with existing message streaming |
| Use dedicated `questionnaire_progress` event | Clean separation of concerns |
| Store progress in ephemeral UI state only | Not in messages, not in database |
| Include monotonic `seq` number in events | Ordering protection - client can reject out-of-order |
| Use direct socket emission (NOT room-based) | Matches existing ChatServer patterns |
| Timer-based progress (NOT actual status) | Single Claude call means no real-time dimension tracking |

## Sprints

| Sprint | Focus | Stories | Estimated |
|--------|-------|---------|-----------|
| Sprint 1 | Backend Infrastructure | 3 | IProgressEmitter, QuestionnaireGenerationService integration, WebSocket events |
| Sprint 2 | Frontend Integration | 3 | Stepper event subscription, progress display, reconnection handling |

**Total Stories:** 6

## Dependency Chart

```
Sprint 1 (Backend) - backend-agent
═══════════════════════════════════════════════════════════════

  32.1.1 IProgressEmitter Interface
         │
         ├──────────────────────┐
         │                      │
         ▼                      ▼
  32.1.2 QuestionnaireGenerationService   32.1.3 SocketProgressEmitter
         Integration                      (can run PARALLEL with 32.1.2)
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
═══════════════════════════════════════════════════════════════
Sprint 2 (Frontend) - frontend-agent
Depends on: Sprint 1 complete
═══════════════════════════════════════════════════════════════

  32.2.1 Stepper Event Subscription
         │
         ▼
  32.2.2 Progress Display Component
         │
         ▼
  32.2.3 Reconnection Handling

═══════════════════════════════════════════════════════════════
```

### Parallelization Opportunities

| Stories | Can Parallelize? | Reason |
|---------|------------------|--------|
| 32.1.2 + 32.1.3 | YES | No file overlap - different layers |
| Sprint 1 + Sprint 2 | NO | Frontend depends on backend events |
| 32.2.1 + 32.2.2 | NO | Display depends on subscription |

## Execution Order

```
Day 1: backend-agent
├── 32.1.1 IProgressEmitter Interface (1-2 hours)
└── 32.1.2 + 32.1.3 in PARALLEL (2-3 hours each)

Day 2: frontend-agent (after Sprint 1 complete)
├── 32.2.1 Stepper event subscription (2 hours)
├── 32.2.2 Progress display (2 hours)
└── 32.2.3 Reconnection handling (2 hours)
```

**Estimated Total:** 2 working days

## Files Created/Modified

### New Files
- `packages/backend/src/application/interfaces/IProgressEmitter.ts`
- `packages/backend/src/infrastructure/websocket/emitters/SocketProgressEmitter.ts`
- `packages/backend/src/infrastructure/websocket/emitters/index.ts`
- `packages/backend/__tests__/unit/application/interfaces/IProgressEmitter.test.ts`
- `packages/backend/__tests__/unit/infrastructure/websocket/emitters/SocketProgressEmitter.test.ts`

### Modified Files
- `packages/backend/src/application/services/QuestionnaireGenerationService.ts` - Add progress emission
- `packages/backend/src/application/interfaces/index.ts` - Export IProgressEmitter
- `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts` - Wire emitter
- `apps/web/src/lib/websocket.ts` - Add onQuestionnaireProgress method
- `apps/web/src/stores/chatStore.ts` - Add questionnaireProgress state
- `apps/web/src/components/chat/VerticalStepper.tsx` - Progress display
- `apps/web/src/components/chat/ChatInterface.tsx` - Pass progress to stepper
- `apps/web/src/hooks/useWebSocket.ts` - Wire progress subscription

## WebSocket Protocol Extension

### New Event: `questionnaire_progress`

```typescript
// Server → Client (direct socket emission, NOT room-based)
interface QuestionnaireProgressEvent {
  conversationId: string;
  message: string;      // e.g., "Generating questions for Data Security..."
  step: number;         // 1-based step number (1-11 for curated messages)
  totalSteps: number;   // Total expected steps (typically 11)
  timestamp: number;    // Unix timestamp for ordering
  seq: number;          // Monotonic sequence number (client can reject out-of-order)
}
```

**Note:** Progress is timer-based (every ~5s), NOT tied to actual dimension completion.

### Existing Event: `questionnaire_complete` (unchanged)

```typescript
// Server → Client
interface QuestionnaireCompleteEvent {
  type: 'questionnaire_complete';
  payload: {
    conversationId: string;
    questionnaire: Questionnaire; // Full validated JSON
  };
}
```

## Success Metrics

1. **UX Improvement:** Users report better experience (qualitative)
2. **Perceived Speed:** Same 60s feels shorter with progress feedback
3. **Abandonment Rate:** Fewer users abandon during generation
4. **Technical:** Progress events arrive every 5-10s (measurable)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude API doesn't expose progress | High | Timer-based progress (curated messages every ~5s) |
| Messages arrive out of order | Low | Monotonic seq ordering on client (reject old seq) |
| Connection drops during generation | Medium | Fallback to polling or "Generating..." state |
| Over-engineering | Low | Keep interface minimal (emit only) |

## Definition of Done

- [ ] Sprint 1-2 complete
- [ ] All tests pass (unit + integration)
- [ ] Manual QA: generate questionnaire, observe progress updates
- [ ] No regressions in questionnaire output
- [ ] Progress events visible in browser DevTools (WebSocket tab)
