/**
 * ScoringMetricsCollector - Captures Claude API scoring metrics
 *
 * Epic 39 Story 39.3.2: Instruments scoring calls with cache hit rate,
 * token usage, latency, and cost estimation.
 *
 * Sonnet 4.5 pricing (Feb 2026):
 *   Input: $3/MTok, Output: $15/MTok
 *   Cache read: $0.30/MTok, Cache write: $3.75/MTok
 */

/** Usage data shape from Claude API response */
export interface ClaudeUsageData {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Metrics captured from a single scoring API call */
export interface ScoringCallMetrics {
  /** Total input tokens (excluding cache) */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Tokens read from cache (cache hit) */
  cacheReadInputTokens: number;
  /** Tokens written to cache (cache miss, will be cached for next call) */
  cacheCreationInputTokens: number;
  /** Cache hit rate: cache_read / (input + cache_read). Range 0-1. */
  cacheHitRate: number;
  /** Wall clock latency in ms */
  latencyMs: number;
  /** Estimated cost in USD (based on Sonnet 4.5 pricing) */
  estimatedCostUSD: number;
}

// Sonnet 4.5 pricing constants (USD per million tokens)
const PRICE_INPUT_PER_MTOK = 3;
const PRICE_OUTPUT_PER_MTOK = 15;
const PRICE_CACHE_READ_PER_MTOK = 0.30;
const PRICE_CACHE_WRITE_PER_MTOK = 3.75;
const TOKENS_PER_MILLION = 1_000_000;

export class ScoringMetricsCollector {
  /**
   * Calculate metrics from Claude API usage response.
   *
   * @param usage - Token usage from Claude API (may be undefined)
   * @param latencyMs - Wall clock time for the streaming call
   * @returns Calculated metrics with cache hit rate and cost estimate
   */
  static fromUsage(
    usage: ClaudeUsageData | undefined,
    latencyMs: number
  ): ScoringCallMetrics {
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheCreation = usage?.cache_creation_input_tokens ?? 0;

    const totalInput = inputTokens + cacheRead;
    const cacheHitRate = totalInput > 0 ? cacheRead / totalInput : 0;

    const estimatedCostUSD =
      (inputTokens * PRICE_INPUT_PER_MTOK +
        outputTokens * PRICE_OUTPUT_PER_MTOK +
        cacheRead * PRICE_CACHE_READ_PER_MTOK +
        cacheCreation * PRICE_CACHE_WRITE_PER_MTOK) /
      TOKENS_PER_MILLION;

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
   * Log metrics as structured JSON for analysis.
   *
   * @param metrics - The calculated scoring metrics
   * @param context - Optional context (e.g., assessmentId) for correlation
   */
  static log(
    metrics: ScoringCallMetrics,
    context: { assessmentId?: string } = {}
  ): void {
    console.log(
      JSON.stringify({
        event: 'scoring_metrics',
        ...metrics,
        ...context,
        timestamp: new Date().toISOString(),
      })
    );
  }
}
