/**
 * IConsultToolLoopService Interface
 *
 * Story 34.1.1: Create IConsultToolLoopService interface
 * Epic 34: Moved to infrastructure layer (websocket-specific)
 *
 * Defines the contract for the Consult Tool Loop service, which handles
 * the tool_use -> tool_result -> final response flow for consult mode.
 */

import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ClaudeMessage, ToolUseBlock, ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';

/**
 * Options for executing the consult tool loop
 * Matches current executeConsultToolLoop signature exactly
 */
export interface ConsultToolLoopOptions {
  /** Authenticated WebSocket for emitting events */
  socket: IAuthenticatedSocket;
  /** Conversation ID for context and saving */
  conversationId: string;
  /** Original conversation messages */
  originalMessages: ClaudeMessage[];
  /** Claude's initial response text (before tool call) - currently unused, preserved for future */
  firstResponse: string;
  /** Tool use blocks from Claude's response */
  toolUseBlocks: ToolUseBlock[];
  /** System prompt for continuation calls */
  systemPrompt: string;
  /** Claude options including tools - matches current Record<string, unknown> pattern */
  claudeOptions: {
    tools?: ClaudeTool[];
    [key: string]: unknown;
  };
}

/**
 * Result of tool loop execution
 */
export interface ConsultToolLoopResult {
  /** Full accumulated response text */
  fullResponse: string;
  /** Tool use blocks (empty - tools already handled) */
  toolUseBlocks: ToolUseBlock[];
  /** ID of saved message (null if empty) */
  savedMessageId: string | null;
  /** Whether stream was aborted */
  wasAborted: boolean;
  /** Stop reason from Claude */
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

/**
 * Service for executing consult mode tool loops (web search)
 */
export interface IConsultToolLoopService {
  /**
   * Execute tool loop with up to MAX_TOOL_ITERATIONS searches
   *
   * Handles:
   * - Tool dispatch via ToolUseRegistry
   * - Multi-iteration context accumulation
   * - Graceful degradation when max iterations reached
   * - Abort handling at every stage
   * - tool_status event emission
   * - Final message saving
   */
  execute(options: ConsultToolLoopOptions): Promise<ConsultToolLoopResult>;
}
