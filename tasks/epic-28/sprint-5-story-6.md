# Story 28.9.6: Update ChatServer to delegate send_message

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (1 file)

---

## Description

Update ChatServer to use MessageHandler for the `send_message` event. This is the largest extraction and removes ~400 lines from ChatServer. **CRITICAL:** Must preserve all existing semantics including payload handling, attachment validation, message_sent event, scoring bypass, abort handling, and mode-specific behaviors.

---

## Acceptance Criteria

- [ ] ChatServer creates MessageHandler in constructor
- [ ] ChatServer creates ToolUseRegistry and registers handlers
- [ ] `send_message` event delegates to MessageHandler
- [ ] **Payload handling**: Supports both `text` and `content` fields (`payload.text || payload.content`)
- [ ] **Attachment validation**: Uses `findByIdAndConversation` for validation, enriches with server metadata
- [ ] **message_sent event**: Emitted immediately after saving user message with enrichedAttachments
- [ ] **Scoring bypass**: Scoring mode with attachments triggers scoring directly (NOT Claude)
- [ ] **Scoring title update**: Updates title to "Scoring: {filename}" format (Epic 25.4 behavior)
- [ ] **userQuery filter**: Only pass userQuery to scoring if NOT placeholder text (`[Uploaded file...`)
- [ ] **Abort handling**: Checks `socket.data.abortRequested` in streaming loop, suppresses `assistant_done` on abort
- [ ] **Tool dispatch**: Uses ToolUseRegistry with `ToolUseInput`/`ToolUseContext` types
- [ ] **Conditional file context**: Only inject file context for consult/assessment modes, NOT scoring
- [ ] **Mode behaviors**: Auto-summarize (consult), background enrichment (assessment), scoring trigger preserved
- [ ] All inline send_message code removed (~400 lines)
- [ ] All 13 existing ChatServer tests pass

---

## Technical Approach

1. Add imports (use correct tool import from ChatServer):
```typescript
import { MessageHandler } from './handlers/MessageHandler';
import { ToolUseRegistry } from './ToolUseRegistry';
import type { ToolUseInput, ToolUseContext } from '../../application/interfaces/IToolUseHandler';
// Tools import (from ChatServer line 17):
import { assessmentModeTools } from '../ai/tools/index.js';
```

2. Initialize in constructor:
```typescript
// Create tool registry and register handlers (by handler.toolName)
this.toolRegistry = new ToolUseRegistry();
this.toolRegistry.register(this.questionnaireReadyService);

// Create message handler with all dependencies
this.messageHandler = new MessageHandler(
  this.conversationService,
  this.fileRepository,
  this.rateLimiter
);
```

