# Story 28.10.1: Define IModeStrategy interface (optional)

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Define the `IModeStrategy` interface for mode-specific behavior. This is an optional enhancement that enables cleaner mode handling.

**Note:** This story and 28.10.2-4 are optional. If time is limited, skip to 28.11.x stories.

---

## Acceptance Criteria

- [ ] `IModeStrategy.ts` created at `infrastructure/websocket/modes/`
- [ ] Interface defines preProcess, postProcess, enhanceSystemPrompt
- [ ] ModeStrategyFactory for strategy selection
- [ ] Unit tests for factory

---

## Technical Approach

```typescript
// infrastructure/websocket/modes/IModeStrategy.ts

export interface ModeContext {
  conversationId: string;
  userId: string;
  fileIds: string[];
  hasDocuments: boolean;
}

export interface PreProcessResult {
  systemPromptAddition?: string;
  skipStandardProcessing?: boolean;
  customResponse?: string;
}

export interface PostProcessResult {
  triggerScoring?: boolean;
  enrichInBackground?: boolean;
  autoSummarize?: boolean;
}

/**
 * IModeStrategy - Strategy interface for mode-specific behavior
 *
 * Each mode (consult, assessment, scoring) can have different:
 * - System prompt additions
 * - Pre-processing logic
 * - Post-processing logic
 */
export interface IModeStrategy {
  readonly mode: 'consult' | 'assessment' | 'scoring';

  /**
   * Pre-process before Claude call
   */
  preProcess(context: ModeContext): Promise<PreProcessResult>;

  /**
   * Post-process after Claude response
   */
  postProcess(context: ModeContext, response: string): Promise<PostProcessResult>;

  /**
   * Enhance system prompt for this mode
   */
  enhanceSystemPrompt(basePrompt: string, context: ModeContext): Promise<string>;
}

/**
 * Factory to get strategy for a mode
 */
export class ModeStrategyFactory {
  private strategies: Map<string, IModeStrategy> = new Map();

  register(strategy: IModeStrategy): void {
    this.strategies.set(strategy.mode, strategy);
  }

  getStrategy(mode: string): IModeStrategy | undefined {
    return this.strategies.get(mode);
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/modes/IModeStrategy.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/modes/ModeStrategyFactory.test.ts` - Create

---

## Tests Required

```typescript
describe('ModeStrategyFactory', () => {
  it('should register and retrieve strategies', () => {
    const factory = new ModeStrategyFactory();
    const mockStrategy: IModeStrategy = {
      mode: 'consult',
      preProcess: jest.fn(),
      postProcess: jest.fn(),
      enhanceSystemPrompt: jest.fn(),
    };

    factory.register(mockStrategy);
    expect(factory.getStrategy('consult')).toBe(mockStrategy);
  });

  it('should return undefined for unregistered mode', () => {
    const factory = new ModeStrategyFactory();
    expect(factory.getStrategy('unknown')).toBeUndefined();
  });
});
```

---

## Definition of Done

- [ ] IModeStrategy interface defined
- [ ] ModeStrategyFactory created
- [ ] Unit tests passing
