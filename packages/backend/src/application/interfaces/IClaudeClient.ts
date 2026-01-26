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
  type: string | string[]; // Can be 'string' or ['string', 'null'] for union types
  description?: string;
  enum?: readonly string[] | string[];
  const?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
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

/**
 * Tool choice configuration for Claude API
 */
export type ClaudeToolChoice =
  | { type: 'auto' }           // Claude decides whether to use tools
  | { type: 'any' }            // Claude must use at least one tool
  | { type: 'tool'; name: string }; // Force Claude to use specific tool

export interface ClaudeRequestOptions {
  systemPrompt?: string;
  cachedPromptId?: string; // Optional prompt caching handle (future use)
  usePromptCache?: boolean; // Flag to send system prompt with cache_control (Anthropic prompt caching)
  /** Optional tools to make available to Claude */
  tools?: ClaudeTool[];
  /** Control how Claude uses tools */
  tool_choice?: ClaudeToolChoice;
  /** Override max tokens (default 4096, use higher for large outputs like questionnaires) */
  maxTokens?: number;
  /** Abort signal to cancel the request (Story 20.3.3) */
  abortSignal?: AbortSignal;
}

/**
 * Import type for ImageContentBlock (Epic 30 Sprint 3)
 * Note: Using import type to avoid circular dependencies
 */
import type { ImageContentBlock } from '../../infrastructure/ai/types/vision.js';

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
   *
   * Epic 30 Sprint 3: Added optional imageBlocks parameter for Vision API support.
   * When imageBlocks are provided, they are merged into the last user message
   * as ContentBlock arrays for Claude's Vision API.
   *
   * @param messages - Conversation history (domain format, string content)
   * @param options - Optional request settings (system prompt, cached prompt id)
   * @param imageBlocks - Optional image content blocks to include in last user message
   * @yields Chunks of the response as they arrive
   */
  streamMessage(
    messages: ClaudeMessage[],
    options?: ClaudeRequestOptions,
    imageBlocks?: ImageContentBlock[]
  ): AsyncGenerator<StreamChunk>;
}
