# Story 24.1: Regenerate with Retry Context

## Description

Modify the regenerate functionality to include context indicating this is a retry attempt, prompting the LLM to provide a genuinely different response instead of potentially repeating the same output.

**Why:** Currently, clicking "Regenerate" resends the identical prompt to Claude with no indication it's a retry. The LLM often produces the same or very similar response because it has no context that the user was dissatisfied.

## Acceptance Criteria

- [ ] `sendMessage` payload includes `isRegenerate: boolean` flag when regenerating
- [ ] Frontend passes `isRegenerate: true` through WebSocket chain
- [ ] Backend detects `isRegenerate` flag in `send_message` handler
- [ ] When `isRegenerate: true`, system prompt includes retry context: "The user requested a different response. Please provide a fresh perspective with different wording, examples, or approach."
- [ ] Regenerated responses are noticeably different from original
- [ ] Existing non-regenerate messages work unchanged
- [ ] Unit tests cover regenerate flag handling
- [ ] **Browser QA:** Click regenerate, verify response differs from original

## Technical Approach

### Frontend Changes

**1. Update WebSocket types (`apps/web/src/lib/websocket.ts:461-474`):**
```typescript
// Line 461-474: Update sendMessage to accept isRegenerate
sendMessage(content: string, conversationId: string, attachments?: MessageAttachment[], isRegenerate?: boolean): void {
  // ... existing validation ...
  this.socket.emit('send_message', {
    conversationId,
    content,
    ...(attachments && attachments.length > 0 && { attachments }),
    ...(isRegenerate && { isRegenerate: true }),
  });
}
```

**2. Update useWebSocket hook (`apps/web/src/hooks/useWebSocket.ts:120-128`):**
- Add `isRegenerate` parameter to `sendMessage` callback

**3. Update WebSocketAdapter interface (`apps/web/src/hooks/useWebSocketAdapter.ts:69-70`):**
- Add `isRegenerate?: boolean` to `sendMessage` signature

**4. Update ChatService (`apps/web/src/services/ChatService.ts:150-154`):**
```typescript
// Line 154: Pass isRegenerate: true when regenerating
this.adapter.sendMessage(previousMessage.content, conversationId, undefined, true);
```

### Backend Changes

**5. Update SendMessagePayload type (`packages/backend/src/infrastructure/websocket/ChatServer.ts`):**
```typescript
interface SendMessagePayload {
  conversationId?: string;
  text?: string;
  content?: string;
  attachments?: MessageAttachment[];
  isRegenerate?: boolean;  // NEW
}
```

**6. Modify message handling (`packages/backend/src/infrastructure/websocket/ChatServer.ts:1346`):**
- Pass `isRegenerate` to `buildConversationContext`
- If `isRegenerate: true`, prepend retry context to system prompt

```typescript
const { messages, systemPrompt, promptCache, mode } = await this.buildConversationContext(
  conversationId,
  payload.isRegenerate  // NEW parameter
);
```

**7. Update buildConversationContext method:**
- Add retry context to system prompt when `isRegenerate` is true:
```typescript
if (isRegenerate) {
  systemPrompt = `${systemPrompt}\n\nIMPORTANT: The user has requested a different response. Please provide a fresh perspective with different wording, examples, or approach. Avoid repeating your previous answer.`;
}
```

## Files Touched

- `apps/web/src/lib/websocket.ts:461-474` - Add isRegenerate to sendMessage
- `apps/web/src/hooks/useWebSocket.ts:120-128` - Pass through isRegenerate
- `apps/web/src/hooks/useWebSocketAdapter.ts:69-70, 186-188` - Update interface and implementation
- `apps/web/src/services/ChatService.ts:154` - Pass isRegenerate: true
- `packages/backend/src/infrastructure/websocket/ChatServer.ts:1196+` - Detect flag, modify prompt

## Agent Assignment

**backend-agent** - This story requires coordinated changes across frontend WebSocket layer and backend message handling.

## Tests Required

### Unit Tests

**Frontend (`apps/web/src/services/__tests__/ChatService.test.ts`):**
```typescript
describe('regenerateMessage', () => {
  it('should pass isRegenerate: true to adapter.sendMessage', () => {
    const mockAdapter = { sendMessage: jest.fn(), isConnected: true };
    const service = new ChatService(mockAdapter, mockStore);

    service.regenerateMessage(1, 'conv-123', messages);

    expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
      'user message content',
      'conv-123',
      undefined,
      true  // isRegenerate flag
    );
  });
});
```

**Backend (`packages/backend/src/infrastructure/websocket/__tests__/ChatServer.test.ts`):**
```typescript
describe('send_message with isRegenerate', () => {
  it('should include retry context in system prompt when isRegenerate is true', async () => {
    // Mock socket and emit send_message with isRegenerate: true
    // Verify buildConversationContext receives the flag
    // Verify system prompt includes retry context
  });

  it('should not include retry context when isRegenerate is false', async () => {
    // Verify normal flow unchanged
  });
});
```

## Browser QA Required

**Steps for Playwright MCP verification:**

1. Navigate to chat interface
2. Send a message: "Explain photosynthesis in simple terms"
3. Wait for assistant response
4. Take screenshot of original response
5. Click "Regenerate" button on assistant message
6. Wait for new response
7. Take screenshot of regenerated response
8. **Verify:** New response is noticeably different (different wording, structure, or examples)

**Screenshot naming:**
- `24.1-original-response.png`
- `24.1-regenerated-response.png`

**Success criteria:** The regenerated response MUST differ meaningfully from the original.
