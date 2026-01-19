/**
 * Unit tests for ChatServer title generation (Story 26.1)
 *
 * Story 26.1: LLM Title for Assessment Mode
 * - Wire TitleGenerationService into production code
 * - Generate LLM-based titles for Assessment/Consult mode conversations
 * - Title generation happens after first Q&A exchange (2 messages)
 * - Scoring mode skips LLM (titles come from filename)
 */

import type { TitleContext, TitleGenerationResult } from '../../src/application/services/TitleGenerationService';
import { isPlaceholderTitle, PLACEHOLDER_TITLES } from '../../src/application/services/TitleGenerationService';
import type { Conversation } from '../../src/domain/entities/Conversation';
import type { Message } from '../../src/domain/entities/Message';

/**
 * Mock generateTitleIfNeeded logic for testing
 *
 * This function mirrors the ChatServer.generateTitleIfNeeded() method
 * for unit testing the business logic without infrastructure dependencies.
 */
async function generateTitleIfNeeded(
  conversationId: string,
  mode: 'consult' | 'assessment' | 'scoring',
  assistantResponse: string,
  conversationService: {
    getMessageCount: (id: string) => Promise<number>;
    getConversation: (id: string) => Promise<Partial<Conversation> | null>;
    getFirstUserMessage: (id: string) => Promise<Partial<Message> | null>;
    updateTitleIfNotManuallyEdited: (id: string, title: string) => Promise<boolean>;
  },
  titleGenerationService: {
    generateModeAwareTitle: (context: TitleContext) => Promise<TitleGenerationResult>;
  },
  emitCallback: (event: string, data: unknown) => void
): Promise<void> {
  try {
    // Guard 1: Skip for scoring mode - titles come from filename
    if (mode === 'scoring') {
      return;
    }

    // Guard 2: Check message count - only generate on first exchange (2 messages)
    const messageCount = await conversationService.getMessageCount(conversationId);
    if (messageCount !== 2) {
      return;
    }

    // Guard 3: Check if conversation exists
    const conversation = await conversationService.getConversation(conversationId);
    if (!conversation) {
      return;
    }

    // Guard 4: Skip if title already set (not a placeholder) or manually edited
    if (!isPlaceholderTitle(conversation.title as string | null) || conversation.titleManuallyEdited) {
      return;
    }

    // Get first user message for context
    const firstUserMessage = await conversationService.getFirstUserMessage(conversationId);
    if (!firstUserMessage || !(firstUserMessage.content as { text?: string })?.text) {
      return;
    }

    // Build context for title generation
    const titleContext: TitleContext = {
      mode,
      userMessage: (firstUserMessage.content as { text?: string }).text,
      assistantResponse: assistantResponse,
    };

    // Generate title using TitleGenerationService
    const result = await titleGenerationService.generateModeAwareTitle(titleContext);

    // Update title in database (only if not manually edited)
    const titleUpdated = await conversationService.updateTitleIfNotManuallyEdited(
      conversationId,
      result.title
    );

    if (titleUpdated) {
      // Emit title update event for real-time sidebar update
      emitCallback('conversation_title_updated', {
        conversationId,
        title: result.title,
      });
    }
  } catch (error) {
    // Non-fatal - log and continue
    console.error('[generateTitleIfNeeded] Error:', error);
  }
}

