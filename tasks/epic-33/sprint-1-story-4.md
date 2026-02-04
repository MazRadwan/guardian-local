# Story 33.1.4: Claude Client Tool Result Support

## Description

Extend the Claude client to support follow-up API calls with `tool_result` content blocks. When Claude returns a `tool_use` stop reason, the calling code needs to send a follow-up message containing the tool result. This requires supporting mixed content arrays (text + tool_result blocks) in the messages parameter.

## Acceptance Criteria

- [ ] `IClaudeClient.ts` updated with new `continueWithToolResult` method signature
- [ ] `ClaudeClient.ts` implements `continueWithToolResult` method
- [ ] Method streams the final response after tool_result is processed
- [ ] Correctly formats tool_result blocks per Anthropic API spec
- [ ] Handles multiple tool_results in single continuation (for future multi-tool support)
- [ ] Maintains existing streaming behavior (assistant_token events)

**NOTE:** `ToolResultBlock` type already exists in `IClaudeClient.ts` (lines 66-72). No new types needed for this story.

## Technical Approach

Extend the client to support a follow-up call pattern.

**Existing Types (NO changes needed):**
- `ToolResultBlock` already exists in `IClaudeClient.ts` (lines 66-72) with correct shape
- `ToolUseBlock` already exists in `IClaudeClient.ts` (lines 53-61)

### Tool-Result Message Contract (CRITICAL)

The message array for `continueWithToolResult` MUST follow this exact structure:

```typescript
// Message array structure for tool continuation
type MessageParam = Anthropic.MessageParam;

// STEP 1: Original conversation messages
const originalMessages: MessageParam[] = [
  { role: 'user', content: 'What are the latest HIPAA updates?' },
];

// STEP 2: Assistant message with tool_use block (Claude's response)
const assistantToolUse: MessageParam = {
  role: 'assistant',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_01abc123',          // Claude-generated ID
      name: 'web_search',
      input: { query: 'HIPAA updates 2024' },
    },
  ],
};

// STEP 3: User message with tool_result block (our response)
const userToolResult: MessageParam = {
  role: 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: 'toolu_01abc123',  // MUST match tool_use id
      content: 'Search results: ...',  // String content from tool execution
    },
  ],
};

// FINAL message array for API call:
const messages: MessageParam[] = [
  ...originalMessages,
  assistantToolUse,
  userToolResult,
];
```

**Serialization Rules:**
- `ToolUseResult.toolResult` has shape `{ toolUseId, content }` (camelCase, our internal format)
- Convert to Claude API format: `{ type: 'tool_result', tool_use_id: toolUseId, content }` (snake_case)
- The `tool_use_id` MUST exactly match the `id` from the `tool_use` block

**New Types (if needed for internal implementation):**
```typescript
// These are optional internal types for clarity, not required in interface
export interface ToolUseMessage {
  role: 'assistant';
  content: ToolUseBlock[];
}

export interface ToolResultMessage {
  role: 'user';
  content: ToolResultBlock[];
}
```

**Extended interface method:**
```typescript
interface IClaudeClient {
  // ... existing methods ...

  /**
   * Continue a conversation after tool use
   * Sends tool_result blocks back to Claude and streams the response
   */
  continueWithToolResult(
    messages: ClaudeMessage[],
    toolUseBlocks: ToolUseBlock[],
    toolResults: ToolResultBlock[],
    options?: ClaudeRequestOptions
  ): AsyncGenerator<StreamChunk>;
}
```

Implementation approach:
1. Build message array: existing messages + assistant tool_use + user tool_result
2. Call Claude API with this extended context
3. Stream response using existing mechanism

