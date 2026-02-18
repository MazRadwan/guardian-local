/**
 * Unit tests for ScoringRetryService
 *
 * Tests the structural-violation retry logic:
 * - Successful retry (violations resolved on second attempt)
 * - Fail closed on schema error (valid=false after retry)
 * - Fail closed on persistent structural violations
 * - Abort before retry (abortSignal already aborted)
 * - Correction prompt includes specific violation text
 * - scoreWithClaude called with correctionPrompt parameter
 */

import { ScoringRetryService, ScoringRetryParams } from '../../../../src/application/services/ScoringRetryService.js';
import { ScoringPayloadValidator, ValidationResult } from '../../../../src/domain/scoring/ScoringPayloadValidator.js';
import { ScoringLLMService, ScoreWithClaudeResult } from '../../../../src/application/services/ScoringLLMService.js';
import { ScoringError } from '../../../../src/domain/scoring/errors.js';
import type { ScoringParseResult } from '../../../../src/application/interfaces/IScoringDocumentParser.js';
import type { SolutionType } from '../../../../src/domain/scoring/rubric.js';

describe('ScoringRetryService', () => {
  let service: ScoringRetryService;
  let mockValidator: jest.Mocked<ScoringPayloadValidator>;
  let mockLLMService: jest.Mocked<ScoringLLMService>;

  const testSolutionType: SolutionType = 'clinical_ai';

  const mockParseResult: ScoringParseResult = {
    success: true,
    assessmentId: 'assessment-1',
    vendorName: 'TestVendor',
    solutionName: 'TestSolution',
    responses: [
      {
        sectionNumber: 1,
        questionNumber: 1,
        questionText: 'What is your security posture?',
        responseText: 'We implement zero trust architecture.',
        confidence: 0.95,
        sectionTitle: 'Security',
        hasVisualContent: false,
        visualContentDescription: null,
      },
    ],
    expectedQuestionCount: 87,
    parsedQuestionCount: 1,
    unparsedQuestions: [],
    isComplete: false,
    confidence: 0.95,
    metadata: {
      filename: 'test-questionnaire.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'pdf',
      storagePath: '/tmp/test-file.pdf',
      uploadedAt: new Date('2026-01-15'),
      uploadedBy: 'user-1',
    },
    parseTimeMs: 100,
  };

  const mockRetryPayload = {
    compositeScore: 72,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Corrected summary with valid scores.',
    dimensionScores: [],
  };

  const mockLLMResult: ScoreWithClaudeResult = {
    narrativeReport: 'Corrected narrative report',
    payload: mockRetryPayload,
  };

  function makeParams(overrides?: Partial<ScoringRetryParams>): ScoringRetryParams {
    return {
      parseResult: mockParseResult,
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: testSolutionType,
      abortSignal: new AbortController().signal,
      onMessage: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockValidator = {
      validate: jest.fn(),
    } as unknown as jest.Mocked<ScoringPayloadValidator>;

    mockLLMService = {
      scoreWithClaude: jest.fn(),
    } as unknown as jest.Mocked<ScoringLLMService>;

    service = new ScoringRetryService(mockValidator, mockLLMService);

    // Suppress console.warn/error/info during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('retryWithCorrection', () => {
    const sampleViolations = [
      'clinical_risk: sub-score sum 18 != dimension score 20',
      'privacy_risk: sub-score value 7 not in allowed set [0, 3, 5, 8, 10]',
    ];

    it('should return validated result when retry succeeds', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
        sanitized: mockRetryPayload as any,
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const params = makeParams();
      const result = await service.retryWithCorrection(sampleViolations, params);

      expect(result.validationResult).toBe(validResult);
      expect(result.llmResult).toBe(mockLLMResult);
      expect(result.validationResult.valid).toBe(true);
      expect(result.validationResult.structuralViolations).toHaveLength(0);
    });

    it('should throw STRUCTURAL_VALIDATION_FAILED when retry response fails schema validation (valid=false)', async () => {
      const invalidResult: ValidationResult = {
        valid: false,
        errors: ['compositeScore must be integer 0-100, got: -5', 'Missing dimensions: clinical_risk'],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(invalidResult);

      const params = makeParams();

      await expect(
        service.retryWithCorrection(sampleViolations, params)
      ).rejects.toThrow(ScoringError);

      try {
        await service.retryWithCorrection(sampleViolations, params);
      } catch (error) {
        expect(error).toBeInstanceOf(ScoringError);
        const scoringError = error as ScoringError;
        expect(scoringError.code).toBe('STRUCTURAL_VALIDATION_FAILED');
        expect(scoringError.message).toContain('Retry also failed schema validation');
        expect(scoringError.message).toContain('compositeScore must be integer 0-100');
      }
    });

    it('should throw STRUCTURAL_VALIDATION_FAILED when retry response still has structural violations', async () => {
      const persistentViolations: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [
          'clinical_risk: sub-score sum 18 != dimension score 20',
        ],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(persistentViolations);

      const params = makeParams();

      await expect(
        service.retryWithCorrection(sampleViolations, params)
      ).rejects.toThrow(ScoringError);

      try {
        await service.retryWithCorrection(sampleViolations, params);
      } catch (error) {
        expect(error).toBeInstanceOf(ScoringError);
        const scoringError = error as ScoringError;
        expect(scoringError.code).toBe('STRUCTURAL_VALIDATION_FAILED');
        expect(scoringError.message).toContain('Structural violations persist after retry');
        expect(scoringError.message).toContain('sub-score sum 18');
      }
    });

    it('should throw SCORING_FAILED when abort signal is already aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const params = makeParams({ abortSignal: abortController.signal });

      await expect(
        service.retryWithCorrection(sampleViolations, params)
      ).rejects.toThrow(ScoringError);

      try {
        await service.retryWithCorrection(sampleViolations, params);
      } catch (error) {
        expect(error).toBeInstanceOf(ScoringError);
        const scoringError = error as ScoringError;
        expect(scoringError.code).toBe('SCORING_FAILED');
        expect(scoringError.message).toContain('Scoring aborted before retry');
      }

      // scoreWithClaude should NOT be called when aborted
      expect(mockLLMService.scoreWithClaude).not.toHaveBeenCalled();
    });

    it('should build correction prompt containing each specific violation', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const violations = [
        'clinical_risk: sub-score sum 18 != dimension score 20',
        'privacy_risk: sub-score value 7 not in allowed set [0, 3, 5, 8, 10]',
        'composite: expected 65.4, got 70 (delta 4.6 > tolerance 2)',
      ];

      const params = makeParams();
      await service.retryWithCorrection(violations, params);

      // Extract the correctionPrompt argument (8th positional arg)
      const callArgs = mockLLMService.scoreWithClaude.mock.calls[0];
      const correctionPrompt = callArgs[7] as string;

      expect(correctionPrompt).toBeDefined();
      expect(typeof correctionPrompt).toBe('string');

      // Each violation must appear in the correction prompt
      for (const violation of violations) {
        expect(correctionPrompt).toContain(violation);
      }

      // The prompt should include the structural rules
      expect(correctionPrompt).toContain('structural violations that must be corrected');
      expect(correctionPrompt).toContain('RULES:');
      expect(correctionPrompt).toContain('sub-scores');
      expect(correctionPrompt).toContain('composite score');
    });

    it('should call scoreWithClaude with correct parameters including correctionPrompt', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const onMessage = jest.fn();
      const abortController = new AbortController();
      const isoOptions = {
        catalogControls: [],
        applicableControls: [],
      };

      const params = makeParams({
        abortSignal: abortController.signal,
        onMessage,
        isoOptions,
      });

      await service.retryWithCorrection(sampleViolations, params);

      expect(mockLLMService.scoreWithClaude).toHaveBeenCalledTimes(1);
      expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
        mockParseResult,         // parseResult
        'TestVendor',            // vendorName
        'TestSolution',          // solutionName
        testSolutionType,        // solutionType
        abortController.signal,  // abortSignal
        onMessage,               // onMessage
        isoOptions,              // isoOptions
        expect.any(String)       // correctionPrompt
      );
    });

    it('should pass solutionType to validator.validate()', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const params = makeParams({ solutionType: 'administrative_ai' });
      await service.retryWithCorrection(sampleViolations, params);

      expect(mockValidator.validate).toHaveBeenCalledTimes(1);
      expect(mockValidator.validate).toHaveBeenCalledWith(
        mockRetryPayload,
        'administrative_ai'
      );
    });

    it('should pass undefined isoOptions when not provided', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const params = makeParams(); // no isoOptions
      await service.retryWithCorrection(sampleViolations, params);

      const callArgs = mockLLMService.scoreWithClaude.mock.calls[0];
      expect(callArgs[6]).toBeUndefined(); // isoOptions
    });

    it('should propagate errors thrown by scoreWithClaude', async () => {
      const llmError = new Error('LLM API timeout');
      mockLLMService.scoreWithClaude.mockRejectedValue(llmError);

      const params = makeParams();

      await expect(
        service.retryWithCorrection(sampleViolations, params)
      ).rejects.toThrow('LLM API timeout');

      // Validator should never be called since LLM failed
      expect(mockValidator.validate).not.toHaveBeenCalled();
    });

    it('should format violations as bulleted list in correction prompt', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const violations = ['violation A', 'violation B'];
      const params = makeParams();
      await service.retryWithCorrection(violations, params);

      const correctionPrompt = mockLLMService.scoreWithClaude.mock.calls[0][7] as string;
      expect(correctionPrompt).toContain('- violation A');
      expect(correctionPrompt).toContain('- violation B');
    });

    it('should handle single violation correctly', async () => {
      const validResult: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(validResult);

      const singleViolation = ['composite: expected 65.4, got 70'];
      const params = makeParams();
      const result = await service.retryWithCorrection(singleViolation, params);

      expect(result.validationResult.valid).toBe(true);

      const correctionPrompt = mockLLMService.scoreWithClaude.mock.calls[0][7] as string;
      expect(correctionPrompt).toContain('- composite: expected 65.4, got 70');
    });

    it('should include schema validation error details in thrown error message', async () => {
      const invalidResult: ValidationResult = {
        valid: false,
        errors: ['executiveSummary must be at least 10 characters'],
        warnings: ['some warning'],
        structuralViolations: [],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(invalidResult);

      const params = makeParams();

      try {
        await service.retryWithCorrection(sampleViolations, params);
        fail('Expected ScoringError to be thrown');
      } catch (error) {
        const scoringError = error as ScoringError;
        expect(scoringError.message).toContain('executiveSummary must be at least 10 characters');
      }
    });

    it('should include persistent violation details in thrown error message', async () => {
      const stillBroken: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: [
          'clinical_risk: sub-score sum 18 != dimension score 20',
          'composite: expected 65.4, got 70',
        ],
      };

      mockLLMService.scoreWithClaude.mockResolvedValue(mockLLMResult);
      mockValidator.validate.mockReturnValue(stillBroken);

      const params = makeParams();

      try {
        await service.retryWithCorrection(sampleViolations, params);
        fail('Expected ScoringError to be thrown');
      } catch (error) {
        const scoringError = error as ScoringError;
        expect(scoringError.message).toContain('sub-score sum 18');
        expect(scoringError.message).toContain('composite: expected 65.4');
      }
    });
  });
});
