# Story 33.2.4: Assistant Done Gating

## Description

Ensure `assistant_done` event is only emitted after the FINAL answer, not after the initial response that contains `tool_use`. Without this gating, the frontend would incorrectly show the response as complete before the tool loop finishes.

**NOTE:** This story builds on 33.2.2 which adds the tool loop. The gating logic must integrate with that implementation.

## Acceptance Criteria

- [ ] `assistant_done` NOT emitted when `stop_reason` is `tool_use`
- [ ] `assistant_done` IS emitted after the final response (post tool_result)
- [ ] Frontend receives single `assistant_done` per user message (no duplicates)
- [ ] Streaming tokens still emitted during initial response (before tool_use)
- [ ] Assessment mode assistant_done behavior unchanged
- [ ] Scoring mode assistant_done behavior unchanged
- [ ] **Intermediate pre-tool response NOT persisted as a separate assistant message**
- [ ] **Exactly one assistant message persisted per user input in tool flow** (the final response only)
- [ ] **If aborted after tool_use but before follow-up, do NOT save empty assistant message**
- [ ] **Emit tool_status 'idle' on abort**
- [ ] **assistant_done emitted ONLY when second stream completes (not on tool_use stop)**

## Technical Approach

### Follow-up Stream Gating Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ASSISTANT_DONE GATING FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  First Stream (Claude API call)                                              │
│  ─────────────────────────────                                              │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────┐    YES    ┌────────────────────┐                           │
│  │ stop_reason │─────────▶ │ DO NOT emit        │                           │
│  │ = tool_use? │           │ assistant_done     │                           │
│  └──────┬──────┘           │ DO NOT save msg    │                           │
│         │ NO               └─────────┬──────────┘                           │
│         ▼                            │                                       │
│  ┌─────────────┐                     ▼                                       │
│  │ Save msg    │           ┌────────────────────┐                           │
│  │ Emit done   │           │ Execute tool       │                           │
│  └─────────────┘           │ (WebSearchTool)    │                           │
│                            └─────────┬──────────┘                           │
│                                      │                                       │
│                                      ▼                                       │
│                            ┌────────────────────┐                           │
│                            │ continueWithTool   │                           │
│                            │ Result() call      │                           │
│                            │ (second stream)    │                           │
│                            └─────────┬──────────┘                           │
│                                      │                                       │
│                                      ▼                                       │
│                            ┌────────────────────┐                           │
│                            │ Second stream      │                           │
│                            │ completes          │                           │
│                            └─────────┬──────────┘                           │
│                                      │                                       │
│                                      ▼                                       │
│                            ┌────────────────────┐                           │
│                            │ NOW save message   │◀─── ONLY message saved    │
│                            │ NOW emit           │     for entire exchange   │
│                            │ assistant_done     │                           │
│                            └────────────────────┘                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

EDGE CASE - Tool Handler Fails:
───────────────────────────────
If tool_use response received but tool handler throws:
1. Catch error in executeToolLoop
2. Send error as tool_result content: "Search failed: {error}. Answer from knowledge."
3. Continue with continueWithToolResult (second stream)
4. Save final message, emit assistant_done
5. User sees graceful degradation, not error

EDGE CASE - Abort During Tool Loop:
───────────────────────────────────
If abort signal received after tool_use but before follow-up:
1. Cancel pending Jina requests
2. Emit tool_status 'idle'
3. DO NOT save any assistant message (no partial content)
4. DO NOT emit assistant_done
5. User can retry with fresh message
```

### 1. Message Persistence Clarification

When Claude returns `stop_reason: tool_use`:
- The initial response (before tool call) is **NOT saved** as a message
- Only the final response (after tool_result) is saved as the assistant message
- This prevents duplicate/fragmented messages in conversation history

```typescript
// In streamClaudeResponse - when tool_use detected:
// DO NOT save the initial response here
// Let continueAfterToolUse save the final combined response
```

### 2. Gating Logic

The gating logic should be in MessageHandler.streamClaudeResponse where assistant_done is emitted:

```typescript
// In MessageHandler.streamClaudeResponse
async streamClaudeResponse(...): Promise<StreamingResult> {
  // ... streaming code ...

  // CRITICAL: Only emit assistant_done if NOT about to enter tool loop
  const isToolUseResponse = result.stopReason === 'tool_use' && options.mode === 'consult';

  if (!wasAborted && !isToolUseResponse) {
    // Save message and emit assistant_done for non-tool responses
    const savedMessage = await this.saveMessage(...);
    socket.emit('assistant_done', {
      messageId: savedMessage.id,
      conversationId,
      fullText: fullResponse,
      assessmentId: null,
    });
  }

  // If tool_use, handle tool loop and emit assistant_done after final response
  if (isToolUseResponse && result.toolUseBlocks.length > 0) {
    // Note: Message is NOT saved here - saved in continueAfterToolUse
    // ... tool loop code from 33.2.2 ...
    // assistant_done emitted in continueAfterToolUse after final streaming
  }

  return result;
}
```

### 3. Final Response Handling

The `continueAfterToolUse` method should emit `assistant_done` after the final response:

```typescript
private async continueAfterToolUse(
  socket: IAuthenticatedSocket,
  conversationId: string,
  originalMessages: ClaudeMessage[],
  toolUseBlocks: ToolUseBlock[],
  toolResults: ToolResultBlock[],
  systemPrompt: string,
  options: StreamingOptions
): Promise<StreamingResult> {
  // Stream final response
  let finalResponse = '';
  for await (const chunk of this.claudeClient.continueWithToolResult(...)) {
    if (!chunk.isComplete && chunk.content) {
      finalResponse += chunk.content;
      socket.emit('assistant_token', { conversationId, token: chunk.content });
    }
  }

  // Save final message (the ONLY message saved for this user input)
  const finalMessage = await this.conversationService.sendMessage({
    conversationId,
    role: 'assistant',
    content: { text: finalResponse },
  });

  // NOW emit assistant_done (only place for tool loop)
  socket.emit('assistant_done', {
    messageId: finalMessage.id,
    conversationId,
    fullText: finalResponse,
    assessmentId: null,
  });

  return {
    fullResponse: finalResponse,
    toolUseBlocks: [], // No more tools in final response
    savedMessageId: finalMessage.id,
    wasAborted: false,
  };
}
```

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - UPDATE: Add assistant_done gating for tool_use stop_reason, clarify message persistence

## Tests Affected

- `packages/backend/__tests__/unit/ChatServer.modeSpecificBehavior.test.ts` - May need updates for gating behavior
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Persistence behavior tests

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
  - assistant_done NOT emitted when stop_reason is 'tool_use' and mode is 'consult'
  - assistant_done IS emitted after continueAfterToolUse completes
  - assistant_done IS emitted normally when stop_reason is 'end_turn'
  - Only one assistant_done emitted per user message (no duplicates)
  - Assessment mode assistant_done unaffected
  - Streaming tokens still emitted before tool_use
  - **No intermediate assistant message persisted on tool_use** (verify conversationService.sendMessage NOT called before tool loop)
  - **Exactly one assistant message persisted after tool_result processing**
  - **Persisted message contains final response text (not pre-tool text)**
- [ ] `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
  - **Abort after tool_use but before follow-up does NOT save empty assistant message**
  - **Abort emits tool_status 'idle'**
  - **Abort does NOT emit assistant_done**
  - **No orphaned messages in database after abort**
- [ ] `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`
  - **Tool handler failure still results in assistant_done after error recovery**
  - **Tool handler failure saves graceful error response (not empty)**
  - **Second stream failure handled gracefully**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
