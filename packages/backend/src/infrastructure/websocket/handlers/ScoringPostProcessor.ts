/**
 * ScoringPostProcessor - Handles post-score behaviors after scoring completes
 *
 * Story 39.4.5: Extracted from ScoringHandler.ts (~567 LOC)
 *
 * Responsibilities:
 * 1. processSuccess: result data assembly, scoring_complete emission, file status update,
 *    narrative persistence, assessment linking, follow-up query flow
 * 2. processFailure: file status update, scoring_error emission, error message persistence
 * 3. handleFollowUpQuery: streaming Claude response addressing user's question (Epic 18.4.3)
 * 4. buildScoringFollowUpContext: pure formatting function for scoring context
 *
 * CRITICAL BEHAVIORS (preserved from ScoringHandler):
 * 1. scoring_complete resultData includes batchId + assessmentId
 * 2. Narrative message persistence (NO components -- card from scoring_complete)
 * 3. conversationService.linkAssessment() (non-fatal on failure)
 * 4. Follow-up query flow when userQuery provided
 * 5. scoring_error includes code field for frontend handling
 */

import type { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import type { IClaudeClient, ClaudeMessage } from '../../../application/interfaces/IClaudeClient.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ScoringReportData } from '../../../domain/scoring/types.js';
import type { ScoringOutput } from '../../../application/interfaces/IScoringService.js';

/** Context builder function type for follow-up queries */
export type BuildConversationContext = (
  conversationId: string
) => Promise<{ messages: ClaudeMessage[]; systemPrompt: string }>;

export class ScoringPostProcessor {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly claudeClient: IClaudeClient
  ) {}

  /**
   * Handle successful scoring: emit results, persist narrative, link assessment
   *
   * @param socket - Authenticated socket to emit events to
   * @param conversationId - Conversation being scored
   * @param fileId - File that was scored
   * @param scoringResult - Output from scoring service
   * @param userQuery - Optional user query to address after scoring (Epic 18.4.3)
   * @param buildConversationContext - Optional context builder for follow-up queries
   */
  async processSuccess(
    socket: IAuthenticatedSocket,
    conversationId: string,
    fileId: string,
    scoringResult: ScoringOutput,
    userQuery?: string,
    buildConversationContext?: BuildConversationContext
  ): Promise<void> {
    const report = scoringResult.report!;

    // Epic 18: Get assessmentId from the scoring report (extracted from document)
    const assessmentId = report.assessmentId;

    // Build result data for frontend - MUST include batchId + assessmentId
    const resultData = {
      compositeScore: report.payload.compositeScore,
      recommendation: report.payload.recommendation,
      overallRiskRating: report.payload.overallRiskRating,
      executiveSummary: report.payload.executiveSummary,
      keyFindings: report.payload.keyFindings,
      dimensionScores: report.payload.dimensionScores.map(ds => ({
        dimension: ds.dimension,
        score: ds.score,
        riskRating: ds.riskRating,
        findings: ds.findings ?? undefined,
      })),
      batchId: scoringResult.batchId,  // CRITICAL: Include batchId
      assessmentId,                     // CRITICAL: Include assessmentId
    };

    // Emit scoring complete with results
    socket.emit('scoring_complete', {
      conversationId,
      result: resultData,
      narrativeReport: report.narrativeReport,
    });

    // Mark file as completed
    await this.fileRepository.updateParseStatus(fileId, 'completed');

    // =========================================================
    // CRITICAL: Post-score behaviors
    // =========================================================

    // 1. Save narrative report as assistant message
    // Note: Don't include scoring_result component here - it's already displayed
    // from the store state set by scoring_complete event. Including it would cause
    // duplicate card rendering.
    const narrativeText = report.narrativeReport ||
      `Risk assessment complete. Composite score: ${report.payload.compositeScore}/100. ` +
      `Overall risk: ${report.payload.overallRiskRating}. ` +
      `Recommendation: ${report.payload.recommendation}.`;

    const reportMessage = await this.conversationService.sendMessage({
      conversationId,
      role: 'assistant',
      content: {
        text: narrativeText,
        // No components - scoring card rendered from store state via scoring_complete event
      },
    });

    // 2. Emit the message for display (narrative only, card is from scoring_complete)
    socket.emit('message', {
      id: reportMessage.id,
      conversationId: reportMessage.conversationId,
      role: reportMessage.role,
      content: reportMessage.content,
      createdAt: reportMessage.createdAt,
    });

    // 3. Epic 22.1.1: Link assessment to conversation for rehydration
    // Non-fatal - scoring already succeeded, don't emit scoring_error if this fails
    try {
      await this.conversationService.linkAssessment(conversationId, assessmentId);
    } catch (linkError) {
      console.warn(`[ScoringPostProcessor] Failed to link assessment (non-fatal):`, linkError);
    }

    console.log(`[ScoringPostProcessor] Scoring completed: assessmentId=${assessmentId}, score=${report.payload.compositeScore}`);

    // =========================================================
    // 4. Epic 18.4.3: Address user query after scoring
    // =========================================================
    if (userQuery && userQuery.trim().length > 0 && buildConversationContext) {
      await this.handleFollowUpQuery(
        socket,
        conversationId,
        userQuery,
        report,
        buildConversationContext
      );
    }
  }

  /**
   * Handle failed scoring: emit error, persist error message
   *
   * @param socket - Authenticated socket to emit events to
   * @param conversationId - Conversation being scored
   * @param fileId - File that failed scoring
   * @param error - Error message
   * @param code - Error code for frontend handling
   */
  async processFailure(
    socket: IAuthenticatedSocket,
    conversationId: string,
    fileId: string,
    error: string,
    code: string
  ): Promise<void> {
    // 1. Update file parse status to 'failed'
    await this.fileRepository.updateParseStatus(fileId, 'failed');

    // 2. Emit scoring_error with code field
    socket.emit('scoring_error', {
      conversationId,
      error,
      code,
    });

    // 3. Save error as system message
    await this.conversationService.sendMessage({
      conversationId,
      role: 'system',
      content: { text: `[System: Scoring failed - ${error}]` },
    });
  }

  /**
   * Epic 18.4.3: Handle follow-up user query after scoring
   *
   * Streams a Claude response addressing the user's question using
   * the scoring results as context.
   *
   * @param socket - Socket to emit streaming events
   * @param conversationId - Conversation ID
   * @param userQuery - User's question to address
   * @param report - Scoring report for context
   * @param buildConversationContext - Context builder function
   */
  private async handleFollowUpQuery(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userQuery: string,
    report: ScoringReportData,
    buildConversationContext: BuildConversationContext
  ): Promise<void> {
    console.log(`[ScoringPostProcessor] Addressing user query after scoring: "${userQuery.slice(0, 50)}..."`);

    try {
      // Build context with scoring results
      const scoringContext = this.buildScoringFollowUpContext(report);

      // Get conversation history (includes scoring narrative)
      const { messages, systemPrompt } = await buildConversationContext(conversationId);

      // Build enhanced prompt with scoring context
      const enhancedPrompt = `${systemPrompt}

${scoringContext}

The user submitted this questionnaire with a question. The scoring has completed.
Now address their question using the scoring results above as context.
Be specific and reference actual scores and findings from the assessment.
If they asked about a specific dimension or topic, focus your answer on that area.`;

      // Emit typing indicator
      socket.emit('assistant_stream_start', { conversationId });

      // Stream Claude response
      let fullResponse = '';

      for await (const chunk of this.claudeClient.streamMessage(messages, { systemPrompt: enhancedPrompt })) {
        if (!chunk.isComplete && chunk.content) {
          fullResponse += chunk.content;
          socket.emit('assistant_token', {
            conversationId,
            token: chunk.content,
          });
        }
      }

      // Save assistant response
      const followUpMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: fullResponse },
      });

      // Emit stream complete
      socket.emit('assistant_done', {
        conversationId,
        messageId: followUpMessage.id,
        fullText: fullResponse,
      });

      console.log(`[ScoringPostProcessor] User query addressed (${fullResponse.length} chars)`);
    } catch (error) {
      console.error('[ScoringPostProcessor] Failed to address user query:', error);
      // Non-fatal - scoring already completed
      socket.emit('message', {
        role: 'assistant',
        content: "I've completed the scoring. I tried to address your question but encountered an issue. Feel free to ask again.",
        conversationId,
      });
    }
  }

  /**
   * Story 28.7.2: Build scoring context for follow-up questions
   *
   * CRITICAL: This is a synchronous pure formatting function that takes the report
   * directly - it does NOT call any service to fetch scoring state.
   *
   * Only called when userQuery exists after scoring completes.
   * Made public for direct unit testing.
   *
   * @param report - Scoring report data with payload containing scores and findings
   * @returns Formatted scoring context string
   */
  buildScoringFollowUpContext(report: { payload: ScoringReportData['payload'] }): string {
    const { payload } = report;

    // Format dimension scores for context
    const dimensionSummary = payload.dimensionScores
      .map(ds => `- ${ds.dimension}: ${ds.score}/100 (${ds.riskRating})`)
      .join('\n');

    return `
## Scoring Results Context

**Composite Score:** ${payload.compositeScore}/100
**Overall Risk Rating:** ${payload.overallRiskRating}
**Recommendation:** ${payload.recommendation}

### Dimension Scores:
${dimensionSummary}

### Key Findings:
${payload.keyFindings.map(f => `- ${f}`).join('\n')}

### Executive Summary:
${payload.executiveSummary}
`;
  }
}