```typescript
// In ClaudeClient.ts
async *continueWithToolResult(
  messages: ClaudeMessage[],
  toolUseBlocks: ToolUseBlock[],
  toolResults: ToolResultBlock[],
  options: ClaudeRequestOptions = {}
): AsyncGenerator<StreamChunk> {
  // Build extended message history:
  // 1. Original messages
  // 2. Assistant message with tool_use blocks
  // 3. User message with tool_result blocks

  const extendedMessages = [
    ...this.toApiMessages(messages),
    {
      role: 'assistant',
      content: toolUseBlocks.map(tu => ({
        type: 'tool_use',
        id: tu.id,
        name: tu.name,
        input: tu.input,
      })),
    },
    {
      role: 'user',
      content: toolResults.map(tr => ({
        type: 'tool_result',
        tool_use_id: tr.tool_use_id,
        content: tr.content,
      })),
    },
  ];

  // Use existing streaming logic
  yield* this.streamWithExtendedMessages(extendedMessages, options);
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IClaudeClient.ts` - UPDATE: Add `continueWithToolResult` method to interface (ToolResultBlock already exists)
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - UPDATE: Implement `continueWithToolResult` method
- `packages/backend/src/infrastructure/ai/types/message.ts` - NO CHANGES (per Option A, use Anthropic SDK types internally)

**Type Approach - Option A (REQUIRED):**

The implementation MUST use Anthropic SDK types directly for the internal API call. This means:

1. **NO changes to `message.ts`** - Do not modify `ClaudeApiMessage` or `ContentBlock` types
2. **Use SDK types internally** - Import `MessageParam`, `ToolUseBlockParam`, `ToolResultBlockParam` from `@anthropic-ai/sdk`
3. **Build API messages directly** - The `continueWithToolResult` method constructs the message array using SDK types, not our internal types

```typescript
// Example of correct approach (using SDK types internally)
import Anthropic from '@anthropic-ai/sdk';

async *continueWithToolResult(...) {
  // Use Anthropic.MessageParam directly - NOT ClaudeApiMessage
  const extendedMessages: Anthropic.MessageParam[] = [
    ...this.toApiMessages(messages),
    {
      role: 'assistant',
      content: toolUseBlocks.map(tu => ({
        type: 'tool_use' as const,
        id: tu.id,
        name: tu.name,
        input: tu.input,
      })),
    },
    // ... etc
  ];
}
```

This approach keeps our internal types clean and leverages the SDK's comprehensive type definitions for API calls.

## Tests Affected

Adding `continueWithToolResult` as a required method to `IClaudeClient` will break existing test mocks that implement the interface. The following files need mock updates:

- `packages/backend/__tests__/unit/ClaudeClient.tools.test.ts` - May need updates for new method
- `packages/backend/__tests__/unit/services/*.test.ts` - Any test that mocks `IClaudeClient` needs the new method added
- `packages/backend/__tests__/unit/MessageHandler.test.ts` - If it mocks `IClaudeClient`, add stub for new method
- `packages/backend/__tests__/integration/*.test.ts` - Check for `IClaudeClient` mocks

**Mock update pattern:**
```typescript
// Add to existing IClaudeClient mocks:
continueWithToolResult: jest.fn().mockImplementation(async function* () {
  yield { type: 'text', text: 'mock response' };
}),
```

**IMPORTANT:** The implementing agent MUST search for all `IClaudeClient` mocks and update them in this story to prevent CI failures. Run:
```bash
grep -r "IClaudeClient" packages/backend/__tests__ --include="*.ts"
```

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/ClaudeClient.continueWithToolResult.test.ts`
  - Builds correct message array with tool_use and tool_result
  - Formats tool_result blocks per Anthropic API spec
  - **Serialization test: Converts { toolUseId, content } to { type: 'tool_result', tool_use_id, content }**
  - **Serialization test: tool_use_id matches original tool_use.id**
  - Streams response after tool_result submission
  - Handles multiple tool_results
  - Preserves system prompt in follow-up call
  - Maintains tool definitions in follow-up call
  - Handles API errors gracefully
  - **Message array structure test: [original messages, assistant tool_use, user tool_result]**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
