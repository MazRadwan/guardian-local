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

## Sprints

| Sprint | Focus | Stories | Estimated |
|--------|-------|---------|-----------|
| Sprint 1 | Backend Infrastructure | 3 | IProgressEmitter, QuestionnaireService integration, WebSocket events |
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
  32.1.2 QuestionnaireService   32.1.3 WebSocket Progress Events
         Integration            (can run PARALLEL with 32.1.2)
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
- `packages/backend/src/infrastructure/websocket/emitters/WebSocketProgressEmitter.ts`
- `packages/backend/__tests__/unit/application/interfaces/IProgressEmitter.test.ts`
- `packages/backend/__tests__/unit/infrastructure/websocket/emitters/WebSocketProgressEmitter.test.ts`

### Modified Files
- `packages/backend/src/application/services/QuestionnaireService.ts` - Add progress emission
- `packages/backend/src/application/interfaces/index.ts` - Export IProgressEmitter
- `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts` - Wire emitter
- `packages/backend/src/index.ts` - DI wiring
- `apps/web/src/components/questionnaire/QuestionnaireWizard.tsx` - Progress display
- `apps/web/src/hooks/useQuestionnaireSocket.ts` - Event subscription (if exists)

## WebSocket Protocol Extension

### New Event: `questionnaire_progress`

```typescript
// Server → Client
interface QuestionnaireProgressEvent {
  type: 'questionnaire_progress';
  payload: {
    conversationId: string;
    message: string;      // e.g., "Generating questions for Data Security..."
    step: number;         // 1-based step number (1-10 for risk dimensions)
    totalSteps: number;   // Total expected steps (10 + validation)
    timestamp: number;    // Unix timestamp for ordering
  };
}
```

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
| Claude API doesn't expose progress | High | Emit progress based on parsing stages, not API callbacks |
| Messages arrive out of order | Low | Timestamp-based ordering on client |
| Connection drops during generation | Medium | Fallback to polling or "Generating..." state |
| Over-engineering | Low | Keep interface minimal (emit only) |

## Definition of Done

- [ ] Sprint 1-2 complete
- [ ] All tests pass (unit + integration)
- [ ] Manual QA: generate questionnaire, observe progress updates
- [ ] No regressions in questionnaire output
- [ ] Progress events visible in browser DevTools (WebSocket tab)
