/**
 * Unit Tests for TitleUpdateService
 *
 * Story 35.1.3: Tests and regression verification for TitleUpdateService
 *
 * Tests the real TitleUpdateService class with mocked dependencies.
 * Covers all guard conditions, success paths, error handling,
 * and output parity with the original MessageHandler behavior.
 *
 * Test cases (18):
 *
 * generateTitleIfNeeded guards:
 *  1. Skip if no titleGenerationService (constructor arg undefined)
 *  2. Skip for scoring mode
 *  3. Skip if message count wrong for consult (not 2)
 *  4. Skip if message count wrong for assessment (not in [3, 5])
 *  5. Skip if conversation not found
 *  6. Skip if title manually edited
 *  7. Skip if title already set (not placeholder, not vendor update)
 *
 * generateTitleIfNeeded success paths:
 *  8. Consult mode at 2 messages - generateModeAwareTitle called, socket.emit called
 *  9. Assessment mode at 3 messages
 * 10. Assessment vendor update at 5 messages - uses second user message from history
 * 11. Title update returns false (race condition) - no event emitted
 *
 * updateScoringTitle:
 * 12. Normal filename - "Scoring: filename.yaml" title, event emitted
 * 13. Long filename truncation with extension preserved
 * 14. Delegates to formatScoringTitle when titleGenerationService exists
 * 15. Manual edit protection - updateTitleIfNotManuallyEdited returns false, no event
 *
 * Error handling:
 * 16. Title service throws - error caught and logged, not thrown
 * 17. DB error (getConversation rejects) - error caught and logged, not thrown
 *
 * Output parity regression:
 * 18. Scoring title output matches original MessageHandler behavior
 */

import { TitleUpdateService } from '../../../../../src/infrastructure/websocket/services/TitleUpdateService';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext';
import type { ITitleGenerationService } from '../../../../../src/application/interfaces/ITitleGenerationService';
import { Conversation } from '../../../../../src/domain/entities/Conversation';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const createMockConversationService = () => ({
  getMessageCount: jest.fn(),
  getConversation: jest.fn(),
  getFirstUserMessage: jest.fn(),
  getHistory: jest.fn(),
  updateTitleIfNotManuallyEdited: jest.fn(),
});

const createMockTitleGenerationService = (): jest.Mocked<ITitleGenerationService> => ({
  generateModeAwareTitle: jest.fn(),
  formatScoringTitle: jest.fn(),
});

const createMockSocket = (): jest.Mocked<Pick<IAuthenticatedSocket, 'emit'>> => ({
  emit: jest.fn(),
});

/**
 * Helper to build a Conversation entity from persistence with sensible defaults.
 */
function buildConversation(overrides: {
  title?: string | null;
  titleManuallyEdited?: boolean;
  mode?: 'consult' | 'assessment' | 'scoring';
} = {}): Conversation {
  return Conversation.fromPersistence({
    id: 'conv-1',
    userId: 'user-1',
    mode: overrides.mode ?? 'consult',
    assessmentId: null,
    status: 'active',
    context: {},
    startedAt: new Date(),
    lastActivityAt: new Date(),
    completedAt: null,
    title: overrides.title ?? null,
    titleManuallyEdited: overrides.titleManuallyEdited ?? false,
  });
}

/**
 * Helper to build a minimal Message-like object for history mocks.
 */
