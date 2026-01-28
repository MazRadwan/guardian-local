# Sprint 1: Backend Infrastructure

## Goal

Establish the progress emission infrastructure and integrate it into QuestionnaireService and WebSocket handlers.

## Stories

### 32.1.1: IProgressEmitter Interface

**Description:** Create an interface for emitting progress events during long-running operations. This decouples the service layer from the transport mechanism (WebSocket).

**Acceptance Criteria:**
- [ ] `IProgressEmitter` interface defined with `emit(message: string, step: number, totalSteps: number)` method
- [ ] Interface lives in application layer (transport-agnostic)
- [ ] Progress message type defined with required fields
- [ ] Exported from application interfaces index

**Technical Approach:**
```typescript
// packages/backend/src/application/interfaces/IProgressEmitter.ts

export interface ProgressEvent {
  message: string;
  step: number;
  totalSteps: number;
  timestamp: number;
}

export interface IProgressEmitter {
  /**
   * Emit a progress event to the client.
   * @param message - Human-readable progress message
   * @param step - Current step number (1-based)
   * @param totalSteps - Total expected steps
   */
  emit(message: string, step: number, totalSteps: number): void;
}

// No-op implementation for when progress isn't needed
export class NullProgressEmitter implements IProgressEmitter {
  emit(_message: string, _step: number, _totalSteps: number): void {
    // Intentionally empty - used when no progress reporting needed
  }
}
```

**Files Touched:**
- `packages/backend/src/application/interfaces/IProgressEmitter.ts` - NEW: Interface and types
- `packages/backend/src/application/interfaces/index.ts` - Export IProgressEmitter

**Agent:** backend-agent

**Tests Required:**
- Type compilation tests (TypeScript validates interface)
- `NullProgressEmitter.test.ts` - Verify no-op doesn't throw

---

### 32.1.2: Integrate Progress Emission into QuestionnaireService

**Description:** Update QuestionnaireService to accept an optional IProgressEmitter and emit progress events at key milestones during questionnaire generation.

**Acceptance Criteria:**
- [ ] `QuestionnaireService.generate()` accepts optional `progressEmitter?: IProgressEmitter`
- [ ] Emits progress at start: "Analyzing vendor context..."
- [ ] Emits progress for each risk dimension: "Generating questions for {dimension}..."
- [ ] Emits progress at validation: "Validating questionnaire structure..."
- [ ] Emits progress at completion: "Finalizing questionnaire..."
- [ ] Works without emitter (backward compatible - uses NullProgressEmitter)
- [ ] Total of ~12 progress events (1 start + 10 dimensions + 1 validation)

**Technical Approach:**
```typescript
// QuestionnaireService.ts

const RISK_DIMENSIONS = [
  'Data Security',
  'Data Privacy',
  'Model Risk',
  'Operational Resilience',
  'Vendor Governance',
  'Regulatory Compliance',
  'Ethical AI',
  'Transparency',
  'Clinical Safety',
  'Financial Risk',
] as const;

async generate(
  context: VendorContext,
  progressEmitter: IProgressEmitter = new NullProgressEmitter()
): Promise<Questionnaire> {
  const totalSteps = RISK_DIMENSIONS.length + 2; // dimensions + start/end

  progressEmitter.emit('Analyzing vendor context...', 1, totalSteps);

  // During generation, emit dimension-specific progress
  // Note: Since generation is a single Claude call, we emit before the call
  // and estimate timing based on typical generation patterns

  for (let i = 0; i < RISK_DIMENSIONS.length; i++) {
    progressEmitter.emit(
      `Generating questions for ${RISK_DIMENSIONS[i]}...`,
      i + 2,
      totalSteps
    );
    // In reality, this happens during the Claude call
    // We'll emit these at intervals during the streaming response
  }

  progressEmitter.emit('Validating questionnaire structure...', totalSteps, totalSteps);

  // ... actual generation logic
}
```

**Implementation Note:** Since questionnaire generation is a single Claude call, we have two options:
1. **Option A (simpler):** Emit all progress before the call, with delays
2. **Option B (accurate):** Parse Claude's streaming response and emit progress when dimension patterns detected

