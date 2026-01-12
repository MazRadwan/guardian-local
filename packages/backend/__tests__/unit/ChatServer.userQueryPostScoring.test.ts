/**
 * Unit tests for ChatServer user query post-scoring (Epic 18.4.3)
 *
 * When a user uploads a questionnaire in Scoring mode with a message like
 * "Score this and tell me about security", the query should be addressed
 * AFTER scoring completes.
 */

import type { ParseStatus, FileRecord } from '../../src/application/interfaces/IFileRepository.js';
import type { ScoringProgressEvent } from '../../src/domain/scoring/types.js';
import type { ClaudeMessage } from '../../src/application/interfaces/IClaudeClient.js';

/**
 * Simulate buildScoringFollowUpContext logic for testing
 *
 * This mirrors the ChatServer.buildScoringFollowUpContext() method
 */
function buildScoringFollowUpContext(report: {
  payload: {
    compositeScore: number;
    overallRiskRating: string;
    recommendation: string;
    executiveSummary: string;
    keyFindings: string[];
    dimensionScores: Array<{
      dimension: string;
      score: number;
      riskRating: string;
    }>;
  };
}): string {
  const { payload } = report;

  // Format dimension scores for context
  const dimensionSummary = payload.dimensionScores
    .map(ds => `- ${ds.dimension}: ${ds.score}/10 (${ds.riskRating})`)
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

/**
 * Simulate triggerScoringOnSend with userQuery support for testing
 */
async function triggerScoringOnSend(
  fileIds: string[],
  conversationId: string,
  userId: string,
  userQuery: string | undefined,
  fileRepository: {
    findById: (id: string) => Promise<FileRecord | null>;
    tryStartParsing: (id: string) => Promise<boolean>;
    updateParseStatus: (id: string, status: ParseStatus) => Promise<void>;
  },
  conversationService: {
    getConversation: (id: string) => Promise<{ assessmentId?: string | null } | null>;
    sendMessage: (msg: unknown) => Promise<{ id: string }>;
  },
  scoringService: {
    score: (
      input: { assessmentId: string; conversationId: string; fileId: string; userId: string },
      onProgress: (event: ScoringProgressEvent) => void
    ) => Promise<{
      success: boolean;
      batchId: string;
      error?: string;
      code?: string;
      report?: {
        payload: {
          compositeScore: number;
          recommendation: string;
          overallRiskRating: string;
          executiveSummary: string;
          keyFindings: string[];
          dimensionScores: Array<{ dimension: string; score: number; riskRating: string }>;
        };
        narrativeReport: string;
      };
    }>;
  },
  claudeClient: {
    streamMessage: (messages: ClaudeMessage[], options: { systemPrompt: string }) => AsyncGenerator<{
      isComplete: boolean;
      content?: string;
    }>;
    lastCallArgs?: { messages: ClaudeMessage[]; options: { systemPrompt: string } };
  },
  buildConversationContext: () => Promise<{
    messages: ClaudeMessage[];
    systemPrompt: string;
    mode: string;
  }>,
  emittedEvents: Array<{ event: string; data: unknown }>
): Promise<{
  processed: string[];
  failed: string[];
  followUpGenerated: boolean;
  followUpContent?: string;
}> {
  const results = {
    processed: [] as string[],
    failed: [] as string[],
    followUpGenerated: false,
    followUpContent: undefined as string | undefined,
  };

  for (const fileId of fileIds) {
    try {
      // Get file record
      const file = await fileRepository.findById(fileId);
      if (!file) {
        results.failed.push(fileId);
        continue;
      }

      // Idempotency check
      const started = await fileRepository.tryStartParsing(fileId);
      if (!started) {
        continue;
      }

      // Get conversation for assessmentId
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || !conversation.assessmentId) {
        emittedEvents.push({
          event: 'scoring_error',
          data: { conversationId, error: 'No assessment linked', code: 'NO_ASSESSMENT' },
        });
        await fileRepository.updateParseStatus(fileId, 'failed');
        results.failed.push(fileId);
        continue;
      }

      const assessmentId = conversation.assessmentId;

      // Emit scoring started
      emittedEvents.push({
        event: 'scoring_started',
        data: { assessmentId, fileId, conversationId },
      });

      // Run scoring
      const scoringResult = await scoringService.score(
        { assessmentId, conversationId, fileId, userId },
        (event) => {
          emittedEvents.push({ event: 'scoring_progress', data: { conversationId, ...event } });
        }
      );

      if (scoringResult.success && scoringResult.report) {
        await fileRepository.updateParseStatus(fileId, 'completed');
        emittedEvents.push({
          event: 'scoring_complete',
          data: {
            conversationId,
            result: scoringResult.report.payload,
            narrativeReport: scoringResult.report.narrativeReport,
          },
        });
        results.processed.push(fileId);

        // Epic 18.4.3: Address user query after scoring
        if (userQuery && userQuery.trim().length > 0) {
          try {
            // Build context with scoring results
            const scoringContext = buildScoringFollowUpContext(scoringResult.report);

            // Get conversation history
            const { messages, systemPrompt } = await buildConversationContext();

            // Build enhanced prompt
            const enhancedPrompt = `${systemPrompt}

${scoringContext}

The user submitted this questionnaire with a question. The scoring has completed.
Now address their question using the scoring results above as context.
Be specific and reference actual scores and findings from the assessment.
If they asked about a specific dimension or topic, focus your answer on that area.`;

            // Store call args for verification
            claudeClient.lastCallArgs = { messages, options: { systemPrompt: enhancedPrompt } };

            // Emit typing indicator
            emittedEvents.push({
              event: 'assistant_stream_start',
              data: { conversationId },
            });

            // Stream Claude response
            let fullResponse = '';
            for await (const chunk of claudeClient.streamMessage(messages, { systemPrompt: enhancedPrompt })) {
              if (!chunk.isComplete && chunk.content) {
                fullResponse += chunk.content;
                emittedEvents.push({
                  event: 'assistant_token',
                  data: { conversationId, token: chunk.content },
                });
              }
            }

            // Save response
            const followUpMessage = await conversationService.sendMessage({
              conversationId,
              role: 'assistant',
              content: { text: fullResponse },
            });

            // Emit complete
            emittedEvents.push({
              event: 'assistant_done',
              data: {
                conversationId,
                messageId: followUpMessage.id,
                fullText: fullResponse,
              },
            });

            results.followUpGenerated = true;
            results.followUpContent = fullResponse;
          } catch (error) {
            // Non-fatal - scoring already completed
            emittedEvents.push({
              event: 'message',
              data: {
                role: 'assistant',
                content: "I've completed the scoring. I tried to address your question but encountered an issue. Feel free to ask again.",
                conversationId,
              },
            });
          }
        }
      } else {
        await fileRepository.updateParseStatus(fileId, 'failed');
        emittedEvents.push({
          event: 'scoring_error',
          data: { conversationId, error: scoringResult.error, code: scoringResult.code },
        });
        results.failed.push(fileId);
      }
    } catch (err) {
      await fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
      results.failed.push(fileId);
    }
  }

  return results;
}

