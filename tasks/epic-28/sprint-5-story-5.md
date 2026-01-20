# Story 28.9.5: Extract MessageHandler.ts (Claude streaming)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add Claude API streaming logic to MessageHandler. This handles calling Claude with the conversation context and streaming the response back to the client.

---

## Acceptance Criteria

- [ ] `streamClaudeResponse()` method implemented
- [ ] Uses ConversationContextBuilder for context
- [ ] Supports abort via ChatContext.abortedStreams
- [ ] Emits assistant_token and assistant_done events
- [ ] Handles tool use responses
- [ ] Unit tests cover streaming scenarios

---

## Technical Approach

```typescript
// Add to MessageHandler.ts

import { IClaudeClient } from '../../../application/interfaces/IClaudeClient';
import { ConversationContextBuilder } from '../context/ConversationContextBuilder';

export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileContextBuilder: FileContextBuilder,
    private readonly contextBuilder: ConversationContextBuilder,
    private readonly claudeClient: IClaudeClient,
    private readonly toolRegistry: ToolUseRegistry
  ) {}

  /**
   * Stream Claude response to client
   */
  async streamClaudeResponse(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userMessage: string,
    fileContext: string,
    modeConfig: ModeConfig,
    chatContext: ChatContext
  ): Promise<{
    fullResponse: string;
    toolUses: Array<{ name: string; input: unknown }>;
  }> {
    // Build context
    const context = await this.contextBuilder.build(conversationId);

    // Add user message
    context.messages.push({
      role: 'user',
      content: userMessage + (fileContext ? `\n\n${fileContext}` : ''),
    });

    // Enhance system prompt with mode additions
    let systemPrompt = context.systemPrompt;
    if (modeConfig.systemPromptAdditions) {
      systemPrompt += `\n\n${modeConfig.systemPromptAdditions}`;
    }

    // Check abort before streaming
    const isAborted = () => chatContext.abortedStreams.has(conversationId);
    if (isAborted()) {
      return { fullResponse: '', toolUses: [] };
    }

    // Stream response
    let fullResponse = '';
    const toolUses: Array<{ name: string; input: unknown }> = [];

    await this.claudeClient.streamMessage({
      messages: context.messages,
      system: systemPrompt,
      onToken: (token) => {
        if (isAborted()) return;
        fullResponse += token;
        socket.emit('assistant_token', { conversationId, token });
      },
      onToolUse: (toolName, toolInput) => {
        toolUses.push({ name: toolName, input: toolInput });
      },
      onComplete: () => {
        if (!isAborted()) {
          socket.emit('assistant_done', { conversationId, fullText: fullResponse });
        }
      },
    });

    return { fullResponse, toolUses };
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('streamClaudeResponse', () => {
  it('should stream tokens to socket', async () => {
    mockContextBuilder.build.mockResolvedValue({
      messages: [],
      systemPrompt: 'Base prompt',
    });
    mockClaudeClient.streamMessage.mockImplementation(async (opts) => {
      opts.onToken('Hello ');
      opts.onToken('world!');
      opts.onComplete();
    });

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      'Hi',
      '',
      handler.getModeConfig('consult'),
      mockChatContext
    );

    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', expect.objectContaining({ token: 'Hello ' }));
    expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', expect.any(Object));
    expect(result.fullResponse).toBe('Hello world!');
  });

  it('should stop streaming when aborted', async () => {
    mockContextBuilder.build.mockResolvedValue({ messages: [], systemPrompt: '' });
    mockChatContext.abortedStreams.add('conv-1');

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      'Hi',
      '',
      handler.getModeConfig('consult'),
      mockChatContext
    );

    expect(result.fullResponse).toBe('');
    expect(mockClaudeClient.streamMessage).not.toHaveBeenCalled();
  });

  it('should collect tool uses', async () => {
    mockContextBuilder.build.mockResolvedValue({ messages: [], systemPrompt: '' });
    mockClaudeClient.streamMessage.mockImplementation(async (opts) => {
      opts.onToolUse('questionnaire_ready', { vendor: 'Test' });
      opts.onComplete();
    });

    const result = await handler.streamClaudeResponse(
      mockSocket,
      'conv-1',
      'Hi',
      '',
      handler.getModeConfig('assessment'),
      mockChatContext
    );

    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0].name).toBe('questionnaire_ready');
  });
});
```

---

## Definition of Done

- [ ] streamClaudeResponse implemented
- [ ] Abort handling works
- [ ] Tool uses collected
- [ ] Unit tests passing