function buildMessage(role: 'user' | 'assistant', text: string) {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    conversationId: 'conv-1',
    role,
    content: { text },
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TitleUpdateService', () => {
  let mockConvService: ReturnType<typeof createMockConversationService>;
  let mockTitleGenService: jest.Mocked<ITitleGenerationService>;
  let mockSocket: ReturnType<typeof createMockSocket>;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    mockConvService = createMockConversationService();
    mockTitleGenService = createMockTitleGenerationService();
    mockSocket = createMockSocket();
    // Suppress console output during tests; capture for assertion where needed
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // generateTitleIfNeeded guards
  // =========================================================================
  describe('generateTitleIfNeeded guards', () => {
    it('1. should skip if no titleGenerationService (constructor arg undefined)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        undefined // no title generation service
      );

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Hello from assistant'
      );

      // Nothing should be called - early return
      expect(mockConvService.getMessageCount).not.toHaveBeenCalled();
      expect(mockConvService.getConversation).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('2. should skip for scoring mode', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'scoring',
        'Scoring response'
      );

      expect(mockConvService.getMessageCount).not.toHaveBeenCalled();
      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('3. should skip if message count wrong for consult (not 2)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      // Count is 4 - wrong for consult (needs exactly 2)
      mockConvService.getMessageCount.mockResolvedValue(4);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Response'
      );

      expect(mockConvService.getMessageCount).toHaveBeenCalledWith('conv-1');
      expect(mockConvService.getConversation).not.toHaveBeenCalled();
      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
    });

    it('4. should skip if message count wrong for assessment (not in [3, 5])', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      // Count is 4 - not in [3, 5]
      mockConvService.getMessageCount.mockResolvedValue(4);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'assessment',
        'Response'
      );

      expect(mockConvService.getMessageCount).toHaveBeenCalledWith('conv-1');
      expect(mockConvService.getConversation).not.toHaveBeenCalled();
    });

    it('5. should skip if conversation not found', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockResolvedValue(null);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Response'
      );

      expect(mockConvService.getConversation).toHaveBeenCalledWith('conv-1');
      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('6. should skip if title manually edited', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'My Custom Title', titleManuallyEdited: true })
      );

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Response'
      );

      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('7. should skip if title already set (not placeholder, not vendor update)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      // Title is a real, non-placeholder title
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'AI Vendor Risk Assessment' })
      );

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Response'
      );

      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // generateTitleIfNeeded success paths
  // =========================================================================
  describe('generateTitleIfNeeded success paths', () => {
    it('8. should generate title for consult mode at 2 messages', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'New Chat' }) // placeholder
      );
      mockConvService.getFirstUserMessage.mockResolvedValue(
        buildMessage('user', 'What is HIPAA compliance?')
      );
      mockTitleGenService.generateModeAwareTitle.mockResolvedValue({
        title: 'HIPAA Compliance Overview',
        source: 'llm',
      });
      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'HIPAA is a federal law...'
      );

      // Verify generateModeAwareTitle called with correct context
      expect(mockTitleGenService.generateModeAwareTitle).toHaveBeenCalledWith({
        mode: 'consult',
        userMessage: 'What is HIPAA compliance?',
        assistantResponse: 'HIPAA is a federal law...',
      });

      // Verify title saved
      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-1',
        'HIPAA Compliance Overview'
      );

      // Verify socket event emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-1',
        title: 'HIPAA Compliance Overview',
      });
    });

    it('9. should generate title for assessment mode at 3 messages', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(3);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'New Assessment', mode: 'assessment' })
      );
      mockConvService.getFirstUserMessage.mockResolvedValue(
        buildMessage('user', 'I want to assess VendorX')
      );
      mockTitleGenService.generateModeAwareTitle.mockResolvedValue({
        title: 'Assessment: VendorX',
        source: 'llm',
      });
      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'assessment',
        'Let me help assess VendorX...'
      );

      expect(mockTitleGenService.generateModeAwareTitle).toHaveBeenCalledWith({
        mode: 'assessment',
        userMessage: 'I want to assess VendorX',
        assistantResponse: 'Let me help assess VendorX...',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-1',
        title: 'Assessment: VendorX',
      });
    });

    it('10. should use second user message for assessment vendor update at 5 messages', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(5);
      // isVendorInfoUpdate = true, so non-placeholder title is OK (will be overwritten)
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'Assessment: Initial', mode: 'assessment' })
      );

      // History with 2 user messages
      const history = [
        buildMessage('assistant', 'Preamble'),
        buildMessage('user', 'Assessment type selection'),
        buildMessage('assistant', 'Got it, which vendor?'),
        buildMessage('user', 'VendorY for their EHR solution'),
        buildMessage('assistant', 'Starting assessment for VendorY...'),
      ];
      mockConvService.getHistory.mockResolvedValue(history);

      mockTitleGenService.generateModeAwareTitle.mockResolvedValue({
        title: 'Assessment: VendorY EHR',
        source: 'llm',
      });
      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'assessment',
        'Starting assessment for VendorY...'
      );

      // Should use the second user message (vendor info), not the first
      expect(mockTitleGenService.generateModeAwareTitle).toHaveBeenCalledWith({
        mode: 'assessment',
        userMessage: 'VendorY for their EHR solution',
        assistantResponse: 'Starting assessment for VendorY...',
      });

      // Verify history was fetched with limit 10, offset 0
      expect(mockConvService.getHistory).toHaveBeenCalledWith('conv-1', 10, 0);

      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-1',
        title: 'Assessment: VendorY EHR',
      });
    });

    it('11. should not emit event when title update returns false (race condition)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'New Chat' })
      );
      mockConvService.getFirstUserMessage.mockResolvedValue(
        buildMessage('user', 'Hello')
      );
      mockTitleGenService.generateModeAwareTitle.mockResolvedValue({
        title: 'Greeting Chat',
        source: 'llm',
      });
      // Race condition: another request already updated the title
      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(false);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Hi there!'
      );

      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalled();
      // No socket event because update returned false
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateScoringTitle
  // =========================================================================
  describe('updateScoringTitle', () => {
    it('12. should set "Scoring: filename.yaml" title and emit event', async () => {
      const service = new TitleUpdateService(
        mockConvService as never
        // no titleGenerationService - uses inline formatting
      );

      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      await service.updateScoringTitle(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'vendor_report.yaml'
      );

      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-1',
        'Scoring: vendor_report.yaml'
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-1',
        title: 'Scoring: vendor_report.yaml',
      });
    });

    it('13. should truncate long filename while preserving extension', async () => {
      const service = new TitleUpdateService(
        mockConvService as never
        // no titleGenerationService - uses inline formatting
      );

      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      // maxTitleLength=50, prefix="Scoring: " (9 chars), maxFilenameLength=41
      // Filename that exceeds 41 chars
      const longFilename = 'very_long_vendor_assessment_report_name_that_exceeds_limit.yaml';

      await service.updateScoringTitle(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        longFilename
      );

      const emittedTitle = (mockConvService.updateTitleIfNotManuallyEdited.mock.calls[0] as unknown[])[1] as string;

      // Title should start with "Scoring: "
      expect(emittedTitle).toMatch(/^Scoring: /);
      // Title total length should not exceed 50
      expect(emittedTitle.length).toBeLessThanOrEqual(50);
      // Extension should be preserved
      expect(emittedTitle).toMatch(/\.yaml$/);
      // Should contain truncation indicator
      expect(emittedTitle).toContain('...');
    });

    it('14. should delegate to formatScoringTitle when titleGenerationService exists', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockTitleGenService.formatScoringTitle.mockReturnValue('Scoring: delegated_title.pdf');
      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      await service.updateScoringTitle(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'delegated_title.pdf'
      );

      // Should call formatScoringTitle on the injected service
      expect(mockTitleGenService.formatScoringTitle).toHaveBeenCalledWith('delegated_title.pdf');

      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-1',
        'Scoring: delegated_title.pdf'
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId: 'conv-1',
        title: 'Scoring: delegated_title.pdf',
      });
    });

    it('15. should not emit event when manual edit protection blocks update', async () => {
      const service = new TitleUpdateService(
        mockConvService as never
      );

      // Simulate manual edit protection - update returns false
      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(false);

      await service.updateScoringTitle(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'report.yaml'
      );

      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error handling', () => {
    it('16. should catch and log error when title service throws', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'New Chat' })
      );
      mockConvService.getFirstUserMessage.mockResolvedValue(
        buildMessage('user', 'Test message')
      );
      mockTitleGenService.generateModeAwareTitle.mockRejectedValue(
        new Error('LLM API timeout')
      );

      // Should NOT throw
      await expect(
        service.generateTitleIfNeeded(
          mockSocket as unknown as IAuthenticatedSocket,
          'conv-1',
          'consult',
          'Response'
        )
      ).resolves.toBeUndefined();

      // Error should be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[TitleUpdateService] Error in generateTitleIfNeeded:',
        expect.any(Error)
      );

      // No socket event emitted
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('17. should catch and log error when DB rejects (getConversation)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockRejectedValue(
        new Error('Connection refused')
      );

      // Should NOT throw
      await expect(
        service.generateTitleIfNeeded(
          mockSocket as unknown as IAuthenticatedSocket,
          'conv-1',
          'consult',
          'Response'
        )
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[TitleUpdateService] Error in generateTitleIfNeeded:',
        expect.any(Error)
      );

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Output parity regression
  // =========================================================================
  describe('output parity regression', () => {
    it('18. scoring title output should match original MessageHandler behavior for representative filename', async () => {
      // The original MessageHandler.updateScoringTitle used identical logic:
      //   prefix = "Scoring: "
      //   maxTitleLength = 50
      //   maxFilenameLength = 41
      //   Truncation: baseName.slice(0, availableLength) + "..." + extension
      //
      // We verify output parity for both short and long filenames.

      const service = new TitleUpdateService(
        mockConvService as never
        // no titleGenerationService - uses inline formatting (same as original)
      );

      mockConvService.updateTitleIfNotManuallyEdited.mockResolvedValue(true);

      // Case A: Short filename (no truncation) - "vendor_analysis.yaml"
      await service.updateScoringTitle(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'vendor_analysis.yaml'
      );

      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-1',
        'Scoring: vendor_analysis.yaml'
      );

      // Reset mocks for next case
      mockConvService.updateTitleIfNotManuallyEdited.mockClear();
      mockSocket.emit.mockClear();

      // Case B: Long filename (requires truncation)
      // "healthcare_vendor_comprehensive_risk_analysis_report.yaml" = 57 chars
      // maxFilenameLength = 41, extension = ".yaml" (5 chars), "..." = 3 chars
      // availableLength = 41 - 3 - 5 = 33
      // baseName = "healthcare_vendor_comprehensive_risk_analysis_report" (52 chars)
      // truncatedBase = baseName.slice(0, 33) = "healthcare_vendor_comprehensive_r"
      // result = "Scoring: healthcare_vendor_comprehensive_r...yaml"
      const longFilename = 'healthcare_vendor_comprehensive_risk_analysis_report.yaml';

      await service.updateScoringTitle(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        longFilename
      );

      // Compute expected output using the exact same algorithm
      const prefix = 'Scoring: ';
      const maxFilenameLength = 50 - prefix.length; // 41
      const lastDot = longFilename.lastIndexOf('.');
      const extension = longFilename.slice(lastDot); // ".yaml"
      const baseName = longFilename.slice(0, lastDot);
      const availableLength = maxFilenameLength - 3 - extension.length; // 41 - 3 - 5 = 33
      const expectedTitle = `${prefix}${baseName.slice(0, availableLength)}...${extension}`;

      expect(mockConvService.updateTitleIfNotManuallyEdited).toHaveBeenCalledWith(
        'conv-1',
        expectedTitle
      );

      // Verify the title does not exceed 50 characters
      expect(expectedTitle.length).toBeLessThanOrEqual(50);

      // Verify extension is preserved
      expect(expectedTitle).toMatch(/\.yaml$/);
    });
  });

  // =========================================================================
  // Additional edge cases for completeness
  // =========================================================================
  describe('additional edge cases', () => {
    it('should return early when vendor update at 5 messages has no second user message', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(5);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: 'Assessment: Initial', mode: 'assessment' })
      );

      // History with only one user message
      const history = [
        buildMessage('assistant', 'Preamble'),
        buildMessage('user', 'First user message'),
        buildMessage('assistant', 'Response 1'),
        buildMessage('assistant', 'Response 2'),
        buildMessage('assistant', 'Response 3'),
      ];
      mockConvService.getHistory.mockResolvedValue(history);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'assessment',
        'Response'
      );

      // No title generation because second user message not found
      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should return early when consult first user message has no text', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);
      mockConvService.getConversation.mockResolvedValue(
        buildConversation({ title: null }) // null title = placeholder
      );
      // getFirstUserMessage returns null (no user message found)
      mockConvService.getFirstUserMessage.mockResolvedValue(null);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Response'
      );

      expect(mockTitleGenService.generateModeAwareTitle).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should handle consult mode at count 1 (below threshold)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(1);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'consult',
        'Response'
      );

      expect(mockConvService.getConversation).not.toHaveBeenCalled();
    });

    it('should handle assessment mode at count 2 (below threshold)', async () => {
      const service = new TitleUpdateService(
        mockConvService as never,
        mockTitleGenService
      );

      mockConvService.getMessageCount.mockResolvedValue(2);

      await service.generateTitleIfNeeded(
        mockSocket as unknown as IAuthenticatedSocket,
        'conv-1',
        'assessment',
        'Response'
      );

      expect(mockConvService.getConversation).not.toHaveBeenCalled();
    });
  });
});
