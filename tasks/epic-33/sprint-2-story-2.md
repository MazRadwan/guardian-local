# Story 33.2.2: Consult Mode Tool Loop

## Description

Implement the tool_use -> tool_result -> final answer loop for consult mode in MessageHandler. When Claude responds with a `tool_use` block and `stop_reason: tool_use`, the handler must:
1. Execute the tool via WebSearchToolService
2. Send tool_result back to Claude
3. Stream the final answer with citations

This is consult-mode ONLY. Assessment mode already has its own tool handling (questionnaireReadyTool).

## Acceptance Criteria

- [ ] MessageHandler detects `stop_reason: tool_use` in streaming result
- [ ] Only processes tool loop if mode is 'consult'
- [ ] Calls ToolUseRegistry.dispatch for web_search tool
- [ ] Uses ClaudeClient.continueWithToolResult to send tool_result
- [ ] Streams final response to client after tool_result processed
- [ ] Handles tool execution errors gracefully (sends error as tool_result)
- [ ] Does NOT affect assessment mode tool handling (questionnaire_ready)
- [ ] Maximum 1 tool loop iteration (prevent infinite loops)
- [ ] **MessageHandler receives ToolUseRegistry via constructor injection**
- [ ] **Prevent double handling: toolUseBlocks NOT returned to ChatServer caller when handled in consult tool loop**
- [ ] **Abort during tool loop cancels pending Jina requests**
- [ ] **Abort emits tool_status 'idle' immediately**
- [ ] **Consult auto-summarize path does NOT trigger tool flow**
- [ ] **Only user-initiated messages can trigger tool_use**

## Technical Approach

### Tool Loop Sequence Diagram

```
User Message → Claude API (stream)
                    │
                    ▼
            ┌──────────────────┐
            │ Streaming Result │
            │ stop_reason?     │
            └────────┬─────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   end_turn      tool_use     max_tokens
   (normal)      (search)     (truncated)
        │            │            │
        ▼            ▼            ▼
   Save msg    Execute Tool    Save msg
   Emit done   (JinaClient)    Emit done
                    │
                    ▼
            ┌──────────────────┐
            │ continueWith     │
            │ ToolResult()     │
            │ (second stream)  │
            └────────┬─────────┘
                     │
                     ▼
            Final Response
            Save msg (ONLY now)
            Emit assistant_done (ONLY now)

Message History at Each Step:
─────────────────────────────
1. Before Claude call:
   [{ role: 'user', content: 'search query' }]

2. After first stream (tool_use):
   [{ role: 'user', content: 'search query' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'xyz', ... }] }]

3. After tool execution, before second stream:
   [{ role: 'user', content: 'search query' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'xyz', ... }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'xyz', content: '...' }] }]

4. After second stream (final):
   [{ role: 'user', content: 'search query' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'xyz', ... }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'xyz', content: '...' }] },
    { role: 'assistant', content: 'Here is what I found...' }]

CRITICAL: Only the FINAL assistant message (step 4) is persisted to database.
```

### Abort Handling

```typescript
private async executeToolLoop(
  socket: IAuthenticatedSocket,
  conversationId: string,
  toolUseBlocks: ToolUseBlock[],
  options: StreamingOptions,
  abortSignal?: AbortSignal  // NEW: Pass abort signal
): Promise<ToolResultBlock[]> {
  // Check abort before starting
  if (abortSignal?.aborted) {
    this.emitToolStatus(socket, conversationId, 'idle');
    throw new AbortError('Tool execution aborted');
  }

  // ... tool execution ...

  // If aborted during execution, clean up
  abortSignal?.addEventListener('abort', () => {
    this.emitToolStatus(socket, conversationId, 'idle');
  });
}
```

### Auto-Summarize Exclusion

The tool loop MUST check if the message is user-initiated vs auto-generated:

```typescript
// In handleUserMessage or streamClaudeResponse
const isUserInitiated = options.source === 'user_input'; // vs 'auto_summarize'

if (
  result.toolUseBlocks.length > 0 &&
  options.mode === 'consult' &&
  result.stopReason === 'tool_use' &&
  isUserInitiated  // NEW: Only user messages trigger tools
) {
  // Execute tool loop
}
```

### 1. Constructor Injection for ToolUseRegistry

MessageHandler needs access to ToolUseRegistry to dispatch tools. Pass it via constructor:

```typescript
// In MessageHandler constructor
constructor(
  private readonly claudeClient: ClaudeClient,
  private readonly conversationService: ConversationService,
  private readonly messageService: MessageService,
  private readonly toolRegistry: ToolUseRegistry,  // NEW: Injected dependency
) {}

// In ChatServer - pass toolRegistry when creating MessageHandler
this.messageHandler = new MessageHandler(
  this.claudeClient,
  this.conversationService,
  this.messageService,
  this.toolRegistry,  // Pass the registry
);
```

