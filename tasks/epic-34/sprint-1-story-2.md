# Story 34.1.2: Implement ConsultToolLoopService

## Description

Implement `ConsultToolLoopService` by moving the `executeConsultToolLoop()` and `buildAugmentedMessages()` methods from MessageHandler.ts. This is a direct code move with minimal changes.

## Acceptance Criteria

- [ ] Service file created at `packages/backend/src/application/services/ConsultToolLoopService.ts`
- [ ] `execute()` method contains exact logic from `executeConsultToolLoop()`
- [ ] `buildAugmentedMessages()` moved as private helper
- [ ] `MAX_TOOL_ITERATIONS = 3` constant moved to service
- [ ] Service implements `IConsultToolLoopService` interface
- [ ] Constructor accepts required dependencies (claudeClient, toolRegistry, conversationService)
- [ ] Service exported from `application/services/index.ts`

## Technical Approach

**Step 1:** Create service file with constructor

```typescript
// FILE: packages/backend/src/application/services/ConsultToolLoopService.ts

import type { IClaudeClient, ClaudeMessage, ToolUseBlock, ToolResultBlock, ClaudeTool } from '../interfaces/IClaudeClient.js';
import type { IConsultToolLoopService, ConsultToolLoopOptions, ConsultToolLoopResult } from '../interfaces/IConsultToolLoopService.js';
import type { ToolUseRegistry } from '../../infrastructure/websocket/ToolUseRegistry.js';
import type { ConversationService } from './ConversationService.js';
import type { ToolUseInput, ToolUseContext } from '../interfaces/IToolUseHandler.js';

/**
 * Maximum tool iterations per user query.
 * Allows Claude to make multiple searches before forcing conclusion.
 */
const MAX_TOOL_ITERATIONS = 3;

export class ConsultToolLoopService implements IConsultToolLoopService {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly toolRegistry: ToolUseRegistry,
    private readonly conversationService: ConversationService
  ) {}

  // ... execute() and buildAugmentedMessages() go here
}
```

**Step 2:** Copy `executeConsultToolLoop()` from MessageHandler.ts (lines 917-1172)

Rename to `execute()` and adjust:
- Change `this.claudeClient` → `this.claudeClient` (same)
- Change `this.toolRegistry` → `this.toolRegistry` (same)
- Change `this.conversationService` → `this.conversationService` (same)
- Change `this.buildAugmentedMessages()` → `this.buildAugmentedMessages()` (same)
- Parameters now come from `options` object

**Step 3:** Copy `buildAugmentedMessages()` from MessageHandler.ts (lines 1186-1222)

Keep as private method, no changes needed.

## CRITICAL: Preserve These Behaviors

1. **MAX_TOOL_ITERATIONS = 3** - Do not change
2. **is_error tool_result** - When max iterations hit, send `is_error: true`
3. **Abort checks** - Check `socket.data.abortRequested` at:
   - Before tool execution (line 987-991)
   - During tool execution (line 998-1002)
   - Before continuation (line 1044-1050)
   - During stream (line 1073-1076)
4. **tool_status events** - Emit at correct points:
   - `searching` before tool dispatch (line 984)
   - `reading` before continuation (line 1042)
   - `idle` on completion/error (lines 1121, 1145)
5. **Context accumulation** - `accumulatedResponses` and `accumulatedToolSummaries` arrays
6. **Error handling** - Catch block saves error message to conversation
7. **assistant_token streaming** - Emit `assistant_token` events during tool loop continuations
8. **ToolUseContext fields** - Preserve exact fields: `userId: socket.userId!`, `assessmentId: null`, `mode: 'consult'`
9. **Loop exit gating** - Exit loop when `stopReason !== 'tool_use'` OR `currentToolUseBlocks.length === 0`
10. **firstResponse parameter** - Currently unused in loop body, keep this behavior unchanged

## Files Touched

- `packages/backend/src/application/services/ConsultToolLoopService.ts` - CREATE
- `packages/backend/src/application/services/index.ts` - UPDATE: Add export

## Tests Required

Tests will be added in Story 34.1.4. This story focuses on the code move.

## Agent Assignment

- [x] backend-agent

## Definition of Done

- [ ] Service file created
- [ ] `execute()` method implemented (copied from executeConsultToolLoop)
- [ ] `buildAugmentedMessages()` method implemented (copied)
- [ ] MAX_TOOL_ITERATIONS constant moved
- [ ] Implements IConsultToolLoopService interface
- [ ] Exported from barrel file
- [ ] No TypeScript errors
- [ ] No lint errors

## Reference

Source code to copy from:
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
- Lines 72 (constant), 917-1172 (executeConsultToolLoop), 1186-1222 (buildAugmentedMessages)
