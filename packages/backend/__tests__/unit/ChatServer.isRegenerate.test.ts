/**
 * Unit tests for ChatServer isRegenerate flag handling (Story 24.1)
 *
 * Story 24.1: Regenerate with Retry Context
 * - When isRegenerate: true, system prompt includes retry context
 * - When isRegenerate: false/undefined, system prompt is unchanged
 *
 * Epic 34: Regeneration deletes old assistant message
 * - When isRegenerate: true, old assistant message is deleted from DB before context build
 * - Prevents stale tool_use/tool_result blocks from polluting Claude's context
 * - Normal messages are NOT deleted
 * - If last message is user (edge case), nothing is deleted
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

  /**
   * Epic 34: Regeneration deletes old assistant message before context build
   *
   * This mirrors the logic in ChatServer.handleSendMessage() where isRegenerate: true
   * triggers deletion of the last assistant message so Claude gets clean context
   * without stale tool_use/tool_result blocks.
   *
   * This was the root cause of the regeneration bug: search results from the first
   * response leaked into the regenerated context, causing Claude to skip re-searching.
   */
  describe('regeneration deletes old assistant message (Epic 34)', () => {
    /**
     * Mirrors the regeneration logic in ChatServer.handleSendMessage():
     * 1. Get last message from history
     * 2. If it's an assistant message, delete it
     * 3. Then build context (which now gets clean history)
     */
    async function handleRegenerateCleanup(
      conversationService: {
        getHistory: (id: string, limit: number, offset: number) => Promise<Array<{ id: string; role: string; content: string }>>;
        deleteMessage: (id: string) => Promise<void>;
      },
      conversationId: string,
      isRegenerate: boolean
    ): Promise<{ deletedMessageId: string | null }> {
      if (!isRegenerate) {
        return { deletedMessageId: null };
      }

      const history = await conversationService.getHistory(conversationId, 1, 0);
      const lastMsg = history[0];
      if (lastMsg?.role === 'assistant') {
        await conversationService.deleteMessage(lastMsg.id);
        return { deletedMessageId: lastMsg.id };
      }

      return { deletedMessageId: null };
    }

    it('should delete old assistant message when isRegenerate is true', async () => {
      const conversationService = {
        getHistory: jest.fn().mockResolvedValue([
          { id: 'msg-assistant-1', role: 'assistant', content: 'Old response with search results' },
        ]),
        deleteMessage: jest.fn().mockResolvedValue(undefined),
      };

      const result = await handleRegenerateCleanup(conversationService, 'conv-123', true);

      expect(conversationService.getHistory).toHaveBeenCalledWith('conv-123', 1, 0);
      expect(conversationService.deleteMessage).toHaveBeenCalledWith('msg-assistant-1');
      expect(result.deletedMessageId).toBe('msg-assistant-1');
    });

    it('should NOT delete any message when isRegenerate is false', async () => {
      const conversationService = {
        getHistory: jest.fn(),
        deleteMessage: jest.fn(),
      };

      const result = await handleRegenerateCleanup(conversationService, 'conv-123', false);

      expect(conversationService.getHistory).not.toHaveBeenCalled();
      expect(conversationService.deleteMessage).not.toHaveBeenCalled();
      expect(result.deletedMessageId).toBeNull();
    });

    it('should NOT delete if last message is from user (edge case)', async () => {
      const conversationService = {
        getHistory: jest.fn().mockResolvedValue([
          { id: 'msg-user-1', role: 'user', content: 'User message' },
        ]),
        deleteMessage: jest.fn(),
      };

      const result = await handleRegenerateCleanup(conversationService, 'conv-123', true);

      expect(conversationService.getHistory).toHaveBeenCalledWith('conv-123', 1, 0);
      expect(conversationService.deleteMessage).not.toHaveBeenCalled();
      expect(result.deletedMessageId).toBeNull();
    });

    it('should handle empty history gracefully', async () => {
      const conversationService = {
        getHistory: jest.fn().mockResolvedValue([]),
        deleteMessage: jest.fn(),
      };

      const result = await handleRegenerateCleanup(conversationService, 'conv-123', true);

      expect(conversationService.getHistory).toHaveBeenCalledWith('conv-123', 1, 0);
      expect(conversationService.deleteMessage).not.toHaveBeenCalled();
      expect(result.deletedMessageId).toBeNull();
    });

    it('should delete assistant message containing tool_use blocks (the actual bug)', async () => {
      // This is the exact scenario that broke regeneration:
      // Claude returned a response with web_search tool_use, and on regenerate
      // the stale tool_result leaked into context, causing Claude to skip re-searching
      const conversationService = {
        getHistory: jest.fn().mockResolvedValue([
          {
            id: 'msg-with-tools',
            role: 'assistant',
            content: 'Searching for NIST CSF updates...\n\n[tool_use: web_search]\n\nHere are the results...',
          },
        ]),
        deleteMessage: jest.fn().mockResolvedValue(undefined),
      };

      const result = await handleRegenerateCleanup(conversationService, 'conv-123', true);

      expect(conversationService.deleteMessage).toHaveBeenCalledWith('msg-with-tools');
      expect(result.deletedMessageId).toBe('msg-with-tools');
    });
  });
});
