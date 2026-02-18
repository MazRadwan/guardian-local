/**
 * ScoringLLMService - LLM orchestration for scoring
 *
 * Extracted from ScoringService.scoreWithClaude() for single responsibility.
 * Handles prompt building, LLM streaming, and tool payload extraction.
 *
 * Epic 37: Added ISO control injection via IPromptBuilder optional methods.
 */

import { ILLMClient } from '../interfaces/ILLMClient.js';
import { IPromptBuilder } from '../interfaces/IPromptBuilder.js';
import { scoringCompleteTool } from '../../domain/scoring/tools/scoringComplete.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import { ScoringParseResult } from '../interfaces/IScoringDocumentParser.js';
import type { ISOControlForPrompt } from '../../domain/compliance/types.js';
import type { ScoringCallMetrics, ClaudeUsageData } from './ScoringMetricsCollector.js';
import { ScoringMetricsCollector } from './ScoringMetricsCollector.js';

/** Result of LLM scoring - narrative text + structured tool payload */
export interface ScoreWithClaudeResult {
  narrativeReport: string;
  payload: unknown;
  /** Scoring metrics (cache hit rate, cost, latency). Undefined if usage unavailable. */
  metrics?: ScoringCallMetrics;
}

/** Optional ISO control data passed to scoreWithClaude */
export interface ISOScoringOptions {
  catalogControls: ISOControlForPrompt[];
  applicableControls: ISOControlForPrompt[];
}

/**
 * ScoringLLMService handles the LLM interaction for scoring:
 * - Builds system and user prompts via IPromptBuilder port
 * - Streams LLM response via ILLMClient port
 * - Extracts scoring_complete tool payload
 * - Handles abort signal
 * - Proxies ISO data fetching through IPromptBuilder (Epic 37)
 */
export class ScoringLLMService {
  constructor(
    private llmClient: ILLMClient,
    private promptBuilder: IPromptBuilder
  ) {}

  /**
   * Proxy to ILLMClient.getModelId() for report data provenance.
   */
  getModelId(): string {
    return this.llmClient.getModelId();
  }

  /**
   * Proxy: Fetch the full ISO control catalog via IPromptBuilder.
   * ScoringService calls this to get ISO data without depending on infrastructure.
   */
  async fetchISOCatalog(): Promise<ISOControlForPrompt[]> {
    return this.promptBuilder.fetchISOCatalog?.() ?? Promise.resolve([]);
  }

  /**
   * Proxy: Fetch applicable ISO controls for specific dimensions via IPromptBuilder.
   */
  async fetchApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    return this.promptBuilder.fetchApplicableControls?.(dimensions) ?? Promise.resolve([]);
  }

  /**
   * Send responses to Claude for scoring
   *
   * NOTE: Uses ports (ILLMClient, IPromptBuilder) - no infrastructure imports
   * Epic 37: Accepts optional isoOptions to inject ISO controls into prompts
   */
  async scoreWithClaude(
    parseResult: ScoringParseResult,
    vendorName: string,
    solutionName: string,
    solutionType: SolutionType,
    abortSignal: AbortSignal,
    onMessage: (message: string) => void,
    isoOptions?: ISOScoringOptions
  ): Promise<ScoreWithClaudeResult> {
    // Build prompts using port (not infrastructure import)
    // System prompt is static and fully cacheable (no ISO controls) - Story 39.3.3
    const systemPrompt = this.promptBuilder.buildScoringSystemPrompt();
    const userPrompt = this.promptBuilder.buildScoringUserPrompt({
      vendorName,
      solutionName,
      solutionType,
      responses: parseResult.responses.map(r => ({
        sectionNumber: r.sectionNumber,
        questionNumber: r.questionNumber,
        questionText: r.questionText,
        responseText: r.responseText,
      })),
      isoControls: isoOptions?.applicableControls,
      isoCatalog: isoOptions?.catalogControls,
    });

    // Call LLM via port (not ClaudeClient directly)
    let narrativeReport = '';
    let toolPayload: unknown = null;
    let lastReportedLength = 0;
    let capturedUsage: ClaudeUsageData | undefined;
    const startTime = Date.now();

    await this.llmClient.streamWithTool({
      systemPrompt,
      userPrompt,
      tools: [scoringCompleteTool],
      tool_choice: { type: 'any' },
      usePromptCache: true,
      // Epic 37->38: Increased to 16384 -- ISO-enriched scoring produces longer
      // narrative + 10 dimension tool payload with confidence + ISO clause refs
      maxTokens: 16384,
      temperature: 0,
      abortSignal,
      onTextDelta: (delta) => {
        narrativeReport += delta;
        if (narrativeReport.length - lastReportedLength >= 500) {
          lastReportedLength = narrativeReport.length;
          onMessage('Generating risk assessment...');
        }
      },
      onToolUse: (toolName, input) => {
        if (toolName === 'scoring_complete') {
          toolPayload = input;
        }
      },
      onUsage: (usage) => {
        capturedUsage = usage;
      },
    });

    // P2 Fix: Check if abort caused the missing tool payload
    if (!toolPayload) {
      if (abortSignal.aborted) {
        throw new Error('Scoring aborted');
      }
      const narrativeLen = narrativeReport.length;
      throw new Error(
        `Claude did not call scoring_complete tool (narrative length: ${narrativeLen} chars). ` +
        'Likely hit max_tokens before tool call. Consider increasing maxTokens.'
      );
    }

    // Epic 39: Calculate scoring metrics if usage data available
    let metrics: ScoringCallMetrics | undefined;
    if (capturedUsage) {
      const latencyMs = Date.now() - startTime;
      metrics = ScoringMetricsCollector.fromUsage(capturedUsage, latencyMs);
      ScoringMetricsCollector.log(metrics);
    }

    return { narrativeReport, payload: toolPayload, metrics };
  }
}
