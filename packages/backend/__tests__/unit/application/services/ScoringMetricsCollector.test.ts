/**
 * Unit tests for ScoringMetricsCollector
 *
 * Epic 39 Story 39.3.2: Tests metrics calculation including
 * cache hit rate, cost estimation, and structured logging.
 */

import {
  ScoringMetricsCollector,
  type ClaudeUsageData,
  type ScoringCallMetrics,
} from '../../../../src/application/services/ScoringMetricsCollector.js';

describe('ScoringMetricsCollector', () => {
  describe('fromUsage', () => {
    it('should calculate cache hit rate correctly with mixed tokens', () => {
      const usage: ClaudeUsageData = {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 3000);

      // cache_read / (input + cache_read) = 4000 / (1000 + 4000) = 0.8
      expect(metrics.cacheHitRate).toBe(0.8);
      expect(metrics.inputTokens).toBe(1000);
      expect(metrics.outputTokens).toBe(500);
      expect(metrics.cacheReadInputTokens).toBe(4000);
      expect(metrics.cacheCreationInputTokens).toBe(0);
      expect(metrics.latencyMs).toBe(3000);
    });

    it('should return 0 cache hit rate with no cache tokens', () => {
      const usage: ClaudeUsageData = {
        input_tokens: 2000,
        output_tokens: 800,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 5000);

      // cache_read / (input + cache_read) = 0 / (2000 + 0) = 0
      expect(metrics.cacheHitRate).toBe(0);
    });

    it('should return 1.0 cache hit rate when all tokens are cached', () => {
      const usage: ClaudeUsageData = {
        input_tokens: 0,
        output_tokens: 300,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 0,
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 1500);

      // cache_read / (input + cache_read) = 5000 / (0 + 5000) = 1.0
      expect(metrics.cacheHitRate).toBe(1.0);
    });

    it('should handle undefined usage gracefully', () => {
      const metrics = ScoringMetricsCollector.fromUsage(undefined, 2000);

      expect(metrics.inputTokens).toBe(0);
      expect(metrics.outputTokens).toBe(0);
      expect(metrics.cacheReadInputTokens).toBe(0);
      expect(metrics.cacheCreationInputTokens).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
      expect(metrics.latencyMs).toBe(2000);
      expect(metrics.estimatedCostUSD).toBe(0);
    });

    it('should handle partial usage data (missing fields)', () => {
      const usage: ClaudeUsageData = {
        input_tokens: 1000,
        // output_tokens, cache fields omitted
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 1000);

      expect(metrics.inputTokens).toBe(1000);
      expect(metrics.outputTokens).toBe(0);
      expect(metrics.cacheReadInputTokens).toBe(0);
      expect(metrics.cacheCreationInputTokens).toBe(0);
    });

    it('should calculate cost estimation matching Sonnet 4.5 pricing formula', () => {
      // Sonnet 4.5: Input $3/MTok, Output $15/MTok, Cache read $0.30/MTok, Cache write $3.75/MTok
      const usage: ClaudeUsageData = {
        input_tokens: 1_000_000,   // 1M tokens -> $3.00
        output_tokens: 1_000_000,  // 1M tokens -> $15.00
        cache_read_input_tokens: 1_000_000,    // 1M tokens -> $0.30
        cache_creation_input_tokens: 1_000_000, // 1M tokens -> $3.75
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 10000);

      // Total: $3.00 + $15.00 + $0.30 + $3.75 = $22.05
      expect(metrics.estimatedCostUSD).toBeCloseTo(22.05, 2);
    });

    it('should calculate cost correctly for realistic scoring scenario', () => {
      // Realistic scoring: ~5K input, ~2K output, ~8K cache read, ~5K cache write
      const usage: ClaudeUsageData = {
        input_tokens: 5000,
        output_tokens: 2000,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 5000,
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 4500);

      // (5000*3 + 2000*15 + 8000*0.30 + 5000*3.75) / 1_000_000
      // = (15000 + 30000 + 2400 + 18750) / 1_000_000
      // = 66150 / 1_000_000
      // = 0.066150
      expect(metrics.estimatedCostUSD).toBeCloseTo(0.06615, 5);
    });

    it('should return 0 cache hit rate when both input and cache_read are 0', () => {
      const usage: ClaudeUsageData = {
        input_tokens: 0,
        output_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      };

      const metrics = ScoringMetricsCollector.fromUsage(usage, 500);

      // totalInput = 0, so cacheHitRate = 0 (division guard)
      expect(metrics.cacheHitRate).toBe(0);
    });

    it('should preserve latencyMs exactly as provided', () => {
      const metrics = ScoringMetricsCollector.fromUsage(undefined, 12345);
      expect(metrics.latencyMs).toBe(12345);
    });
  });

  describe('log', () => {
    it('should output structured JSON with all fields', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const now = new Date('2026-02-17T10:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => now as unknown as Date);

      const metrics: ScoringCallMetrics = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: 4000,
        cacheCreationInputTokens: 0,
        cacheHitRate: 0.8,
        latencyMs: 3000,
        estimatedCostUSD: 0.0115,
      };

      ScoringMetricsCollector.log(metrics, { assessmentId: 'assess-123' });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedJson = JSON.parse(consoleSpy.mock.calls[0][0]);

      expect(loggedJson.event).toBe('scoring_metrics');
      expect(loggedJson.inputTokens).toBe(1000);
      expect(loggedJson.outputTokens).toBe(500);
      expect(loggedJson.cacheReadInputTokens).toBe(4000);
      expect(loggedJson.cacheCreationInputTokens).toBe(0);
      expect(loggedJson.cacheHitRate).toBe(0.8);
      expect(loggedJson.latencyMs).toBe(3000);
      expect(loggedJson.estimatedCostUSD).toBe(0.0115);
      expect(loggedJson.assessmentId).toBe('assess-123');
      expect(loggedJson.timestamp).toBeDefined();

      consoleSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('should work without context', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const metrics: ScoringCallMetrics = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheHitRate: 0,
        latencyMs: 100,
        estimatedCostUSD: 0,
      };

      ScoringMetricsCollector.log(metrics);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedJson = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedJson.event).toBe('scoring_metrics');
      expect(loggedJson.assessmentId).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });
});
