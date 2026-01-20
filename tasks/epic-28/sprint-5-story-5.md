# Story 28.9.5: Extract MessageHandler.ts (Claude streaming)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add Claude API streaming logic to MessageHandler. This handles calling Claude with the conversation context and streaming the response back to the client using async iterators.

---

## Acceptance Criteria

- [ ] `streamClaudeResponse()` method implemented
- [ ] Uses async iterator pattern (`for await...of claudeClient.streamMessage()`)
- [ ] Supports abort via `socket.data.abortRequested` check in streaming loop
- [ ] Emits `message_sent` event after saving user message
- [ ] Emits `assistant_stream_start` before streaming begins
- [ ] Emits `assistant_token` for each chunk during streaming
- [ ] Emits `assistant_done` only when NOT aborted
- [ ] Does NOT emit `assistant_done` when `socket.data.abortRequested === true`
- [ ] Saves partial response to DB even on abort
- [ ] Collects tool use blocks from final chunk
- [ ] Unit tests cover streaming, abort handling, and tool collection

---

## Technical Approach

```typescript
// Add to MessageHandler.ts

import type { IClaudeClient, ClaudeMessage, ToolUseBlock } from '../../../application/interfaces/IClaudeClient';

interface StreamingResult {
  fullResponse: string;
  toolUseBlocks: ToolUseBlock[];
  savedMessageId: string | null;
  wasAborted: boolean;
}

/**
 * Stream Claude response to client
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Uses async iterator: `for await (const chunk of claudeClient.streamMessage(...))`
 * 2. Abort check inside loop: `if (socket.data.abortRequested) break;`
 * 3. assistant_done SUPPRESSED on abort
 * 4. Partial response saved to DB even on abort
 * 5. Tool uses captured from final chunk (chunk.isComplete && chunk.toolUse)
 */
async streamClaudeResponse(
  socket: IAuthenticatedSocket,
  conversationId: string,
  messages: ClaudeMessage[],
  systemPrompt: string,
  options: {
    enableTools: boolean;
    tools?: unknown[];
    usePromptCache?: boolean;
    cachedPromptId?: string;
  }
): Promise<StreamingResult> {
  // Reset abort flag before starting stream
  socket.data.abortRequested = false;

  // Emit stream start event
  socket.emit('assistant_stream_start', {
    conversationId,
  });

  let fullResponse = '';
  let toolUseBlocks: ToolUseBlock[] = [];
  let savedMessageId: string | null = null;
  let wasAborted = false;

  try {
    // Build Claude options
    const claudeOptions = {
      systemPrompt,
      usePromptCache: options.usePromptCache || false,
      ...(options.cachedPromptId && { cachedPromptId: options.cachedPromptId }),
      ...(options.enableTools && options.tools && { tools: options.tools }),
    };

    // Stream response chunks from Claude using async iterator
    for await (const chunk of this.claudeClient.streamMessage(messages, claudeOptions)) {
      // CRITICAL: Check if stream was aborted by user
      if (socket.data.abortRequested) {
        console.log(`[MessageHandler] Stream aborted by user, breaking loop`);
        wasAborted = true;
        break;
      }

      if (!chunk.isComplete && chunk.content) {
        fullResponse += chunk.content;

        // Emit each chunk to client
        socket.emit('assistant_token', {
          conversationId,
          token: chunk.content,
        });
      }

      // Capture tool use from final chunk
      if (chunk.isComplete && chunk.toolUse) {
        toolUseBlocks = chunk.toolUse;
      }
    }

    // Save message to database (even if aborted, save partial response)
    if (fullResponse.length > 0) {
      const completeMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: fullResponse },
      });
      savedMessageId = completeMessage.id;
    }

    // CRITICAL: Only emit assistant_done if NOT aborted
    if (!wasAborted) {
      socket.emit('assistant_done', {
        messageId: savedMessageId,
        conversationId,
        fullText: fullResponse,
        assessmentId: null,
      });
    } else {
      console.log(`[MessageHandler] Stream aborted - partial response saved (${fullResponse.length} chars)`);
    }

    return {
      fullResponse,
      toolUseBlocks,
      savedMessageId,
      wasAborted,
    };

  } catch (error) {
    console.error('[MessageHandler] Claude API error:', error);

    // Send user-friendly error message
    const errorMessage = await this.conversationService.sendMessage({
      conversationId,
      role: 'system',
      content: {
        text: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
      },
    });

    socket.emit('message', {
      id: errorMessage.id,
      conversationId: errorMessage.conversationId,
      role: errorMessage.role,
      content: errorMessage.content,
      createdAt: errorMessage.createdAt,
    });

    return {
      fullResponse: '',
      toolUseBlocks: [],
      savedMessageId: null,
      wasAborted: false,
    };
  }
}

/**
 * Save user message and emit message_sent event
 *
 * CRITICAL: message_sent event MUST be emitted after saving
 */
async saveUserMessageAndEmit(
  socket: IAuthenticatedSocket,
  conversationId: string,
  messageText: string,
  attachments?: MessageAttachment[],
  components?: unknown[]
): Promise<{ messageId: string }> {
  const message = await this.conversationService.sendMessage({
    conversationId,
    role: 'user',
    content: {
      text: messageText,
      components,
    },
    attachments,
  });

  // CRITICAL: Emit message_sent event
  socket.emit('message_sent', {
    messageId: message.id,
    conversationId: message.conversationId,
    timestamp: message.createdAt,
    attachments,
  });

  return { messageId: message.id };
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Add methods
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('streamClaudeResponse', () => {
  it('should stream tokens to socket using async iterator', async () => {
    // Mock async iterator
    async function* mockStream() {
      yield { isComplete: false, content: 'Hello ' };
      yield { isComplete: false, content: 'world!' };
      yield { isComplete: true, content: '', toolUse: [] };
    }
    mockClaudeClient.streamMessage.mockReturnValue(mockStream());
    mockConversationService.sendMessage.mockResolvedValue({ id: 'msg-1' });

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      [],
      'System prompt',
      { enableTools: false }
    );

    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', { conversationId: 'conv-1' });
    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', { conversationId: 'conv-1', token: 'Hello ' });
    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', { conversationId: 'conv-1', token: 'world!' });
    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', expect.objectContaining({
      conversationId: 'conv-1',
      fullText: 'Hello world!',
    }));
    expect(result.fullResponse).toBe('Hello world!');
    expect(result.wasAborted).toBe(false);
  });

  it('should NOT emit assistant_done when aborted', async () => {
    async function* mockStream() {
      yield { isComplete: false, content: 'Hello ' };
      // Simulate abort between chunks
      mockSocket.data.abortRequested = true;
      yield { isComplete: false, content: 'world!' };
      yield { isComplete: true, content: '' };
    }
    mockClaudeClient.streamMessage.mockReturnValue(mockStream());
    mockConversationService.sendMessage.mockResolvedValue({ id: 'msg-1' });

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      [],
      'System prompt',
      { enableTools: false }
    );

    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', expect.any(Object));
    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', expect.objectContaining({ token: 'Hello ' }));
    expect(mockSocket.emit).not.toHaveBeenCalledWith('assistant_done', expect.anything());
    expect(result.wasAborted).toBe(true);
    // Partial response should still be saved
    expect(mockConversationService.sendMessage).toHaveBeenCalled();
  });

  it('should collect tool uses from final chunk', async () => {
    const mockToolUse: ToolUseBlock[] = [
      { id: 'tool-1', name: 'questionnaire_ready', input: { vendor: 'Test' } },
    ];

    async function* mockStream() {
      yield { isComplete: false, content: 'Response ' };
      yield { isComplete: true, content: '', toolUse: mockToolUse };
    }
    mockClaudeClient.streamMessage.mockReturnValue(mockStream());
    mockConversationService.sendMessage.mockResolvedValue({ id: 'msg-1' });

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      [],
      'System prompt',
      { enableTools: true, tools: [] }
    );

    expect(result.toolUseBlocks).toEqual(mockToolUse);
  });

  it('should handle Claude API errors gracefully', async () => {
    mockClaudeClient.streamMessage.mockImplementation(() => {
      throw new Error('API rate limit');
    });
    mockConversationService.sendMessage.mockResolvedValue({ id: 'error-msg-1' });

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      [],
      'System prompt',
      { enableTools: false }
    );

    expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
      role: 'system',
    }));
    expect(result.fullResponse).toBe('');
    expect(result.savedMessageId).toBeNull();
  });

  it('should reset abortRequested flag before streaming', async () => {
    mockSocket.data.abortRequested = true;  // Pre-set

    async function* mockStream() {
      // Should NOT see abortRequested=true here
      expect(mockSocket.data.abortRequested).toBe(false);
      yield { isComplete: true, content: '' };
    }
    mockClaudeClient.streamMessage.mockReturnValue(mockStream());

    await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      [],
      'System prompt',
      { enableTools: false }
    );
  });
});

describe('saveUserMessageAndEmit', () => {
  it('should save message and emit message_sent event', async () => {
    mockConversationService.sendMessage.mockResolvedValue({
      id: 'msg-123',
      conversationId: 'conv-1',
      createdAt: new Date('2024-01-01'),
    });

    const result = await handler.saveUserMessageAndEmit(
      mockSocket,
      'conv-1',
      'Hello',
      [{ fileId: 'f1', filename: 'test.pdf', mimeType: 'application/pdf', size: 1024 }]
    );

    expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      role: 'user',
      content: { text: 'Hello', components: undefined },
      attachments: expect.any(Array),
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('message_sent', {
      messageId: 'msg-123',
      conversationId: 'conv-1',
      timestamp: expect.any(Date),
      attachments: expect.any(Array),
    });
    expect(result.messageId).toBe('msg-123');
  });
});
```

---

## Preserve Notes (CRITICAL)

The following behaviors MUST be preserved:

1. **`message_sent` event MUST be emitted** after saving user message:
   ```typescript
   socket.emit('message_sent', {
     messageId: message.id,
     conversationId: message.conversationId,
     timestamp: message.createdAt,
     attachments: enrichedAttachments,
   });
   ```

2. **`assistant_done` suppression on abort**:
   - If `socket.data.abortRequested === true`, do NOT emit `assistant_done`
   - Partial response is still saved to DB

3. **`stream_aborted` vs abort semantics**:
   - `socket.on('abort_stream')` sets `socket.data.abortRequested = true`
   - Also adds conversationId to `abortedStreams` set
   - Emits `stream_aborted` event as acknowledgment

---

## Definition of Done

- [ ] streamClaudeResponse implemented with async iterator
- [ ] Abort handling via socket.data.abortRequested
- [ ] assistant_done suppressed on abort
- [ ] Partial response saved on abort
- [ ] Tool uses collected from final chunk
- [ ] saveUserMessageAndEmit with message_sent event
- [ ] Unit tests passing
