/**
 * ScoringLLMService - LLM orchestration for scoring
 *
 * Extracted from ScoringService.scoreWithClaude() (lines 352-418) for
 * single responsibility. Handles prompt building, LLM streaming, and
 * tool payload extraction.
 *
 * Zero behavioral change from original method.
 */

import { ILLMClient } from '../interfaces/ILLMClient.js';
import { IPromptBuilder } from '../interfaces/IPromptBuilder.js';
import { scoringCompleteTool } from '../../domain/scoring/tools/scoringComplete.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import { ScoringParseResult } from '../interfaces/IScoringDocumentParser.js';

/**
 * Result of LLM scoring - narrative text + structured tool payload
 */
export interface ScoreWithClaudeResult {
  narrativeReport: string;
  payload: unknown;
}

/**
 * ScoringLLMService handles the LLM interaction for scoring:
 * - Builds system and user prompts via IPromptBuilder port
 * - Streams LLM response via ILLMClient port
 * - Extracts scoring_complete tool payload
 * - Handles abort signal
 */
export class ScoringLLMService {
  constructor(
    private llmClient: ILLMClient,
    private promptBuilder: IPromptBuilder
  ) {}

  /**
   * Proxy to ILLMClient.getModelId() for report data provenance.
   * ScoringService needs this for ScoringReportData.modelId.
   */
  getModelId(): string {
    return this.llmClient.getModelId();
  }

  /**
   * Send responses to Claude for scoring
   *
   * NOTE: Uses ports (ILLMClient, IPromptBuilder) - no infrastructure imports
   */
  async scoreWithClaude(
    parseResult: ScoringParseResult,
    vendorName: string,
    solutionName: string,
    solutionType: SolutionType,
    abortSignal: AbortSignal,
    onMessage: (message: string) => void
  ): Promise<ScoreWithClaudeResult> {
    // Build prompts using port (not infrastructure import)
    const systemPrompt = this.promptBuilder.buildScoringSystemPrompt();
    const userPrompt = this.promptBuilder.buildScoringUserPrompt({
      vendorName,
      solutionName,
      solutionType, // CRITICAL: Determines composite score weights
      responses: parseResult.responses.map(r => ({
        sectionNumber: r.sectionNumber,
        questionNumber: r.questionNumber,
        questionText: r.questionText,
        responseText: r.responseText,
      })),
    });

    // Call LLM via port (not ClaudeClient directly)
    let narrativeReport = '';
    let toolPayload: unknown = null;

    await this.llmClient.streamWithTool({
      systemPrompt,
      userPrompt,
      tools: [scoringCompleteTool],
      // CRITICAL: Force Claude to use the scoring_complete tool
      // Without this, Claude may write narrative but skip calling the tool
      tool_choice: { type: 'any' },
      // Enable prompt caching for the large scoring rubric system prompt
      // Reduces input token costs by 30-50% for repeated scoring requests
      usePromptCache: true,
      // Scoring output includes 10 dimensions with findings, executive summary,
      // and key findings. 8K tokens provides headroom for comprehensive analysis.
      maxTokens: 8000,
      // Use temperature 0 for deterministic, reproducible scoring output
      temperature: 0,
      abortSignal,
      onTextDelta: (delta) => {
        narrativeReport += delta;
        // Emit progress updates periodically
        if (narrativeReport.length % 500 === 0) {
          onMessage('Generating risk assessment...');
        }
      },
      onToolUse: (toolName, input) => {
        if (toolName === 'scoring_complete') {
          toolPayload = input;
        }
      },
    });

    // P2 Fix: Check if abort caused the missing tool payload
    // When user aborts mid-stream, streamWithTool exits early before tool fires
    if (!toolPayload) {
      if (abortSignal.aborted) {
        throw new Error('Scoring aborted');
      }
      throw new Error('Claude did not call scoring_complete tool');
    }

    return { narrativeReport, payload: toolPayload };
  }
}
