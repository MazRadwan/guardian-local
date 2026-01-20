import { ScoringModeStrategy } from '../../../../../src/infrastructure/websocket/modes/ScoringModeStrategy.js';
import type { ModeContext } from '../../../../../src/infrastructure/websocket/modes/IModeStrategy.js';

describe('ScoringModeStrategy', () => {
  let strategy: ScoringModeStrategy;

  beforeEach(() => {
    strategy = new ScoringModeStrategy();
  });

  describe('mode property', () => {
    it('should have mode set to scoring', () => {
      expect(strategy.mode).toBe('scoring');
    });
  });

  describe('preProcess', () => {
    it('should return empty result (no pre-processing needed)', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.preProcess(context);

      expect(result).toEqual({});
    });

    it('should return empty result even with documents (attachments handled separately)', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1', 'file-2'],
        hasDocuments: true,
      };

      const result = await strategy.preProcess(context);

      // Pre-process always returns empty - scoring with attachments
      // is handled directly by ChatServer's triggerScoringOnSend()
      expect(result).toEqual({});
      expect(result.skipStandardProcessing).toBeUndefined();
      expect(result.customResponse).toBeUndefined();
      expect(result.systemPromptAddition).toBeUndefined();
    });
  });

  describe('postProcess', () => {
    it('should NOT trigger scoring for follow-up (no documents)', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.postProcess(context, 'Response text');

      expect(result.triggerScoring).toBe(false);
    });

    it('should NOT trigger scoring for follow-up even with document context', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await strategy.postProcess(
        context,
        'Here is my analysis of the vendor...'
      );

      // Follow-up questions don't re-trigger scoring
      // Original scoring results are in conversation history
      expect(result.triggerScoring).toBe(false);
    });

    it('should not set enrichInBackground or autoSummarize', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await strategy.postProcess(context, 'Some response');

      expect(result.enrichInBackground).toBeUndefined();
      expect(result.autoSummarize).toBeUndefined();
    });
  });

  describe('enhanceSystemPrompt', () => {
    it('should enhance system prompt for scoring context', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt('Base prompt', context);

      expect(enhanced).toContain('Base prompt');
      expect(enhanced).toContain('Scoring Mode Context');
      expect(enhanced).toContain('follow-up questions');
    });

    it('should include key scoring discussion topics', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const enhanced = await strategy.enhanceSystemPrompt(
        'You are Guardian AI',
        context
      );

      // Should mention common scoring-related topics
      expect(enhanced).toContain('previous scoring analysis');
      expect(enhanced).toContain('dimension scores');
      expect(enhanced).toContain('Risk recommendations');
      expect(enhanced).toContain('Vendor evaluation');
    });

    it('should reference conversation history for original results', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt('Base', context);

      expect(enhanced).toContain('conversation history');
      expect(enhanced).toContain('original scoring results');
    });

    it('should include guidance on explaining rationale', async () => {
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt('Base', context);

      expect(enhanced).toContain('rationale');
      expect(enhanced).toContain('actionable recommendations');
    });

    it('should preserve the base prompt at the beginning', async () => {
      const basePrompt = 'This is the base system prompt with important instructions.';
      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: [],
        hasDocuments: false,
      };

      const enhanced = await strategy.enhanceSystemPrompt(basePrompt, context);

      expect(enhanced.startsWith(basePrompt)).toBe(true);
    });
  });

  describe('IModeStrategy interface compliance', () => {
    it('should implement all required methods', () => {
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
      const enhanceResult = strategy.enhanceSystemPrompt('base', context);

      expect(preProcessResult).toBeInstanceOf(Promise);
      expect(postProcessResult).toBeInstanceOf(Promise);
      expect(enhanceResult).toBeInstanceOf(Promise);

      // Await to avoid unhandled promise rejections
      await preProcessResult;
      await postProcessResult;
      await enhanceResult;
    });
  });
});