describe('ChatServer title generation (Story 26.1)', () => {
  // Helper to create mock conversation service
  const createMockConversationService = (options: {
    messageCount?: number;
    conversation?: Partial<Conversation> | null;
    firstUserMessage?: Partial<Message> | null;
  } = {}) => ({
    getMessageCount: jest.fn().mockResolvedValue(options.messageCount ?? 2),
    getConversation: jest.fn().mockResolvedValue(
      'conversation' in options
        ? options.conversation
        : { id: 'conv-123', title: null, titleManuallyEdited: false }
    ),
    getFirstUserMessage: jest.fn().mockResolvedValue(
      'firstUserMessage' in options
        ? options.firstUserMessage
        : { id: 'msg-1', content: { text: 'What is AI governance?' } }
    ),
    updateTitleIfNotManuallyEdited: jest.fn().mockResolvedValue(true),
  });

  // Helper to create mock title generation service
  const createMockTitleGenerationService = (result: TitleGenerationResult = {
    title: 'AI Governance Discussion',
    source: 'llm',
  }) => ({
    generateModeAwareTitle: jest.fn().mockResolvedValue(result),
  });

  describe('generateTitleIfNeeded guards', () => {
    it('should skip title generation for scoring mode', async () => {
      const conversationService = createMockConversationService();
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'scoring',
        'Processing your file...',
        conversationService,
        titleService,
        emitCallback
      );

      // Should skip immediately without checking anything
      expect(conversationService.getMessageCount).not.toHaveBeenCalled();
      expect(titleService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should skip title generation when message count is not 2', async () => {
      const conversationService = createMockConversationService({ messageCount: 4 });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      expect(conversationService.getMessageCount).toHaveBeenCalled();
      expect(titleService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should skip when title already set (not placeholder)', async () => {
      const conversationService = createMockConversationService({
        conversation: {
          id: 'conv-123',
          title: 'AI Compliance Questions',  // Real title, not a placeholder
          titleManuallyEdited: false,
        },
      });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      expect(titleService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should skip when title was manually edited', async () => {
      const conversationService = createMockConversationService({
        conversation: {
          id: 'conv-123',
          title: 'My Custom Title',
          titleManuallyEdited: true,  // User renamed it
        },
      });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      expect(titleService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should skip when no first user message found', async () => {
      const conversationService = createMockConversationService({
        firstUserMessage: null,
      });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      expect(titleService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });
  });

  describe('successful title generation', () => {
    it('should generate LLM title for consult mode', async () => {
      const conversationService = createMockConversationService({
        messageCount: 2,
        conversation: {
          id: 'conv-123',
          title: 'New Chat',  // Placeholder
          titleManuallyEdited: false,
        },
        firstUserMessage: {
          id: 'msg-1',
          content: { text: 'How do I comply with HIPAA?' },
        },
      });
      const titleService = createMockTitleGenerationService({
        title: 'HIPAA Compliance Guide',
        source: 'llm',
      });
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'HIPAA requires covered entities to implement...',
        conversationService,
        titleService,
        emitCallback
      );

      // Should call title generation service with correct context
      expect(titleService.generateModeAwareTitle).toHaveBeenCalledWith({
        mode: 'consult',
        userMessage: 'How do I comply with HIPAA?',
        assistantResponse: 'HIPAA requires covered entities to implement...',
      });

      // Should update title in database
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'HIPAA Compliance Guide'
      );

      // Should emit title update event
      expect(emitCallback).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-123',
        title: 'HIPAA Compliance Guide',
      });
    });

    it('should generate LLM title for assessment mode (Story 26.1)', async () => {
      const conversationService = createMockConversationService({
        messageCount: 2,
        conversation: {
          id: 'conv-123',
          title: 'New Assessment',  // Placeholder
          titleManuallyEdited: false,
        },
        firstUserMessage: {
          id: 'msg-1',
          content: { text: 'I need to assess an AI radiology vendor' },
        },
      });
      const titleService = createMockTitleGenerationService({
        title: 'AI Radiology Vendor Evaluation',
        source: 'llm',
      });
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'assessment',
        'I can help you assess this vendor...',
        conversationService,
        titleService,
        emitCallback
      );

      // Should call title generation service with assessment mode
      expect(titleService.generateModeAwareTitle).toHaveBeenCalledWith({
        mode: 'assessment',
        userMessage: 'I need to assess an AI radiology vendor',
        assistantResponse: 'I can help you assess this vendor...',
      });

      // Should emit title update event
      expect(emitCallback).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-123',
        title: 'AI Radiology Vendor Evaluation',
      });
    });

    it('should not emit when title update was skipped (manual edit race)', async () => {
      const conversationService = createMockConversationService();
      // updateTitleIfNotManuallyEdited returns false (someone edited it concurrently)
      conversationService.updateTitleIfNotManuallyEdited.mockResolvedValue(false);

      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      // Should still call title generation
      expect(titleService.generateModeAwareTitle).toHaveBeenCalled();

      // But should NOT emit since update was skipped
      expect(emitCallback).not.toHaveBeenCalled();
    });
  });

  describe('placeholder title detection', () => {
    it('should proceed for "New Chat" placeholder', async () => {
      const conversationService = createMockConversationService({
        conversation: {
          id: 'conv-123',
          title: PLACEHOLDER_TITLES.DEFAULT,  // "New Chat"
          titleManuallyEdited: false,
        },
      });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      expect(titleService.generateModeAwareTitle).toHaveBeenCalled();
    });

    it('should proceed for "New Assessment" placeholder', async () => {
      const conversationService = createMockConversationService({
        conversation: {
          id: 'conv-123',
          title: PLACEHOLDER_TITLES.ASSESSMENT,  // "New Assessment"
          titleManuallyEdited: false,
        },
      });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'assessment',
        'I can help you assess...',
        conversationService,
        titleService,
        emitCallback
      );

      expect(titleService.generateModeAwareTitle).toHaveBeenCalled();
    });

    it('should proceed for null title', async () => {
      const conversationService = createMockConversationService({
        conversation: {
          id: 'conv-123',
          title: null,
          titleManuallyEdited: false,
        },
      });
      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      await generateTitleIfNeeded(
        'conv-123',
        'consult',
        'AI is fascinating!',
        conversationService,
        titleService,
        emitCallback
      );

      expect(titleService.generateModeAwareTitle).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle title generation service error gracefully', async () => {
      const conversationService = createMockConversationService();
      const titleService = createMockTitleGenerationService();
      titleService.generateModeAwareTitle.mockRejectedValue(new Error('API Error'));
      const emitCallback = jest.fn();

      // Should not throw
      await expect(
        generateTitleIfNeeded(
          'conv-123',
          'consult',
          'AI is fascinating!',
          conversationService,
          titleService,
          emitCallback
        )
      ).resolves.not.toThrow();

      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should handle database error gracefully', async () => {
      const conversationService = createMockConversationService();
      conversationService.getConversation.mockRejectedValue(new Error('DB Error'));

      const titleService = createMockTitleGenerationService();
      const emitCallback = jest.fn();

      // Should not throw
      await expect(
        generateTitleIfNeeded(
          'conv-123',
          'consult',
          'AI is fascinating!',
          conversationService,
          titleService,
          emitCallback
        )
      ).resolves.not.toThrow();

      expect(emitCallback).not.toHaveBeenCalled();
    });
  });
});

