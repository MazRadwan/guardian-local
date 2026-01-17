# Story 20.3.2: Configurable maxTokens for Scoring

## Description
Make the `maxTokens` parameter configurable in `ILLMClient.streamWithTool()` instead of hardcoding 8192. For scoring, the tool payload only needs ~1,200 tokens, so the default can be reduced to 2,500 (with safety margin).

## Acceptance Criteria
- [ ] `maxTokens` is an optional parameter in `StreamWithToolOptions`
- [ ] Default value for scoring is 2,500 (configurable)
- [ ] Existing calls without maxTokens use sensible default
- [ ] No change to scoring output quality
- [ ] Reduces potential token waste on runaway responses

## Technical Approach

### 1. Update ILLMClient Interface

```typescript
// ILLMClient.ts
export interface StreamWithToolOptions {
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  tool_choice?: LLMToolChoice;
  abortSignal?: AbortSignal;
  usePromptCache?: boolean;
  maxTokens?: number;  // NEW: Configurable output tokens
  onTextDelta?: (delta: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
}
```

### 2. Update ClaudeClient Implementation

```typescript
// ClaudeClient.ts
async streamWithTool(options: StreamWithToolOptions): Promise<void> {
  const {
    systemPrompt,
    userPrompt,
    tools,
    tool_choice,
    abortSignal,
    usePromptCache,
    maxTokens = 8192,  // Default for backward compatibility
    onTextDelta,
    onToolUse,
  } = options;

  const stream = await this.client.messages.stream({
    model: this.model,
    max_tokens: maxTokens,  // Use configurable value
    system: /* ... */,
    messages: /* ... */,
    tools: /* ... */,
    // ...
  });
}
```

### 3. Update ScoringService

Set appropriate maxTokens for scoring:

```typescript
// ScoringService.ts - scoreWithClaude method
await this.llmClient.streamWithTool({
  systemPrompt,
  userPrompt,
  tools: [scoringCompleteTool],
  tool_choice: { type: 'any' },
  maxTokens: 2500,  // Reduced from 8192 - tool payload needs ~1,200
  abortSignal,
  onTextDelta: (delta) => { /* ... */ },
  onToolUse: (toolName, input) => { /* ... */ },
});
```

### 4. Token Budget Analysis

The `scoring_complete` tool schema requires approximately:
- 10 dimensions * ~100 tokens each = 1,000 tokens
- Executive summary: ~100 tokens
- Key findings: ~100 tokens
- Total: ~1,200 tokens

Setting maxTokens to 2,500 provides ~2x safety margin.

## Files Touched
- `packages/backend/src/application/interfaces/ILLMClient.ts` - Add `maxTokens` to options
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Use configurable maxTokens
- `packages/backend/src/application/services/ScoringService.ts` - Set maxTokens for scoring

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: maxTokens parameter passed to Claude API
- [ ] Unit test: Default maxTokens used when not specified
- [ ] Unit test: Custom maxTokens value used when specified
- [ ] Integration test: Scoring succeeds with reduced maxTokens

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Scoring output unchanged with lower maxTokens