3. Delegate send_message with complete semantics:
```typescript
socket.on('send_message', async (payload: SendMessagePayload) => {
  // =========================================================
  // STEP 1: Validate request (uses MessageHandler.validateSendMessage)
  // =========================================================
  const validation = await this.messageHandler.validateSendMessage(
    socket as IAuthenticatedSocket,
    payload
  );

  if (!validation.valid) {
    socket.emit('error', validation.error);
    return;
  }

  const { conversationId, messageText, enrichedAttachments } = validation;
  const conversation = await this.conversationService.getConversation(conversationId!);
  const mode = conversation.mode;

  // =========================================================
  // STEP 2: Save user message with enriched attachments
  // =========================================================
  // Generate placeholder for file-only messages
  let finalMessageText = messageText || '';
  if (!finalMessageText && enrichedAttachments && enrichedAttachments.length > 0) {
    finalMessageText = this.messageHandler.generatePlaceholderText(enrichedAttachments);
  }

  const userMessage = await this.conversationService.sendMessage({
    conversationId: conversationId!,
    role: 'user',
    content: { text: finalMessageText },
    attachments: enrichedAttachments,
  });

  // CRITICAL: Emit message_sent immediately after save
  socket.emit('message_sent', {
    messageId: userMessage.id,
    conversationId: userMessage.conversationId,
    timestamp: userMessage.createdAt,
    attachments: enrichedAttachments,  // Enriched, no storagePath
  });

  // =========================================================
  // STEP 3: Mode-specific routing
  // =========================================================

  // SCORING MODE: Bypass Claude entirely when attachments present
  if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
    console.log(`[ChatServer] Scoring mode with ${enrichedAttachments.length} attachments - triggering scoring`);
    const fileIds = enrichedAttachments.map(a => a.fileId);

    // Epic 25.4: Update conversation title with filename (if not manually edited)
    const firstFile = enrichedAttachments[0];
    if (firstFile && firstFile.filename) {
      const maxTitleLength = 50;
      const prefix = 'Scoring: ';
      const maxFilenameLength = maxTitleLength - prefix.length;

      let filename = firstFile.filename;
      if (filename.length > maxFilenameLength) {
        // Truncate while preserving extension
        const lastDot = filename.lastIndexOf('.');
        const extension = lastDot > 0 ? filename.slice(lastDot) : '';
        const baseName = lastDot > 0 ? filename.slice(0, lastDot) : filename;
        const availableLength = maxFilenameLength - 3 - extension.length;
        if (availableLength > 0) {
          filename = baseName.slice(0, availableLength) + '...' + extension;
        } else {
          filename = filename.slice(0, maxFilenameLength - 3) + '...';
        }
      }

      const scoringTitle = `${prefix}${filename}`;
      const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
        conversationId,
        scoringTitle
      );

      if (titleUpdated) {
        socket.emit('conversation_title_updated', {
          conversationId,
          title: scoringTitle,
        });
        console.log(`[ChatServer] Updated scoring title: "${scoringTitle}"`);
      }
    }

    // Epic 18.4.3: Only pass actual user text, not placeholder text for file-only uploads
    const userQueryForFollowUp = messageText && !messageText.startsWith('[Uploaded file')
      ? messageText
      : undefined;

    await this.triggerScoringOnSend(
      socket as IAuthenticatedSocket,
      conversationId!,
      socket.userId!,
      fileIds,
      userQueryForFollowUp  // Epic 18.4.3: Pass user query only if not placeholder
    );
    return;  // EXIT - scoring mode doesn't continue to Claude
  }

  // Get mode configuration
  const modeConfig = this.messageHandler.getModeConfig(mode);

  // =========================================================
  // STEP 4: Build context and stream Claude response
  // =========================================================
  const { messages, systemPrompt } = await this.buildConversationContext(conversationId!);

  // Only inject file context for consult/assessment modes, NOT scoring
  let enhancedSystemPrompt = systemPrompt;
  if (mode === 'consult' || mode === 'assessment') {
    const fileContext = await this.buildFileContext(conversationId!);
    if (fileContext) {
      enhancedSystemPrompt = `${systemPrompt}${fileContext}`;
      console.log(`[ChatServer] Injected file context (${fileContext.length} chars) into ${mode} mode prompt`);
    }
  }

  // Clear abort flag before streaming
  socket.data.abortRequested = false;

  // Stream with abort handling
  socket.emit('assistant_stream_start', { conversationId });

  let fullResponse = '';
  // NOTE: Use chunk.toolUse (singular), NOT chunk.toolUses - see ChatServer line 1676-1677
  let toolUseBlocks: ToolUseBlock[] = [];

  for await (const chunk of this.claudeClient.streamMessage(messages, {
    systemPrompt: enhancedSystemPrompt,
    // Use assessmentModeTools from '../ai/tools/index.js'
    ...(modeConfig.enableTools && { tools: assessmentModeTools }),
  })) {
    // CRITICAL: Check abort inside loop
    if (socket.data.abortRequested) {
      console.log(`[ChatServer] Stream aborted for conversation ${conversationId}`);
      break;
    }

    if (!chunk.isComplete && chunk.content) {
      fullResponse += chunk.content;
      socket.emit('assistant_token', { conversationId, token: chunk.content });
    }

    // Capture tool use from final chunk - use chunk.toolUse (NOT toolUses)
    if (chunk.isComplete && chunk.toolUse) {
      toolUseBlocks = chunk.toolUse;
    }
  }

  // Save assistant response (even partial on abort)
  const assistantMessage = await this.conversationService.sendMessage({
    conversationId: conversationId!,
    role: 'assistant',
    content: { text: fullResponse },
  });

  // CRITICAL: Suppress assistant_done on abort
  if (!socket.data.abortRequested) {
    socket.emit('assistant_done', {
      conversationId,
      messageId: assistantMessage.id,
      fullText: fullResponse,
    });
  }

  // =========================================================
  // STEP 5: Dispatch tool uses via registry
  // =========================================================
  for (const toolUse of toolUseBlocks) {
    const input: ToolUseInput = {
      toolName: toolUse.name,
      toolUseId: toolUse.id,  // Note: use toolUse.id, not toolUseId
      input: toolUse.input,
    };
    const context: ToolUseContext = {
      conversationId: conversationId!,
      userId: socket.userId!,
      assessmentId: conversation.assessmentId,
      mode,
    };
    await this.toolRegistry.dispatch(input, context);
  }

  // =========================================================
  // STEP 6: Mode-specific post-processing
  // =========================================================

  // Assessment mode: Background enrichment
  if (mode === 'assessment' && enrichedAttachments && enrichedAttachments.length > 0) {
    const fileIds = enrichedAttachments.map(a => a.fileId);
    this.enrichInBackground(conversationId!, fileIds).catch(err => {
      console.error('[ChatServer] Background enrichment failed:', err);
    });
  }

  // Consult mode: Auto-summarize empty message with files
  const isEmptyMessageWithFile = !messageText?.trim() && enrichedAttachments && enrichedAttachments.length > 0;
  if (mode === 'consult' && isEmptyMessageWithFile && enrichedAttachments) {
    const fileIds = enrichedAttachments.map(a => a.fileId);
    this.autoSummarizeDocuments(socket as IAuthenticatedSocket, conversationId!, fileIds)
      .catch(err => console.error('[ChatServer] Auto-summarize failed:', err));
  }
});
```

