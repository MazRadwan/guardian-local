# Story 36.2.1: Create ClaudeStreamingService + Move Streaming Types

## Description

Create `ClaudeStreamingService` with `streamClaudeResponse()` extracted from MessageHandler. Move `StreamingResult` and `StreamingOptions` types to the shared types file.

## Acceptance Criteria

- [ ] `StreamingResult` and `StreamingOptions` added to `types/SendMessage.ts`
- [ ] `ClaudeStreamingService.ts` created with `streamClaudeResponse()` method
- [ ] Constructor accepts: `IClaudeClient`, `ConversationService`, `IConsultToolLoopService`
- [ ] `streamClaudeResponse()` is exact logic from MessageHandler lines 544-721
- [ ] Log prefixes updated: `[ClaudeStreamingService]` instead of `[MessageHandler]`
- [ ] No TypeScript errors
- [ ] Under 300 LOC

## Technical Approach

### 1. Move streaming types to shared file

**File:** `packages/backend/src/infrastructure/websocket/types/SendMessage.ts`

Add these from MessageHandler.ts (exact copy):
- `StreamingResult` (lines 106-117)
- `StreamingOptions` (lines 124-139)

These types import from:
- `ToolUseBlock` from `IClaudeClient` (already an application interface)
- `ClaudeTool` from `IClaudeClient`
- `ImageContentBlock` from `ai/types/vision.ts`

### 2. Create ClaudeStreamingService

**File:** `packages/backend/src/infrastructure/websocket/services/ClaudeStreamingService.ts`

```typescript
import type { IClaudeClient, ClaudeMessage, ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IConsultToolLoopService } from './IConsultToolLoopService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { StreamingResult, StreamingOptions } from '../types/SendMessage.js';

export class ClaudeStreamingService {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly conversationService: ConversationService,
    private readonly consultToolLoopService?: IConsultToolLoopService
  ) {}

  async streamClaudeResponse(
    socket: IAuthenticatedSocket,
    conversationId: string,
    messages: ClaudeMessage[],
    systemPrompt: string,
    options: StreamingOptions
  ): Promise<StreamingResult> {
    // EXACT logic from MessageHandler lines 544-721
  }
}
```

### 3. Critical behaviors to preserve (EXACT copy, no refactoring)

**Stream lifecycle events:**
- `socket.data.abortRequested = false` — reset at start (line 557)
- `socket.emit('assistant_stream_start', { conversationId })` — before streaming begins (line 560)
- `socket.emit('assistant_token', { conversationId, token: chunk.content })` — per chunk (line 595)
- `socket.emit('assistant_done', { messageId, conversationId, fullText, assessmentId: null })` — after streaming, UNLESS abort (line 676)

**Abort handling:**
- `if (socket.data.abortRequested) break;` — inside stream loop (line 585)
- `wasAborted = true` — set on break (line 587)
- Partial response saved to DB even on abort (line 665-672)
- `assistant_done` SUPPRESSED when `wasAborted` is true (line 675)

**Tool loop delegation (5-condition gate):**
```typescript
const shouldExecuteToolLoop =
  options.mode === 'consult' &&
  options.source === 'user_input' &&
  stopReason === 'tool_use' &&
  toolUseBlocks.length > 0 &&
  this.consultToolLoopService &&
  !wasAborted;
```
- When tool loop handles: returns EMPTY `toolUseBlocks` (line 657) — prevents ChatServer double-dispatch
- When tool loop handles: `fullResponse`, `savedMessageId`, `wasAborted`, `stopReason` all updated from loop result

**Error recovery:**
- Catches Claude API errors (line 693)
- Saves system error message to DB (line 697-703)
- Emits error message to client via `socket.emit('message', {...})` (line 705-711)
- Returns empty result with no toolUseBlocks (line 713-719)

**Message saving:**
- Non-empty response saved via `this.conversationService.sendMessage({ role: 'assistant', content: { text: fullResponse } })` (line 666-671)
- `savedMessageId` set from saved message (line 671)

### 4. What NOT to change

- Do NOT refactor the stream loop
- Do NOT change event names or payload shapes
- Do NOT modify the tool loop gating conditions
- Do NOT change the error recovery behavior
- Do NOT move `assistant_done` emission out of this service — it must stay coupled with abort detection

## Files Touched

- `packages/backend/src/infrastructure/websocket/types/SendMessage.ts` - MODIFY (add 2 types)
- `packages/backend/src/infrastructure/websocket/services/ClaudeStreamingService.ts` - CREATE

## Agent Assignment

- [x] backend-agent

## Tests Required

None for this story — Story 36.2.3 covers testing. TypeScript compilation validates the service compiles.

## Definition of Done

- [ ] Both streaming types in shared types file
- [ ] ClaudeStreamingService created with exact logic
- [ ] All stream lifecycle events preserved
- [ ] Abort handling preserved
- [ ] Tool loop 5-condition gate preserved
- [ ] Empty toolUseBlocks return preserved
- [ ] Error recovery preserved
- [ ] Log prefixes updated
- [ ] Under 300 LOC
- [ ] TypeScript compiles
