import { ToolUseRegistry } from '../../../../src/infrastructure/websocket/ToolUseRegistry.js';
import type {
  IToolUseHandler,
  ToolUseInput,
  ToolUseContext,
  ToolUseResult,
} from '../../../../src/application/interfaces/IToolUseHandler.js';

describe('ToolUseRegistry', () => {
  let registry: ToolUseRegistry;
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    registry = new ToolUseRegistry();
    // Spy on console methods to verify logging behavior
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
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

    it('should log registration message', () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'test_tool',
        handle: jest.fn(),
      };

      registry.register(mockHandler);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[ToolUseRegistry] Registered handler for tool: test_tool'
      );
    });

    it('should overwrite existing handler with warning', () => {
      const handler1: IToolUseHandler = {
        toolName: 'test_tool',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };
      const handler2: IToolUseHandler = {
        toolName: 'test_tool',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };

      registry.register(handler1);
      registry.register(handler2);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[ToolUseRegistry] Overwriting handler for tool: test_tool'
      );
      expect(registry.getHandler('test_tool')).toBe(handler2);
    });

    it('should register multiple different handlers', () => {
      const handler1: IToolUseHandler = {
        toolName: 'tool_a',
        handle: jest.fn(),
      };
      const handler2: IToolUseHandler = {
        toolName: 'tool_b',
        handle: jest.fn(),
      };

      registry.register(handler1);
      registry.register(handler2);

      expect(registry.hasHandler('tool_a')).toBe(true);
      expect(registry.hasHandler('tool_b')).toBe(true);
      expect(registry.getHandler('tool_a')).toBe(handler1);
      expect(registry.getHandler('tool_b')).toBe(handler2);
    });
  });

  describe('getHandler', () => {
    it('should return handler for registered tool', () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'my_tool',
        handle: jest.fn(),
      };
      registry.register(mockHandler);

      const retrieved = registry.getHandler('my_tool');

      expect(retrieved).toBe(mockHandler);
    });

    it('should return undefined for unregistered tool', () => {
      const retrieved = registry.getHandler('nonexistent_tool');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('hasHandler', () => {
    it('should return true for registered tool', () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'exists_tool',
        handle: jest.fn(),
      };
      registry.register(mockHandler);

      expect(registry.hasHandler('exists_tool')).toBe(true);
    });

    it('should return false for unregistered tool', () => {
      expect(registry.hasHandler('does_not_exist')).toBe(false);
    });
  });

  describe('getRegisteredTools', () => {
    it('should return empty array when no handlers registered', () => {
      expect(registry.getRegisteredTools()).toEqual([]);
    });

    it('should list all registered tool names', () => {
      registry.register({ toolName: 'tool_a', handle: jest.fn() });
      registry.register({ toolName: 'tool_b', handle: jest.fn() });

      const tools = registry.getRegisteredTools();

      expect(tools).toHaveLength(2);
      expect(tools).toContain('tool_a');
      expect(tools).toContain('tool_b');
    });

    it('should not include overwritten tools twice', () => {
      registry.register({ toolName: 'tool_a', handle: jest.fn() });
      registry.register({ toolName: 'tool_a', handle: jest.fn() });

      expect(registry.getRegisteredTools()).toEqual(['tool_a']);
    });
  });

  describe('dispatch', () => {
    it('should dispatch with ToolUseInput and ToolUseContext', async () => {
      const expectedResult: ToolUseResult = {
        handled: true,
        emitEvent: {
          event: 'questionnaire_ready',
          payload: { questionnaireId: 'q-1' },
        },
      };
      const mockHandler: IToolUseHandler = {
        toolName: 'questionnaire_ready',
        handle: jest.fn().mockResolvedValue(expectedResult),
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
      expect(result).toEqual(expectedResult);
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
      expect(result.error).toBeUndefined();
    });

    it('should log message for unknown tool', async () => {
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

      await registry.dispatch(input, context);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[ToolUseRegistry] No handler for tool: unknown_tool'
      );
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

    it('should log error for handler failures', async () => {
      const error = new Error('Handler crashed');
      const mockHandler: IToolUseHandler = {
        toolName: 'crash_tool',
        handle: jest.fn().mockRejectedValue(error),
      };
      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'crash_tool',
        toolUseId: 'tool-999',
        input: {},
      };
      const context: ToolUseContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentId: null,
      };

      await registry.dispatch(input, context);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[ToolUseRegistry] Error dispatching tool crash_tool:',
        error
      );
    });

    it('should handle non-Error thrown values', async () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'string_error_tool',
        handle: jest.fn().mockRejectedValue('String error'),
      };
      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'string_error_tool',
        toolUseId: 'tool-111',
        input: {},
      };
      const context: ToolUseContext = {
        conversationId: 'conv-1',
        userId: 'user-1',
        assessmentId: null,
      };

      const result = await registry.dispatch(input, context);

      expect(result.handled).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should pass through all ToolUseResult properties from handler', async () => {
      const expectedResult: ToolUseResult = {
        handled: true,
        emitEvent: {
          event: 'test_event',
          payload: { data: 'value' },
        },
        toolResult: {
          toolUseId: 'tool-222',
          content: '{"success": true}',
        },
      };
      const mockHandler: IToolUseHandler = {
        toolName: 'full_result_tool',
        handle: jest.fn().mockResolvedValue(expectedResult),
      };
      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'full_result_tool',
        toolUseId: 'tool-222',
        input: { param: 'value' },
      };
      const context: ToolUseContext = {
        conversationId: 'conv-2',
        userId: 'user-2',
        assessmentId: 'assess-2',
        mode: 'scoring',
      };

      const result = await registry.dispatch(input, context);

      expect(result).toEqual(expectedResult);
      expect(result.emitEvent).toEqual({
        event: 'test_event',
        payload: { data: 'value' },
      });
      expect(result.toolResult).toEqual({
        toolUseId: 'tool-222',
        content: '{"success": true}',
      });
    });

    it('should support context with optional mode', async () => {
      const mockHandler: IToolUseHandler = {
        toolName: 'mode_tool',
        handle: jest.fn().mockResolvedValue({ handled: true }),
      };
      registry.register(mockHandler);

      const input: ToolUseInput = {
        toolName: 'mode_tool',
        toolUseId: 'tool-333',
        input: {},
      };
      // Context without mode (optional field)
      const context: ToolUseContext = {
        conversationId: 'conv-3',
        userId: 'user-3',
        assessmentId: null,
      };

      await registry.dispatch(input, context);

      expect(mockHandler.handle).toHaveBeenCalledWith(input, context);
    });
  });
});
