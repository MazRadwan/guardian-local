# Story 36.3.1: Create SendMessageOrchestrator

## Description

Create `SendMessageOrchestrator` by lifting the `handleSendMessage()` pipeline from ChatServer. This is the 11-step orchestration pipeline that coordinates validation, message persistence, context building, streaming, and post-streaming work. Inline `buildFileContext()` from the remaining MessageHandler stub.

## Acceptance Criteria

- [ ] `SendMessageOrchestrator.ts` created with `execute()` method
- [ ] Constructor uses a `SendMessageOrchestratorDeps` interface (not positional params — Codex recommendation)
- [ ] All 11 pipeline steps preserved in exact order
- [ ] Regenerate path preserved (skip save, delete old assistant message)
- [ ] Placeholder text generation preserved: `[Uploaded file for analysis: ${filenames}]`
- [ ] Scoring bypass preserved: requires `bypassClaude AND hasAttachments`
- [ ] Scoring `userQuery` computation preserved: excludes placeholder text
- [ ] `webSearchEnabled` gate preserved: consult tools only if Jina configured
- [ ] Prompt cache pass-through preserved: `promptCache?.usePromptCache`, `cachedPromptId`
- [ ] File context null guard preserved: if no FileContextBuilder → empty result
- [ ] File context scoping preserved: passes `undefined` for scopeToFileIds (ALL conversation files)
- [ ] File context mode gating preserved: only consult + assessment, not scoring
- [ ] Post-streaming tool dispatch preserved
- [ ] Post-streaming background enrichment preserved (assessment mode only)
- [ ] Post-streaming title generation preserved (all modes, fire-and-forget)
- [ ] `emitFileProcessingError` error branch preserved
- [ ] No TypeScript errors
- [ ] Under 300 LOC

## Technical Approach

### 1. Create deps interface

**File:** `packages/backend/src/infrastructure/websocket/services/SendMessageOrchestrator.ts`

```typescript
import type { SendMessageValidator } from './SendMessageValidator.js';
import type { ClaudeStreamingService } from './ClaudeStreamingService.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { ConversationContextBuilder } from '../context/ConversationContextBuilder.js';
import type { FileContextBuilder } from '../context/FileContextBuilder.js';
import type { ScoringHandler } from '../handlers/ScoringHandler.js';
import type { ToolUseRegistry } from '../ToolUseRegistry.js';
import type { TitleUpdateService } from './TitleUpdateService.js';
import type { BackgroundEnrichmentService } from './BackgroundEnrichmentService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { SendMessagePayload } from '../types/SendMessage.js';
import type { ImageContentBlock } from '../../ai/types/vision.js';
import { getModeConfig } from '../handlers/ModeRouter.js';
import { assessmentModeTools, consultModeTools } from '../../ai/tools/index.js';
import { sanitizeErrorForClient } from '../../../utils/sanitize.js';

export interface SendMessageOrchestratorDeps {
  validator: SendMessageValidator;
  streamingService: ClaudeStreamingService;
  conversationService: ConversationService;
  contextBuilder: ConversationContextBuilder;
  fileContextBuilder: FileContextBuilder;
  scoringHandler: ScoringHandler;
  toolRegistry: ToolUseRegistry;
  titleUpdateService: TitleUpdateService;
  backgroundEnrichmentService: BackgroundEnrichmentService;
  webSearchEnabled: boolean;
}
```

### 2. Create orchestrator with exact pipeline

```typescript
export class SendMessageOrchestrator {
  constructor(private readonly deps: SendMessageOrchestratorDeps) {}

  async execute(socket: IAuthenticatedSocket, payload: SendMessagePayload): Promise<void> {
    // EXACT 11-step pipeline from ChatServer.handleSendMessage (lines 237-345)
    // See pipeline map below
  }
}
```

### 3. Pipeline map — EVERY step must be preserved

