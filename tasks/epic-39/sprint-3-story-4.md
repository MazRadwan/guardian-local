# Story 39.3.4: Multi-Block User Prompt Spike

## Description

Investigate whether the Anthropic API supports `cache_control` on individual user content blocks within a multi-block user message. If supported, this enables caching the ISO catalog portion of the user prompt separately from the vendor responses, achieving optimal caching (Option C from the goals doc): static system prompt (cached) + ISO catalog in user prompt (cached) + vendor responses (uncached).

**This is a spike.** The current `ClaudeClient.streamWithTool()` accepts `userPrompt` as a `string`. Multi-block content requires changing the interface to accept `ContentBlock[]`. The spike determines:
1. Does the API support `cache_control` on user content blocks?
2. Does it actually produce cache hits across calls with same ISO, different vendor data?
3. Is the latency/cost improvement measurable?

If the spike proves viable, implement the interface change. If not, document findings and close as "deferred."

## Acceptance Criteria

- [ ] Spike result documented: viable or deferred (with evidence)
- [ ] If viable:
  - [ ] `StreamWithToolOptions.userPrompt` type changed to `string | ContentBlock[]`
  - [ ] `ClaudeClient.streamWithTool()` handles both string and array user prompts
  - [ ] `ScoringPromptBuilder.buildScoringUserPrompt()` returns multi-block content with `cache_control` on ISO block
  - [ ] Metrics show cache hits on ISO catalog block across scoring calls
- [ ] If deferred:
  - [ ] Document why (API limitation, no measurable improvement, etc.)
  - [ ] No code changes shipped
- [ ] Under 300 LOC for any modified file
- [ ] No TypeScript errors

## Technical Approach

### 1. API Investigation

Test with a minimal script (not production code):
```typescript
// Test: Does cache_control work on user content blocks?
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  system: [{ type: 'text', text: 'Static rubric...', cache_control: { type: 'ephemeral' } }],
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'ISO catalog...', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Vendor responses (unique per call)...' },
    ],
  }],
  // ...
});
// Check response.usage.cache_read_input_tokens
```

Run this 3 times with same ISO, different vendor data. If `cache_read_input_tokens` includes the ISO block size, caching works.

### 2. Interface Change (If Viable)

**File:** `packages/backend/src/application/interfaces/ILLMClient.ts`

```typescript
export interface ContentBlockForPrompt {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface StreamWithToolOptions {
  systemPrompt: string;
  userPrompt: string | ContentBlockForPrompt[];  // Changed from string-only
  // ... rest unchanged
}
```

**File:** `packages/backend/src/infrastructure/ai/ClaudeClient.ts`

In `streamWithTool()`, handle both formats:
```typescript
const messages: ClaudeMessage[] = [
  {
    role: 'user',
    content: typeof userPrompt === 'string'
      ? userPrompt
      : userPrompt  // Already ContentBlock[] format
  },
];
```

### 3. Metrics Validation

Use `ScoringMetricsCollector` (from Story 39.3.2) to compare:
- **Before:** ISO in user prompt as plain text (no per-block caching)
- **After:** ISO in user prompt as cached block

Minimum 5 runs per configuration. Compare `cache_read_input_tokens`.

## Files Touched

- `packages/backend/src/application/interfaces/ILLMClient.ts` - MODIFY (if viable: extend userPrompt type)
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - MODIFY (if viable: handle multi-block)
- `packages/backend/src/infrastructure/ai/ScoringPromptBuilder.ts` - MODIFY (if viable: return multi-block)
- `scripts/spike-multi-block-caching.ts` - CREATE (investigation script, not production)

## Tests Affected

Existing tests that may need updates (if interface changes):
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - If userPrompt type changes, mock may need updating.
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Indirect, via ScoringLLMService.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] If viable:
  - Test ClaudeClient.streamWithTool handles string userPrompt (backward compatible)
  - Test ClaudeClient.streamWithTool handles ContentBlock[] userPrompt
  - Test ScoringPromptBuilder returns multi-block content with cache_control
  - Test cache hit metrics are non-zero for ISO block across calls
- [ ] If deferred:
  - Document findings in spike script comments
  - No tests needed (no code changes)

## Definition of Done

- [ ] Spike completed with documented result
- [ ] If viable: interface change implemented, tested, metrics show improvement
- [ ] If deferred: findings documented, no code changes shipped
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No lint errors