4. Remove from ChatServer:
- All inline send_message handler code (~400 lines)
- Inline tool handling code (use ToolUseRegistry)
- Mode-specific routing inline code

**Note:** Keep `buildFileContext` and `buildConversationContext` methods in ChatServer for now - they may be used elsewhere.

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to MessageHandler

---

## Tests Required

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

Verify all 13 existing ChatServer tests pass, plus verify:

1. **Payload handling**: Both `text` and `content` fields work
2. **message_sent event**: Emitted after save with enrichedAttachments
3. **Scoring bypass**: Scoring mode + attachments triggers scoring, NOT Claude
4. **Abort handling**: `socket.data.abortRequested` breaks streaming loop
5. **assistant_done suppression**: Not emitted when abort flag is set
6. **Tool dispatch**: Correct `ToolUseInput`/`ToolUseContext` types used

---

## Definition of Done

- [ ] MessageHandler integrated into ChatServer
- [ ] ToolUseRegistry created and handlers registered (by handler.toolName)
- [ ] send_message event fully delegated with:
  - [ ] Payload text/content support
  - [ ] Attachment validation via findByIdAndConversation
  - [ ] message_sent event immediately after save
  - [ ] Scoring mode bypass
  - [ ] Abort handling with assistant_done suppression
  - [ ] Tool dispatch via registry with correct types
  - [ ] Mode-specific post-processing
- [ ] ~400 lines removed from ChatServer
- [ ] All 13 existing ChatServer tests pass
- [ ] Integration tests pass
