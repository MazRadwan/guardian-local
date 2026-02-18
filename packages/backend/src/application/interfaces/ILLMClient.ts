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
 * Content block for multi-block user prompts (Story 39.3.4).
 * Enables per-block caching hints on user messages, e.g. caching the
 * ISO catalog block separately from vendor responses.
 */
export interface ContentBlockForPrompt {
  type: 'text';
  text: string;
  cacheable?: boolean;  // Vendor-neutral hint; infrastructure decides how to implement
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
  /** User prompt: plain string or multi-block array with per-block caching hints (Story 39.3.4) */
  userPrompt: string | ContentBlockForPrompt[];
  tools: ToolDefinition[];
  /** Force Claude to use a specific tool - essential for structured output */
  tool_choice?: LLMToolChoice;
  /** Enable Anthropic prompt caching for system prompt (reduces input token costs by 30-50%) */
  usePromptCache?: boolean;
  /** Maximum output tokens for the LLM response. Defaults to 8192 for backward compatibility.
   *  For scoring, 2500 is recommended as tool payload only needs ~1200 tokens. */
  maxTokens?: number;
  /** Temperature for sampling (0-1). Use 0 for deterministic output (e.g., scoring). */
  temperature?: number;
  abortSignal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
  /** Callback invoked at end of streaming with token usage data (for metrics collection) */
  onUsage?: (usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }) => void;
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
