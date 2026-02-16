/**
 * Contract Tests for DocumentUploadController.runScoring()
 *
 * Story 38.2.2: Verify that `findings` is included in:
 *   1. The `scoring_complete` WebSocket event payload (dimensionScores)
 *   2. The persisted `scoring_result` component data (via sendMessage)
 *
 * Scope: ONLY tests the findings contract. All external dependencies are mocked.
 * runScoring() is private, so we access it via (controller as any).runScoring().
 */

import { DocumentUploadController } from '../../../../../src/infrastructure/http/controllers/DocumentUploadController.js';
import type { IFileStorage } from '../../../../../src/application/interfaces/IFileStorage.js';
import type { FileValidationService } from '../../../../../src/application/services/FileValidationService.js';
import type { IIntakeDocumentParser } from '../../../../../src/application/interfaces/IIntakeDocumentParser.js';
import type { IScoringDocumentParser } from '../../../../../src/application/interfaces/IScoringDocumentParser.js';
import type { IScoringService, ScoringOutput } from '../../../../../src/application/interfaces/IScoringService.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { IFileRepository } from '../../../../../src/application/interfaces/IFileRepository.js';
import type { ITextExtractionService } from '../../../../../src/application/interfaces/ITextExtractionService.js';
import type { ScoringReportData, DimensionScoreData } from '../../../../../src/domain/scoring/types.js';
import type { RiskDimension } from '../../../../../src/domain/types/QuestionnaireSchema.js';
import type { Message } from '../../../../../src/domain/entities/Message.js';
import type { Namespace } from 'socket.io';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const createMockNamespace = () => {
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  return {
    to: toFn,
    emit: emitFn,
    /** Access the emit function returned by .to(room) */
    roomEmit: emitFn,
  };
};