Start with Option A; refine to Option B if needed.

**Files Touched:**
- `packages/backend/src/application/services/QuestionnaireService.ts` - Add progressEmitter parameter and emissions
- `packages/backend/src/application/interfaces/IProgressEmitter.ts` - Import NullProgressEmitter

**Agent:** backend-agent

**Tests Required:**
- `QuestionnaireService.test.ts` - Verify progress events emitted in correct order
- `QuestionnaireService.test.ts` - Verify works without emitter (backward compat)
- `QuestionnaireService.test.ts` - Verify correct step numbers and totals

---

### 32.1.3: WebSocket Progress Event Type

**Description:** Create the WebSocket event handler infrastructure to broadcast progress events to connected clients.

**Acceptance Criteria:**
- [ ] `WebSocketProgressEmitter` implements `IProgressEmitter`
- [ ] Emits `questionnaire_progress` event via Socket.IO
- [ ] Events scoped to conversation room (not broadcast to all users)
- [ ] Event payload includes conversationId, message, step, totalSteps, timestamp
- [ ] Registered in DI and available to QuestionnaireHandler

**Technical Approach:**
```typescript
// packages/backend/src/infrastructure/websocket/emitters/WebSocketProgressEmitter.ts

import { Server, Socket } from 'socket.io';
import { IProgressEmitter, ProgressEvent } from '@/application/interfaces';

export class WebSocketProgressEmitter implements IProgressEmitter {
  constructor(
    private readonly io: Server,
    private readonly conversationId: string
  ) {}

  emit(message: string, step: number, totalSteps: number): void {
    const event: ProgressEvent = {
      message,
      step,
      totalSteps,
      timestamp: Date.now(),
    };

    // Emit to conversation room only
    this.io.to(`conversation:${this.conversationId}`).emit('questionnaire_progress', {
      conversationId: this.conversationId,
      ...event,
    });
  }
}

// Factory function for creating emitters
export function createProgressEmitter(
  io: Server,
  conversationId: string
): IProgressEmitter {
  return new WebSocketProgressEmitter(io, conversationId);
}
```

```typescript
// In QuestionnaireHandler.ts
async handleGenerateQuestionnaire(socket: Socket, payload: GeneratePayload): Promise<void> {
  const progressEmitter = createProgressEmitter(this.io, payload.conversationId);

  const questionnaire = await this.questionnaireService.generate(
    payload.context,
    progressEmitter
  );

  socket.emit('questionnaire_complete', { conversationId, questionnaire });
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/emitters/WebSocketProgressEmitter.ts` - NEW: WebSocket implementation
- `packages/backend/src/infrastructure/websocket/emitters/index.ts` - NEW: Export emitter
- `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts` - Wire emitter to generate call
- `packages/backend/src/index.ts` - Ensure handler has access to io instance

**Agent:** backend-agent

**Tests Required:**
- `WebSocketProgressEmitter.test.ts` - Verify emit calls io.to().emit()
- `WebSocketProgressEmitter.test.ts` - Verify correct event structure
- `WebSocketProgressEmitter.test.ts` - Verify room scoping (conversation ID)
- `QuestionnaireHandler.test.ts` - Integration test: verify progress events during generation

---

## Parallelization

```
32.1.1 IProgressEmitter (interface + types)
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
32.1.2 QuestionnaireService    32.1.3 WebSocketProgressEmitter
(application layer)            (infrastructure layer)
    │                              │
    └──────────────────────────────┘
                  │
                  ▼
         Both complete → Sprint 2 ready
```

**32.1.2 and 32.1.3 can run in parallel** after 32.1.1 completes:
- 32.1.2 modifies `QuestionnaireService.ts` (application layer)
- 32.1.3 creates new files in `infrastructure/websocket/` (infrastructure layer)
- No file overlap between them

---

## Definition of Done

- [ ] IProgressEmitter interface defined and exported
- [ ] QuestionnaireService emits progress events
- [ ] WebSocketProgressEmitter broadcasts to correct room
- [ ] All unit tests pass
- [ ] Integration test verifies end-to-end progress flow
- [ ] No regression in questionnaire generation
