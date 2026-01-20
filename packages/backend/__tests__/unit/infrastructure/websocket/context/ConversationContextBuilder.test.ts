/**
 * Unit tests for ConversationContextBuilder
 *
 * Story 28.2.1: Extract ConversationContextBuilder from ChatServer.ts
 */

import {
  ConversationContextBuilder,
  ConversationContext,
} from '../../../../../src/infrastructure/websocket/context/ConversationContextBuilder';
import type { ConversationService } from '../../../../../src/application/services/ConversationService';
import type { PromptCacheManager } from '../../../../../src/infrastructure/ai/PromptCacheManager';
import type { IFileRepository } from '../../../../../src/application/interfaces/IFileRepository';

describe('ConversationContextBuilder', () => {
  let builder: ConversationContextBuilder;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockPromptCacheManager: jest.Mocked<PromptCacheManager>;
  let mockFileRepository: jest.Mocked<IFileRepository>;

  beforeEach(() => {
    mockConversationService = {
      getConversation: jest.fn(),
      getHistory: jest.fn(),
    } as unknown as jest.Mocked<ConversationService>;

    mockPromptCacheManager = {
      ensureCached: jest.fn().mockReturnValue({
        systemPrompt: 'You are Guardian...',
        usePromptCache: false,
        cachedPromptId: undefined,
      }),
    } as unknown as jest.Mocked<PromptCacheManager>;

    mockFileRepository = {
      findByConversationWithContext: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IFileRepository>;

    builder = new ConversationContextBuilder(
      mockConversationService,
      mockPromptCacheManager,
      mockFileRepository
    );
  });

  describe('build()', () => {
    it('should load last 10 messages (history limit)', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
        { role: 'assistant', content: { text: 'Hi!' } },
      ] as any);

      await builder.build('conv-123');

      expect(mockConversationService.getHistory).toHaveBeenCalledWith(
        'conv-123',
        10
      );
    });

    it('should filter out empty messages', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
        { role: 'assistant', content: { text: '' } }, // Empty - should be filtered
        { role: 'assistant', content: { text: '  ' } }, // Whitespace only - should be filtered
        { role: 'user', content: { text: 'Question' } },
      ] as any);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(2);
      expect(context.messages[0].content).toBe('Hello');
      expect(context.messages[1].content).toBe('Question');
    });

    it('should filter out system messages', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
        { role: 'system', content: { text: 'System message' } }, // Should be filtered
        { role: 'assistant', content: { text: 'Hi!' } },
      ] as any);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(2);
      // Verify no system messages remain (all should be user or assistant)
      expect(context.messages[0].role).toBe('user');
      expect(context.messages[1].role).toBe('assistant');
    });

    it('should use ensureCached with includeToolInstructions: true', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'assessment',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      await builder.build('conv-123');

      expect(mockPromptCacheManager.ensureCached).toHaveBeenCalledWith(
        'assessment',
        {
          includeToolInstructions: true,
        }
      );
    });

    it('should add retry context for regenerate requests', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123', true);

      expect(context.systemPrompt).toContain(
        'IMPORTANT: The user has requested a different response'
      );
      expect(context.systemPrompt).toContain('fresh perspective');
      expect(context.systemPrompt).toContain('Avoid repeating');
    });

    it('should not add retry context for normal requests', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123', false);

      expect(context.systemPrompt).not.toContain(
        'IMPORTANT: The user has requested a different response'
      );
    });

    it('should return correct promptCache fields', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockPromptCacheManager.ensureCached.mockReturnValue({
        mode: 'consult',
        hash: 'abc123',
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

      await expect(builder.build('invalid')).rejects.toThrow(
        'Conversation invalid not found'
      );
    });

    it('should default to consult mode when conversation mode is undefined', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: undefined,
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.mode).toBe('consult');
      expect(mockPromptCacheManager.ensureCached).toHaveBeenCalledWith(
        'consult',
        expect.any(Object)
      );
    });

    it('should handle string content format in messages', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: 'String content' },
        { role: 'assistant', content: 'Assistant reply' },
      ] as any);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(2);
      expect(context.messages[0].content).toBe('String content');
      expect(context.messages[1].content).toBe('Assistant reply');
    });

    it('should handle object content with text property', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Object text content' } },
      ] as any);

      const context = await builder.build('conv-123');

      expect(context.messages[0].content).toBe('Object text content');
    });

    it('should handle object content with missing text property', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { otherField: 'value' } }, // No text property
        { role: 'user', content: { text: 'Has text' } },
      ] as any);

      const context = await builder.build('conv-123');

      // First message has empty text (no .text property), should be filtered
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].content).toBe('Has text');
    });
  });

  describe('intake context injection', () => {
    it('should inject multi-doc context as synthetic assistant message', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
      ] as any);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          conversationId: 'conv-123',
          filename: 'doc1.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          intakeContext: {
            vendorName: 'Acme',
            solutionName: 'AI Tool',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
        {
          id: 'file-2',
          conversationId: 'conv-123',
          filename: 'doc2.pdf',
          mimeType: 'application/pdf',
          size: 2000,
          intakeContext: {
            vendorName: 'Beta',
            solutionName: 'ML Platform',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
      ]);

      const context = await builder.build('conv-123');

      // Synthetic message should be prepended
      expect(context.messages[0].role).toBe('assistant');
      expect(context.messages[0].content).toContain(
        'analyzed 2 uploaded document'
      );
      expect(context.messages[0].content).toContain('Acme');
      expect(context.messages[0].content).toContain('Beta');
      // Original message should be second
      expect(context.messages[1].content).toBe('Hello');
    });

    it('should inject legacy context when no per-file context exists', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: {
            vendorName: 'Legacy Vendor',
            solutionName: 'Legacy Solution',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: ['Data Privacy'],
        },
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.messages[0].role).toBe('assistant');
      expect(context.messages[0].content).toContain('Legacy Vendor');
      expect(context.messages[0].content).toContain('Areas Needing Clarification');
      expect(context.messages[0].content).toContain('Data Privacy');
    });

    it('should not inject context when none exists', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([
        { role: 'user', content: { text: 'Hello' } },
      ] as any);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].content).toBe('Hello');
    });

    it('should include legacy context in multi-doc when not duplicate', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: {
            vendorName: 'Different Vendor',
            solutionName: 'Different Solution',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
        },
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          conversationId: 'conv-123',
          filename: 'doc1.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          intakeContext: {
            vendorName: 'File Vendor',
            solutionName: 'File Solution',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
      ]);

      const context = await builder.build('conv-123');

      expect(context.messages[0].content).toContain('File Vendor');
      expect(context.messages[0].content).toContain('Prior Document (legacy)');
      expect(context.messages[0].content).toContain('Different Vendor');
    });

    it('should NOT include duplicate legacy context in multi-doc', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: {
            vendorName: 'Same Vendor',
            solutionName: 'Same Solution',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
        },
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          conversationId: 'conv-123',
          filename: 'doc1.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          intakeContext: {
            vendorName: 'Same Vendor',
            solutionName: 'Same Solution',
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
      ]);

      const context = await builder.build('conv-123');

      // Should NOT include "Prior Document (legacy)" since it's a duplicate
      expect(context.messages[0].content).not.toContain('Prior Document (legacy)');
    });

    it('should aggregate features from multiple documents', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          conversationId: 'conv-123',
          filename: 'doc1.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          intakeContext: {
            vendorName: 'Vendor A',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: ['Feature A', 'Feature B'],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
        {
          id: 'file-2',
          conversationId: 'conv-123',
          filename: 'doc2.pdf',
          mimeType: 'application/pdf',
          size: 2000,
          intakeContext: {
            vendorName: 'Vendor B',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: ['Feature C'],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
      ]);

      const context = await builder.build('conv-123');

      expect(context.messages[0].content).toContain('Combined Features:');
      expect(context.messages[0].content).toContain('Feature A');
      expect(context.messages[0].content).toContain('Feature B');
      expect(context.messages[0].content).toContain('Feature C');
    });

    it('should deduplicate features across documents', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          conversationId: 'conv-123',
          filename: 'doc1.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          intakeContext: {
            vendorName: 'Vendor A',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: ['Same Feature', 'Feature A'],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
        {
          id: 'file-2',
          conversationId: 'conv-123',
          filename: 'doc2.pdf',
          mimeType: 'application/pdf',
          size: 2000,
          intakeContext: {
            vendorName: 'Vendor B',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: ['Same Feature'], // Duplicate
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
      ]);

      const context = await builder.build('conv-123');

      // Count occurrences of "Same Feature" - should only appear once
      const content = context.messages[0].content;
      const matches = content.match(/Same Feature/g);
      expect(matches).toHaveLength(1);
    });

    it('should include compliance mentions in context', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: {
            vendorName: 'Test Vendor',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: ['HIPAA', 'SOC 2'],
          },
        },
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.messages[0].content).toContain('Compliance Mentions:');
      expect(context.messages[0].content).toContain('HIPAA');
      expect(context.messages[0].content).toContain('SOC 2');
    });

    it('should include claims in context', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: {
            vendorName: 'Test Vendor',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: [],
            claims: ['99.9% uptime', 'AI-powered'],
            complianceMentions: [],
          },
        },
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.messages[0].content).toContain('Claims:');
      expect(context.messages[0].content).toContain('99.9% uptime');
      expect(context.messages[0].content).toContain('AI-powered');
    });

    it('should include all context fields when present', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {
          intakeContext: {
            vendorName: 'Full Vendor',
            solutionName: 'Full Solution',
            solutionType: 'SaaS',
            industry: 'Healthcare',
            features: ['Feature 1'],
            claims: ['Claim 1'],
            complianceMentions: ['HIPAA'],
          },
          intakeGapCategories: ['Security'],
        },
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      const content = context.messages[0].content;
      expect(content).toContain('Full Vendor');
      expect(content).toContain('Full Solution');
      expect(content).toContain('SaaS');
      expect(content).toContain('Healthcare');
      expect(content).toContain('Feature 1');
      expect(content).toContain('Claim 1');
      expect(content).toContain('HIPAA');
      expect(content).toContain('Security');
    });
  });

  describe('mode handling', () => {
    it('should handle consult mode', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.mode).toBe('consult');
      expect(mockPromptCacheManager.ensureCached).toHaveBeenCalledWith(
        'consult',
        { includeToolInstructions: true }
      );
    });

    it('should handle assessment mode', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'assessment',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.mode).toBe('assessment');
      expect(mockPromptCacheManager.ensureCached).toHaveBeenCalledWith(
        'assessment',
        { includeToolInstructions: true }
      );
    });

    it('should handle scoring mode', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'scoring',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      const context = await builder.build('conv-123');

      expect(context.mode).toBe('scoring');
      expect(mockPromptCacheManager.ensureCached).toHaveBeenCalledWith(
        'scoring',
        { includeToolInstructions: true }
      );
    });
  });

  describe('file repository integration', () => {
    it('should call findByConversationWithContext with correct conversation ID', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);

      await builder.build('specific-conv-id');

      expect(
        mockFileRepository.findByConversationWithContext
      ).toHaveBeenCalledWith('specific-conv-id');
    });

    it('should filter out files without intakeContext', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        mode: 'consult',
        context: {},
      } as any);
      mockConversationService.getHistory.mockResolvedValue([]);
      mockFileRepository.findByConversationWithContext.mockResolvedValue([
        {
          id: 'file-1',
          conversationId: 'conv-123',
          filename: 'doc1.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          intakeContext: {
            vendorName: 'Has Context',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
          intakeGapCategories: null,
          intakeParsedAt: new Date(),
        },
        {
          id: 'file-2',
          conversationId: 'conv-123',
          filename: 'doc2.pdf',
          mimeType: 'application/pdf',
          size: 2000,
          intakeContext: null, // No context - should be filtered
          intakeGapCategories: null,
          intakeParsedAt: null,
        },
      ]);

      const context = await builder.build('conv-123');

      // Should only include file with context
      expect(context.messages[0].content).toContain('1 uploaded document');
      expect(context.messages[0].content).toContain('Has Context');
    });
  });
});
