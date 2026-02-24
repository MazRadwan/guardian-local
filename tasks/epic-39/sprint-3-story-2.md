# Story 39.3.2: Scoring Metrics Collector

## Description

Create a `ScoringMetricsCollector` that instruments the Claude scoring API call to capture cache hit rate, input tokens, output tokens, latency, and cost. These metrics are essential for evaluating the prompt caching optimizations in subsequent stories (39.3.3, 39.3.4). Without before/after metrics, the caching changes are assumptions, not verified improvements.

Also modify `ScoringLLMService` to collect and log these metrics after each scoring call.

## Acceptance Criteria

- [ ] `ScoringMetricsCollector` captures metrics from Claude API response usage
- [ ] Metrics captured: `cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens`, `output_tokens`
- [ ] Latency measured (wall clock time for streaming call)
- [ ] Cost estimated from token counts (using known Sonnet 4.5 pricing)
- [ ] Cache hit rate calculated: `cache_read_input_tokens / (input_tokens + cache_read_input_tokens)`
- [ ] Metrics logged as structured JSON for easy analysis
- [ ] `ScoringLLMService.scoreWithClaude()` returns metrics alongside narrative and payload
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ScoringMetricsCollector

**File:** `packages/backend/src/infrastructure/ai/ScoringMetricsCollector.ts`

```typescript
export interface ScoringCallMetrics {
  /** Total input tokens (excluding cache) */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Tokens read from cache (cache hit) */
  cacheReadInputTokens: number;
  /** Tokens written to cache (cache miss, will be cached for next call) */
  cacheCreationInputTokens: number;
  /** Cache hit rate: cache_read / (input + cache_read) */
  cacheHitRate: number;
  /** Wall clock latency in ms */
  latencyMs: number;
  /** Estimated cost in USD (based on model pricing) */
  estimatedCostUSD: number;
}

export class ScoringMetricsCollector {
  /**
   * Calculate metrics from Claude API usage response
   */
  static fromUsage(
    usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined,
    latencyMs: number
  ): ScoringCallMetrics {
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheCreation = usage?.cache_creation_input_tokens ?? 0;
    const totalInput = inputTokens + cacheRead;
    const cacheHitRate = totalInput > 0 ? cacheRead / totalInput : 0;

    // Sonnet 4.5 pricing (as of Feb 2026)
    // Input: $3/MTok, Output: $15/MTok, Cache read: $0.30/MTok, Cache write: $3.75/MTok
    const estimatedCostUSD =
      (inputTokens * 3 + outputTokens * 15 + cacheRead * 0.30 + cacheCreation * 3.75) / 1_000_000;

    return {
      inputTokens,
      outputTokens,
      cacheReadInputTokens: cacheRead,
      cacheCreationInputTokens: cacheCreation,
      cacheHitRate,
      latencyMs,
      estimatedCostUSD,
    };
  }

  /**
   * Log metrics as structured JSON
   */
  static log(metrics: ScoringCallMetrics, context: { assessmentId?: string }): void {
    console.log(JSON.stringify({
      event: 'scoring_metrics',
      ...metrics,
      ...context,
      timestamp: new Date().toISOString(),
    }));
  }
}
```

### 2. Integrate into ScoringLLMService

**File:** `packages/backend/src/application/services/ScoringLLMService.ts`

After the `streamWithTool` call completes, the stream object has `stream.currentMessage?.usage` which contains token counts. However, `ScoringLLMService` uses `ILLMClient.streamWithTool()` which does not currently expose usage data to the caller.

**Option A (recommended):** Add an `onUsage` callback to `StreamWithToolOptions`:
```typescript
// In ILLMClient.ts:
export interface StreamWithToolOptions {
  // ... existing fields ...
  onUsage?: (usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }) => void;
}
```

**Option B:** Return usage from `streamWithTool()` (changes return type from `void` to `{ usage }`, larger interface change).

Recommend Option A -- add `onUsage` callback, call it from `ClaudeClient.streamWithTool()` at the end of streaming where `usage` is already logged.

### 3. Extend ScoreWithClaudeResult

```typescript
export interface ScoreWithClaudeResult {
  narrativeReport: string;
  payload: unknown;
  metrics?: ScoringCallMetrics;  // NEW
}
```

## Files Touched

- `packages/backend/src/infrastructure/ai/ScoringMetricsCollector.ts` - CREATE (~80 LOC)
- `packages/backend/src/application/services/ScoringLLMService.ts` - MODIFY (add metrics collection, ~15 lines)
- `packages/backend/src/application/interfaces/ILLMClient.ts` - MODIFY (add onUsage callback to StreamWithToolOptions)
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - MODIFY (call onUsage callback at end of stream)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - ScoreWithClaudeResult now has optional `metrics` field. Existing assertions still valid (metrics is optional).
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - If it asserts on ScoreWithClaudeResult shape.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/ScoringMetricsCollector.test.ts`
  - Test fromUsage calculates cache hit rate correctly
  - Test fromUsage with no cache tokens returns 0 hit rate
  - Test fromUsage with all cached returns 1.0 hit rate
  - Test fromUsage handles undefined usage gracefully
  - Test cost estimation calculation matches pricing formula
  - Test log outputs structured JSON with all fields

- [ ] Update `ScoringLLMService.test.ts`:
  - Test metrics included in ScoreWithClaudeResult when usage available
  - Test metrics undefined when usage not available (graceful)

## Definition of Done

- [ ] ScoringMetricsCollector created with fromUsage and log methods
- [ ] onUsage callback added to ILLMClient interface
- [ ] ClaudeClient calls onUsage at end of streaming
- [ ] ScoringLLMService returns metrics in ScoreWithClaudeResult
- [ ] All tests passing
- [ ] Each file under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
