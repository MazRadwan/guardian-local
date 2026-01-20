# Story 28.9.6: Update ChatServer to delegate send_message

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (1 file)

---

## Description

Update ChatServer to use MessageHandler for the `send_message` event. This is the largest extraction and removes ~400 lines from ChatServer.

---

## Acceptance Criteria

- [ ] ChatServer creates MessageHandler in constructor
- [ ] ChatServer creates ToolUseRegistry and registers handlers
- [ ] `send_message` event delegates to MessageHandler
- [ ] Tool uses dispatch via ToolUseRegistry
- [ ] All inline send_message code removed
- [ ] All 13 existing ChatServer tests pass
- [ ] **Scoring trigger uses ScoringHandler from Sprint 4**

---

## Technical Approach

1. Add imports:
```typescript
import { MessageHandler } from './handlers/MessageHandler';
import { ToolUseRegistry } from './ToolUseRegistry';
```

2. Initialize in constructor:
```typescript
// Create tool registry and register handlers
this.toolRegistry = new ToolUseRegistry();
this.toolRegistry.register('questionnaire_ready', this.questionnaireReadyService);

// Create message handler
this.messageHandler = new MessageHandler(
  this.conversationService,
  this.fileContextBuilder,
  this.contextBuilder,
  this.claudeClient,
  this.toolRegistry
);
```

3. Delegate send_message:
```typescript
socket.on('send_message', async (payload) => {
  const validation = await this.messageHandler.validateSendMessage(
    socket as IAuthenticatedSocket,
    payload,
    this.chatContext
  );

  if (validation) {
    socket.emit('error', { event: 'send_message', message: validation });
    return;
  }

  // Process message
  const conversationId = payload.conversationId || socket.conversationId!;
  const conversation = await this.conversationService.getConversation(conversationId);
  const modeConfig = this.messageHandler.getModeConfig(conversation.mode);

  // Get file context
  const { fileContext } = await this.messageHandler.processAttachments(
    conversationId,
    payload.fileIds
  );

  // Save user message
  await this.conversationService.sendMessage({
    conversationId,
    role: 'user',
    content: { text: payload.message },
  });

  // Stream Claude response
  const { fullResponse, toolUses } = await this.messageHandler.streamClaudeResponse(
    socket as IAuthenticatedSocket,
    conversationId,
    payload.message,
    fileContext,
    modeConfig,
    this.chatContext
  );

  // Save assistant response
  await this.conversationService.sendMessage({
    conversationId,
    role: 'assistant',
    content: { text: fullResponse },
  });

  // Dispatch tool uses
  for (const toolUse of toolUses) {
    await this.toolRegistry.dispatch(toolUse.name, toolUse.input, {
      conversationId,
      userId: socket.userId!,
    });
  }

  // Trigger scoring if needed (uses ScoringHandler from Sprint 4)
  if (modeConfig.triggerScoringOnResponse && this.scoringHandler) {
    const fileIds = await this.fileRepository.findIdsByConversation(conversationId);
    if (this.scoringHandler.shouldTriggerScoring(modeConfig.mode, fileIds.length > 0, true)) {
      await this.scoringHandler.triggerScoring(socket as IAuthenticatedSocket, conversationId, fileIds);
    }
  }
});
```

4. Remove from ChatServer:
- All inline send_message handler code (~400 lines)
- buildFileContext calls (use MessageHandler)
- Claude streaming code (use MessageHandler)
- Tool handling code (use ToolUseRegistry)
- Mode-specific routing inline code

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to MessageHandler

---

## Tests Required

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

Verify all 13 existing ChatServer tests pass.

---

## Definition of Done

- [ ] MessageHandler integrated into ChatServer
- [ ] ToolUseRegistry created and handlers registered
- [ ] send_message event fully delegated
- [ ] ~400 lines removed from ChatServer
- [ ] All 13 existing ChatServer tests pass
- [ ] Integration tests pass
