# Story 20.3.1: Prompt Caching for Scoring Rubric

## Description
Enable Anthropic prompt caching for the scoring system prompt, which is static (~2,500 tokens) and identical across all scoring calls. This can reduce input token costs by 30-50%.

## Acceptance Criteria
- [ ] Scoring system prompt uses `cache_control: { type: 'ephemeral' }` marker
- [ ] Cache header `anthropic-beta: prompt-caching-2024-07-31` included in requests
- [ ] Caching is toggleable via configuration (default: enabled)
- [ ] Cache hit/miss observable in logs
- [ ] No functional change to scoring behavior

## Technical Approach

### 1. Review Existing PromptCacheManager

The project already has a `PromptCacheManager` used for the Guardian conversation prompt. The scoring prompt can use similar infrastructure.

Current implementation in `PromptCacheManager.ts`:
- Computes stable hash for prompts
- Provides `usePromptCache` flag
- Works with `ClaudeClient.buildSystemPrompt()`

### 2. Option A: Extend PromptCacheManager for Scoring

Create a separate cache entry for scoring:

```typescript
// Extend ConversationMode or create ScoringMode
type PromptMode = ConversationMode | 'scoring';

// Use in ScoringService
const cacheEntry = promptCacheManager.ensureCached('scoring');
```

### 3. Option B: Direct Cache Flag in ScoringPromptBuilder (Simpler)

Add cache control directly to the prompt builder:

```typescript
// ScoringPromptBuilder.ts
buildScoringSystemPrompt(useCache: boolean = true): string | CacheableSystemPrompt {
  const prompt = buildScoringSystemPrompt();

  if (useCache) {
    return {
      type: 'text',
      text: prompt,
      cache_control: { type: 'ephemeral' }
    };
  }

  return prompt;
}
```

### 4. Update ILLMClient.streamWithTool

Add `usePromptCache` option:

```typescript
export interface StreamWithToolOptions {
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  tool_choice?: LLMToolChoice;
  abortSignal?: AbortSignal;
  usePromptCache?: boolean;  // NEW
  onTextDelta?: (delta: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
}
```

### 5. Update ClaudeClient.streamWithTool

Apply cache control when enabled:

```typescript
async streamWithTool(options: StreamWithToolOptions): Promise<void> {
  const { systemPrompt, usePromptCache, ... } = options;

  const system = usePromptCache
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : systemPrompt;

  const requestOptions = usePromptCache
    ? { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
    : undefined;

  const stream = await this.client.messages.stream({
    system,
    // ...
  }, requestOptions);
}
```

### 6. Update ScoringService

Enable caching for scoring calls:

```typescript
await this.llmClient.streamWithTool({
  systemPrompt,
  userPrompt,
  tools: [scoringCompleteTool],
  tool_choice: { type: 'any' },
  usePromptCache: true,  // NEW: Enable caching
  abortSignal,
  // ...
});
```

## Files Touched
- `packages/backend/src/application/interfaces/ILLMClient.ts` - Add `usePromptCache` option
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Implement cache control
- `packages/backend/src/application/services/ScoringService.ts` - Enable caching flag

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: Cache control header included when enabled
- [ ] Unit test: System prompt formatted with cache_control when enabled
- [ ] Unit test: Cache control not included when disabled
- [ ] Unit test: Backward compatible - works without flag

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Cache usage observable in Claude API logs