const createMockConversationService = (): jest.Mocked<ConversationService> =>
  ({
    sendMessage: jest.fn(),
    linkAssessment: jest.fn(),
    getConversation: jest.fn(),
    createConversation: jest.fn(),
    getUserConversations: jest.fn(),
    switchMode: jest.fn(),
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

const createMockScoringService = (): jest.Mocked<IScoringService> => ({
  score: jest.fn(),
  abort: jest.fn(),
  getResultForConversation: jest.fn(),
});

const createMockMessage = (conversationId: string, text: string): Message =>
  ({
    id: 'msg-abc',
    conversationId,
    role: 'assistant',
    content: { text },
    createdAt: new Date('2025-06-01T00:00:00Z'),
  } as Message);

// ---------------------------------------------------------------------------
// Realistic fixture: scoring report WITH findings (ISO enrichment)
// ---------------------------------------------------------------------------

const createReportWithFindings = (): ScoringReportData => ({
  assessmentId: 'assess-001',
  batchId: 'batch-001',
  payload: {
    compositeScore: 74,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Vendor demonstrates moderate alignment with ISO 42001.',
    keyFindings: ['Strong data governance', 'Gaps in explainability'],
    disqualifyingFactors: [],
    dimensionScores: [
      {
        dimension: 'security_risk' as RiskDimension,
        score: 82,
        riskRating: 'low',
        findings: {
          subScores: [
            { name: 'Access Control', score: 9, maxScore: 10, notes: 'MFA enforced' },
          ],
          keyRisks: ['Legacy encryption in transit'],
          mitigations: ['Upgrade to TLS 1.3 planned for Q3'],
          evidenceRefs: [
            { sectionNumber: 3, questionNumber: 12, quote: 'AES-256 at rest' },
          ],
          assessmentConfidence: {
            level: 'high' as const,
            rationale: 'Strong documentary evidence across all sub-dimensions',
          },
          isoClauseReferences: [
            {
              clauseRef: 'A.8.2',
              title: 'Information security controls',
              framework: 'ISO/IEC 42001',
              status: 'aligned' as const,
            },
            {
              clauseRef: 'A.6.2.6',
              title: 'Data quality management for AI',
              framework: 'ISO/IEC 42001',
              status: 'partial' as const,
            },
          ],
        },
      },
      {
        dimension: 'privacy_risk' as RiskDimension,
        score: 65,
        riskRating: 'medium',
        findings: {
          subScores: [],
          keyRisks: ['No DPA on file'],
          mitigations: [],
          evidenceRefs: [],
          assessmentConfidence: {
            level: 'medium' as const,
            rationale: 'Limited privacy documentation provided',
          },
          isoClauseReferences: [],
        },
      },
    ] as DimensionScoreData[],
  },
  narrativeReport: 'Narrative report text with ISO references.',
  rubricVersion: '2.0',
  modelId: 'claude-sonnet-4-20250514',
  scoringDurationMs: 8200,
});

// ---------------------------------------------------------------------------
// Realistic fixture: scoring report WITHOUT findings (backward compat)
// ---------------------------------------------------------------------------

const createReportWithoutFindings = (): ScoringReportData => ({
  assessmentId: 'assess-002',
  batchId: 'batch-002',
  payload: {
    compositeScore: 60,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Basic assessment without enrichment.',
    keyFindings: ['Adequate security posture'],
    disqualifyingFactors: [],
    dimensionScores: [
      {
        dimension: 'security_risk' as RiskDimension,
        score: 70,
        riskRating: 'medium',
        // findings intentionally omitted
      },
      {
        dimension: 'compliance_risk' as RiskDimension,
        score: 55,
        riskRating: 'medium',
        findings: null as unknown as DimensionScoreData['findings'],
        // findings explicitly null (coerced from DB null)
      },
    ] as DimensionScoreData[],
  },
  narrativeReport: 'Basic narrative report.',
  rubricVersion: '1.0',
  modelId: 'claude-sonnet-4-20250514',
  scoringDurationMs: 4000,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DocumentUploadController.runScoring - findings contract', () => {
  let controller: DocumentUploadController;
  let mockScoringService: jest.Mocked<IScoringService>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockNamespace: ReturnType<typeof createMockNamespace>;

  beforeEach(() => {
    mockScoringService = createMockScoringService();
    mockConversationService = createMockConversationService();
    mockNamespace = createMockNamespace();

    // Stub dependencies that runScoring does not use directly
    const stubFileStorage = {} as IFileStorage;
    const stubFileValidator = {} as FileValidationService;
    const stubIntakeParser = {} as IIntakeDocumentParser;
    const stubScoringParser = {} as IScoringDocumentParser;
    const stubFileRepository = {} as IFileRepository;
    const stubTextExtraction = {} as ITextExtractionService;

    controller = new DocumentUploadController(
      stubFileStorage,
      stubFileValidator,
      stubIntakeParser,
      stubScoringParser,
      mockConversationService,
      mockNamespace as unknown as Namespace,
      stubFileRepository,
      mockScoringService,
      stubTextExtraction,
    );

    // Default: sendMessage returns a mock message so runScoring completes
    mockConversationService.sendMessage.mockResolvedValue(
      createMockMessage('conv-1', 'report text'),
    );
    // linkAssessment resolves silently
    mockConversationService.linkAssessment.mockResolvedValue(undefined);

    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Helper: invoke the private method
  // -------------------------------------------------------------------------
  const invokeRunScoring = (
    scoringOutput: ScoringOutput,
    opts?: { socketRoom?: string; conversationId?: string; assessmentId?: string },
  ) => {
    mockScoringService.score.mockResolvedValue(scoringOutput);
    const socketRoom = opts?.socketRoom ?? 'room-1';
    const conversationId = opts?.conversationId ?? 'conv-1';
    const assessmentId = opts?.assessmentId ?? 'assess-001';

    return (controller as unknown as Record<string, Function>).runScoring(
      socketRoom,
      conversationId,
      assessmentId,
      'file-1',
      'user-1',
    );
  };

  // =========================================================================
  // 1. scoring_complete event payload includes findings
  // =========================================================================

  describe('scoring_complete event payload', () => {
    it('should include findings in dimensionScores when findings data exists', async () => {
      const report = createReportWithFindings();
      await invokeRunScoring({ success: true, batchId: 'batch-001', report });

      // Find the scoring_complete emit call
      const scoringCompleteCall = mockNamespace.roomEmit.mock.calls.find(
        (call: unknown[]) => call[0] === 'scoring_complete',
      );
      expect(scoringCompleteCall).toBeDefined();

      const payload = scoringCompleteCall![1] as {
        conversationId: string;
        result: {
          dimensionScores: Array<{
            dimension: string;
            score: number;
            riskRating: string;
            findings?: DimensionScoreData['findings'];
          }>;
        };
      };

      // Both dimensions should have findings
      const securityDim = payload.result.dimensionScores.find(
        ds => ds.dimension === 'security_risk',
      );
      const privacyDim = payload.result.dimensionScores.find(
        ds => ds.dimension === 'privacy_risk',
      );

      expect(securityDim).toBeDefined();
      expect(securityDim!.findings).toBeDefined();
      expect(securityDim!.findings).toEqual(
        expect.objectContaining({
          subScores: expect.arrayContaining([
            expect.objectContaining({ name: 'Access Control', score: 9 }),
          ]),
          keyRisks: ['Legacy encryption in transit'],
          assessmentConfidence: expect.objectContaining({
            level: 'high',
            rationale: expect.stringContaining('Strong documentary evidence'),
          }),
          isoClauseReferences: expect.arrayContaining([
            expect.objectContaining({
              clauseRef: 'A.8.2',
              framework: 'ISO/IEC 42001',
              status: 'aligned',
            }),
            expect.objectContaining({
              clauseRef: 'A.6.2.6',
              status: 'partial',
            }),
          ]),
        }),
      );

      expect(privacyDim).toBeDefined();
      expect(privacyDim!.findings).toBeDefined();
      expect(privacyDim!.findings!.assessmentConfidence).toEqual(
        expect.objectContaining({ level: 'medium' }),
      );
    });

    it('should set findings to undefined when findings is absent or null (backward compat)', async () => {
      const report = createReportWithoutFindings();
      await invokeRunScoring({ success: true, batchId: 'batch-002', report });

      const scoringCompleteCall = mockNamespace.roomEmit.mock.calls.find(
        (call: unknown[]) => call[0] === 'scoring_complete',
      );
      expect(scoringCompleteCall).toBeDefined();

      const payload = scoringCompleteCall![1] as {
        result: {
          dimensionScores: Array<{
            dimension: string;
            findings?: DimensionScoreData['findings'];
          }>;
        };
      };

      // security_risk has no findings property at all -> undefined via ?? undefined
      const securityDim = payload.result.dimensionScores.find(
        ds => ds.dimension === 'security_risk',
      );
      expect(securityDim).toBeDefined();
      expect(securityDim!.findings).toBeUndefined();

      // compliance_risk has findings: null -> undefined via ?? undefined
      const complianceDim = payload.result.dimensionScores.find(
        ds => ds.dimension === 'compliance_risk',
      );
      expect(complianceDim).toBeDefined();
      expect(complianceDim!.findings).toBeUndefined();
    });

    it('should preserve dimension, score, and riskRating alongside findings', async () => {
      const report = createReportWithFindings();
      await invokeRunScoring({ success: true, batchId: 'batch-001', report });

      const scoringCompleteCall = mockNamespace.roomEmit.mock.calls.find(
        (call: unknown[]) => call[0] === 'scoring_complete',
      );
      const payload = scoringCompleteCall![1] as {
        result: {
          dimensionScores: Array<{
            dimension: string;
            score: number;
            riskRating: string;
            findings?: unknown;
          }>;
        };
      };

      const securityDim = payload.result.dimensionScores.find(
        ds => ds.dimension === 'security_risk',
      );
      expect(securityDim).toEqual(
        expect.objectContaining({
          dimension: 'security_risk',
          score: 82,
          riskRating: 'low',
          findings: expect.any(Object),
        }),
      );
    });
  });

  // =========================================================================
  // 2. Persisted scoring_result component includes findings
  // =========================================================================

  describe('persisted scoring_result component data', () => {
    it('should persist findings in scoring_result component when findings exist', async () => {
      const report = createReportWithFindings();
      await invokeRunScoring({ success: true, batchId: 'batch-001', report });

      // sendMessage is called to persist the narrative + scoring component
      expect(mockConversationService.sendMessage).toHaveBeenCalled();
      const sendCall = mockConversationService.sendMessage.mock.calls[0][0] as {
        conversationId: string;
        role: string;
        content: {
          text: string;
          components: Array<{
            type: string;
            data: {
              dimensionScores: Array<{
                dimension: string;
                findings?: DimensionScoreData['findings'];
              }>;
            };
          }>;
        };
      };

      expect(sendCall.role).toBe('assistant');
      expect(sendCall.content.components).toHaveLength(1);
      expect(sendCall.content.components[0].type).toBe('scoring_result');

      const componentData = sendCall.content.components[0].data;
      const securityDim = componentData.dimensionScores.find(
        ds => ds.dimension === 'security_risk',
      );
      expect(securityDim).toBeDefined();
      expect(securityDim!.findings).toBeDefined();
      expect(securityDim!.findings!.assessmentConfidence).toEqual(
        expect.objectContaining({ level: 'high' }),
      );
      expect(securityDim!.findings!.isoClauseReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ clauseRef: 'A.8.2', status: 'aligned' }),
        ]),
      );
    });

    it('should persist undefined findings in scoring_result component when absent', async () => {
      const report = createReportWithoutFindings();
      await invokeRunScoring({ success: true, batchId: 'batch-002', report });

      const sendCall = mockConversationService.sendMessage.mock.calls[0][0] as {
        content: {
          components: Array<{
            type: string;
            data: {
              dimensionScores: Array<{
                dimension: string;
                findings?: DimensionScoreData['findings'];
              }>;
            };
          }>;
        };
      };

      const componentData = sendCall.content.components[0].data;
      for (const ds of componentData.dimensionScores) {
        expect(ds.findings).toBeUndefined();
      }
    });

    it('should use same resultData object for both WS emit and component persistence', async () => {
      const report = createReportWithFindings();
      await invokeRunScoring({ success: true, batchId: 'batch-001', report });

      // Extract resultData from scoring_complete emission
      const scoringCompleteCall = mockNamespace.roomEmit.mock.calls.find(
        (call: unknown[]) => call[0] === 'scoring_complete',
      );
      const emittedResult = (scoringCompleteCall![1] as { result: unknown }).result;

      // Extract resultData from persisted component
      const sendCall = mockConversationService.sendMessage.mock.calls[0][0] as {
        content: {
          components: Array<{ data: unknown }>;
        };
      };
      const persistedResult = sendCall.content.components[0].data;

      // They should be the exact same object reference (same resultData variable)
      expect(emittedResult).toBe(persistedResult);
    });
  });

  // =========================================================================
  // 3. Edge case: scoringService is null
  // =========================================================================

  describe('guard: scoringService is null', () => {
    it('should return early without emitting when scoringService is null', async () => {
      const controllerNoScoring = new DocumentUploadController(
        {} as IFileStorage,
        {} as FileValidationService,
        {} as IIntakeDocumentParser,
        {} as IScoringDocumentParser,
        mockConversationService,
        mockNamespace as unknown as Namespace,
        {} as IFileRepository,
        undefined, // scoringService is undefined
        {} as ITextExtractionService,
      );

      await (controllerNoScoring as unknown as Record<string, Function>).runScoring(
        'room-1', 'conv-1', 'assess-001', 'file-1', 'user-1',
      );

      expect(mockNamespace.roomEmit).not.toHaveBeenCalled();
      expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
