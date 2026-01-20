# Story 28.9.3: Implement ToolUseRegistry with IToolUseHandler pattern

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Implement ToolUseRegistry that uses the existing `IToolUseHandler` interface pattern. This replaces hard-coded tool handling with a registry-based approach.

---

## Acceptance Criteria

- [ ] `ToolUseRegistry.ts` created at `infrastructure/websocket/`
- [ ] Uses existing `IToolUseHandler` interface from `application/interfaces/`
- [ ] Register handlers by tool name
- [ ] QuestionnaireReadyService registered via registry
- [ ] Unit tests cover registration and dispatch
- [ ] **Architecture: Registry in infrastructure, handlers in application**

---

## Technical Approach

The existing `IToolUseHandler` interface (at `application/interfaces/IToolUseHandler.ts`) is comprehensive with:
- `ToolUseInput` (toolName, toolUseId, input)
- `ToolUseResult` (handled, emitEvent?, toolResult?, error?)
- `ToolUseContext` (conversationId, userId, assessmentId, mode)

```typescript
// infrastructure/websocket/ToolUseRegistry.ts

import {
  IToolUseHandler,
  ToolUseInput,
  ToolUseContext,
  ToolUseResult
} from '../../application/interfaces/IToolUseHandler';

/**
 * ToolUseRegistry - Registry for tool use handlers
 *
 * ARCHITECTURE: Lives in infrastructure layer.
 * Handlers (like QuestionnaireReadyService) are in application layer
 * and injected via constructor, not via ChatContext.
 */
export class ToolUseRegistry {
  private handlers: Map<string, IToolUseHandler> = new Map();

  /**
   * Register a handler (uses handler.toolName property)
   */
  register(handler: IToolUseHandler): void {
    const toolName = handler.toolName;
    if (this.handlers.has(toolName)) {
      console.warn(`[ToolUseRegistry] Overwriting handler for tool: ${toolName}`);
    }
    this.handlers.set(toolName, handler);
    console.log(`[ToolUseRegistry] Registered handler for tool: ${toolName}`);
  }

  /**
   * Get handler for a tool name
   */
  getHandler(toolName: string): IToolUseHandler | undefined {
    return this.handlers.get(toolName);
  }

  /**
   * Check if a handler is registered
   */
  hasHandler(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Dispatch tool use to registered handler
   */
  async dispatch(
    input: ToolUseInput,
    context: ToolUseContext
  ): Promise<ToolUseResult> {
    const handler = this.handlers.get(input.toolName);

    if (!handler) {
      console.log(`[ToolUseRegistry] No handler for tool: ${input.toolName}`);
      return { handled: false };
    }

    try {
      return await handler.handle(input, context);
    } catch (error) {
      console.error(`[ToolUseRegistry] Error dispatching tool ${input.toolName}:`, error);
      return { handled: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ToolUseRegistry.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/ToolUseRegistry.test.ts` - Create

---

## Tests Required

```typescript
import {
  IToolUseHandler,
  ToolUseInput,
  ToolUseContext,
  ToolUseResult
} from '../../../application/interfaces/IToolUseHandler';

describe('ToolUseRegistry', () => {
  let registry: ToolUseRegistry;

  beforeEach(() => {
    registry = new ToolUseRegistry();
  });

  describe('register', () => {
    it('should register handler using handler.toolName', () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'test_tool',
        handle: jest.fn(),
      };

      registry.register(mockHandler);

      expect(registry.hasHandler('test_tool')).toBe(true);
      expect(registry.getHandler('test_tool')).toBe(mockHandler);
    });

    it('should overwrite existing handler with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      const handler1: IToolUseHandler = {
        toolName: 'test_tool',
        handle: jest.fn(),
      };
      const handler2: IToolUseHandler = {
        toolName: 'test_tool',
        handle: jest.fn(),
      };

      registry.register(handler1);
      registry.register(handler2);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overwriting'));
      expect(registry.getHandler('test_tool')).toBe(handler2);
    });

    it('should list all registered tool names', () => {
      registry.register({ toolName: 'tool_a', handle: jest.fn() });
      registry.register({ toolName: 'tool_b', handle: jest.fn() });

      expect(registry.getRegisteredTools()).toEqual(['tool_a', 'tool_b']);
    });
  });

  describe('dispatch', () => {
    it('should dispatch with ToolUseInput and ToolUseContext', async () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'questionnaire_ready',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };
      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'questionnaire_ready',
        toolUseId: 'tool-123',
        input: { vendorName: 'TestVendor' },
      };
      const context: ToolUseContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentId: 'assess-1',
        mode: 'assessment',
      };

      const result = await registry.dispatch(input, context);

      expect(mockHandler.handle).toHaveBeenCalledWith(input, context);
      expect(result.handled).toBe(true);
    });

    it('should return handled: false for unknown tool', async () => {
      const input: ToolUseInput = {
        toolName: 'unknown_tool',
        toolUseId: 'tool-456',
        input: {},
      };
      const context: ToolUseContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentId: null,
      };

      const result = await registry.dispatch(input, context);

      expect(result.handled).toBe(false);
    });

    it('should catch handler errors and return handled: false with error', async () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'error_tool',
        handle: jest.fn().mockRejectedValue(new Error('Handler failed')),
      };
      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'error_tool',
        toolUseId: 'tool-789',
        input: {},
      };
      const context: ToolUseContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentId: null,
      };

      const result = await registry.dispatch(input, context);

      expect(result.handled).toBe(false);
      expect(result.error).toBe('Handler failed');
    });
  });
});
```

---

## Definition of Done

- [ ] ToolUseRegistry created
- [ ] Follows IToolUseHandler pattern
- [ ] Unit tests passing
