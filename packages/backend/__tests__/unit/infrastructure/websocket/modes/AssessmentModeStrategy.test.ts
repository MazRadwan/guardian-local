import { AssessmentModeStrategy } from '../../../../../src/infrastructure/websocket/modes/AssessmentModeStrategy.js';
import type { ModeContext } from '../../../../../src/infrastructure/websocket/modes/IModeStrategy.js';

describe('AssessmentModeStrategy', () => {
  let strategy: AssessmentModeStrategy;

  beforeEach(() => {
    strategy = new AssessmentModeStrategy();
  });

  describe('mode', () => {
    it('should have mode set to assessment', () => {
      expect(strategy.mode).toBe('assessment');
    });
  });

  describe('preProcess', () => {
    it('should return empty result', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await strategy.preProcess(context);

      expect(result).toEqual({});
    });

    it('should return empty result when no documents present', async () => {
      const context: ModeContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.preProcess(context);

      expect(result).toEqual({});
    });
  });

  describe('postProcess', () => {
    it('should trigger background enrichment when documents present', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['f1'],
        hasDocuments: true,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.enrichInBackground).toBe(true);
    });

    it('should not trigger background enrichment when no documents present', async () => {
      const context: ModeContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.enrichInBackground).toBe(false);
    });

    it('should handle context with fileIds but hasDocuments false', async () => {
      // Edge case: fileIds might be populated but hasDocuments explicitly false
      const context: ModeContext = {
        conversationId: 'conv-3',
        userId: 'user-3',
        fileIds: ['file-1', 'file-2'],
        hasDocuments: false,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.enrichInBackground).toBe(false);
    });

    it('should not set triggerScoring or autoSummarize', async () => {
      const context: ModeContext = {
        conversationId: 'conv-4',
        userId: 'user-4',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await strategy.postProcess(
        context,
        'Detailed assessment response'
      );

      expect(result.triggerScoring).toBeUndefined();
      expect(result.autoSummarize).toBeUndefined();
    });
  });

  describe('enhanceSystemPrompt', () => {
    it('should enhance system prompt with assessment mode instructions', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt('Base prompt', context);

      expect(enhanced).toContain('Base prompt');
      expect(enhanced).toContain('Assessment Mode Instructions');
      expect(enhanced).toContain('Guardian assessment framework');
    });

    it('should include guidance for uploading vendor documentation', async () => {
      const context: ModeContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt(
        'System prompt base',
        context
      );

      expect(enhanced).toContain('Uploading vendor documentation');
    });

    it('should include guidance for identifying capabilities and risks', async () => {
      const context: ModeContext = {
        conversationId: 'conv-3',
        userId: 'user-3',
        fileIds: ['doc-1'],
        hasDocuments: true,
      };

      const enhanced = await strategy.enhanceSystemPrompt(
        'Base system prompt',
        context
      );

      expect(enhanced).toContain('Identifying key capabilities and risks');
    });

    it('should include guidance for generating questionnaires', async () => {
      const context: ModeContext = {
        conversationId: 'conv-4',
        userId: 'user-4',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt(
        'Initial prompt',
        context
      );

      expect(enhanced).toContain('Generating comprehensive questionnaires');
    });

    it('should preserve the base prompt at the beginning', async () => {
      const basePrompt = 'You are Guardian, an AI assistant.';
      const context: ModeContext = {
        conversationId: 'conv-5',
        userId: 'user-5',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt(basePrompt, context);

      expect(enhanced.startsWith(basePrompt)).toBe(true);
    });

    it('should work with empty base prompt', async () => {
      const context: ModeContext = {
        conversationId: 'conv-6',
        userId: 'user-6',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt('', context);

      expect(enhanced).toContain('Assessment Mode Instructions');
      expect(enhanced).toContain('Guardian assessment framework');
    });
  });

  describe('IModeStrategy interface compliance', () => {
    it('should implement all required interface methods', () => {
      expect(typeof strategy.mode).toBe('string');
      expect(typeof strategy.preProcess).toBe('function');
      expect(typeof strategy.postProcess).toBe('function');
      expect(typeof strategy.enhanceSystemPrompt).toBe('function');
    });

    it('should return promises from all async methods', async () => {
      const context: ModeContext = {
        conversationId: 'conv-interface',
        userId: 'user-interface',
        fileIds: [],
        hasDocuments: false,
      };

      const preProcessResult = strategy.preProcess(context);
      const postProcessResult = strategy.postProcess(context, 'response');
      const enhanceResult = strategy.enhanceSystemPrompt('base', context);

      expect(preProcessResult).toBeInstanceOf(Promise);
      expect(postProcessResult).toBeInstanceOf(Promise);
      expect(enhanceResult).toBeInstanceOf(Promise);

      // Await to ensure they resolve properly
      await expect(preProcessResult).resolves.toBeDefined();
      await expect(postProcessResult).resolves.toBeDefined();
      await expect(enhanceResult).resolves.toBeDefined();
    });
  });
});
