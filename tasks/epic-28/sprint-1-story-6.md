# Story 28.2.1: Extract ConversationContextBuilder.ts

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract `buildConversationContext()` and related methods from ChatServer.ts into a dedicated `ConversationContextBuilder` class. This handles loading conversation history, selecting system prompts, injecting intake context, and managing prompt cache.

---

## Acceptance Criteria

- [ ] `ConversationContextBuilder.ts` created at `infrastructure/websocket/context/ConversationContextBuilder.ts`
- [ ] Contains `build()` method returning `ConversationContext`
- [ ] **History limit: 10 messages** (matches ChatServer.ts:166)
- [ ] **Empty message filtering** - filter out messages with empty content (Claude API requires non-empty)
- [ ] **Intake context injection** - inject stored intake context as synthetic assistant message
  - Multi-doc: `formatMultiDocContextForClaude()` when multiple files have context
  - Legacy: `formatIntakeContextForClaude()` for backward compat
- [ ] **PromptCacheManager integration** - use `ensureCached(mode, { includeToolInstructions: true })`
- [ ] **Correct return fields**: `messages`, `systemPrompt`, `mode`, `promptCache: { usePromptCache, cachedPromptId }`
- [ ] Unit tests cover all modes (consult, assessment, scoring)
- [ ] Unit tests cover intake context injection (multi-doc, legacy, none)
- [ ] ChatServer.ts continues to compile

---

## Technical Approach

