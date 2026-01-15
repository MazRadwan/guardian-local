import type { JSONSchemaProperty } from './IClaudeClient.js';

/**
 * Port for LLM client - application layer abstraction
 * Infrastructure layer implements this with ClaudeClient
 */
export interface ILLMClient {
  /**
   * Stream a conversation with tool support
   */
  streamWithTool(options: StreamWithToolOptions): Promise<void>;

  /**
   * Get the model identifier for provenance
   */
  getModelId(): string;
}

/**
 * Tool choice configuration for LLM API
 * Matches Anthropic SDK's ToolChoice type for strict compatibility
 */
export type LLMToolChoice =
  | { type: 'auto' }                    // LLM decides whether to use tools
  | { type: 'any' }                     // LLM must use at least one tool
  | { type: 'tool'; name: string };     // Force LLM to use specific tool (name required)

export interface StreamWithToolOptions {
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  /** Force Claude to use a specific tool - essential for structured output */
  tool_choice?: LLMToolChoice;
  /** Enable Anthropic prompt caching for system prompt (reduces input token costs by 30-50%) */
  usePromptCache?: boolean;
  /** Maximum output tokens for the LLM response. Defaults to 8192 for backward compatibility.
   *  For scoring, 2500 is recommended as tool payload only needs ~1200 tokens. */
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
}

/**
 * Tool definition compatible with Claude API
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
}
