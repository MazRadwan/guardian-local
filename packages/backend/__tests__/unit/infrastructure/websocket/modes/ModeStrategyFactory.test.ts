import {
  ModeStrategyFactory,
  type IModeStrategy,
  type ModeContext,
  type PreProcessResult,
  type PostProcessResult,
} from '../../../../../src/infrastructure/websocket/modes/IModeStrategy.js';

describe('ModeStrategyFactory', () => {
  let factory: ModeStrategyFactory;
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
  };

  beforeEach(() => {
    factory = new ModeStrategyFactory();
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  /**
   * Helper to create a mock strategy for testing
   */
  function createMockStrategy(
    mode: 'consult' | 'assessment' | 'scoring'
  ): IModeStrategy {
    return {
      mode,
      preProcess: jest.fn().mockResolvedValue({} as PreProcessResult),
      postProcess: jest.fn().mockResolvedValue({} as PostProcessResult),
      enhanceSystemPrompt: jest
        .fn()
        .mockImplementation((basePrompt: string) =>
          Promise.resolve(basePrompt)
        ),
    };
  }

  describe('register', () => {
    it('should register and retrieve strategies', () => {
      const mockStrategy = createMockStrategy('consult');

      factory.register(mockStrategy);

      expect(factory.getStrategy('consult')).toBe(mockStrategy);
    });

    it('should log registration message', () => {
      const mockStrategy = createMockStrategy('assessment');

      factory.register(mockStrategy);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[ModeStrategyFactory] Registered strategy for mode: assessment'
      );
    });

    it('should overwrite existing strategy with warning', () => {
      const strategy1 = createMockStrategy('consult');
      const strategy2 = createMockStrategy('consult');

      factory.register(strategy1);
      factory.register(strategy2);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[ModeStrategyFactory] Overwriting strategy for mode: consult'
      );
      expect(factory.getStrategy('consult')).toBe(strategy2);
    });

    it('should register multiple different strategies', () => {
      const consultStrategy = createMockStrategy('consult');
      const assessmentStrategy = createMockStrategy('assessment');
      const scoringStrategy = createMockStrategy('scoring');

      factory.register(consultStrategy);
      factory.register(assessmentStrategy);
      factory.register(scoringStrategy);

      expect(factory.getStrategy('consult')).toBe(consultStrategy);
      expect(factory.getStrategy('assessment')).toBe(assessmentStrategy);
      expect(factory.getStrategy('scoring')).toBe(scoringStrategy);
    });
  });

  describe('getStrategy', () => {
    it('should return undefined for unregistered mode', () => {
      expect(factory.getStrategy('consult')).toBeUndefined();
    });

    it('should return the correct strategy for registered mode', () => {
      const mockStrategy = createMockStrategy('scoring');
      factory.register(mockStrategy);

      const retrieved = factory.getStrategy('scoring');

      expect(retrieved).toBe(mockStrategy);
      expect(retrieved?.mode).toBe('scoring');
    });
  });

  describe('hasStrategy', () => {
    it('should return true for registered mode', () => {
      const mockStrategy = createMockStrategy('assessment');
      factory.register(mockStrategy);

      expect(factory.hasStrategy('assessment')).toBe(true);
    });

    it('should return false for unregistered mode', () => {
      expect(factory.hasStrategy('scoring')).toBe(false);
    });
  });

  describe('getRegisteredModes', () => {
    it('should return empty array when no strategies registered', () => {
      expect(factory.getRegisteredModes()).toEqual([]);
    });

    it('should list all registered modes', () => {
      factory.register(createMockStrategy('consult'));
      factory.register(createMockStrategy('assessment'));

      const modes = factory.getRegisteredModes();

      expect(modes).toHaveLength(2);
      expect(modes).toContain('consult');
      expect(modes).toContain('assessment');
    });

    it('should not include overwritten modes twice', () => {
      factory.register(createMockStrategy('consult'));
      factory.register(createMockStrategy('consult'));

      expect(factory.getRegisteredModes()).toEqual(['consult']);
    });
  });

  describe('IModeStrategy interface', () => {
    it('should allow strategy to implement preProcess', async () => {
      const expectedResult: PreProcessResult = {
        systemPromptAddition: 'Additional context for consult mode',
        skipStandardProcessing: false,
      };
      const mockStrategy: IModeStrategy = {
        mode: 'consult',
        preProcess: jest.fn().mockResolvedValue(expectedResult),
        postProcess: jest.fn().mockResolvedValue({}),
        enhanceSystemPrompt: jest.fn().mockResolvedValue('prompt'),
      };

      const context: ModeContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['file-1'],
        hasDocuments: true,
      };

      const result = await mockStrategy.preProcess(context);

      expect(mockStrategy.preProcess).toHaveBeenCalledWith(context);
      expect(result).toEqual(expectedResult);
    });

    it('should allow strategy to implement postProcess', async () => {
      const expectedResult: PostProcessResult = {
        triggerScoring: true,
        enrichInBackground: false,
        autoSummarize: true,
      };
      const mockStrategy: IModeStrategy = {
        mode: 'scoring',
        preProcess: jest.fn().mockResolvedValue({}),
        postProcess: jest.fn().mockResolvedValue(expectedResult),
        enhanceSystemPrompt: jest.fn().mockResolvedValue('prompt'),
      };

      const context: ModeContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await mockStrategy.postProcess(
        context,
        'Claude response text'
      );

      expect(mockStrategy.postProcess).toHaveBeenCalledWith(
        context,
        'Claude response text'
      );
      expect(result).toEqual(expectedResult);
    });

    it('should allow strategy to implement enhanceSystemPrompt', async () => {
      const mockStrategy: IModeStrategy = {
        mode: 'assessment',
        preProcess: jest.fn().mockResolvedValue({}),
        postProcess: jest.fn().mockResolvedValue({}),
        enhanceSystemPrompt: jest
          .fn()
          .mockImplementation((basePrompt: string, context: ModeContext) =>
            Promise.resolve(
              `${basePrompt}\n\nAssessment mode: reviewing ${context.fileIds.length} documents.`
            )
          ),
      };

      const context: ModeContext = {
        conversationId: 'conv-3',
        userId: 'user-3',
        fileIds: ['file-1', 'file-2'],
        hasDocuments: true,
      };

      const result = await mockStrategy.enhanceSystemPrompt(
        'Base system prompt',
        context
      );

      expect(mockStrategy.enhanceSystemPrompt).toHaveBeenCalledWith(
        'Base system prompt',
        context
      );
      expect(result).toBe(
        'Base system prompt\n\nAssessment mode: reviewing 2 documents.'
      );
    });

    it('should support PreProcessResult with customResponse', async () => {
      const expectedResult: PreProcessResult = {
        skipStandardProcessing: true,
        customResponse:
          'This action is not available in the current context.',
      };
      const mockStrategy: IModeStrategy = {
        mode: 'consult',
        preProcess: jest.fn().mockResolvedValue(expectedResult),
        postProcess: jest.fn().mockResolvedValue({}),
        enhanceSystemPrompt: jest.fn().mockResolvedValue('prompt'),
      };

      const context: ModeContext = {
        conversationId: 'conv-4',
        userId: 'user-4',
        fileIds: [],
        hasDocuments: false,
      };

      const result = await mockStrategy.preProcess(context);

      expect(result.skipStandardProcessing).toBe(true);
      expect(result.customResponse).toBe(
        'This action is not available in the current context.'
      );
    });
  });
});