### 2. Extend Types

```typescript
// Extend StreamingResult to include stopReason
interface StreamingResult {
  fullResponse: string;
  toolUseBlocks: ToolUseBlock[];
  savedMessageId: string;
  wasAborted: boolean;
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';  // NEW
}

// Extend StreamingOptions to include mode
interface StreamingOptions {
  conversationId: string;
  assessmentId?: string;
  mode: ConversationMode;  // NEW: 'consult' | 'assessment' | 'scoring'
  // ... other options
}
```

### 3. Tool Loop Implementation

```typescript
// In MessageHandler.streamClaudeResponse
async streamClaudeResponse(
  socket: IAuthenticatedSocket,
  conversationId: string,
  messages: ClaudeMessage[],
  systemPrompt: string,
  options: StreamingOptions
): Promise<StreamingResult> {
  // ... existing streaming code ...

  // After streaming completes, check for tool_use
  if (
    result.toolUseBlocks.length > 0 &&
    options.mode === 'consult' &&
    result.stopReason === 'tool_use'
  ) {
    // Execute tool loop
    const toolResults = await this.executeToolLoop(
      socket,
      conversationId,
      result.toolUseBlocks,
      options
    );

    // Continue with tool_result
    const finalResult = await this.continueAfterToolUse(
      socket,
      conversationId,
      messages,
      result.toolUseBlocks,
      toolResults,
      systemPrompt,
      options
    );

    // CRITICAL: Return empty toolUseBlocks to prevent ChatServer from also dispatching
    return {
      ...finalResult,
      toolUseBlocks: [],  // Already handled - don't pass back to caller
    };
  }

  return result;
}

private async executeToolLoop(
  socket: IAuthenticatedSocket,
  conversationId: string,
  toolUseBlocks: ToolUseBlock[],
  options: StreamingOptions
): Promise<ToolResultBlock[]> {
  const results: ToolResultBlock[] = [];

  for (const toolUse of toolUseBlocks) {
    // Dispatch to ToolUseRegistry
    const input: ToolUseInput = {
      toolName: toolUse.name,
      toolUseId: toolUse.id,
      input: toolUse.input,
    };
    const context: ToolUseContext = {
      conversationId,
      userId: socket.userId!,
      assessmentId: null,
      mode: options.mode,
    };

    const result = await this.toolRegistry.dispatch(input, context);

    if (result.handled && result.toolResult) {
      results.push(result.toolResult);
    } else {
      // Tool not handled - return error
      results.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: 'Tool execution failed. Please answer based on your knowledge.',
      });
    }
  }

  return results;
}
```

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - UPDATE: Add tool loop handling for consult mode, receive ToolUseRegistry via constructor, extend types
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - UPDATE: Pass ToolUseRegistry to MessageHandler constructor

## Tests Affected

- `packages/backend/__tests__/unit/ChatServer.modeSpecificBehavior.test.ts` - May need updates for consult tool loop
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Constructor signature changed, need to pass mock ToolUseRegistry

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
  - Detects stop_reason: tool_use in streaming result
  - Only processes tool loop when mode is 'consult'
  - Skips tool loop for assessment mode (let existing handler handle)
  - Calls ToolUseRegistry.dispatch with correct input and context
  - Calls continueWithToolResult with tool_result blocks
  - Streams final response after tool_result
  - Handles tool execution errors gracefully
  - Limits to 1 tool loop iteration
  - Does not double-emit assistant_done
  - **MessageHandler receives ToolUseRegistry via constructor**
  - **ChatServer doesn't dispatch consult tool_use in parallel with MessageHandler tool loop (toolUseBlocks returned empty)**
  - **StreamingResult includes stopReason field**
  - **StreamingOptions includes mode field**
- [ ] `packages/backend/__tests__/unit/MessageHandler.toolLoop.abort.test.ts`
  - **Abort during tool execution cancels pending requests and cleans up**
  - **Abort emits tool_status 'idle' immediately**
  - **Abort during tool loop does NOT leave orphaned Jina requests**
- [ ] `packages/backend/__tests__/unit/MessageHandler.toolLoop.gating.test.ts`
  - **Auto-summarize messages skip tool loop (source !== 'user_input')**
  - **Assessment mode tool_use never enters consult tool loop**
  - **Scoring mode tool_use never enters consult tool loop**
  - **Tool gating: only 'consult' mode + 'user_input' source triggers tool loop**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
