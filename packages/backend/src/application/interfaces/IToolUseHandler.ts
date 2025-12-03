/**
 * IToolUseHandler - Interface for handling Claude tool_use responses
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * This interface defines the contract for services that handle specific
 * Claude tool calls. Each tool has a dedicated handler implementing this
 * interface, following the dependency inversion principle.
 */

/**
 * Input from Claude's tool_use response
 */
export interface ToolUseInput {
  /** Name of the tool being called */
  toolName: string;

  /** Unique ID for this tool use (from Claude API) */
  toolUseId: string;

  /** Tool input parameters (varies by tool) */
  input: Record<string, unknown>;
}

/**
 * Result of handling a tool_use
 */
export interface ToolUseResult {
  /** Whether the tool was successfully handled */
  handled: boolean;

  /** Optional event to emit via WebSocket */
  emitEvent?: {
    /** Event name (e.g., 'questionnaire_ready') */
    event: string;
    /** Event payload */
    payload: Record<string, unknown>;
  };

  /**
   * Optional tool result to send back to Claude
   * Used when Claude needs a response to continue conversation
   */
  toolResult?: {
    /** Must match the toolUseId from input */
    toolUseId: string;
    /** Result content (string or JSON stringified) */
    content: string;
  };

  /** Optional error message if handling failed */
  error?: string;
}

/**
 * Context about the current conversation/user
 */
export interface ToolUseContext {
  /** Current conversation ID */
  conversationId: string;

  /** Authenticated user ID */
  userId: string;

  /** Linked assessment ID (may be null if not yet created) */
  assessmentId: string | null;

  /** Current conversation mode */
  mode?: 'consult' | 'assessment';
}

/**
 * Interface for tool handlers
 *
 * Each tool type has a dedicated handler implementing this interface.
 * Handlers are registered with ChatServer and called when their tool is used.
 *
 * @example
 * ```typescript
 * class QuestionnaireReadyService implements IToolUseHandler {
 *   readonly toolName = 'questionnaire_ready';
 *
 *   async handle(input: ToolUseInput, context: ToolUseContext): Promise<ToolUseResult> {
 *     // Validate input, build payload, return result
 *   }
 * }
 * ```
 */
export interface IToolUseHandler {
  /** The tool name this handler responds to */
  readonly toolName: string;

  /**
   * Handle a tool_use from Claude
   *
   * @param input - The tool_use input from Claude's response
   * @param context - Context about the conversation and user
   * @returns Result indicating success/failure and optional events to emit
   */
  handle(input: ToolUseInput, context: ToolUseContext): Promise<ToolUseResult>;
}
