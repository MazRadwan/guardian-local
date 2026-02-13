/**
 * Unit tests for ScoringStorageService
 *
 * Tests the 4 extracted helper methods:
 * - storeResponses: maps parse result to repository createBatch call
 * - storeScores: wraps insert in transaction, throws ScoringError on failure
 * - deriveDocumentType: maps known MIME types, throws on unknown
 * - determineSolutionType: returns correct SolutionType, defaults for invalid/null
 */

import { ScoringStorageService } from '../../../../src/application/services/ScoringStorageService.js';
import { ScoringError } from '../../../../src/domain/scoring/errors.js';
import { RUBRIC_VERSION } from '../../../../src/domain/scoring/rubric.js';
import type { IResponseRepository } from '../../../../src/application/interfaces/IResponseRepository.js';
import type { IDimensionScoreRepository } from '../../../../src/application/interfaces/IDimensionScoreRepository.js';
import type { IAssessmentResultRepository } from '../../../../src/application/interfaces/IAssessmentResultRepository.js';
import type { ITransactionRunner } from '../../../../src/application/interfaces/ITransactionRunner.js';
import type { ILLMClient } from '../../../../src/application/interfaces/ILLMClient.js';
import type { ScoringParseResult } from '../../../../src/application/interfaces/IScoringDocumentParser.js';
import type { ScoringCompletePayload } from '../../../../src/domain/scoring/types.js';