```
Step 1: Validate
  const validation = await this.deps.validator.validateSendMessage(socket, payload);
  if (!validation.valid) {
    // BRANCH A: emitFileProcessingError check (lines 242-249)
    if (validation.emitFileProcessingError && validation.conversationId) {
      socket.emit('file_processing_error', {
        conversationId: validation.conversationId,
        missingFileIds: validation.missingFileIds || [],
        message: validation.error?.message || 'Some files are still processing...',
      });
      return;
    }
    // BRANCH B: generic error
    socket.emit('error', validation.error);
    return;
  }

Step 2: Destructure + Save user message
  const { conversationId, messageText, enrichedAttachments } = validation;
  const hasAttachments = !!(enrichedAttachments && enrichedAttachments.length > 0);

  let finalText = messageText || '';
  // PRESERVE: Placeholder text for file-only messages
  if (!finalText && hasAttachments) {
    finalText = `[Uploaded file for analysis: ${enrichedAttachments!.map(a => a.filename).join(', ')}]`;
  }

  if (!payload.isRegenerate) {
    // Normal path: save user message + emit message_sent
    const message = await this.deps.conversationService.sendMessage({
      conversationId: conversationId!,
      role: 'user',
      content: { text: finalText, components: payload.components },
      attachments: enrichedAttachments,
    });
    socket.emit('message_sent', {
      messageId: message.id,
      conversationId: message.conversationId,
      timestamp: message.createdAt,
      attachments: enrichedAttachments,  // CRITICAL: emit enrichedAttachments, NOT message.attachments (security)
    });
  } else {
    // PRESERVE: Regenerate path — delete old assistant message for clean context
    const history = await this.deps.conversationService.getHistory(conversationId!, 1, 0);
    const lastMsg = history[0];
    if (lastMsg?.role === 'assistant') {
      await this.deps.conversationService.deleteMessage(lastMsg.id);
    }
  }

Step 3: Build context + mode config
  const { messages, systemPrompt, promptCache, mode } = await this.deps.contextBuilder.build(conversationId!, payload.isRegenerate);
  const modeConfig = getModeConfig(mode);

Step 4: Scoring bypass — EARLY RETURN
  // PRESERVE: Requires BOTH bypassClaude AND hasAttachments
  if (modeConfig.bypassClaude && hasAttachments) {
    const fileIds = enrichedAttachments!.map(a => a.fileId);
    if (enrichedAttachments![0]?.filename) {
      await this.deps.titleUpdateService.updateScoringTitle(socket, conversationId!, enrichedAttachments![0].filename);
    }
    // PRESERVE: userQuery excludes placeholder text
    const userQuery = messageText && !messageText.startsWith('[Uploaded file') ? messageText : undefined;
    await this.deps.scoringHandler.triggerScoringOnSend(
      socket, conversationId!, socket.userId!, fileIds, userQuery,
      (id) => this.deps.contextBuilder.build(id)
    );
    return;  // CRITICAL: Early return prevents steps 5-7
  }

Step 5: File context building (INLINED from MessageHandler.buildFileContext)
  let enhancedPrompt = systemPrompt;
  let imageBlocks: ImageContentBlock[] = [];
  if (mode === 'consult' || mode === 'assessment') {
    // PRESERVE: Null guard — fileContextBuilder may not be configured
    if (this.deps.fileContextBuilder) {
      // PRESERVE: Pass undefined for scopeToFileIds — uses ALL conversation files
      // Do NOT pass enrichedAttachments here — that would limit context to just-attached files
      const options = mode ? { mode } : undefined;
      const fileContextResult = await this.deps.fileContextBuilder.buildWithImages(conversationId!, undefined, options);
      if (fileContextResult.textContext) {
        enhancedPrompt = `${systemPrompt}${fileContextResult.textContext}`;
      }
      imageBlocks = fileContextResult.imageBlocks;
    }
  }

Step 6: Stream Claude response
  // PRESERVE: webSearchEnabled gate — only pass consult tools if Jina configured
  const tools = modeConfig.enableTools
    ? (mode === 'consult'
        ? (this.deps.webSearchEnabled ? consultModeTools : undefined)
        : assessmentModeTools)
    : undefined;
  const result = await this.deps.streamingService.streamClaudeResponse(socket, conversationId!, messages, enhancedPrompt, {
    enableTools: modeConfig.enableTools,
    tools,
    usePromptCache: promptCache?.usePromptCache || false,  // PRESERVE: prompt cache pass-through
    cachedPromptId: promptCache?.cachedPromptId,
    imageBlocks,
    mode,
    source: 'user_input',
  });

Step 7: Post-streaming
  if (!result.wasAborted) {
    // Tool dispatch
    for (const toolUse of result.toolUseBlocks) {
      const input = { toolName: toolUse.name, toolUseId: toolUse.id, input: toolUse.input };
      const ctx = { conversationId: conversationId!, userId: socket.userId!, assessmentId: null, mode };
      const res = await this.deps.toolRegistry.dispatch(input, ctx);
      if (res.handled && res.emitEvent) socket.emit(res.emitEvent.event, res.emitEvent.payload);
    }

    // Background enrichment (assessment mode only)
    if (modeConfig.backgroundEnrich && hasAttachments) {
      this.deps.backgroundEnrichmentService.enrichInBackground(
        conversationId!, enrichedAttachments!.map(a => a.fileId)
      ).catch(e => console.error('[SendMessageOrchestrator] Enrichment failed:', e));
    }

    // Title generation (all modes, fire-and-forget)
    this.deps.titleUpdateService.generateTitleIfNeeded(socket, conversationId!, mode, result.fullResponse)
      .catch(e => console.error('[SendMessageOrchestrator] Title generation failed:', e));
  }
```

### 4. TRAPS (from audit + Codex review)

- **DO NOT** call `validator.validateSendMessage()` AND rate-limit elsewhere — rate limiter increments on check
- **DO NOT** pass `enrichedAttachments` to `fileContextBuilder.buildWithImages()` — must be `undefined` (all files)
- **DO NOT** remove the `hasAttachments` check from scoring bypass — `bypassClaude` alone is not sufficient
- **DO NOT** simplify `userQuery` — the placeholder text exclusion (`!messageText.startsWith('[Uploaded file')`) is intentional
- **DO NOT** await title generation — it's fire-and-forget with `.catch()`
- **DO NOT** await background enrichment — same fire-and-forget pattern
- **DO NOT** change `message_sent` payload — `attachments: enrichedAttachments` (not DB return) is a security decision

## Files Touched

- `packages/backend/src/infrastructure/websocket/services/SendMessageOrchestrator.ts` - CREATE

## Agent Assignment

- [x] backend-agent

## Tests Required

None for this story — Story 36.3.3 covers testing.

## Definition of Done

- [ ] Orchestrator created with all 11 steps
- [ ] Deps interface pattern used (not positional params)
- [ ] All behaviors listed in pipeline map preserved
- [ ] All traps avoided
- [ ] Under 300 LOC
- [ ] TypeScript compiles