describe('ChatServer - User Query Post-Scoring (Epic 18.4.3)', () => {
  const createMockFile = (
    id: string,
    parseStatus: ParseStatus = 'pending'
  ): FileRecord => ({
    id,
    userId: 'user-1',
    conversationId: 'conv-1',
    filename: `${id}.pdf`,
    mimeType: 'application/pdf',
    size: 1000,
    storagePath: `uploads/${id}.pdf`,
    createdAt: new Date(),
    textExcerpt: null,
    parseStatus,
    detectedDocType: null,
    detectedVendorName: null,
  });

  const createMockScoringReport = (overrides?: Partial<{
    compositeScore: number;
    recommendation: string;
    overallRiskRating: string;
  }>) => ({
    payload: {
      compositeScore: overrides?.compositeScore ?? 72,
      recommendation: overrides?.recommendation ?? 'conditional',
      overallRiskRating: overrides?.overallRiskRating ?? 'medium',
      executiveSummary: 'The vendor demonstrates moderate compliance with healthcare AI requirements.',
      keyFindings: [
        'Strong data encryption practices',
        'Missing SOC 2 Type II certification',
        'Limited incident response documentation',
      ],
      dimensionScores: [
        { dimension: 'data_privacy', score: 8, riskRating: 'low' },
        { dimension: 'security', score: 6, riskRating: 'medium' },
        { dimension: 'compliance', score: 5, riskRating: 'medium' },
      ],
    },
    narrativeReport: 'Risk assessment complete. Overall risk rating: Medium.',
  });

  // Helper to create async generator for streaming
  function createMockStreamGenerator(response: string): AsyncGenerator<{ isComplete: boolean; content?: string }> {
    const chunks = response.split(' ').map(word => word + ' ');
    let index = 0;
    let completeSent = false;

    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        if (index < chunks.length) {
          return { value: { isComplete: false, content: chunks[index++] }, done: false };
        }
        // Send isComplete: true once, then terminate the generator
        if (!completeSent) {
          completeSent = true;
          return { value: { isComplete: true }, done: false };
        }
        return { value: undefined, done: true };
      },
      async return() {
        return { value: undefined, done: true };
      },
      async throw() {
        return { value: undefined, done: true };
      },
    } as AsyncGenerator<{ isComplete: boolean; content?: string }>;
  }

  describe('triggerScoringOnSend with userQuery', () => {
    it('should address user query after scoring completes', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const followUpResponse = 'Based on the scoring results, here are the key security concerns: The vendor scored 6/10 on security, indicating a medium risk level.';

      let streamMessageCalled = false;
      const claudeClient = {
        lastCallArgs: undefined as { messages: ClaudeMessage[]; options: { systemPrompt: string } } | undefined,
        streamMessage: (_messages: ClaudeMessage[], _options: { systemPrompt: string }) => {
          streamMessageCalled = true;
          return createMockStreamGenerator(followUpResponse);
        },
      };

      const results = await triggerScoringOnSend(
        ['file-1'],
        'conv-1',
        'user-1',
        'Score this and tell me about security',
        {
          findById: async () => file,
          tryStartParsing: async () => true,
          updateParseStatus: async () => {},
        },
        {
          getConversation: async () => ({ assessmentId: 'assess-1' }),
          sendMessage: async () => ({ id: 'msg-follow-up' }),
        },
        {
          score: async () => ({
            success: true,
            batchId: 'batch-1',
            report: createMockScoringReport(),
          }),
        },
        claudeClient,
        async () => ({
          messages: [{ role: 'user' as const, content: 'Score this and tell me about security' }],
          systemPrompt: 'You are a healthcare AI risk assessment assistant.',
          mode: 'scoring',
        }),
        emittedEvents
      );

      expect(results.processed).toEqual(['file-1']);
      expect(results.followUpGenerated).toBe(true);

      // Verify Claude was called with scoring context
      expect(streamMessageCalled).toBe(true);
      expect(claudeClient.lastCallArgs).toBeDefined();
      expect(claudeClient.lastCallArgs!.options.systemPrompt).toContain('Scoring Results Context');
      expect(claudeClient.lastCallArgs!.options.systemPrompt).toContain('**Composite Score:** 72/100');
      expect(claudeClient.lastCallArgs!.options.systemPrompt).toContain('security: 6/10 (medium)');

      // Verify follow-up events emitted
      expect(emittedEvents).toContainEqual({
        event: 'assistant_stream_start',
        data: { conversationId: 'conv-1' },
      });

      const doneEvent = emittedEvents.find(e => e.event === 'assistant_done');
      expect(doneEvent).toBeDefined();
      expect((doneEvent?.data as { messageId: string }).messageId).toBe('msg-follow-up');
    });

    it('should skip follow-up when userQuery is empty', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      let streamMessageCalled = false;
      const claudeClient = {
        lastCallArgs: undefined as { messages: ClaudeMessage[]; options: { systemPrompt: string } } | undefined,
        streamMessage: () => {
          streamMessageCalled = true;
          return createMockStreamGenerator('Response');
        },
      };

      const results = await triggerScoringOnSend(
        ['file-1'],
        'conv-1',
        'user-1',
        '',  // Empty query
        {
          findById: async () => file,
          tryStartParsing: async () => true,
          updateParseStatus: async () => {},
        },
        {
          getConversation: async () => ({ assessmentId: 'assess-1' }),
          sendMessage: async () => ({ id: 'msg-1' }),
        },
        {
          score: async () => ({
            success: true,
            batchId: 'batch-1',
            report: createMockScoringReport(),
          }),
        },
        claudeClient,
        async () => ({ messages: [], systemPrompt: '', mode: 'scoring' }),
        emittedEvents
      );

      expect(results.processed).toEqual(['file-1']);
      expect(results.followUpGenerated).toBe(false);

      // Claude should NOT be called for follow-up
      expect(streamMessageCalled).toBe(false);

      // Scoring should still complete
      expect(emittedEvents).toContainEqual({
        event: 'scoring_complete',
        data: expect.objectContaining({ conversationId: 'conv-1' }),
      });
    });

    it('should skip follow-up when userQuery is whitespace only', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      let streamMessageCalled = false;
      const claudeClient = {
        lastCallArgs: undefined as { messages: ClaudeMessage[]; options: { systemPrompt: string } } | undefined,
        streamMessage: () => {
          streamMessageCalled = true;
          return createMockStreamGenerator('Response');
        },
      };

      const results = await triggerScoringOnSend(
        ['file-1'],
        'conv-1',
        'user-1',
        '   \t\n  ',  // Whitespace only
        {
          findById: async () => file,
          tryStartParsing: async () => true,
          updateParseStatus: async () => {},
        },
        {
          getConversation: async () => ({ assessmentId: 'assess-1' }),
          sendMessage: async () => ({ id: 'msg-1' }),
        },
        {
          score: async () => ({
            success: true,
            batchId: 'batch-1',
            report: createMockScoringReport(),
          }),
        },
        claudeClient,
        async () => ({ messages: [], systemPrompt: '', mode: 'scoring' }),
        emittedEvents
      );

      expect(results.followUpGenerated).toBe(false);
      expect(streamMessageCalled).toBe(false);
    });

    it('should skip follow-up when userQuery is undefined', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      let streamMessageCalled = false;
      const claudeClient = {
        lastCallArgs: undefined as { messages: ClaudeMessage[]; options: { systemPrompt: string } } | undefined,
        streamMessage: () => {
          streamMessageCalled = true;
          return createMockStreamGenerator('Response');
        },
      };

      const results = await triggerScoringOnSend(
        ['file-1'],
        'conv-1',
        'user-1',
        undefined,  // No query
        {
          findById: async () => file,
          tryStartParsing: async () => true,
          updateParseStatus: async () => {},
        },
        {
          getConversation: async () => ({ assessmentId: 'assess-1' }),
          sendMessage: async () => ({ id: 'msg-1' }),
        },
        {
          score: async () => ({
            success: true,
            batchId: 'batch-1',
            report: createMockScoringReport(),
          }),
        },
        claudeClient,
        async () => ({ messages: [], systemPrompt: '', mode: 'scoring' }),
        emittedEvents
      );

      expect(results.followUpGenerated).toBe(false);
      expect(streamMessageCalled).toBe(false);
    });

    it('should handle Claude error gracefully', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      const claudeClient = {
        lastCallArgs: undefined as { messages: ClaudeMessage[]; options: { systemPrompt: string } } | undefined,
        streamMessage: (): AsyncGenerator<{ isComplete: boolean; content?: string }> => {
          throw new Error('Claude API rate limit exceeded');
        },
      };

      const results = await triggerScoringOnSend(
        ['file-1'],
        'conv-1',
        'user-1',
        'Tell me about security',
        {
          findById: async () => file,
          tryStartParsing: async () => true,
          updateParseStatus: async () => {},
        },
        {
          getConversation: async () => ({ assessmentId: 'assess-1' }),
          sendMessage: async () => ({ id: 'msg-1' }),
        },
        {
          score: async () => ({
            success: true,
            batchId: 'batch-1',
            report: createMockScoringReport(),
          }),
        },
        claudeClient,
        async () => ({ messages: [], systemPrompt: 'Test', mode: 'scoring' }),
        emittedEvents
      );

      // Scoring should still succeed
      expect(results.processed).toEqual(['file-1']);

      // Follow-up should fail gracefully
      expect(results.followUpGenerated).toBe(false);

      // Should emit error message
      const errorMessage = emittedEvents.find(
        e => e.event === 'message' &&
        (e.data as { content: string }).content.includes("I've completed the scoring")
      );
      expect(errorMessage).toBeDefined();
    });

    it('should include scoring results in follow-up context', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const customReport = createMockScoringReport({
        compositeScore: 85,
        recommendation: 'approve',
        overallRiskRating: 'low',
      });

      const claudeClient = {
        lastCallArgs: undefined as { messages: ClaudeMessage[]; options: { systemPrompt: string } } | undefined,
        streamMessage: (_messages: ClaudeMessage[], _options: { systemPrompt: string }) => {
          return createMockStreamGenerator('Response');
        },
      };

      await triggerScoringOnSend(
        ['file-1'],
        'conv-1',
        'user-1',
        'What are the main risks?',
        {
          findById: async () => file,
          tryStartParsing: async () => true,
          updateParseStatus: async () => {},
        },
        {
          getConversation: async () => ({ assessmentId: 'assess-1' }),
          sendMessage: async () => ({ id: 'msg-follow-up' }),
        },
        {
          score: async () => ({
            success: true,
            batchId: 'batch-1',
            report: customReport,
          }),
        },
        claudeClient,
        async () => ({ messages: [], systemPrompt: 'Base prompt', mode: 'scoring' }),
        emittedEvents
      );

      // Verify context includes all scoring results (using markdown bold format)
      const enhancedPrompt = claudeClient.lastCallArgs!.options.systemPrompt;

      expect(enhancedPrompt).toContain('**Composite Score:** 85/100');
      expect(enhancedPrompt).toContain('**Overall Risk Rating:** low');
      expect(enhancedPrompt).toContain('**Recommendation:** approve');
      expect(enhancedPrompt).toContain('data_privacy: 8/10 (low)');
      expect(enhancedPrompt).toContain('security: 6/10 (medium)');
      expect(enhancedPrompt).toContain('Missing SOC 2 Type II certification');
      expect(enhancedPrompt).toContain('moderate compliance');
    });
  });

  describe('buildScoringFollowUpContext', () => {
    it('should format dimension scores correctly', () => {
      const report = createMockScoringReport();
      const context = buildScoringFollowUpContext(report);

      // Note: The actual format uses markdown bold (**) for labels
      expect(context).toContain('**Composite Score:** 72/100');
      expect(context).toContain('data_privacy: 8/10 (low)');
      expect(context).toContain('security: 6/10 (medium)');
      expect(context).toContain('compliance: 5/10 (medium)');
    });

    it('should include all key findings', () => {
      const report = createMockScoringReport();
      const context = buildScoringFollowUpContext(report);

      expect(context).toContain('Strong data encryption practices');
      expect(context).toContain('Missing SOC 2 Type II certification');
      expect(context).toContain('Limited incident response documentation');
    });

    it('should include executive summary', () => {
      const report = createMockScoringReport();
      const context = buildScoringFollowUpContext(report);

      expect(context).toContain('### Executive Summary:');
      expect(context).toContain('moderate compliance with healthcare AI requirements');
    });

    it('should format with proper markdown sections', () => {
      const report = createMockScoringReport();
      const context = buildScoringFollowUpContext(report);

      expect(context).toContain('## Scoring Results Context');
      expect(context).toContain('### Dimension Scores:');
      expect(context).toContain('### Key Findings:');
      expect(context).toContain('### Executive Summary:');
    });
  });
});
