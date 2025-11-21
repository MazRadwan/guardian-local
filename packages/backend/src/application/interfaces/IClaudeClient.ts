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

export interface ClaudeResponse {
  content: string;
  stop_reason: string;
  model: string;
}

export interface StreamChunk {
  content: string;
  isComplete: boolean;
}

export interface ClaudeRequestOptions {
  systemPrompt?: string;
  cachedPromptId?: string; // Optional prompt caching handle (future use)
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
