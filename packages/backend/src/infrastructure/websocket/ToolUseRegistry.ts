import type {
  IToolUseHandler,
  ToolUseInput,
  ToolUseContext,
  ToolUseResult,
} from '../../application/interfaces/IToolUseHandler.js';

/**
 * ToolUseRegistry - Registry for tool use handlers
 *
 * ARCHITECTURE: Lives in infrastructure layer.
 * Handlers (like QuestionnaireReadyService) are in application layer
 * and injected via constructor, not via ChatContext.
 *
 * This registry implements the Strategy pattern, allowing different
 * tool handlers to be registered and dispatched dynamically based
 * on the tool name from Claude's tool_use response.
 *
 * @example
 * ```typescript
 * const registry = new ToolUseRegistry();
 * registry.register(new QuestionnaireReadyService(assessmentRepo, questionnaireRepo));
 *
 * // Later, when Claude responds with tool_use
 * const result = await registry.dispatch(
 *   { toolName: 'questionnaire_ready', toolUseId: 'id', input: {} },
 *   { conversationId: 'conv-1', userId: 'user-1', assessmentId: null }
 * );
 * ```
 */
export class ToolUseRegistry {
  private handlers: Map<string, IToolUseHandler> = new Map();

  /**
   * Register a handler (uses handler.toolName property)
   *
   * @param handler - Handler implementing IToolUseHandler interface
   * @remarks If a handler for the same tool name already exists, it will be overwritten with a warning
   */
  register(handler: IToolUseHandler): void {
    const toolName = handler.toolName;
    if (this.handlers.has(toolName)) {
      console.warn(
        `[ToolUseRegistry] Overwriting handler for tool: ${toolName}`
      );
    }
    this.handlers.set(toolName, handler);
    console.log(`[ToolUseRegistry] Registered handler for tool: ${toolName}`);
  }

  /**
   * Get handler for a tool name
   *
   * @param toolName - Name of the tool to get handler for
   * @returns Handler if registered, undefined otherwise
   */
  getHandler(toolName: string): IToolUseHandler | undefined {
    return this.handlers.get(toolName);
  }

  /**
   * Check if a handler is registered for the given tool name
   *
   * @param toolName - Name of the tool to check
   * @returns true if handler exists, false otherwise
   */
  hasHandler(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all registered tool names
   *
   * @returns Array of registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Dispatch tool use to registered handler
   *
   * @param input - Tool use input from Claude's response
   * @param context - Context about the current conversation/user
   * @returns Result indicating success/failure and optional events to emit
   *
   * @remarks
   * - Returns { handled: false } if no handler is registered for the tool
   * - Catches and logs handler errors, returning { handled: false, error: message }
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
      console.error(
        `[ToolUseRegistry] Error dispatching tool ${input.toolName}:`,
        error
      );
      return {
        handled: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
