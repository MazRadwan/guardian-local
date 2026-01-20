# Story 28.2.1: Extract ConversationContextBuilder.ts

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract `buildConversationContext()` and related methods from ChatServer.ts into a dedicated `ConversationContextBuilder` class. This handles loading conversation history, selecting system prompts, and managing prompt cache.

---

## Acceptance Criteria

- [ ] `ConversationContextBuilder.ts` created at `infrastructure/websocket/context/ConversationContextBuilder.ts`
- [ ] Contains `build()` method returning `ConversationContext`
- [ ] Handles system prompt selection based on mode
- [ ] Integrates with PromptCacheManager
- [ ] Unit tests cover all modes (consult, assessment, scoring)
- [ ] ChatServer.ts continues to compile

---

## Technical Approach

```typescript
// infrastructure/websocket/context/ConversationContextBuilder.ts

import { ConversationService } from '../../../application/services/ConversationService';
import { PromptCacheManager } from '../../../application/services/PromptCacheManager';
import { IFileRepository } from '../../../application/interfaces/IFileRepository';
import { ClaudeMessage } from '../../../application/interfaces/IClaudeClient';

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
    private readonly promptCacheManager: PromptCacheManager
  ) {}

  /**
   * Build conversation context for Claude API call
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

    // Load message history
    const history = await this.conversationService.getHistory(conversationId);
    const messages = this.formatMessagesForClaude(history);

    // Select system prompt based on mode
    let systemPrompt = this.getSystemPromptForMode(mode);

    // Add retry context if regenerating
    if (isRegenerate) {
      systemPrompt += '\n\n[Note: The user has requested you regenerate your previous response. Please provide a fresh, alternative answer.]';
    }

    // Get prompt cache info
    const promptCache = this.promptCacheManager.getCacheInfo(conversationId);

    return {
      messages,
      systemPrompt,
      mode,
      promptCache,
    };
  }

  private formatMessagesForClaude(history: Array<{ role: string; content: { text: string } }>): ClaudeMessage[] {
    return history
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content.text,
      }));
  }

  private getSystemPromptForMode(mode: 'consult' | 'assessment' | 'scoring'): string {
    // These would typically come from a config or prompt service
    const prompts: Record<string, string> = {
      consult: 'You are Guardian, an AI assistant helping healthcare organizations assess AI vendors...',
      assessment: 'You are Guardian in Assessment mode. Help the user evaluate AI vendor solutions...',
      scoring: 'You are Guardian in Scoring mode. Analyze completed vendor questionnaires...',
    };
    return prompts[mode] || prompts.consult;
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

  beforeEach(() => {
    mockConversationService = {
      getConversation: jest.fn(),
      getHistory: jest.fn(),
    } as any;
    mockPromptCacheManager = {
      getCacheInfo: jest.fn().mockReturnValue({ usePromptCache: false }),
    } as any;
    builder = new ConversationContextBuilder(mockConversationService, mockPromptCacheManager);
  });

  it('should build context for consult mode', async () => {
    mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
    mockConversationService.getHistory.mockResolvedValue([
      { role: 'user', content: { text: 'Hello' } },
      { role: 'assistant', content: { text: 'Hi!' } },
    ]);

    const context = await builder.build('conv-123');

    expect(context.mode).toBe('consult');
    expect(context.messages).toHaveLength(2);
    expect(context.systemPrompt).toContain('Guardian');
  });

  it('should add retry context for regenerate requests', async () => {
    mockConversationService.getConversation.mockResolvedValue({ mode: 'consult' });
    mockConversationService.getHistory.mockResolvedValue([]);

    const context = await builder.build('conv-123', true);

    expect(context.systemPrompt).toContain('regenerate');
  });

  it('should throw if conversation not found', async () => {
    mockConversationService.getConversation.mockResolvedValue(null);

    await expect(builder.build('invalid')).rejects.toThrow('not found');
  });
});
```

---

## Definition of Done

- [ ] ConversationContextBuilder.ts created
- [ ] Unit tests written and passing
- [ ] TypeScript compiles without errors
- [ ] No changes to ChatServer behavior yet
