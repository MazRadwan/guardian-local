/**
 * SendMessageOrchestrator - Orchestrates the 7-step send_message pipeline
 *
 * Story 36.3.1: Extracted from ChatServer.handleSendMessage()
 *
 * Pipeline steps:
 * 1. Validate (via SendMessageValidator)
 * 2. Save user message (or delete old assistant on regenerate)
 * 3. Build conversation context + mode config
 * 4. Scoring bypass (early return for scoring mode with attachments)
 * 5. File context building (consult/assessment only)
 * 6. Stream Claude response
 * 7. Post-streaming (tool dispatch, enrichment, title generation)
 *
 * ARCHITECTURE: Infrastructure layer orchestrator.
 * - Coordinates services but contains no business logic
 * - Error handling (sanitizeErrorForClient) stays in ChatServer's outer try/catch
 * - Fire-and-forget patterns preserved for title generation and enrichment
 */

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
import type { ToolUseInput, ToolUseContext } from '../../../application/interfaces/IToolUseHandler.js';
import { getModeConfig } from '../handlers/ModeRouter.js';
import { assessmentModeTools, consultModeTools } from '../../ai/tools/index.js';

export interface SendMessageOrchestratorDeps {
  validator: SendMessageValidator;
  streamingService: ClaudeStreamingService;
  conversationService: ConversationService;
  contextBuilder: ConversationContextBuilder;
  fileContextBuilder?: FileContextBuilder;  // Optional -- orchestrator handles null guard
  scoringHandler: ScoringHandler;
  toolRegistry: ToolUseRegistry;
  titleUpdateService: TitleUpdateService;
  backgroundEnrichmentService: BackgroundEnrichmentService;
  webSearchEnabled: boolean;
}

export class SendMessageOrchestrator {
  constructor(private readonly deps: SendMessageOrchestratorDeps) {}

  async execute(socket: IAuthenticatedSocket, payload: SendMessagePayload): Promise<void> {
    // Step 1: Validate
    const validation = await this.deps.validator.validateSendMessage(socket, payload);
    if (!validation.valid) {
      // Story 31.2: Emit file_processing_error when files are missing after retry
      if (validation.emitFileProcessingError && validation.conversationId) {
        socket.emit('file_processing_error', {
          conversationId: validation.conversationId,
          missingFileIds: validation.missingFileIds || [],
          message: validation.error?.message || 'Some files are still processing. Please wait a moment and try again.',
        });
        return;
      }
      socket.emit('error', validation.error);
      return;
    }

    const { conversationId, messageText, enrichedAttachments } = validation;
    const hasAttachments = !!(enrichedAttachments && enrichedAttachments.length > 0);

    // Step 2: Save user message (skip for regenerate - message already exists in DB)
    let finalText = messageText || '';
    // Placeholder text for file-only messages
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
      // CRITICAL: emit enrichedAttachments, NOT message.attachments (security decision)
      socket.emit('message_sent', {
        messageId: message.id,
        conversationId: message.conversationId,
        timestamp: message.createdAt,
        attachments: enrichedAttachments,
      });
    } else {
      // Regenerate path: delete old assistant message for clean context (no stale tool_use/tool_result)
      const history = await this.deps.conversationService.getHistory(conversationId!, 1, 0);
      const lastMsg = history[0];
      if (lastMsg?.role === 'assistant') {
        await this.deps.conversationService.deleteMessage(lastMsg.id);
      }
    }

    // Step 3: Build context + mode config
    const { messages, systemPrompt, promptCache, mode } = await this.deps.contextBuilder.build(conversationId!, payload.isRegenerate);
    const modeConfig = getModeConfig(mode);

    // Step 4: Scoring bypass -- EARLY RETURN
    // Requires BOTH bypassClaude AND hasAttachments
    if (modeConfig.bypassClaude && hasAttachments) {
      const fileIds = enrichedAttachments!.map(a => a.fileId);
      if (enrichedAttachments![0]?.filename) {
        await this.deps.titleUpdateService.updateScoringTitle(socket, conversationId!, enrichedAttachments![0].filename);
      }
      // userQuery excludes placeholder text
      const userQuery = messageText && !messageText.startsWith('[Uploaded file') ? messageText : undefined;
      await this.deps.scoringHandler.triggerScoringOnSend(
        socket, conversationId!, socket.userId!, fileIds, userQuery,
        (id) => this.deps.contextBuilder.build(id)
      );
      return;  // Early return prevents steps 5-7
    }

    // Step 5: File context building (inlined from MessageHandler.buildFileContext)
    // Only for consult + assessment modes (scoring already returned in step 4)
    let enhancedPrompt = systemPrompt;
    let imageBlocks: ImageContentBlock[] = [];
    if (mode === 'consult' || mode === 'assessment') {
      // Null guard: fileContextBuilder may not be configured
      if (this.deps.fileContextBuilder) {
        // Pass undefined for scopeToFileIds -- uses ALL conversation files
        // Do NOT pass enrichedAttachments here -- that would limit context to just-attached files
        const options = mode ? { mode } : undefined;
        const fileContextResult = await this.deps.fileContextBuilder.buildWithImages(conversationId!, undefined, options);
        if (fileContextResult.textContext) {
          enhancedPrompt = `${systemPrompt}${fileContextResult.textContext}`;
        }
        imageBlocks = fileContextResult.imageBlocks;
      }
    }

    // Step 6: Stream Claude response
    // webSearchEnabled gate: only pass consult tools if Jina configured
    const tools = modeConfig.enableTools
      ? (mode === 'consult'
          ? (this.deps.webSearchEnabled ? consultModeTools : undefined)
          : assessmentModeTools)
      : undefined;
    const result = await this.deps.streamingService.streamClaudeResponse(socket, conversationId!, messages, enhancedPrompt, {
      enableTools: modeConfig.enableTools,
      tools,
      usePromptCache: promptCache?.usePromptCache || false,
      cachedPromptId: promptCache?.cachedPromptId,
      imageBlocks,
      mode,
      source: 'user_input',
    });

    // Step 7: Post-streaming (tool dispatch, enrichment, title generation)
    if (!result.wasAborted) {
      // Tool dispatch
      for (const toolUse of result.toolUseBlocks) {
        const input: ToolUseInput = { toolName: toolUse.name, toolUseId: toolUse.id, input: toolUse.input };
        const ctx: ToolUseContext = { conversationId: conversationId!, userId: socket.userId!, assessmentId: null, mode };
        const res = await this.deps.toolRegistry.dispatch(input, ctx);
        if (res.handled && res.emitEvent) socket.emit(res.emitEvent.event, res.emitEvent.payload);
      }

      // Background enrichment (assessment mode only, fire-and-forget)
      if (modeConfig.backgroundEnrich && hasAttachments) {
        this.deps.backgroundEnrichmentService.enrichInBackground(
          conversationId!, enrichedAttachments!.map(a => a.fileId)
        ).catch(e => console.error('[SendMessageOrchestrator] Enrichment failed:', e));
      }

      // Title generation (all modes, fire-and-forget)
      this.deps.titleUpdateService.generateTitleIfNeeded(socket, conversationId!, mode, result.fullResponse)
        .catch(e => console.error('[SendMessageOrchestrator] Title generation failed:', e));
    }
  }
}
