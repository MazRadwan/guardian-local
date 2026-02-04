# Story 34.1.1: Create IConsultToolLoopService Interface

## Description

Create the interface and types for the Consult Tool Loop service. This defines the contract that the service will implement.

## Acceptance Criteria

- [ ] Interface file created at `packages/backend/src/application/interfaces/IConsultToolLoopService.ts`
- [ ] `IConsultToolLoopService` interface defined with `execute()` method
- [ ] `ConsultToolLoopOptions` type defined (input parameters)
- [ ] `ConsultToolLoopResult` type defined (return value)
- [ ] Interface exported from `application/interfaces/index.ts`

## Technical Approach

Create types based on current `executeConsultToolLoop()` signature in MessageHandler.ts.

**Current signature (MessageHandler.ts:917-924):**
```typescript
private async executeConsultToolLoop(
  socket: IAuthenticatedSocket,
  conversationId: string,
  originalMessages: ClaudeMessage[],
  firstResponse: string,
  toolUseBlocks: ToolUseBlock[],
  systemPrompt: string,
  claudeOptions: Record<string, unknown>
): Promise<StreamingResult>
```

**New interface:**

Note: Interface matches current `executeConsultToolLoop` signature exactly, preserving `claudeOptions` pattern.

```typescript
// FILE: packages/backend/src/application/interfaces/IConsultToolLoopService.ts

import type { IAuthenticatedSocket } from '../../infrastructure/websocket/ChatContext.js';
import type { ClaudeMessage, ToolUseBlock, ClaudeTool } from './IClaudeClient.js';

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
```

## Files Touched

- `packages/backend/src/application/interfaces/IConsultToolLoopService.ts` - CREATE
- `packages/backend/src/application/interfaces/index.ts` - UPDATE: Add export

## Tests Required

None - this is a type-only file. TypeScript compilation validates the types.

## Agent Assignment

- [x] backend-agent

## Definition of Done

- [ ] Interface file created with all types
- [ ] Types match current executeConsultToolLoop signature
- [ ] Exported from barrel file
- [ ] No TypeScript errors
- [ ] No lint errors
