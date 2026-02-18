/**
 * Unit Tests for ScoringPostProcessor
 *
 * Story 39.4.5: Extracted post-score behaviors from ScoringHandler.ts
 *
 * Tests cover:
 * 1. processSuccess emits scoring_complete with batchId and assessmentId
 * 2. processSuccess persists narrative as assistant message (no components)
 * 3. processSuccess links assessment (non-fatal on failure)
 * 4. processSuccess handles follow-up query when present
 * 5. processSuccess updates file status to completed
 * 6. processFailure emits scoring_error with code field
 * 7. processFailure updates file status to failed
 * 8. processFailure persists error as system message
 * 9. buildScoringFollowUpContext formats all sections
 */

import { ScoringPostProcessor } from '../../../../../src/infrastructure/websocket/handlers/ScoringPostProcessor.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { IFileRepository, FileRecord } from '../../../../../src/application/interfaces/IFileRepository.js';
import type { IClaudeClient, StreamChunk } from '../../../../../src/application/interfaces/IClaudeClient.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { ScoringOutput } from '../../../../../src/application/interfaces/IScoringService.js';
import type { ScoringReportData, DimensionScoreData } from '../../../../../src/domain/scoring/types.js';
import type { Message } from '../../../../../src/domain/entities/Message.js';
import type { RiskDimension } from '../../../../../src/domain/types/QuestionnaireSchema.js';
import type { BuildConversationContext } from '../../../../../src/infrastructure/websocket/handlers/ScoringHandler.js';

const createMockFileRepository = (): jest.Mocked<IFileRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIds: jest.fn(),
  findByIdAndUser: jest.fn(),
  findByIdAndConversation: jest.fn(),
  updateIntakeContext: jest.fn(),
  findByConversationWithContext: jest.fn(),
  updateTextExcerpt: jest.fn(),
  updateExcerptAndClassification: jest.fn(),
  updateParseStatus: jest.fn(),
  tryStartParsing: jest.fn(),
  findByConversationWithExcerpt: jest.fn(),
  deleteByConversationId: jest.fn(),
});

const createMockConversationService = (): jest.Mocked<ConversationService> => ({
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  getUserConversations: jest.fn(),
  switchMode: jest.fn(),
  linkAssessment: jest.fn(),
  sendMessage: jest.fn(),
  getHistory: jest.fn(),
  completeConversation: jest.fn(),
  deleteConversation: jest.fn(),
  updateContext: jest.fn(),
  getConversationTitle: jest.fn(),
  getFirstUserMessage: jest.fn(),
  getFirstAssistantMessage: jest.fn(),
  getMessageCount: jest.fn(),
  updateTitle: jest.fn(),
  updateTitleIfNotManuallyEdited: jest.fn(),
} as unknown as jest.Mocked<ConversationService>);

const createMockClaudeClient = (): jest.Mocked<IClaudeClient> => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  continueWithToolResult: jest.fn(),
});

const createMockSocket = (): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-123',
  userId: 'user-123',
  userEmail: 'test@example.com',
  userRole: 'analyst',
  conversationId: undefined,
  data: {},
  handshake: { auth: {} },
  emit: jest.fn(),
  join: jest.fn(),
} as unknown as jest.Mocked<IAuthenticatedSocket>);

const createMockReport = (overrides?: Partial<ScoringReportData>): ScoringReportData => ({
  assessmentId: 'assess-456',
  batchId: 'batch-123',
  payload: {
    compositeScore: 72,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Summary text',
    keyFindings: ['Finding 1', 'Finding 2'],
    disqualifyingFactors: [],
    dimensionScores: [
      { dimension: 'security_risk' as RiskDimension, score: 8, riskRating: 'low' },
      { dimension: 'privacy_risk' as RiskDimension, score: 6, riskRating: 'medium' },
    ] as DimensionScoreData[],
  },
  narrativeReport: 'Test narrative report text',
  rubricVersion: '1.0',
  modelId: 'claude-3-sonnet',
  scoringDurationMs: 5000,
  ...overrides,
});

const createMockScoringResult = (overrides?: Partial<ScoringOutput>): ScoringOutput => ({
  success: true,
  batchId: 'batch-123',
  report: createMockReport(),
  ...overrides,
});

const createMockMessage = (conversationId: string, text: string): Message => ({
  id: 'msg-123',
  conversationId,
  role: 'assistant',
  content: { text },
  createdAt: new Date('2025-01-15T12:00:00Z'),
} as Message);

