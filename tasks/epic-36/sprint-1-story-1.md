# Story 36.1.1: Create Shared Types + SendMessageValidator Service

## Description

Create the shared types file and the `SendMessageValidator` service. This is a pure creation story — no existing files are modified except adding exports.

## Acceptance Criteria

- [ ] `types/SendMessage.ts` created with `SendMessagePayload`, `ValidationError`, `SendMessageValidationResult`
- [ ] `SendMessageValidator.ts` created with all 4 validation methods
- [ ] Constructor accepts: `ConversationService`, `IFileRepository`, `RateLimiter`
- [ ] `validateSendMessage()` is exact logic from MessageHandler lines 190-302
- [ ] `validateAndEnrichAttachments()` is exact logic from MessageHandler lines 320-387 with dead `socket` param REMOVED
- [ ] `validateConversationOwnership()` is exact logic from MessageHandler lines 401-409
- [ ] `waitForFileRecords()` is exact logic from MessageHandler lines 422-454, kept PUBLIC
- [ ] Log prefixes updated: `[SendMessageValidator]` instead of `[MessageHandler]`
- [ ] `[TIMING]` log prefix updated: `[TIMING] SendMessageValidator validateSendMessage`
- [ ] No TypeScript errors
- [ ] Under 300 LOC

## Technical Approach

### 1. Create shared types file

**File:** `packages/backend/src/infrastructure/websocket/types/SendMessage.ts`

Move these from MessageHandler.ts (exact copy, no logic changes):
- `SendMessagePayload` (lines 52-65)
- `ValidationError` (lines 70-77)
- `SendMessageValidationResult` (lines 82-97)

Import `MessageAttachment` and `MessageComponent` from domain entities (same imports MessageHandler uses).

### 2. Create SendMessageValidator

**File:** `packages/backend/src/infrastructure/websocket/services/SendMessageValidator.ts`

```typescript
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import type { RateLimiter } from '../RateLimiter.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { MessageAttachment } from '../../../domain/entities/Message.js';
import type {
  SendMessagePayload,
  SendMessageValidationResult,
  ValidationError,
} from '../types/SendMessage.js';

export class SendMessageValidator {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly rateLimiter: RateLimiter
  ) {}

  async validateSendMessage(
    socket: IAuthenticatedSocket,
    payload: SendMessagePayload
  ): Promise<SendMessageValidationResult> {
    // EXACT logic from MessageHandler lines 190-302
    // Update log prefix: [SendMessageValidator]
  }

  // EXACT logic from MessageHandler lines 320-387
  // REMOVE dead socket param (4th param was never read)
  private async validateAndEnrichAttachments(
    attachments: Array<{ fileId: string }>,
    conversationId: string,
    userId: string
  ): Promise<{...}> { }

  private async validateConversationOwnership(
    conversationId: string,
    userId: string
  ): Promise<void> { }

  // Keep PUBLIC — 9 tests call this directly
  async waitForFileRecords(
    fileIds: string[],
    maxWaitMs?: number,
    intervalMs?: number
  ): Promise<{ found: string[]; missing: string[] }> { }
}
```

### 3. Key details

- **Dead socket param removal:** `validateAndEnrichAttachments` currently accepts `socket?: IAuthenticatedSocket` as 4th param but never reads it. Remove it.
- **Internal call update:** `validateSendMessage` line 270 passes `socket` as 4th arg to `validateAndEnrichAttachments`. Remove that arg from the call.
- **Return types:** Import from `types/SendMessage.ts`, not defined locally.
- **`emitFileProcessingError` return shape:** Preserved exactly — the private method returns `{ valid: false, emitFileProcessingError: true, missingFileIds, error }` and `validateSendMessage` passes it through.

## Files Touched

- `packages/backend/src/infrastructure/websocket/types/SendMessage.ts` - CREATE
- `packages/backend/src/infrastructure/websocket/services/SendMessageValidator.ts` - CREATE

## Agent Assignment

- [x] backend-agent

## Tests Required

None for this story — Story 36.1.3 covers testing. TypeScript compilation validates the service compiles.

## Definition of Done

- [ ] Both files created and compile
- [ ] Types re-exported correctly
- [ ] All 4 methods present with exact logic
- [ ] Dead socket param removed
- [ ] Log prefixes updated
- [ ] Under 300 LOC each
