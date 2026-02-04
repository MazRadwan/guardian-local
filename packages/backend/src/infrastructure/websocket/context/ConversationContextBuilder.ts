/**
 * ConversationContextBuilder - Builds conversation context for Claude API calls
 *
 * Story 28.2.1: Extract from ChatServer.ts for better modularity
 *
 * Responsibilities:
 * - Load conversation history (last 10 messages)
 * - Filter out system messages and empty messages
 * - Inject stored intake context as synthetic assistant message
 * - Manage prompt cache integration
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { PromptCacheManager } from '../../ai/PromptCacheManager.js';
import type {
  IFileRepository,
  FileWithIntakeContext,
} from '../../../application/interfaces/IFileRepository.js';
import type { ClaudeMessage } from '../../../application/interfaces/IClaudeClient.js';
import type { IntakeDocumentContext } from '../../../domain/entities/Conversation.js';
import { sanitizeForPrompt, CHAT_CONTEXT_PROFILE } from '../../../utils/sanitize.js';

/**
 * Context returned by ConversationContextBuilder for Claude API calls
 */
export interface ConversationContext {
  messages: ClaudeMessage[];
  systemPrompt: string;
  mode: 'consult' | 'assessment' | 'scoring';
  promptCache: {
    usePromptCache: boolean;
    cachedPromptId?: string;
  };
}

/**
 * ConversationContextBuilder
 *
 * Handles loading conversation history, selecting system prompts,
 * injecting intake context, and managing prompt cache.
 *
 * IMPORTANT: Uses CHAT_CONTEXT_PROFILE for whitespace normalization
 * to match original ChatServer.ts:227-234 behavior.
 */
