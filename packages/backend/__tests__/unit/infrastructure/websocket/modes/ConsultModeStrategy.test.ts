import { ConsultModeStrategy } from '../../../../../src/infrastructure/websocket/modes/ConsultModeStrategy.js';
import type { ModeContext } from '../../../../../src/infrastructure/websocket/modes/IModeStrategy.js';

describe('ConsultModeStrategy', () => {
  let strategy: ConsultModeStrategy;

  beforeEach(() => {
    strategy = new ConsultModeStrategy();
  });

  describe('mode property', () => {
    it('should have mode set to "consult"', () => {
      expect(strategy.mode).toBe('consult');
    });
  });

  describe('preProcess', () => {
    it('should return empty result for preProcess', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await strategy.preProcess(context);

      expect(result).toEqual({});
    });

    it('should return empty result regardless of context', async () => {
      const context: ModeContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.preProcess(context);

      expect(result).toEqual({});
      expect(result.skipStandardProcessing).toBeUndefined();
      expect(result.customResponse).toBeUndefined();
      expect(result.systemPromptAddition).toBeUndefined();
    });
  });

  describe('postProcess', () => {
    it('should trigger auto-summarize when documents present', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.autoSummarize).toBe(true);
    });

    it('should not trigger auto-summarize when no documents', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.autoSummarize).toBe(false);
    });

    it('should trigger auto-summarize with multiple documents', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1', 'file-2', 'file-3'],
        hasDocuments: true,
      };

      const result = await strategy.postProcess(
        context,
        'Detailed response about documents'
      );

      expect(result.autoSummarize).toBe(true);
    });

    it('should not trigger scoring or background enrichment', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.triggerScoring).toBeUndefined();
      expect(result.enrichInBackground).toBeUndefined();
    });

    it('should return consistent result regardless of response content', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result1 = await strategy.postProcess(context, 'Short response');
      const result2 = await strategy.postProcess(
        context,
        'A very long response with lots of content about vendor assessment and AI governance topics that spans multiple paragraphs.'
      );

      expect(result1).toEqual(result2);
    });
  });

  describe('enhanceSystemPrompt', () => {
    it('should return base prompt unchanged', async () => {
      const basePrompt = 'You are Guardian, an AI assistant for healthcare AI governance.';
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.enhanceSystemPrompt(basePrompt, context);

      expect(result).toBe(basePrompt);
    });

    it('should return base prompt unchanged even with documents', async () => {
      const basePrompt = 'You are Guardian, an AI assistant for healthcare AI governance.';
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1', 'file-2'],
        hasDocuments: true,
      };

      const result = await strategy.enhanceSystemPrompt(basePrompt, context);

      expect(result).toBe(basePrompt);
    });

    it('should preserve empty base prompt', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.enhanceSystemPrompt('', context);

      expect(result).toBe('');
    });

    it('should preserve complex base prompts with special characters', async () => {
      const basePrompt = `You are Guardian.

Rules:
1. Be helpful
2. Be accurate
3. Don't make assumptions

Special chars: $100, 50% off, <html>, "quotes"`;

      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.enhanceSystemPrompt(basePrompt, context);

      expect(result).toBe(basePrompt);
    });
  });

  describe('IModeStrategy compliance', () => {
    it('should implement all required interface methods', () => {
      expect(typeof strategy.preProcess).toBe('function');
      expect(typeof strategy.postProcess).toBe('function');
      expect(typeof strategy.enhanceSystemPrompt).toBe('function');
      expect(strategy.mode).toBeDefined();
    });

    it('should return promises from all async methods', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const preProcessResult = strategy.preProcess(context);
      const postProcessResult = strategy.postProcess(context, 'response');
      const enhanceResult = strategy.enhanceSystemPrompt('prompt', context);

      expect(preProcessResult).toBeInstanceOf(Promise);
      expect(postProcessResult).toBeInstanceOf(Promise);
      expect(enhanceResult).toBeInstanceOf(Promise);

      // Await to avoid unhandled promise rejections
      await Promise.all([preProcessResult, postProcessResult, enhanceResult]);
    });
  });
});