```typescript
// infrastructure/websocket/context/ConversationContextBuilder.ts

import { ConversationService } from '../../../application/services/ConversationService';
import { PromptCacheManager } from '../../ai/PromptCacheManager';
import type { IFileRepository, FileWithIntakeContext } from '../../../application/interfaces/IFileRepository';
import type { ClaudeMessage } from '../../../application/interfaces/IClaudeClient';
import type { IntakeDocumentContext } from '../../../domain/entities/Conversation';
import { sanitizeForPrompt, CHAT_CONTEXT_PROFILE } from '../../../utils/sanitize';

/**
 * IMPORTANT: ChatServer.ts:227-234 uses a private sanitizeForPrompt that:
 * - Removes control chars ([\x00-\x1F\x7F])
 * - Normalizes whitespace (\s+ -> single space)
 * - Trims
 * - Truncates to maxLength (default 200)
 *
 * The utility sanitizeForPrompt should use CHAT_CONTEXT_PROFILE (from Story 28.1.3)
 * which includes normalizeWhitespace: true to match this behavior.
 *
 * Call pattern: sanitizeForPrompt(str, { ...CHAT_CONTEXT_PROFILE, maxLength: X })
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
  async build(conversationId: string, isRegenerate?: boolean): Promise<ConversationContext> {
    // Get conversation to determine mode
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const mode = conversation.mode || 'consult';

    // Load last 10 messages for context (MUST match ChatServer behavior)
    const history = await this.conversationService.getHistory(conversationId, 10);

    // Format messages for Claude API (only user/assistant, skip system messages)
    // Also filter out empty messages (Claude API requires non-empty content)
    const messages: ClaudeMessage[] = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content.text || '',
      }))
      .filter((msg) => msg.content.trim().length > 0);

    // Epic 17.3: Inject stored intake context(s) as synthetic assistant message
    // Query per-file contexts (sorted by parse time, oldest first)
    const filesWithContext = await this.fileRepository.findByConversationWithContext(conversationId);
    const contextsFromFiles = filesWithContext.filter(f => f.intakeContext);

    // Get legacy context from conversation
    const legacyContext = conversation.context?.intakeContext;
    const legacyGapCategories = conversation.context?.intakeGapCategories;

    // Inject combined context message if any contexts exist
    if (contextsFromFiles.length > 0 || legacyContext) {
      const contextMessage = contextsFromFiles.length > 0
        ? this.formatMultiDocContextForClaude(contextsFromFiles, legacyContext, legacyGapCategories)
        : this.formatIntakeContextForClaude(legacyContext!, legacyGapCategories);

      // Prepend as first assistant message (Claude sees it, user doesn't)
      messages.unshift({
        role: 'assistant',
        content: contextMessage,
      });
    }

    // Get system prompt (and cache metadata) based on conversation mode
    // Always include tool instructions (tool-based trigger is now the only path)
    const promptCache = this.promptCacheManager.ensureCached(mode, {
      includeToolInstructions: true,
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
      parts.push(`\n**Document ${i + 1}: ${sanitizeForPrompt(file.filename, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })}**`);
      if (ctx.vendorName) parts.push(`- Vendor: ${sanitizeForPrompt(ctx.vendorName, CHAT_CONTEXT_PROFILE)}`);
      if (ctx.solutionName) parts.push(`- Solution: ${sanitizeForPrompt(ctx.solutionName, CHAT_CONTEXT_PROFILE)}`);
      if (ctx.solutionType) parts.push(`- Type: ${sanitizeForPrompt(ctx.solutionType, CHAT_CONTEXT_PROFILE)}`);
      if (ctx.industry) parts.push(`- Industry: ${sanitizeForPrompt(ctx.industry, CHAT_CONTEXT_PROFILE)}`);
    });

    // Include legacy context if present AND not duplicate
    if (legacyContext && !files.some(f =>
      f.intakeContext?.vendorName === legacyContext.vendorName &&
      f.intakeContext?.solutionName === legacyContext.solutionName
    )) {
      parts.push(`\n**Prior Document (legacy):**`);
      if (legacyContext.vendorName) parts.push(`- Vendor: ${sanitizeForPrompt(legacyContext.vendorName, CHAT_CONTEXT_PROFILE)}`);
      if (legacyContext.solutionName) parts.push(`- Solution: ${sanitizeForPrompt(legacyContext.solutionName, CHAT_CONTEXT_PROFILE)}`);
    }

    // Aggregate features, claims, compliance, gaps (with dedup)
    // NOTE: Uses CHAT_CONTEXT_PROFILE for whitespace normalization
    const allFeatures = [...new Set(
      [
        ...files.flatMap(f => f.intakeContext?.features || []),
        ...(legacyContext?.features || []),
      ].map(f => sanitizeForPrompt(f, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })).filter(Boolean)
    )];

    const allClaims = [...new Set(
      [
        ...files.flatMap(f => f.intakeContext?.claims || []),
        ...(legacyContext?.claims || []),
      ].map(c => sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })).filter(Boolean)
    )];

    const allCompliance = [...new Set(
      [
        ...files.flatMap(f => f.intakeContext?.complianceMentions || []),
        ...(legacyContext?.complianceMentions || []),
      ].map(c => sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })).filter(Boolean)
    )];

    const allGaps = [...new Set(
      [
        ...files.flatMap(f => f.intakeGapCategories || []),
        ...(legacyGapCategories || []),
      ].map(g => sanitizeForPrompt(g, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })).filter(Boolean)
    )];

    if (allFeatures.length > 0) {
      parts.push(`\n**Combined Features:** ${allFeatures.slice(0, 10).join(', ')}`);
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
   */
  private formatIntakeContextForClaude(
    ctx: IntakeDocumentContext,
    gapCategories?: string[]
  ): string {
    const parts: string[] = [
      'I have analyzed the uploaded document and extracted the following context:',
    ];

    // NOTE: Uses CHAT_CONTEXT_PROFILE for whitespace normalization (matches ChatServer.ts:227-234)
    if (ctx.vendorName) parts.push(`- Vendor: ${sanitizeForPrompt(ctx.vendorName, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.solutionName) parts.push(`- Solution: ${sanitizeForPrompt(ctx.solutionName, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.solutionType) parts.push(`- Type: ${sanitizeForPrompt(ctx.solutionType, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.industry) parts.push(`- Industry: ${sanitizeForPrompt(ctx.industry, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.features?.length) {
      const sanitizedFeatures = ctx.features.slice(0, 5).map(f => sanitizeForPrompt(f, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })).filter(Boolean);
      if (sanitizedFeatures.length) parts.push(`- Key Features: ${sanitizedFeatures.join(', ')}`);
    }
    if (ctx.claims?.length) {
      const sanitizedClaims = ctx.claims.slice(0, 3).map(c => sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })).filter(Boolean);
      if (sanitizedClaims.length) parts.push(`- Claims: ${sanitizedClaims.join(', ')}`);
    }
    if (ctx.complianceMentions?.length) {
      const sanitizedCompliance = ctx.complianceMentions.map(c => sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })).filter(Boolean);
      if (sanitizedCompliance.length) parts.push(`- Compliance Mentions: ${sanitizedCompliance.join(', ')}`);
    }
    if (gapCategories?.length) {
      const sanitizedGaps = gapCategories.map(g => sanitizeForPrompt(g, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })).filter(Boolean);
      if (sanitizedGaps.length) parts.push(`- Areas Needing Clarification: ${sanitizedGaps.join(', ')}`);
    }

    parts.push('', 'I will use this context to assist with the assessment.');
    return parts.join('\n');
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/context/ConversationContextBuilder.ts` - Create new file
- `packages/backend/__tests__/unit/infrastructure/websocket/context/ConversationContextBuilder.test.ts` - Create unit tests

---

## Tests Required

```typescript
describe('ConversationContextBuilder', () => {
  let builder: ConversationContextBuilder;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockPromptCacheManager: jest.Mocked<PromptCacheManager>;
  let mockFileRepository: jest.Mocked<IFileRepository>;

  beforeEach(() => {
    mockConversationService = {
      getConversation: jest.fn(),
      getHistory: jest.fn(),
    } as any;
    mockPromptCacheManager = {
      ensureCached: jest.fn().mockReturnValue({
        systemPrompt: 'You are Guardian...',
        usePromptCache: false,
        cachedPromptId: undefined,
      }),
    } as any;
    mockFileRepository = {
      findByConversationWithContext: jest.fn().mockResolvedValue([]),
    } as any;
    builder = new ConversationContextBuilder(
      mockConversationService,
      mockPromptCacheManager,
      mockFileRepository
    );
  });

  describe('build()', () => {
    it('should load last 10 messages (history limit)', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
        { role: 'assistant', content: { text: 'Hi!' } },
      ]);

      await builder.build('conv-123');

      expect(mockConversationService.getHistory).toHaveBeenCalledWith('conv-123', 10);
    });

    it('should filter out empty messages', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
        { role: 'assistant', content: { text: '' } },  // Empty - should be filtered
        { role: 'assistant', content: { text: '  ' } }, // Whitespace only - should be filtered
        { role: 'user', content: { text: 'Question' } },
      ]);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(2);
      expect(context.messages[0].content).toBe('Hello');
      expect(context.messages[1].content).toBe('Question');
    });

    it('should filter out system messages', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
        { role: 'system', content: { text: 'System message' } }, // Should be filtered
        { role: 'assistant', content: { text: 'Hi!' } },
      ]);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(2);
    });

    it('should use ensureCached with includeToolInstructions: true', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'assessment' });
      mockConversationService.getHistory.mockResolvedValue([]);

      await builder.build('conv-123');

      expect(mockPromptCacheManager.ensureCached).toHaveBeenCalledWith('assessment', {
        includeToolInstructions: true,
      });
    });

    it('should add retry context for regenerate requests', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123', true);

      expect(context.systemPrompt).toContain('IMPORTANT: The user has requested a different response');
    });

    it('should return correct promptCache fields', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([]);
      mockPromptCacheManager.ensureCached.mockReturnValue({
        systemPrompt: 'Test prompt',
        usePromptCache: true,
        cachedPromptId: 'cache-123',
      });

      const context = await builder.build('conv-123');

      expect(context.promptCache).toEqual({
        usePromptCache: true,
        cachedPromptId: 'cache-123',
      });
    });

    it('should throw if conversation not found', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await expect(builder.build('invalid')).rejects.toThrow('not found');
    });
  });

  describe('intake context injection', () => {
    it('should inject multi-doc context as synthetic assistant message', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
      ]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          filename: 'doc1.pdf',
          intakeContext: { vendorName: 'Acme', solutionName: 'AI Tool' },
        },
        {
          id: 'file-2',
          filename: 'doc2.pdf',
          intakeContext: { vendorName: 'Beta', solutionName: 'ML Platform' },
        },
      ]);

      const context = await builder.build('conv-123');

      // Synthetic message should be prepended
      expect(context.messages[0].role).toBe('assistant');
      expect(context.messages[0].content).toContain('analyzed 2 uploaded document');
      expect(context.messages[0].content).toContain('Acme');
      expect(context.messages[0].content).toContain('Beta');
    });

    it('should inject legacy context when no per-file context exists', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: { vendorName: 'Legacy Vendor', solutionName: 'Legacy Solution' },
          intakeGapCategories: ['Data Privacy'],
        },
      });
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.messages[0].role).toBe('assistant');
      expect(context.messages[0].content).toContain('Legacy Vendor');
      expect(context.messages[0].content).toContain('Areas Needing Clarification');
    });

    it('should not inject context when none exists', async () => {
      mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
      ]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].content).toBe('Hello');
    });
  });
});
```

---

## Definition of Done

- [ ] ConversationContextBuilder.ts created with full intake context injection
- [ ] History limit of 10 messages preserved
- [ ] Empty message filtering preserved
- [ ] PromptCacheManager.ensureCached() integration working
- [ ] Unit tests written and passing
- [ ] TypeScript compiles without errors
- [ ] No changes to ChatServer behavior yet
