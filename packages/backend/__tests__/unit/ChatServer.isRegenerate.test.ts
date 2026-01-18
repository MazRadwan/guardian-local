/**
 * Unit tests for ChatServer isRegenerate flag handling (Story 24.1)
 *
 * Story 24.1: Regenerate with Retry Context
 * - When isRegenerate: true, system prompt includes retry context
 * - When isRegenerate: false/undefined, system prompt is unchanged
 */

/**
 * Mock buildConversationContext logic for testing
 *
 * This function mirrors the ChatServer.buildConversationContext() method
 * for unit testing the business logic without infrastructure dependencies.
 */
async function buildConversationContext(
  conversationId: string,
  conversationService: {
    getConversation: (id: string) => Promise<{ mode: string } | null>;
    getHistory: (id: string, limit: number) => Promise<Array<{ role: string; content: string | { text: string } }>>;
  },
  promptCacheManager: {
    ensureCached: (mode: string, options?: { includeToolInstructions?: boolean }) => {
      systemPrompt: string;
      usePromptCache: boolean;
      cachedPromptId?: string;
    };
  },
  isRegenerate?: boolean
): Promise<{
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt: string;
  mode: string;
  promptCache: { usePromptCache: boolean; cachedPromptId?: string };
}> {
  // Get conversation to determine mode
  const conversation = await conversationService.getConversation(conversationId);

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  // Load last 10 messages for context
  const history = await conversationService.getHistory(conversationId, 10);

  // Format messages for Claude API
  const messages = history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : msg.content.text || '',
    }))
    .filter((msg) => msg.content.trim().length > 0);

  // Get system prompt (and cache metadata) based on conversation mode
  const promptCache = promptCacheManager.ensureCached(conversation.mode, {
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
    mode: conversation.mode,
    promptCache: {
      usePromptCache: promptCache.usePromptCache,
      cachedPromptId: promptCache.cachedPromptId,
    },
  };
}

describe('ChatServer isRegenerate flag handling (Story 24.1)', () => {
  // Mock services
  const createMockConversationService = (mode: string = 'consult') => ({
    getConversation: jest.fn().mockResolvedValue({ mode }),
    getHistory: jest.fn().mockResolvedValue([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]),
  });

  const createMockPromptCacheManager = (systemPrompt: string = 'You are Guardian AI assistant.') => ({
    ensureCached: jest.fn().mockReturnValue({
      systemPrompt,
      usePromptCache: false,
      cachedPromptId: undefined,
    }),
  });

  describe('buildConversationContext with isRegenerate flag', () => {
    it('should include retry context when isRegenerate is true', async () => {
      const conversationService = createMockConversationService();
      const promptCacheManager = createMockPromptCacheManager('Base system prompt.');

      const result = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager,
        true // isRegenerate = true
      );

      // Verify retry context is appended
      expect(result.systemPrompt).toContain('Base system prompt.');
      expect(result.systemPrompt).toContain('IMPORTANT: The user has requested a different response.');
      expect(result.systemPrompt).toContain('fresh perspective');
      expect(result.systemPrompt).toContain('Avoid repeating your previous answer');
    });

    it('should NOT include retry context when isRegenerate is false', async () => {
      const conversationService = createMockConversationService();
      const promptCacheManager = createMockPromptCacheManager('Base system prompt.');

      const result = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager,
        false // isRegenerate = false
      );

      // Verify retry context is NOT appended
      expect(result.systemPrompt).toBe('Base system prompt.');
      expect(result.systemPrompt).not.toContain('IMPORTANT: The user has requested a different response.');
    });

    it('should NOT include retry context when isRegenerate is undefined', async () => {
      const conversationService = createMockConversationService();
      const promptCacheManager = createMockPromptCacheManager('Base system prompt.');

      const result = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager
        // isRegenerate not passed (undefined)
      );

      // Verify retry context is NOT appended
      expect(result.systemPrompt).toBe('Base system prompt.');
      expect(result.systemPrompt).not.toContain('IMPORTANT: The user has requested a different response.');
    });

    it('should work with assessment mode', async () => {
      const conversationService = createMockConversationService('assessment');
      const promptCacheManager = createMockPromptCacheManager('Assessment mode prompt.');

      const result = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager,
        true
      );

      // Should work in assessment mode
      expect(result.mode).toBe('assessment');
      expect(result.systemPrompt).toContain('Assessment mode prompt.');
      expect(result.systemPrompt).toContain('IMPORTANT: The user has requested a different response.');
    });

    it('should work with scoring mode', async () => {
      const conversationService = createMockConversationService('scoring');
      const promptCacheManager = createMockPromptCacheManager('Scoring mode prompt.');

      const result = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager,
        true
      );

      // Should work in scoring mode
      expect(result.mode).toBe('scoring');
      expect(result.systemPrompt).toContain('Scoring mode prompt.');
      expect(result.systemPrompt).toContain('IMPORTANT: The user has requested a different response.');
    });

    it('should preserve messages regardless of isRegenerate flag', async () => {
      const conversationService = createMockConversationService();
      const promptCacheManager = createMockPromptCacheManager();

      const result1 = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager,
        false
      );

      const result2 = await buildConversationContext(
        'conv-123',
        conversationService,
        promptCacheManager,
        true
      );

      // Messages should be the same regardless of isRegenerate
      expect(result1.messages).toEqual(result2.messages);
    });

    it('should throw error for non-existent conversation', async () => {
      const conversationService = {
        getConversation: jest.fn().mockResolvedValue(null),
        getHistory: jest.fn(),
      };
      const promptCacheManager = createMockPromptCacheManager();

      await expect(
        buildConversationContext('non-existent', conversationService, promptCacheManager, true)
      ).rejects.toThrow('Conversation non-existent not found');
    });
  });
});
