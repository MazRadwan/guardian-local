/**
 * IClaudeClient Interface
 *
 * Defines the contract for Claude API integration
 * Used by application services to interact with Claude API
 */

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * JSON Schema property type for tool input definitions
 */
export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
}

/**
 * Tool definition for Claude API
 */
export interface ClaudeTool {
  /** Unique tool name */
  name: string;
  /** Description of when/how to use the tool */
  description: string;
  /** JSON Schema for tool input */
  input_schema: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Tool use block from Claude's response
 */
export interface ToolUseBlock {
  type: 'tool_use';
  /** Unique ID for this tool use */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Input parameters for the tool */
  input: Record<string, unknown>;
}

/**
 * Tool result to send back to Claude (if needed)
 */
export interface ToolResultBlock {
  type: 'tool_result';
  /** Must match the tool_use id */
  tool_use_id: string;
  /** Result content */
  content: string;
}

export interface ClaudeResponse {
  content: string;
  stop_reason: string;
  model: string;
  /** Tool use blocks if Claude called any tools */
  toolUse?: ToolUseBlock[];
}

export interface StreamChunk {
  content: string;
  isComplete: boolean;
  /** Tool use if Claude is calling a tool (only on final chunk) */
  toolUse?: ToolUseBlock[];
  /** Stop reason from Claude */
  stopReason?: string;
}

export interface ClaudeRequestOptions {
  systemPrompt?: string;
  cachedPromptId?: string; // Optional prompt caching handle (future use)
  usePromptCache?: boolean; // Flag to send system prompt with cache_control (Anthropic prompt caching)
  /** Optional tools to make available to Claude */
  tools?: ClaudeTool[];
}

export interface IClaudeClient {
  /**
   * Send a message to Claude and get a complete response
   * @param messages - Conversation history
   * @param options - Optional request settings (system prompt, cached prompt id)
   * @returns Claude's response
   */
  sendMessage(
    messages: ClaudeMessage[],
    options?: ClaudeRequestOptions
  ): Promise<ClaudeResponse>;

  /**
   * Stream a message from Claude (for real-time responses)
   * @param messages - Conversation history
   * @param options - Optional request settings (system prompt, cached prompt id)
   * @yields Chunks of the response as they arrive
   */
  streamMessage(
    messages: ClaudeMessage[],
    options?: ClaudeRequestOptions
  ): AsyncGenerator<StreamChunk>;
}
