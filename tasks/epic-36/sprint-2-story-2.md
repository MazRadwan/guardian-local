# Story 36.2.2: Wire Streaming Service into ChatServer, Remove from MessageHandler

## Description

Wire `ClaudeStreamingService` into ChatServer and remove `streamClaudeResponse()` + streaming types from MessageHandler. After this story, MessageHandler contains only `buildFileContext()` (~61 LOC) + constructor + imports.

## Acceptance Criteria

- [ ] ChatServer creates `ClaudeStreamingService` in constructor
- [ ] ChatServer stores as `private readonly streamingService: ClaudeStreamingService`
- [ ] ChatServer Step 6 (line 320) calls `this.streamingService.streamClaudeResponse()` instead of `this.messageHandler.streamClaudeResponse()`
- [ ] `streamClaudeResponse()` removed from MessageHandler
- [ ] `StreamingResult` and `StreamingOptions` type definitions removed from MessageHandler
- [ ] MessageHandler constructor loses `IClaudeClient` and `IConsultToolLoopService` params
- [ ] MessageHandler constructor KEEPS `ConversationService` — NO WAIT: after validation extraction (Sprint 1), streaming extraction removes the last user of ConversationService in MessageHandler. Check if buildFileContext uses it. If not, remove it too.
- [ ] Note: ChatServer does NOT import `StreamingResult`/`StreamingOptions` directly — it uses them implicitly via the streaming service return type. No ChatServer import change needed for these types.
- [ ] No TypeScript errors

## Technical Approach

### 1. ChatServer constructor changes

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

Add import:
```typescript
import { ClaudeStreamingService } from './services/ClaudeStreamingService.js';
// Note: ChatServer does NOT need to import StreamingResult/StreamingOptions directly
// It uses them implicitly through the streaming service return type
```

In constructor, create streaming service:
```typescript
this.streamingService = new ClaudeStreamingService(
  claudeClient,
  conversationService,
  consultToolLoopService
);
```

### 2. handleSendMessage wiring change

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts` Step 6 (line 320)

```typescript
// BEFORE
const result = await this.messageHandler.streamClaudeResponse(socket as IAuthenticatedSocket, conversationId!, messages, enhancedPrompt, {
  enableTools: modeConfig.enableTools,
  tools,
  usePromptCache: promptCache?.usePromptCache || false,
  cachedPromptId: promptCache?.cachedPromptId,
  imageBlocks,
  mode,
  source: 'user_input',
});

// AFTER
const result = await this.streamingService.streamClaudeResponse(socket as IAuthenticatedSocket, conversationId!, messages, enhancedPrompt, {
  enableTools: modeConfig.enableTools,
  tools,
  usePromptCache: promptCache?.usePromptCache || false,
  cachedPromptId: promptCache?.cachedPromptId,
  imageBlocks,
  mode,
  source: 'user_input',
});
```

**CRITICAL:** The options object stays EXACTLY the same. Do not change any fields.

### 3. Remove from MessageHandler

**File:** `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`

Remove:
- `StreamingResult` type definition (was already moved to types/SendMessage.ts in Sprint 1... actually no, Sprint 1 only moved validation types. This story needs to verify streaming types are removed from MessageHandler since 36.2.1 added them to the shared file)
- `StreamingOptions` type definition
- `streamClaudeResponse()` method (lines 544-721)
- Imports: `IClaudeClient`, `ClaudeMessage`, `ToolUseBlock`, `ClaudeTool`, `ImageContentBlock`, `ToolUseRegistry`, `IConsultToolLoopService`

Update constructor — check what's left:
```typescript
// After Sprint 1, constructor was:
constructor(
  private readonly conversationService: ConversationService,
  private readonly fileContextBuilder?: FileContextBuilder,
  private readonly claudeClient?: IClaudeClient,
  private readonly toolRegistry?: ToolUseRegistry,
  private readonly consultToolLoopService?: IConsultToolLoopService
) {}

// After this story, remove claudeClient, toolRegistry, consultToolLoopService:
constructor(
  private readonly conversationService: ConversationService,  // CHECK: does buildFileContext use this? NO — it only uses fileContextBuilder
  private readonly fileContextBuilder?: FileContextBuilder
) {}
```

**IMPORTANT:** Verify whether `ConversationService` is still needed by `buildFileContext()`. Reading the code:
- `buildFileContext()` only uses `this.fileContextBuilder` (lines 494, 505, 509)
- It does NOT use `this.conversationService`

So after this story, MessageHandler constructor has ONLY `FileContextBuilder`. If `ConversationService` has no remaining callers in MessageHandler, remove it.

### 4. MessageHandler after this story (~100 LOC)

```typescript
import type { FileContextBuilder, FileContextResult } from '../context/FileContextBuilder.js';
import type { MessageAttachment } from '../../../domain/entities/Message.js';

export class MessageHandler {
  constructor(
    private readonly fileContextBuilder?: FileContextBuilder
  ) {}

  async buildFileContext(
    conversationId: string,
    enrichedAttachments?: MessageAttachment[],
    mode?: 'consult' | 'assessment' | 'scoring'
  ): Promise<FileContextResult> {
    // ~30 lines of delegation logic
  }
}
```

This thin remnant gets deleted in Sprint 3 when buildFileContext is inlined into the orchestrator.

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - MODIFY (import + constructor + wiring)
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - MODIFY (remove method, types, constructor params)

## Agent Assignment

- [x] backend-agent

## Tests Required

TypeScript compilation must pass. Test updates are in Story 36.2.3.

## Definition of Done

- [ ] ChatServer creates and uses ClaudeStreamingService
- [ ] streamClaudeResponse removed from MessageHandler
- [ ] Streaming types removed from MessageHandler
- [ ] Constructor params cleaned up
- [ ] Options object passed to streaming service is IDENTICAL
- [ ] TypeScript compiles with zero errors