export class ConversationContextBuilder {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly promptCacheManager: PromptCacheManager,
    private readonly fileRepository: IFileRepository
  ) {}

  /**
   * Build conversation context for Claude API call
   *
   * Epic 16.6.1: Injects stored intake context as synthetic assistant message
   * This ensures Claude sees uploaded document context without a visible chat message
   *
   * @param conversationId - Conversation to build context for
   * @param isRegenerate - Whether this is a regenerate request (adds retry context)
   */
  async build(
    conversationId: string,
    isRegenerate?: boolean
  ): Promise<ConversationContext> {
    // Get conversation to determine mode
    const conversation =
      await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const mode = conversation.mode || 'consult';

    // Load last 10 messages for context (MUST match ChatServer behavior)
    const history = await this.conversationService.getHistory(
      conversationId,
      10
    );

    // Format messages for Claude API (only user/assistant, skip system messages)
    // Also filter out empty messages (Claude API requires non-empty content)
    const messages: ClaudeMessage[] = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          typeof msg.content === 'string' ? msg.content : msg.content.text || '',
      }))
      .filter((msg) => msg.content.trim().length > 0);

    // Epic 17.3: Inject stored intake context(s) as synthetic assistant message
    // Query per-file contexts (sorted by parse time, oldest first)
    const filesWithContext =
      await this.fileRepository.findByConversationWithContext(conversationId);
    const contextsFromFiles = filesWithContext.filter((f) => f.intakeContext);

    // Get legacy context from conversation
    const legacyContext = conversation.context?.intakeContext;
    const legacyGapCategories = conversation.context?.intakeGapCategories;

    // Inject combined context message if any contexts exist
    if (contextsFromFiles.length > 0 || legacyContext) {
      const contextMessage =
        contextsFromFiles.length > 0
          ? this.formatMultiDocContextForClaude(
              contextsFromFiles,
              legacyContext,
              legacyGapCategories
            )
          : this.formatIntakeContextForClaude(
              legacyContext!,
              legacyGapCategories
            );

      // Prepend as first assistant message (Claude sees it, user doesn't)
      messages.unshift({
        role: 'assistant',
        content: contextMessage,
      });
    }

    // Get system prompt (and cache metadata) based on conversation mode
    // Always include tool instructions (tool-based trigger is now the only path)
    // Epic 33: Include web search instructions for consult mode
    const promptCache = this.promptCacheManager.ensureCached(mode, {
      includeToolInstructions: true,
      includeWebSearchInstructions: mode === 'consult',
    });

    // Story 24.1: Add retry context when regenerating to get different response
    let systemPrompt = promptCache.systemPrompt;
    if (isRegenerate) {
      systemPrompt = `${systemPrompt}\n\nIMPORTANT: The user has requested a different response. Please provide a fresh perspective with different wording, examples, or approach. Avoid repeating your previous answer.`;
    }

    return {
      messages,
      systemPrompt,
      mode,
      promptCache: {
        usePromptCache: promptCache.usePromptCache,
        cachedPromptId: promptCache.cachedPromptId,
      },
    };
  }

  /**
   * Format multiple document contexts as synthetic assistant message for Claude
   *
   * Epic 17.3: Multi-document support - aggregates context from all uploaded files
   * plus legacy context for backward compatibility.
   *
   * This is NOT displayed to users - it's injected into Claude's message history
   * so Claude "remembers" having analyzed all uploaded documents.
   */
  private formatMultiDocContextForClaude(
    files: FileWithIntakeContext[],
    legacyContext?: IntakeDocumentContext | null,
    legacyGapCategories?: string[] | null
  ): string {
    const parts: string[] = [
      `I have analyzed ${files.length} uploaded document(s) and extracted the following context:`,
    ];

    // Per-document summary
    // NOTE: Uses CHAT_CONTEXT_PROFILE for whitespace normalization (matches ChatServer.ts:227-234)
    files.forEach((file, i) => {
      const ctx = file.intakeContext!;
      parts.push(
        `\n**Document ${i + 1}: ${sanitizeForPrompt(file.filename, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })}**`
      );
      if (ctx.vendorName)
        parts.push(
          `- Vendor: ${sanitizeForPrompt(ctx.vendorName, CHAT_CONTEXT_PROFILE)}`
        );
      if (ctx.solutionName)
        parts.push(
          `- Solution: ${sanitizeForPrompt(ctx.solutionName, CHAT_CONTEXT_PROFILE)}`
        );
      if (ctx.solutionType)
        parts.push(
          `- Type: ${sanitizeForPrompt(ctx.solutionType, CHAT_CONTEXT_PROFILE)}`
        );
      if (ctx.industry)
        parts.push(
          `- Industry: ${sanitizeForPrompt(ctx.industry, CHAT_CONTEXT_PROFILE)}`
        );
    });

    // Include legacy context if present AND not duplicate
    if (
      legacyContext &&
      !files.some(
        (f) =>
          f.intakeContext?.vendorName === legacyContext.vendorName &&
          f.intakeContext?.solutionName === legacyContext.solutionName
      )
    ) {
      parts.push(`\n**Prior Document (legacy):**`);
      if (legacyContext.vendorName)
        parts.push(
          `- Vendor: ${sanitizeForPrompt(legacyContext.vendorName, CHAT_CONTEXT_PROFILE)}`
        );
      if (legacyContext.solutionName)
        parts.push(
          `- Solution: ${sanitizeForPrompt(legacyContext.solutionName, CHAT_CONTEXT_PROFILE)}`
        );
    }

    // Sprint 17.3 Fix: Sanitize BEFORE dedup (prevents distinct raw strings collapsing to same sanitized value)
    const allFeatures = [
      ...new Set(
        [
          ...files.flatMap((f) => f.intakeContext?.features || []),
          ...(legacyContext?.features || []),
        ]
          .map((f) =>
            sanitizeForPrompt(f, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
          )
          .filter(Boolean)
      ),
    ];

    const allClaims = [
      ...new Set(
        [
          ...files.flatMap((f) => f.intakeContext?.claims || []),
          ...(legacyContext?.claims || []),
        ]
          .map((c) =>
            sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
          )
          .filter(Boolean)
      ),
    ];

    const allCompliance = [
      ...new Set(
        [
          ...files.flatMap((f) => f.intakeContext?.complianceMentions || []),
          ...(legacyContext?.complianceMentions || []),
        ]
          .map((c) =>
            sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })
          )
          .filter(Boolean)
      ),
    ];

    const allGaps = [
      ...new Set(
        [
          ...files.flatMap((f) => f.intakeGapCategories || []),
          ...(legacyGapCategories || []),
        ]
          .map((g) =>
            sanitizeForPrompt(g, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })
          )
          .filter(Boolean)
      ),
    ];

    if (allFeatures.length > 0) {
      parts.push(
        `\n**Combined Features:** ${allFeatures.slice(0, 10).join(', ')}`
      );
    }
    if (allClaims.length > 0) {
      parts.push(`**Combined Claims:** ${allClaims.slice(0, 5).join(', ')}`);
    }
    if (allCompliance.length > 0) {
      parts.push(`**Compliance Mentions:** ${allCompliance.join(', ')}`);
    }
    if (allGaps.length > 0) {
      parts.push(`**Areas Needing Clarification:** ${allGaps.join(', ')}`);
    }

    parts.push('', 'I will use this combined context to assist with the assessment.');
    return parts.join('\n');
  }

  /**
   * Format stored intake context as synthetic assistant message for Claude
   *
   * Epic 16.6.1: This is NOT displayed to users - it's injected into Claude's message history
   * so Claude "remembers" having analyzed the uploaded document.
   *
   * Sprint 17.3 Fix: Now uses sanitizeForPrompt for security (matches multi-doc path)
   */
  private formatIntakeContextForClaude(
    ctx: IntakeDocumentContext,
    gapCategories?: string[]
  ): string {
    const parts: string[] = [
      'I have analyzed the uploaded document and extracted the following context:',
    ];

    // NOTE: Uses CHAT_CONTEXT_PROFILE for whitespace normalization (matches ChatServer.ts:227-234)
    if (ctx.vendorName)
      parts.push(
        `- Vendor: ${sanitizeForPrompt(ctx.vendorName, CHAT_CONTEXT_PROFILE)}`
      );
    if (ctx.solutionName)
      parts.push(
        `- Solution: ${sanitizeForPrompt(ctx.solutionName, CHAT_CONTEXT_PROFILE)}`
      );
    if (ctx.solutionType)
      parts.push(
        `- Type: ${sanitizeForPrompt(ctx.solutionType, CHAT_CONTEXT_PROFILE)}`
      );
    if (ctx.industry)
      parts.push(
        `- Industry: ${sanitizeForPrompt(ctx.industry, CHAT_CONTEXT_PROFILE)}`
      );
    if (ctx.features?.length) {
      const sanitizedFeatures = ctx.features
        .slice(0, 5)
        .map((f) =>
          sanitizeForPrompt(f, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
        )
        .filter(Boolean);
      if (sanitizedFeatures.length)
        parts.push(`- Key Features: ${sanitizedFeatures.join(', ')}`);
    }
    if (ctx.claims?.length) {
      const sanitizedClaims = ctx.claims
        .slice(0, 3)
        .map((c) =>
          sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
        )
        .filter(Boolean);
      if (sanitizedClaims.length)
        parts.push(`- Claims: ${sanitizedClaims.join(', ')}`);
    }
    if (ctx.complianceMentions?.length) {
      const sanitizedCompliance = ctx.complianceMentions
        .map((c) =>
          sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })
        )
        .filter(Boolean);
      if (sanitizedCompliance.length)
        parts.push(`- Compliance Mentions: ${sanitizedCompliance.join(', ')}`);
    }
    if (gapCategories?.length) {
      const sanitizedGaps = gapCategories
        .map((g) =>
          sanitizeForPrompt(g, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })
        )
        .filter(Boolean);
      if (sanitizedGaps.length)
        parts.push(`- Areas Needing Clarification: ${sanitizedGaps.join(', ')}`);
    }

    parts.push('', 'I will use this context to assist with the assessment.');
    return parts.join('\n');
  }
}