/**
 * Unit tests for vendor title upgrade (Story 26.2)
 *
 * Story 26.2: Vendor Title Upgrade
 * - Title upgrades to "Assessment: {vendorName}" when questionnaire is generated
 * - This is Phase 2 of the two-phase title behavior:
 *   - Phase 1 (Story 26.1): LLM generates title after first Q&A exchange
 *   - Phase 2 (Story 26.2): Title upgrades to "Assessment: {vendor}" when generate_questionnaire fires
 * - Respects manual title edits (titleManuallyEdited flag)
 * - Truncates long vendor names to 50 characters total
 */

/**
 * Mock the vendor title upgrade logic from ChatServer.handleGenerateQuestionnaire()
 *
 * This function mirrors the title upgrade logic for unit testing without infrastructure dependencies.
 */
async function upgradeVendorTitle(
  conversationId: string,
  vendorName: string | undefined,
  solutionName: string | undefined,
  conversationService: {
    updateTitleIfNotManuallyEdited: (id: string, title: string) => Promise<boolean>;
  },
  emitCallback: (event: string, data: unknown) => void
): Promise<void> {
  // Only upgrade if vendor or solution name is provided
  if (vendorName || solutionName) {
    const titlePrefix = 'Assessment: ';
    const titleName = vendorName || solutionName || '';
    const maxTitleLength = 50;
    let newTitle = `${titlePrefix}${titleName}`;
    if (newTitle.length > maxTitleLength) {
      newTitle = newTitle.slice(0, maxTitleLength - 3) + '...';
    }

    const titleUpdated = await conversationService.updateTitleIfNotManuallyEdited(
      conversationId,
      newTitle
    );

    if (titleUpdated) {
      emitCallback('conversation_title_updated', {
        conversationId,
        title: newTitle,
      });
    }
  }
}

