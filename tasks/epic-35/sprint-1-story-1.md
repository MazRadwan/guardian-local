# Story 35.1.1: Create ITitleUpdateService Interface + TitleUpdateService Implementation

## Description

Create the interface and implementation for the Title Update Service. This moves title generation logic out of MessageHandler into a dedicated, testable service in the infrastructure layer. Also exposes `formatScoringTitle()` on the `ITitleGenerationService` interface (method already exists on concrete class).

## Acceptance Criteria

- [ ] Interface file created at `packages/backend/src/infrastructure/websocket/services/ITitleUpdateService.ts`
- [ ] Implementation file created at `packages/backend/src/infrastructure/websocket/services/TitleUpdateService.ts`
- [ ] `ITitleUpdateService` defines `generateTitleIfNeeded()` and `updateScoringTitle()` methods
- [ ] `TitleUpdateService` constructor accepts `ConversationService` and optional `ITitleGenerationService`
- [ ] `generateTitleIfNeeded()` logic is an exact copy from MessageHandler lines 1040-1141
- [ ] `updateScoringTitle()` delegates truncation to `ITitleGenerationService.formatScoringTitle()` instead of inline logic
- [ ] `formatScoringTitle(filename: string): string` added to `ITitleGenerationService` interface
- [ ] Exported from `services/index.ts`
- [ ] No TypeScript errors, no lint errors
- [ ] Implementation is under 150 LOC

## Technical Approach

### 1. Add `formatScoringTitle` to ITitleGenerationService interface

**File:** `packages/backend/src/application/interfaces/ITitleGenerationService.ts`

The method already exists on the concrete `TitleGenerationService` class (line 215). Just add it to the interface:

```typescript
export interface ITitleGenerationService {
  generateModeAwareTitle(context: TitleContext): Promise<TitleGenerationResult>;
  formatScoringTitle(filename: string): string;  // ADD THIS
}
```

### 2. Create ITitleUpdateService interface

**File:** `packages/backend/src/infrastructure/websocket/services/ITitleUpdateService.ts`

Follow the `IConsultToolLoopService` pattern — interface + types in same file.

```typescript
import type { IAuthenticatedSocket } from '../ChatContext.js';

export interface ITitleUpdateService {
  generateTitleIfNeeded(
    socket: IAuthenticatedSocket,
    conversationId: string,
    mode: 'consult' | 'assessment' | 'scoring',
    assistantResponse: string
  ): Promise<void>;

  updateScoringTitle(
    socket: IAuthenticatedSocket,
    conversationId: string,
    filename: string
  ): Promise<void>;
}
```

### 3. Create TitleUpdateService implementation

**File:** `packages/backend/src/infrastructure/websocket/services/TitleUpdateService.ts`

Constructor:
```typescript
constructor(
  private readonly conversationService: ConversationService,
  private readonly titleGenerationService?: ITitleGenerationService
)
```

**`generateTitleIfNeeded()`** — Direct move from MessageHandler lines 1040-1141. All guards preserved:
1. Skip if no titleGenerationService
2. Skip for scoring mode
3. Check message count (consult: [2], assessment: [3, 5])
4. Check conversation exists
5. Skip if titleManuallyEdited
6. Skip if title already set (not placeholder) — unless vendor info update
7. Get appropriate user message (initial vs vendor info)
8. Build TitleContext, call generateModeAwareTitle
9. updateTitleIfNotManuallyEdited
10. Emit `conversation_title_updated` on success

**`updateScoringTitle()`** — Simplified from MessageHandler lines 1282-1318:
- If `titleGenerationService` exists, delegate to `titleGenerationService.formatScoringTitle(filename)`
- Otherwise, use inline truncation logic (preserve current behavior when service is absent)
- Call `conversationService.updateTitleIfNotManuallyEdited()`
- Emit `conversation_title_updated` on success

### 4. Export from barrel

**File:** `packages/backend/src/infrastructure/websocket/services/index.ts`

```typescript
export type { ITitleUpdateService } from './ITitleUpdateService.js';
export { TitleUpdateService } from './TitleUpdateService.js';
```

## Files Touched

- `packages/backend/src/application/interfaces/ITitleGenerationService.ts` - MODIFY: Add `formatScoringTitle` to interface
- `packages/backend/src/infrastructure/websocket/services/ITitleUpdateService.ts` - CREATE
- `packages/backend/src/infrastructure/websocket/services/TitleUpdateService.ts` - CREATE
- `packages/backend/src/infrastructure/websocket/services/index.ts` - MODIFY: Add exports

## Tests Affected

None — this story only creates new files and adds a method to an interface that the concrete class already implements.

## Agent Assignment

- [x] backend-agent

## Tests Required

None for this story — Story 35.1.3 covers all testing. TypeScript compilation validates the interface contract.

## Definition of Done

- [ ] Interface file created with both method signatures
- [ ] Implementation created with exact logic from MessageHandler
- [ ] `formatScoringTitle` added to ITitleGenerationService interface
- [ ] Exported from barrel file
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Implementation under 150 LOC