describe('ScoringPostProcessor', () => {
  let postProcessor: ScoringPostProcessor;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = createMockConversationService();
    mockFileRepository = createMockFileRepository();
    mockClaudeClient = createMockClaudeClient();
    mockSocket = createMockSocket();

    postProcessor = new ScoringPostProcessor(
      mockConversationService,
      mockFileRepository,
      mockClaudeClient
    );

    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processSuccess', () => {
    beforeEach(() => {
      mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));
    });

    it('should emit scoring_complete with batchId and assessmentId', async () => {
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', {
        conversationId: 'conv-1',
        result: expect.objectContaining({
          batchId: 'batch-123',
          assessmentId: 'assess-456',
          compositeScore: 72,
        }),
        narrativeReport: 'Test narrative report text',
      });
    });

    it('should persist narrative as assistant message (no components)', async () => {
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: expect.objectContaining({
          text: 'Test narrative report text',
        }),
      });
      // Verify no components in the content
      const callArgs = mockConversationService.sendMessage.mock.calls[0][0];
      expect((callArgs as { content: { components?: unknown } }).content.components).toBeUndefined();
    });

    it('should use fallback narrative when narrativeReport is empty', async () => {
      const result = createMockScoringResult({
        report: createMockReport({ narrativeReport: '' }),
      });

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(mockConversationService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            text: expect.stringContaining('Risk assessment complete'),
          }),
        })
      );
    });

    it('should link assessment (non-fatal on failure)', async () => {
      mockConversationService.linkAssessment.mockRejectedValue(new Error('Link failed'));
      const result = createMockScoringResult();

      // Should not throw
      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(mockConversationService.linkAssessment).toHaveBeenCalledWith('conv-1', 'assess-456');
      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', expect.anything());
    });

    it('should log warning when linkAssessment fails', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      mockConversationService.linkAssessment.mockRejectedValue(new Error('Link failed'));
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to link assessment (non-fatal)'),
        expect.any(Error)
      );
    });

    it('should update file status to completed', async () => {
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'completed');
    });

    it('should emit message event with persisted message data', async () => {
      const mockMessage = createMockMessage('conv-1', 'Test narrative report text');
      mockConversationService.sendMessage.mockResolvedValue(mockMessage);
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        id: mockMessage.id,
        conversationId: 'conv-1',
        role: 'assistant',
      }));
    });

    it('should handle follow-up query when present', async () => {
      const mockBuildContext: BuildConversationContext = jest.fn().mockResolvedValue({
        messages: [],
        systemPrompt: 'Test prompt',
      });

      async function* mockStream(): AsyncGenerator<StreamChunk> {
        yield { content: 'Response ', isComplete: false };
        yield { content: 'text', isComplete: false };
        yield { content: '', isComplete: true };
      }
      mockClaudeClient.streamMessage.mockReturnValue(mockStream());

      const result = createMockScoringResult();

      await postProcessor.processSuccess(
        mockSocket, 'conv-1', 'file-1', result,
        'What about security?', mockBuildContext
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', { conversationId: 'conv-1' });
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', expect.objectContaining({
        conversationId: 'conv-1',
        token: expect.any(String),
      }));
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', expect.objectContaining({
        conversationId: 'conv-1',
        fullText: 'Response text',
      }));
    });

    it('should not invoke follow-up when userQuery is empty', async () => {
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result, '   ');

      expect(mockClaudeClient.streamMessage).not.toHaveBeenCalled();
    });

    it('should not invoke follow-up when buildConversationContext is undefined', async () => {
      const result = createMockScoringResult();

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result, 'question', undefined);

      expect(mockClaudeClient.streamMessage).not.toHaveBeenCalled();
    });

    it('should emit fallback message on follow-up error', async () => {
      const mockBuildContext: BuildConversationContext = jest.fn().mockRejectedValue(
        new Error('Context build failed')
      );
      const result = createMockScoringResult();

      await postProcessor.processSuccess(
        mockSocket, 'conv-1', 'file-1', result,
        'What about security?', mockBuildContext
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('completed the scoring'),
        conversationId: 'conv-1',
      }));
    });

    it('should include dimension findings when present (Story 38.2.2)', async () => {
      const reportWithFindings = createMockReport({
        payload: {
          compositeScore: 72,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: 'Summary text',
          keyFindings: ['Finding 1'],
          disqualifyingFactors: [],
          dimensionScores: [{
            dimension: 'security_risk' as RiskDimension,
            score: 80,
            riskRating: 'low',
            findings: {
              subScores: [],
              keyRisks: [],
              mitigations: [],
              evidenceRefs: [],
              assessmentConfidence: { level: 'high' as const, rationale: 'Strong security evidence' },
              isoClauseReferences: [{ clauseRef: 'A.8.2', title: 'Security controls', framework: 'ISO/IEC 42001', status: 'aligned' as const }],
            },
          }] as DimensionScoreData[],
        },
      });
      const result = createMockScoringResult({ report: reportWithFindings });

      await postProcessor.processSuccess(mockSocket, 'conv-1', 'file-1', result);

      const scoringCompleteCall = mockSocket.emit.mock.calls.find(call => call[0] === 'scoring_complete');
      expect(scoringCompleteCall).toBeDefined();
      const resultData = (scoringCompleteCall![1] as { result: { dimensionScores: Array<{ findings?: unknown }> } }).result;
      expect(resultData.dimensionScores[0].findings).toBeDefined();
    });
  });

  describe('processFailure', () => {
    it('should emit scoring_error with code field', async () => {
      await postProcessor.processFailure(
        mockSocket, 'conv-1', 'file-1', 'Scoring failed', 'PARSE_FAILED'
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
        conversationId: 'conv-1',
        error: 'Scoring failed',
        code: 'PARSE_FAILED',
      });
    });

    it('should update file status to failed', async () => {
      await postProcessor.processFailure(
        mockSocket, 'conv-1', 'file-1', 'Scoring failed', 'SCORING_FAILED'
      );

      expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
    });

    it('should persist error as system message', async () => {
      await postProcessor.processFailure(
        mockSocket, 'conv-1', 'file-1', 'Scoring failed', 'SCORING_FAILED'
      );

      expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'system',
        content: expect.objectContaining({
          text: expect.stringContaining('Scoring failed'),
        }),
      });
    });
  });

  describe('buildScoringFollowUpContext', () => {
    it('should format composite score and risk rating', () => {
      const report = {
        payload: {
          compositeScore: 72,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Test summary',
          keyFindings: ['Finding 1'],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = postProcessor.buildScoringFollowUpContext(report);

      expect(result).toContain('**Composite Score:** 72/100');
      expect(result).toContain('**Overall Risk Rating:** medium');
      expect(result).toContain('**Recommendation:** conditional');
    });

    it('should format dimension scores', () => {
      const report = {
        payload: {
          compositeScore: 65,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Test summary',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'security_risk' as RiskDimension, score: 8, riskRating: 'low' as const },
            { dimension: 'privacy_risk' as RiskDimension, score: 6, riskRating: 'medium' as const },
          ],
        },
      };

      const result = postProcessor.buildScoringFollowUpContext(report);

      expect(result).toContain('- security_risk: 8/100 (low)');
      expect(result).toContain('- privacy_risk: 6/100 (medium)');
    });

    it('should format key findings as bullet points', () => {
      const report = {
        payload: {
          compositeScore: 50,
          overallRiskRating: 'high' as const,
          recommendation: 'decline' as const,
          executiveSummary: 'Test summary',
          keyFindings: ['First finding', 'Second finding'],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = postProcessor.buildScoringFollowUpContext(report);

      expect(result).toContain('- First finding');
      expect(result).toContain('- Second finding');
    });

    it('should include executive summary', () => {
      const report = {
        payload: {
          compositeScore: 85,
          overallRiskRating: 'low' as const,
          recommendation: 'approve' as const,
          executiveSummary: 'Vendor demonstrates strong security practices.',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = postProcessor.buildScoringFollowUpContext(report);

      expect(result).toContain('### Executive Summary:');
      expect(result).toContain('Vendor demonstrates strong security practices.');
    });

    it('should include all required sections', () => {
      const report = {
        payload: {
          compositeScore: 68,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Summary',
          keyFindings: ['Finding'],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'security_risk' as RiskDimension, score: 7, riskRating: 'low' as const },
          ],
        },
      };

      const result = postProcessor.buildScoringFollowUpContext(report);

      expect(result).toContain('## Scoring Results Context');
      expect(result).toContain('### Dimension Scores:');
      expect(result).toContain('### Key Findings:');
      expect(result).toContain('### Executive Summary:');
    });
  });
});