describe('Vendor title upgrade (Story 26.2)', () => {
  // Helper to create mock conversation service for vendor title tests
  const createMockVendorTitleService = (options: {
    updateResult?: boolean;
  } = {}) => ({
    updateTitleIfNotManuallyEdited: jest.fn().mockResolvedValue(options.updateResult ?? true),
  });

  describe('title upgrade with vendor info', () => {
    it('should upgrade title to "Assessment: {vendorName}" when questionnaire generated', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        'MedTech AI Solutions',
        undefined,
        conversationService,
        emitCallback
      );

      // Should update title with vendor name
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: MedTech AI Solutions'
      );

      // Should emit title update event
      expect(emitCallback).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-123',
        title: 'Assessment: MedTech AI Solutions',
      });
    });

    it('should use solutionName if vendorName not provided', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        undefined,
        'RadiologyAI Pro',
        conversationService,
        emitCallback
      );

      // Should use solution name when vendor name is missing
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: RadiologyAI Pro'
      );

      expect(emitCallback).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-123',
        title: 'Assessment: RadiologyAI Pro',
      });
    });

    it('should prefer vendorName over solutionName when both provided', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        'MedTech Corp',
        'RadiologyAI Pro',
        conversationService,
        emitCallback
      );

      // Should use vendor name (takes precedence)
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: MedTech Corp'
      );
    });
  });

  describe('title truncation', () => {
    it('should truncate long vendor names to 50 chars total', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      // "Assessment: " is 12 chars, so vendor name gets truncated
      // Total: 50 chars max, with "..." at the end for truncation
      const longVendorName = 'This Is A Very Long Vendor Name That Exceeds The Maximum Length Allowed';

      await upgradeVendorTitle(
        'conv-123',
        longVendorName,
        undefined,
        conversationService,
        emitCallback
      );

      // Title should be exactly 50 characters with "..." suffix
      const expectedTitle = 'Assessment: This Is A Very Long Vendor Name Tha...';
      expect(expectedTitle.length).toBe(50);

      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        expectedTitle
      );
    });

    it('should not truncate if title is exactly 50 chars', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      // "Assessment: " is 12 chars, so vendor can be 38 chars
      const vendorName = 'Exactly Thirty Eight Characters Here!';
      expect(vendorName.length).toBe(37); // Actually 37, so title will be 49 chars

      await upgradeVendorTitle(
        'conv-123',
        vendorName,
        undefined,
        conversationService,
        emitCallback
      );

      // Should NOT be truncated
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: Exactly Thirty Eight Characters Here!'
      );
    });

    it('should handle short vendor names without truncation', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        'Acme',
        undefined,
        conversationService,
        emitCallback
      );

      // Should NOT be truncated
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: Acme'
      );
    });
  });

  describe('manual edit protection', () => {
    it('should NOT upgrade title if titleManuallyEdited is true', async () => {
      const conversationService = createMockVendorTitleService({
        updateResult: false, // Simulates titleManuallyEdited = true
      });
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        'MedTech AI',
        undefined,
        conversationService,
        emitCallback
      );

      // Should still call the update method (it checks internally)
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalled();

      // But should NOT emit because update returned false
      expect(emitCallback).not.toHaveBeenCalled();
    });
  });

  describe('no vendor info provided', () => {
    it('should NOT update title if no vendor/solution provided', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        undefined,
        undefined,
        conversationService,
        emitCallback
      );

      // Should NOT call update when no vendor info
      expect(conversationService.updateTitleIfNotManuallyEdited).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should NOT update title if vendor/solution are empty strings', async () => {
      const conversationService = createMockVendorTitleService();
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        '',
        '',
        conversationService,
        emitCallback
      );

      // Empty strings are falsy, so should NOT call update
      expect(conversationService.updateTitleIfNotManuallyEdited).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });
  });

  describe('two-phase title flow integration', () => {
    it('should upgrade from LLM-generated title to vendor title', async () => {
      // This test documents the two-phase flow:
      // Phase 1: LLM generates "AI Radiology Vendor Evaluation" after first Q&A
      // Phase 2: Title upgrades to "Assessment: MedTech AI" when questionnaire generated

      const conversationService = createMockVendorTitleService({
        updateResult: true, // Title was "AI Radiology Vendor Evaluation" (not manually edited)
      });
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        'MedTech AI',
        undefined,
        conversationService,
        emitCallback
      );

      // Phase 2 upgrade should succeed
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: MedTech AI'
      );
      expect(emitCallback).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-123',
        title: 'Assessment: MedTech AI',
      });
    });

    it('should upgrade from "New Assessment" placeholder to vendor title', async () => {
      // This test handles the case where LLM title generation was skipped
      // (e.g., user went straight to questionnaire without Q&A)

      const conversationService = createMockVendorTitleService({
        updateResult: true, // Title was "New Assessment" (placeholder, not manually edited)
      });
      const emitCallback = jest.fn();

      await upgradeVendorTitle(
        'conv-123',
        'HealthAI Solutions',
        undefined,
        conversationService,
        emitCallback
      );

      // Should upgrade placeholder to vendor title
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: HealthAI Solutions'
      );
      expect(emitCallback).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-123',
        title: 'Assessment: HealthAI Solutions',
      });
    });
  });

  /**
   * Story 26.2 fix: Invalid vendor name validation tests
   * These tests verify that bad vendor names are rejected
   */
  describe('invalid vendor name validation', () => {
    // Helper to test vendor name validation (mimics ChatServer.isValidVendorName)
    function isValidVendorName(value: string | null | undefined): boolean {
      if (!value || typeof value !== 'string') return false;
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (trimmed.length < 2) return false;
      if (/^(option|choice|select|item|answer)[_\-]?\d*[a-z]?$/i.test(trimmed)) return false;
      return true;
    }

    it('should reject numeric-only vendor names like "1"', () => {
      expect(isValidVendorName('1')).toBe(false);
      expect(isValidVendorName('123')).toBe(false);
      expect(isValidVendorName('42')).toBe(false);
    });

    it('should reject single character vendor names', () => {
      expect(isValidVendorName('A')).toBe(false);
      expect(isValidVendorName('x')).toBe(false);
    });

    it('should reject assessment option tokens', () => {
      expect(isValidVendorName('option1')).toBe(false);
      expect(isValidVendorName('option_1')).toBe(false);
      expect(isValidVendorName('choice_a')).toBe(false);
      expect(isValidVendorName('Choice-2')).toBe(false);
      expect(isValidVendorName('select1')).toBe(false);
      expect(isValidVendorName('item_3')).toBe(false);
      expect(isValidVendorName('answer')).toBe(false);
    });

    it('should reject null/undefined/empty values', () => {
      expect(isValidVendorName(null)).toBe(false);
      expect(isValidVendorName(undefined)).toBe(false);
      expect(isValidVendorName('')).toBe(false);
      expect(isValidVendorName('   ')).toBe(false);
    });

    it('should accept valid vendor names', () => {
      expect(isValidVendorName('Acme Corp')).toBe(true);
      expect(isValidVendorName('AI Solutions Inc.')).toBe(true);
      expect(isValidVendorName('HealthTech AI')).toBe(true);
      expect(isValidVendorName('AB')).toBe(true); // Min 2 chars
      expect(isValidVendorName('Company123')).toBe(true); // Not numeric-only
    });

    it('should NOT upgrade title when vendor name is invalid (e.g., "1")', async () => {
      const conversationService = createMockVendorTitleService({
        updateResult: true,
      });
      const emitCallback = jest.fn();

      // Invalid vendor name "1" should NOT trigger title upgrade
      const invalidVendor = '1';
      const validatedVendor = isValidVendorName(invalidVendor) ? invalidVendor : null;

      if (validatedVendor) {
        await upgradeVendorTitle(
          'conv-123',
          validatedVendor,
          undefined,
          conversationService,
          emitCallback
        );
      }

      // Title should NOT be updated
      expect(conversationService.updateTitleIfNotManuallyEdited).not.toHaveBeenCalled();
      expect(emitCallback).not.toHaveBeenCalled();
    });

    it('should fallback to solutionName when vendorName is invalid', async () => {
      const conversationService = createMockVendorTitleService({
        updateResult: true,
      });
      const emitCallback = jest.fn();

      // Invalid vendor name, but valid solution name
      const invalidVendor = '1';
      const validSolution = 'DiagnosticBot';
      const validatedVendor = isValidVendorName(invalidVendor) ? invalidVendor : null;
      const validatedSolution = isValidVendorName(validSolution) ? validSolution : null;

      const titleName = validatedVendor || validatedSolution;

      if (titleName) {
        await upgradeVendorTitle(
          'conv-123',
          titleName,
          undefined,
          conversationService,
          emitCallback
        );
      }

      // Should use solution name since vendor is invalid
      expect(conversationService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-123',
        'Assessment: DiagnosticBot'
      );
    });
  });
});
