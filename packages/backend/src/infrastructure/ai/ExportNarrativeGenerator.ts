/**
 * ExportNarrativeGenerator Infrastructure Implementation
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.2: Export Service Narrative Generation Integration
 *
 * Implements IExportNarrativeGenerator using IExportNarrativePromptBuilder
 * and IClaudeClient for LLM-powered narrative generation.
 */

import {
  IExportNarrativeGenerator,
  NarrativeGenerationParams,
} from '../../application/interfaces/IExportNarrativeGenerator.js';
import { IExportNarrativePromptBuilder } from '../../application/interfaces/IExportNarrativePromptBuilder.js';
import { IClaudeClient } from '../../application/interfaces/IClaudeClient.js';
import { getMaxTokens } from '../ai/ClaudeClientBase.js';
import { validateNarrativeMessaging } from '../../domain/compliance/isoMessagingTerms.js';

/**
 * Infrastructure implementation of IExportNarrativeGenerator
 *
 * Uses:
 * - IExportNarrativePromptBuilder for building system/user prompts
 * - IClaudeClient for LLM calls
 *
 * Clean Architecture: This is infrastructure layer, implementing
 * application layer port (IExportNarrativeGenerator).
 */
export class ExportNarrativeGenerator implements IExportNarrativeGenerator {
  constructor(
    private readonly promptBuilder: IExportNarrativePromptBuilder,
    private readonly claudeClient: IClaudeClient
  ) {}

  /**
   * Generate a detailed markdown narrative for export
   *
   * @param params - Assessment data and evidence responses
   * @returns Generated markdown narrative
   * @throws Error if LLM call fails
   */
  async generateNarrative(params: NarrativeGenerationParams): Promise<string> {
    const {
      vendorName,
      solutionName,
      solutionType,
      result,
      dimensionScores,
      responses,
    } = params;

    // Build prompts using the prompt builder
    const systemPrompt = this.promptBuilder.buildNarrativeSystemPrompt();
    const userPrompt = this.promptBuilder.buildNarrativeUserPrompt({
      vendorName,
      solutionName,
      solutionType,
      compositeScore: result.compositeScore,
      overallRiskRating: result.overallRiskRating,
      recommendation: result.recommendation,
      dimensionScores,
      keyFindings: result.keyFindings || [],
      executiveSummary: result.executiveSummary || '',
      topResponses: responses.map((r) => ({
        sectionNumber: r.sectionNumber,
        questionNumber: r.questionNumber,
        questionText: r.questionText,
        responseText: r.responseText,
      })),
    });

    // Call Claude to generate narrative
    const response = await this.claudeClient.sendMessage(
      [{ role: 'user', content: userPrompt }],
      {
        systemPrompt,
        // Narrative includes detailed analysis for all 10 dimensions with evidence,
        // strengths/weaknesses, and recommendations. 16K tokens for comprehensive reports.
        maxTokens: getMaxTokens(16000),
      }
    );

    // Extract and clean the markdown narrative
    const narrative = this.extractMarkdown(response.content);

    if (!narrative || narrative.trim().length === 0) {
      throw new Error('LLM returned empty narrative');
    }

    return validateNarrativeMessaging(narrative);
  }

  /**
   * Extract markdown content from Claude's response
   *
   * Claude may wrap the response in markdown code blocks or include
   * preamble text. This method extracts just the markdown content.
   *
   * @param content - Raw response from Claude
   * @returns Cleaned markdown content
   */
  private extractMarkdown(content: string): string {
    // If response is wrapped in markdown code block, extract it
    const codeBlockMatch = content.match(/```(?:markdown|md)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Otherwise, return the content directly (Claude usually responds with raw markdown)
    return content.trim();
  }
}
