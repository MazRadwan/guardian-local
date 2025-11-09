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

export interface IClaudeClient {
  /**
   * Send a message to Claude and get a complete response
   * @param messages - Conversation history
   * @param systemPrompt - System prompt for context
   * @returns Claude's response
   */
  sendMessage(
    messages: ClaudeMessage[],
    systemPrompt?: string
  ): Promise<ClaudeResponse>;

  /**
   * Stream a message from Claude (for real-time responses)
   * @param messages - Conversation history
   * @param systemPrompt - System prompt for context
   * @yields Chunks of the response as they arrive
   */
  streamMessage(
    messages: ClaudeMessage[],
    systemPrompt?: string
  ): AsyncGenerator<StreamChunk>;
}
