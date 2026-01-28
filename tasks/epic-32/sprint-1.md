# Sprint 1: Backend Infrastructure

## Goal

Establish the progress emission infrastructure and integrate it into QuestionnaireGenerationService and WebSocket handlers.

**IMPORTANT: Progress is timer-based perceived progress, NOT actual generation status.**

Since questionnaire generation is a single Claude API call, the backend cannot know which dimension Claude is currently processing. Progress events are curated messages emitted on a timer interval to improve perceived responsiveness. This is a UX enhancement, not a true progress indicator.

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
  seq: number;  // Monotonic sequence number for ordering protection
}

export interface IProgressEmitter {
  /**
   * Emit a progress event to the client.
   * @param message - Human-readable progress message
   * @param step - Current step number (1-based)
   * @param totalSteps - Total expected steps
   * @param seq - Monotonic sequence number (client can reject out-of-order events)
   */
  emit(message: string, step: number, totalSteps: number, seq: number): void;
}

// No-op implementation for when progress isn't needed
export class NullProgressEmitter implements IProgressEmitter {
  emit(_message: string, _step: number, _totalSteps: number, _seq: number): void {
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

### 32.1.2: Integrate Progress Emission into QuestionnaireGenerationService

**Description:** Update QuestionnaireGenerationService to accept an optional IProgressEmitter and emit timer-based progress events during questionnaire generation.

**Acceptance Criteria:**
- [ ] `QuestionnaireGenerationService.generate()` accepts optional `progressEmitter?: IProgressEmitter`
- [ ] Starts a timer-based progress loop when generation begins
- [ ] Emits progress messages from curated list at ~5-second intervals
- [ ] Stops timer when Claude call completes (success or error)
- [ ] Works without emitter (backward compatible - uses NullProgressEmitter)
- [ ] Progress events include monotonic `seq` number for ordering protection
- [ ] Total of ~10-12 progress events (spread over typical 60s generation time)

**Technical Approach:**
```typescript
// packages/backend/src/application/services/QuestionnaireGenerationService.ts

import { IProgressEmitter, NullProgressEmitter } from '../interfaces/IProgressEmitter.js';

const PROGRESS_MESSAGES = [
  'Analyzing vendor context...',
  'Identifying applicable risk dimensions...',
  'Generating questions for Data Security...',
  'Generating questions for Data Privacy...',
  'Generating questions for Model Risk...',
  'Generating questions for Vendor Governance...',
  'Generating questions for Regulatory Compliance...',
  'Generating questions for Ethical AI...',
  'Generating questions for Clinical Safety...',
  'Validating questionnaire structure...',
  'Finalizing questionnaire...',
] as const;

async generate(
  context: GenerationContext,
  progressEmitter: IProgressEmitter = new NullProgressEmitter()
): Promise<GenerationResult> {
  const totalSteps = PROGRESS_MESSAGES.length;
  let currentStep = 0;
  let seq = 0;

  // Start timer-based progress emission (every 5 seconds)
  const progressInterval = setInterval(() => {
    if (currentStep < totalSteps) {
      progressEmitter.emit(PROGRESS_MESSAGES[currentStep], currentStep + 1, totalSteps, ++seq);
      currentStep++;
    }
  }, 5000);

  // Emit first message immediately
  progressEmitter.emit(PROGRESS_MESSAGES[0], 1, totalSteps, ++seq);
  currentStep = 1;

  try {
    // Single Claude call - cannot know actual dimension progress
    const response = await this.claudeClient.sendMessage(...);

    // Clear timer and emit completion
    clearInterval(progressInterval);
    progressEmitter.emit('Finalizing questionnaire...', totalSteps, totalSteps, ++seq);

    // ... rest of validation and persistence logic
  } catch (error) {
    clearInterval(progressInterval);
    throw error;
  }
}
```

**CRITICAL: Timer-Based Progress**

Since questionnaire generation is a single Claude API call (~60s), we CANNOT know:
- Which dimension Claude is currently processing
- Actual progress percentage
- When a specific dimension completes

Progress messages are **perceived progress** - curated messages emitted on a timer to improve UX. They are NOT actual generation status.

**Files Touched:**
- `packages/backend/src/application/services/QuestionnaireGenerationService.ts` - Add progressEmitter parameter and timer-based emissions
- `packages/backend/src/application/interfaces/IProgressEmitter.ts` - Import NullProgressEmitter

**Agent:** backend-agent

**Tests Required:**
- `QuestionnaireGenerationService.test.ts` - Verify timer starts on generate call
- `QuestionnaireGenerationService.test.ts` - Verify timer stops on completion
- `QuestionnaireGenerationService.test.ts` - Verify timer stops on error
- `QuestionnaireGenerationService.test.ts` - Verify works without emitter (backward compat)
- `QuestionnaireGenerationService.test.ts` - Verify seq numbers are monotonically increasing
- `QuestionnaireGenerationService.test.ts` - Verify progress events emitted only for correct conversation (no cross-conversation leaks)
- `QuestionnaireGenerationService.test.ts` - Verify concurrent generations don't interfere with each other

---

### 32.1.3: WebSocket Progress Event Type

**Description:** Create the WebSocket event handler infrastructure to emit progress events to the connected client socket.

**Acceptance Criteria:**
- [ ] `SocketProgressEmitter` implements `IProgressEmitter`
- [ ] Emits `questionnaire_progress` event via direct socket emission (NOT room-based)
- [ ] Event payload includes conversationId, message, step, totalSteps, timestamp, seq
- [ ] Events only sent to the socket that initiated the generation request
- [ ] Available to QuestionnaireHandler via factory function

**Technical Approach:**

**CRITICAL: Use direct socket emission, NOT room-based emission.**

Guardian's ChatServer uses direct socket emission (`socket.emit()`) for all events, NOT room-based broadcasting (`io.to('conversation:${id}').emit()`). This is because:
1. Users only connect to their own conversations
2. Progress events are specific to the requesting client
3. Room-based emission is unnecessary overhead

```typescript
// packages/backend/src/infrastructure/websocket/emitters/SocketProgressEmitter.ts

import type { Socket } from 'socket.io';
import { IProgressEmitter, ProgressEvent } from '../../application/interfaces/IProgressEmitter.js';

/**
 * WebSocket progress emitter that emits directly to the client socket.
 *
 * Uses direct socket.emit() (NOT io.to(room).emit()) to match ChatServer patterns.
 * Progress events are client-specific, not broadcast to conversation rooms.
 */
export class SocketProgressEmitter implements IProgressEmitter {
  constructor(
    private readonly socket: Socket,
    private readonly conversationId: string
  ) {}

  emit(message: string, step: number, totalSteps: number, seq: number): void {
    const event: ProgressEvent & { conversationId: string; seq: number } = {
      conversationId: this.conversationId,
      message,
      step,
      totalSteps,
      timestamp: Date.now(),
      seq,
    };

    // Direct socket emission - NOT room-based
    this.socket.emit('questionnaire_progress', event);
  }
}

// Factory function for creating emitters
export function createSocketProgressEmitter(
  socket: Socket,
  conversationId: string
): IProgressEmitter {
  return new SocketProgressEmitter(socket, conversationId);
}
```

```typescript
// In packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts
import { createSocketProgressEmitter } from '../emitters/SocketProgressEmitter.js';

async handleGenerateQuestionnaire(
  socket: IAuthenticatedSocket,
  payload: GenerateQuestionnairePayload,
  userId: string,
  chatContext: ChatContext
): Promise<void> {
  // ... validation ...

  // Create progress emitter bound to this socket
  const progressEmitter = createSocketProgressEmitter(socket, payload.conversationId);

  // Pass emitter to generation service
  const result = await this.questionnaireGenerationService.generate(
    {
      conversationId: payload.conversationId,
      userId,
      assessmentType,
      vendorName,
      solutionName,
      contextSummary,
      selectedCategories,
    },
    progressEmitter
  );

  // ... rest of handler logic (unchanged)
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/emitters/SocketProgressEmitter.ts` - NEW: Socket-based implementation
- `packages/backend/src/infrastructure/websocket/emitters/index.ts` - NEW: Export emitter
- `packages/backend/src/infrastructure/websocket/handlers/QuestionnaireHandler.ts` - Wire emitter to generate call

**Agent:** backend-agent

**Tests Required:**
- `SocketProgressEmitter.test.ts` - Verify emit calls socket.emit()
- `SocketProgressEmitter.test.ts` - Verify correct event structure including seq
- `SocketProgressEmitter.test.ts` - Verify conversationId in payload
- `QuestionnaireHandler.test.ts` - Integration test: verify progress events during generation

---

## Parallelization

```
32.1.1 IProgressEmitter (interface + types)
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
32.1.2 QuestionnaireGenerationService    32.1.3 SocketProgressEmitter
(application layer)                      (infrastructure layer)
    │                              │
    └──────────────────────────────┘
                  │
                  ▼
         Both complete → Sprint 2 ready
```

**32.1.2 and 32.1.3 can run in parallel** after 32.1.1 completes:
- 32.1.2 modifies `QuestionnaireGenerationService.ts` (application layer)
- 32.1.3 creates new files in `infrastructure/websocket/emitters/` (infrastructure layer)
- No file overlap between them

---

## Definition of Done

- [ ] IProgressEmitter interface defined and exported
- [ ] QuestionnaireGenerationService emits timer-based progress events
- [ ] SocketProgressEmitter emits to requesting socket (direct socket.emit)
- [ ] All unit tests pass
- [ ] Integration test verifies end-to-end progress flow
- [ ] No regression in questionnaire generation