describe('ScoringStorageService', () => {
  let service: ScoringStorageService;
  let mockResponseRepo: jest.Mocked<IResponseRepository>;
  let mockDimensionScoreRepo: jest.Mocked<IDimensionScoreRepository>;
  let mockAssessmentResultRepo: jest.Mocked<IAssessmentResultRepository>;
  let mockTransactionRunner: jest.Mocked<ITransactionRunner>;
  let mockLLMClient: jest.Mocked<ILLMClient>;

  const testModelId = 'claude-sonnet-4-5-20250929';

  beforeEach(() => {
    mockResponseRepo = {
      createBatch: jest.fn().mockResolvedValue([]),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findByBatchId: jest.fn().mockResolvedValue([]),
      deleteByBatchId: jest.fn().mockResolvedValue(undefined),
      findOrphanedBatches: jest.fn().mockResolvedValue([]),
      deleteByBatchIdIfOrphaned: jest.fn().mockResolvedValue(0),
    } as jest.Mocked<IResponseRepository>;

    mockDimensionScoreRepo = {
      createBatch: jest.fn().mockResolvedValue([]),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findByBatchId: jest.fn().mockResolvedValue([]),
      findLatestByAssessmentId: jest.fn().mockResolvedValue([]),
    } as jest.Mocked<IDimensionScoreRepository>;

    mockAssessmentResultRepo = {
      create: jest.fn().mockResolvedValue({}),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findByBatchId: jest.fn().mockResolvedValue(null),
      findLatestByAssessmentId: jest.fn().mockResolvedValue(null),
      updateNarrativeReport: jest.fn().mockResolvedValue(undefined),
      countTodayForAssessment: jest.fn().mockResolvedValue(0),
      findRecentByFileHash: jest.fn().mockResolvedValue(null),
      claimNarrativeGeneration: jest.fn().mockResolvedValue(true),
      finalizeNarrativeGeneration: jest.fn().mockResolvedValue(undefined),
      failNarrativeGeneration: jest.fn().mockResolvedValue(undefined),
      getNarrativeStatus: jest.fn().mockResolvedValue(null),
    } as jest.Mocked<IAssessmentResultRepository>;

    mockTransactionRunner = {
      run: jest.fn().mockImplementation(async (callback) => callback({})),
    } as jest.Mocked<ITransactionRunner>;

    mockLLMClient = {
      streamWithTool: jest.fn().mockResolvedValue(undefined),
      getModelId: jest.fn().mockReturnValue(testModelId),
    } as jest.Mocked<ILLMClient>;

    service = new ScoringStorageService(
      mockResponseRepo,
      mockDimensionScoreRepo,
      mockAssessmentResultRepo,
      mockTransactionRunner,
      mockLLMClient
    );
  });

  describe('storeResponses', () => {
    it('maps parse result to repository createBatch call', async () => {
      const parseResult: Partial<ScoringParseResult> = {
        responses: [
          {
            sectionNumber: 1,
            questionNumber: 1,
            questionText: 'What is your data policy?',
            responseText: 'We encrypt all data at rest.',
            confidence: 0.95,
            hasVisualContent: false,
            visualContentDescription: null,
            sectionTitle: 'Privacy',
          },
          {
            sectionNumber: 2,
            questionNumber: 3,
            questionText: 'Describe your auth model.',
            responseText: 'We use OAuth 2.0.',
            confidence: 0.88,
            hasVisualContent: true,
            visualContentDescription: 'Architecture diagram',
            sectionTitle: 'Security',
          },
        ],
      };

      await service.storeResponses(
        parseResult as ScoringParseResult,
        'assessment-1',
        'batch-1',
        'file-1'
      );

      expect(mockResponseRepo.createBatch).toHaveBeenCalledTimes(1);
      const calledWith = mockResponseRepo.createBatch.mock.calls[0][0];

      expect(calledWith).toHaveLength(2);
      expect(calledWith[0]).toEqual({
        assessmentId: 'assessment-1',
        batchId: 'batch-1',
        fileId: 'file-1',
        sectionNumber: 1,
        questionNumber: 1,
        questionText: 'What is your data policy?',
        responseText: 'We encrypt all data at rest.',
        confidence: 0.95,
        hasVisualContent: false,
        visualContentDescription: undefined, // null -> undefined
      });
      expect(calledWith[1]).toEqual({
        assessmentId: 'assessment-1',
        batchId: 'batch-1',
        fileId: 'file-1',
        sectionNumber: 2,
        questionNumber: 3,
        questionText: 'Describe your auth model.',
        responseText: 'We use OAuth 2.0.',
        confidence: 0.88,
        hasVisualContent: true,
        visualContentDescription: 'Architecture diagram',
      });
    });
  });

  describe('storeScores', () => {
    const validPayload: ScoringCompletePayload = {
      compositeScore: 75,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'Test summary.',
      keyFindings: ['Finding 1'],
      disqualifyingFactors: [],
      dimensionScores: [
        {
          dimension: 'clinical_risk',
          score: 70,
          riskRating: 'medium',
          findings: {
            subScores: [{ name: 'Safety', score: 7, maxScore: 10, notes: 'Good' }],
            keyRisks: ['Risk A'],
            mitigations: ['Mit A'],
            evidenceRefs: [{ sectionNumber: 1, questionNumber: 1, quote: 'Quote' }],
          },
        },
      ],
    };

    it('wraps dimension score and assessment result inserts in a transaction', async () => {
      await service.storeScores('assessment-1', 'batch-1', validPayload, 'Narrative report', 5000);

      expect(mockTransactionRunner.run).toHaveBeenCalledTimes(1);

      // Verify the callback was invoked with a transaction context
      const txCallback = mockTransactionRunner.run.mock.calls[0][0];
      expect(txCallback).toBeInstanceOf(Function);

      // Verify dimension scores were created with transaction context
      expect(mockDimensionScoreRepo.createBatch).toHaveBeenCalledWith(
        [
          {
            assessmentId: 'assessment-1',
            batchId: 'batch-1',
            dimension: 'clinical_risk',
            score: 70,
            riskRating: 'medium',
            findings: validPayload.dimensionScores[0].findings,
          },
        ],
        {} // transaction context
      );

      // Verify assessment result was created with transaction context
      expect(mockAssessmentResultRepo.create).toHaveBeenCalledWith(
        {
          assessmentId: 'assessment-1',
          batchId: 'batch-1',
          compositeScore: 75,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          narrativeReport: 'Narrative report',
          executiveSummary: 'Test summary.',
          keyFindings: ['Finding 1'],
          disqualifyingFactors: [],
          rubricVersion: RUBRIC_VERSION,
          modelId: testModelId,
          rawToolPayload: validPayload,
          scoringDurationMs: 5000,
        },
        {} // transaction context
      );
    });

    it('throws ScoringError on transaction failure', async () => {
      mockTransactionRunner.run.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.storeScores('assessment-1', 'batch-1', validPayload, 'Report', 1000)
      ).rejects.toThrow(ScoringError);

      await expect(
        service.storeScores('assessment-1', 'batch-1', validPayload, 'Report', 1000)
      ).rejects.toThrow('Transaction failed while storing scores: DB connection lost');
    });
  });

  describe('deriveDocumentType', () => {
    it('maps application/pdf to pdf', () => {
      expect(service.deriveDocumentType('application/pdf')).toBe('pdf');
    });

    it('maps application/vnd.openxmlformats-officedocument.wordprocessingml.document to docx', () => {
      expect(
        service.deriveDocumentType(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      ).toBe('docx');
    });

    it('maps image/png to image', () => {
      expect(service.deriveDocumentType('image/png')).toBe('image');
    });

    it('maps image/jpeg to image', () => {
      expect(service.deriveDocumentType('image/jpeg')).toBe('image');
    });

    it('throws on unknown MIME type', () => {
      expect(() => service.deriveDocumentType('application/zip')).toThrow(
        'Unsupported MIME type: application/zip'
      );
    });
  });

  describe('determineSolutionType', () => {
    it('returns clinical_ai for exact match', () => {
      expect(service.determineSolutionType({ solutionType: 'clinical_ai' })).toBe('clinical_ai');
    });

    it('returns administrative_ai for exact match', () => {
      expect(service.determineSolutionType({ solutionType: 'administrative_ai' })).toBe(
        'administrative_ai'
      );
    });

    it('returns patient_facing for exact match', () => {
      expect(service.determineSolutionType({ solutionType: 'patient_facing' })).toBe(
        'patient_facing'
      );
    });

    it('is case-insensitive', () => {
      expect(service.determineSolutionType({ solutionType: 'Clinical_AI' })).toBe('clinical_ai');
      expect(service.determineSolutionType({ solutionType: 'PATIENT_FACING' })).toBe(
        'patient_facing'
      );
    });

    it('defaults to clinical_ai when solutionType is null', () => {
      expect(service.determineSolutionType({ solutionType: null })).toBe('clinical_ai');
    });

    it('defaults to clinical_ai when solutionType is undefined', () => {
      expect(service.determineSolutionType({ solutionType: undefined })).toBe('clinical_ai');
      expect(service.determineSolutionType({})).toBe('clinical_ai');
    });

    it('defaults to clinical_ai for invalid string', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      expect(service.determineSolutionType({ solutionType: 'unknown_type' })).toBe('clinical_ai');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid solutionType')
      );
      warnSpy.mockRestore();
    });
  });
});
