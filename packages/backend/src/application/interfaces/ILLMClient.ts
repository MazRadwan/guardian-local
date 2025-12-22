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

export interface StreamWithToolOptions {
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  abortSignal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
}
