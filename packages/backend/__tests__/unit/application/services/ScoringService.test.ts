/**
 * Unit tests for ScoringService
 *
 * Tests the scoring orchestration workflow:
 * - Authorization checks
 * - Document parsing
 * - LLM scoring via Claude
 * - Payload validation
 * - Score storage
 * - Abort handling
 */

// Jest provides describe, it, expect, beforeEach, jest globals
import { ScoringService, UnauthorizedError } from '../../../../src/application/services/ScoringService.js'
import { ScoringPayloadValidator } from '../../../../src/domain/scoring/ScoringPayloadValidator.js'
import { ALL_DIMENSIONS } from '../../../../src/domain/scoring/rubric.js'
import type { IResponseRepository } from '../../../../src/application/interfaces/IResponseRepository.js'
import type { IDimensionScoreRepository } from '../../../../src/application/interfaces/IDimensionScoreRepository.js'
import type { IAssessmentResultRepository } from '../../../../src/application/interfaces/IAssessmentResultRepository.js'
import type { IAssessmentRepository } from '../../../../src/application/interfaces/IAssessmentRepository.js'
import type { IFileRepository } from '../../../../src/application/interfaces/IFileRepository.js'
import type { IFileStorage } from '../../../../src/application/interfaces/IFileStorage.js'
import type { IScoringDocumentParser } from '../../../../src/application/interfaces/IScoringDocumentParser.js'
import type { ILLMClient } from '../../../../src/application/interfaces/ILLMClient.js'
import type { IPromptBuilder } from '../../../../src/application/interfaces/IPromptBuilder.js'
import type { ITransactionRunner } from '../../../../src/application/interfaces/ITransactionRunner.js'
import type { ScoringProgressEvent } from '../../../../src/domain/scoring/types.js'

describe('ScoringService', () => {
  let service: ScoringService
  let mockResponseRepo: jest.Mocked<IResponseRepository>
  let mockDimensionScoreRepo: jest.Mocked<IDimensionScoreRepository>
  let mockAssessmentResultRepo: jest.Mocked<IAssessmentResultRepository>
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>
  let mockFileRepo: jest.Mocked<IFileRepository>
  let mockFileStorage: jest.Mocked<IFileStorage>
  let mockDocumentParser: jest.Mocked<IScoringDocumentParser>
  let mockLLMClient: jest.Mocked<ILLMClient>
  let mockPromptBuilder: jest.Mocked<IPromptBuilder>
  let mockTransactionRunner: jest.Mocked<ITransactionRunner>
  let validator: ScoringPayloadValidator

  const testUserId = 'user-1'
  const testAssessmentId = 'test-assessment'
  const testFileId = 'file-1'
  const testConversationId = 'conv-1'

  // Valid scoring payload matching all 10 dimensions
  const validPayload = {
    compositeScore: 75,
    recommendation: 'conditional' as const,
    overallRiskRating: 'medium' as const,
    executiveSummary: 'Test summary for the assessment with adequate length.',
    keyFindings: ['Finding 1', 'Finding 2'],
    disqualifyingFactors: [],
    dimensionScores: ALL_DIMENSIONS.map((d) => ({
      dimension: d,
      score: 75,
      riskRating: 'medium' as const,
    })),
  }

  beforeEach(() => {
    // Create mocks for all repositories
    mockResponseRepo = {
      createBatch: jest.fn().mockResolvedValue([]),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findByBatchId: jest.fn().mockResolvedValue([]),
      deleteByBatchId: jest.fn().mockResolvedValue(undefined),
      // Epic 20: Orphan cleanup methods
      findOrphanedBatches: jest.fn().mockResolvedValue([]),
      deleteByBatchIdIfOrphaned: jest.fn().mockResolvedValue(0),
    } as jest.Mocked<IResponseRepository>

    mockDimensionScoreRepo = {
      createBatch: jest.fn().mockResolvedValue([]),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findByBatchId: jest.fn().mockResolvedValue([]),
      findLatestByAssessmentId: jest.fn().mockResolvedValue([]),
    } as jest.Mocked<IDimensionScoreRepository>

    mockAssessmentResultRepo = {
      create: jest.fn().mockResolvedValue({}),
      findByAssessmentId: jest.fn().mockResolvedValue(null),
      findByBatchId: jest.fn().mockResolvedValue(null),
      findLatestByAssessmentId: jest.fn().mockResolvedValue(null),
      updateNarrativeReport: jest.fn().mockResolvedValue(undefined),
      countTodayForAssessment: jest.fn().mockResolvedValue(0),
      findRecentByFileHash: jest.fn().mockResolvedValue(null),
      // Epic 20: Narrative generation concurrency control
      claimNarrativeGeneration: jest.fn().mockResolvedValue(true),
      finalizeNarrativeGeneration: jest.fn().mockResolvedValue(undefined),
      failNarrativeGeneration: jest.fn().mockResolvedValue(undefined),
      getNarrativeStatus: jest.fn().mockResolvedValue(null),
    } as jest.Mocked<IAssessmentResultRepository>

    // Mock assessment repo with findByIdWithVendor method (Story 20.3.4)
    const mockAssessmentEntity = {
      id: testAssessmentId,
      createdBy: testUserId,
      solutionName: 'Test Solution',
      solutionType: 'clinical_ai', // Used for rubric weight selection
      assessmentType: 'comprehensive', // Used for question count (not weights)
      vendorId: 'vendor-1',
      status: 'exported', // Epic 15 Story 5a.4: Required for validation gate
    }
    mockAssessmentRepo = {
      // Story 20.3.4: Combined lookup used by ScoringService
      findByIdWithVendor: jest.fn().mockResolvedValue({
        assessment: mockAssessmentEntity,
        vendor: { id: 'vendor-1', name: 'Test Vendor' },
      }),
      // Legacy methods kept for backward compatibility
      findById: jest.fn().mockResolvedValue(mockAssessmentEntity),
      getVendor: jest.fn().mockResolvedValue({ id: 'vendor-1', name: 'Test Vendor' }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      findByVendorId: jest.fn(),
      findByCreatedBy: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      hasExportedAssessments: jest.fn(),
    } as any

    // Mock file repository for authorization
    mockFileRepo = {
      findByIdAndUser: jest.fn().mockResolvedValue({
        id: testFileId,
        userId: testUserId,
        conversationId: testConversationId,
        filename: 'questionnaire.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/storage/path/file.pdf',
        createdAt: new Date(),
        textExcerpt: null, // Epic 18
        parseStatus: 'pending', // Epic 18
      }),
      create: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(), // Epic 18.4
      findByIdAndConversation: jest.fn(),
      updateIntakeContext: jest.fn(),
      findByConversationWithContext: jest.fn(),
      // Epic 18 methods
      updateTextExcerpt: jest.fn(),
      updateParseStatus: jest.fn(),
      tryStartParsing: jest.fn(),
      findByConversationWithExcerpt: jest.fn(),
    } as jest.Mocked<IFileRepository>

    // Mock file storage for retrieving file content
    mockFileStorage = {
      retrieve: jest.fn().mockResolvedValue(Buffer.from('test file content')),
      store: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
    } as jest.Mocked<IFileStorage>

    // Mock document parser
    mockDocumentParser = {
      parseForResponses: jest.fn().mockResolvedValue({
        assessmentId: testAssessmentId,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [
          {
            sectionNumber: 1,
            sectionTitle: 'Section 1',
            questionNumber: 1,
            questionText: 'Q1',
            responseText: 'A1',
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          },
        ],
        parsedQuestionCount: 1,
        expectedQuestionCount: 111,
        isComplete: false,
        unparsedQuestions: [],
        success: true,
        confidence: 0.9,
        metadata: {
          filename: 'questionnaire.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          documentType: 'pdf' as const,
          storagePath: '/storage/path',
          uploadedAt: new Date(),
          uploadedBy: testUserId,
        },
        parseTimeMs: 100,
      }),
    } as jest.Mocked<IScoringDocumentParser>

    // Mock LLM client port
    mockLLMClient = {
      streamWithTool: jest.fn(),
      getModelId: jest.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
    } as jest.Mocked<ILLMClient>

    // Mock prompt builder port
    mockPromptBuilder = {
      buildScoringSystemPrompt: jest.fn().mockReturnValue('system prompt with rubric'),
      buildScoringUserPrompt: jest.fn().mockReturnValue('user prompt with responses'),
    } as jest.Mocked<IPromptBuilder>

    // Mock transaction runner (Epic 20: clean architecture compliance)
    mockTransactionRunner = {
      run: jest.fn().mockImplementation(async (callback) => {
        // Execute callback with a mock transaction context
        return callback({})
      }),
    } as jest.Mocked<ITransactionRunner>

    validator = new ScoringPayloadValidator()

    service = new ScoringService(
      mockResponseRepo,
      mockDimensionScoreRepo,
      mockAssessmentResultRepo,
      mockAssessmentRepo,
      mockFileRepo,
      mockFileStorage,
      mockDocumentParser,
      mockLLMClient,
      mockPromptBuilder,
      validator,
      mockTransactionRunner
    )
  })

  describe('score', () => {
    const defaultInput = {
      assessmentId: testAssessmentId,
      conversationId: testConversationId,
      fileId: testFileId,
      userId: testUserId,
    }

    describe('successful workflow', () => {
      beforeEach(() => {
        // Setup successful LLM call
        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Narrative report content for the assessment.')
          opts.onToolUse?.('scoring_complete', validPayload)
        })
      })

      it('should complete scoring workflow successfully', async () => {
        const progressEvents: ScoringProgressEvent[] = []
        const result = await service.score(defaultInput, (e) => progressEvents.push(e))

        expect(result.success).toBe(true)
        expect(result.batchId).toBeDefined()
        expect(result.report).toBeDefined()
        expect(result.report?.payload).toEqual(validPayload)
        expect(result.report?.narrativeReport).toBe('Narrative report content for the assessment.')
      })

      it('should emit progress events during workflow', async () => {
        const progressEvents: ScoringProgressEvent[] = []
        await service.score(defaultInput, (e) => progressEvents.push(e))

        expect(progressEvents.length).toBeGreaterThan(0)
        expect(progressEvents.some((e) => e.status === 'parsing')).toBe(true)
        expect(progressEvents.some((e) => e.status === 'scoring')).toBe(true)
        expect(progressEvents.some((e) => e.status === 'validating')).toBe(true)
        expect(progressEvents.some((e) => e.status === 'complete')).toBe(true)
      })

      it('should store responses from parsed document', async () => {
        await service.score(defaultInput, jest.fn())

        expect(mockResponseRepo.createBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              assessmentId: testAssessmentId,
              sectionNumber: 1,
              questionNumber: 1,
              questionText: 'Q1',
              responseText: 'A1',
            }),
          ])
        )
      })

      it('should store dimension scores with transaction context', async () => {
        await service.score(defaultInput, jest.fn())

        // Epic 20.2.1: Verify transaction parameter is passed
        expect(mockDimensionScoreRepo.createBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              assessmentId: testAssessmentId,
              dimension: expect.any(String),
              score: 75,
              riskRating: 'medium',
            }),
          ]),
          expect.anything() // Transaction context
        )
      })

      it('should store assessment result with provenance and transaction context', async () => {
        await service.score(defaultInput, jest.fn())

        // Epic 20.2.1: Verify transaction parameter is passed
        expect(mockAssessmentResultRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            assessmentId: testAssessmentId,
            compositeScore: 75,
            recommendation: 'conditional',
            overallRiskRating: 'medium',
            narrativeReport: expect.any(String),
            rubricVersion: expect.any(String),
            modelId: 'claude-3-5-sonnet-20241022',
            scoringDurationMs: expect.any(Number),
          }),
          expect.anything() // Transaction context
        )
      })

      it('should update assessment status to scored', async () => {
        await service.score(defaultInput, jest.fn())

        expect(mockAssessmentRepo.updateStatus).toHaveBeenCalledWith(testAssessmentId, 'scored')
      })

      it('should include report data with rubric version', async () => {
        const result = await service.score(defaultInput, jest.fn())

        expect(result.report?.rubricVersion).toBeDefined()
        expect(result.report?.modelId).toBe('claude-3-5-sonnet-20241022')
        // Duration may be 0 in fast unit tests, just check it's a number
        expect(typeof result.report?.scoringDurationMs).toBe('number')
        expect(result.report?.scoringDurationMs).toBeGreaterThanOrEqual(0)
      })

      it('should pass maxTokens: 8000 to LLM client for scoring (Story 20.3.2)', async () => {
        await service.score(defaultInput, jest.fn())

        // Verify maxTokens is set to 8000 for scoring
        // 10 dimensions with findings + executive summary needs ~6-7K tokens
        expect(mockLLMClient.streamWithTool).toHaveBeenCalledWith(
          expect.objectContaining({
            maxTokens: 8000,
          })
        )
      })

      it('should enable usePromptCache for scoring (Story 20.3.1)', async () => {
        await service.score(defaultInput, jest.fn())

        // Verify prompt caching is enabled for scoring rubric
        expect(mockLLMClient.streamWithTool).toHaveBeenCalledWith(
          expect.objectContaining({
            usePromptCache: true,
          })
        )
      })
    })

    describe('authorization checks', () => {
      it('should fail if assessment not found', async () => {
        // Story 20.3.4: Now using findByIdWithVendor
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue(null)

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Assessment not found')
      })

      it('should fail if user does not own the assessment', async () => {
        // Story 20.3.4: Now using findByIdWithVendor
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: 'other-user', // Different user owns this assessment
            solutionName: 'Test',
            assessmentType: 'clinical',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('does not own assessment')
      })

      it('should fail if user does not own the file', async () => {
        mockFileRepo.findByIdAndUser.mockResolvedValue(null)

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('does not own file')
      })
    })

    describe('parsing errors', () => {
      it('should fail if assessment ID mismatch in parsed document', async () => {
        mockDocumentParser.parseForResponses.mockResolvedValue({
          assessmentId: 'different-assessment',
          responses: [
            {
              sectionNumber: 1,
              sectionTitle: 'S1',
              questionNumber: 1,
              questionText: 'Q1',
              responseText: 'A1',
              confidence: 0.9,
              hasVisualContent: false,
              visualContentDescription: null,
            },
          ],
          parsedQuestionCount: 1,
          expectedQuestionCount: 1,
          isComplete: true,
          unparsedQuestions: [],
          success: true,
          confidence: 0.9,
          metadata: {
            filename: 'questionnaire.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            documentType: 'pdf' as const,
            storagePath: '/storage/path',
            uploadedAt: new Date(),
            uploadedBy: testUserId,
          },
          parseTimeMs: 100,
          vendorName: null,
          solutionName: null,
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('mismatch')
      })

      it('should fail if no responses found in document', async () => {
        mockDocumentParser.parseForResponses.mockResolvedValue({
          assessmentId: testAssessmentId,
          responses: [],
          parsedQuestionCount: 0,
          expectedQuestionCount: 111,
          isComplete: false,
          unparsedQuestions: [],
          success: true,
          confidence: 0.5,
          metadata: {
            filename: 'questionnaire.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            documentType: 'pdf' as const,
            storagePath: '/storage/path',
            uploadedAt: new Date(),
            uploadedBy: testUserId,
          },
          parseTimeMs: 100,
          vendorName: null,
          solutionName: null,
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('No responses found')
      })

      it('should fail if unsupported MIME type', async () => {
        mockFileRepo.findByIdAndUser.mockResolvedValue({
          id: testFileId,
          userId: testUserId,
          conversationId: testConversationId,
          filename: 'file.xyz',
          mimeType: 'application/xyz', // Unsupported
          size: 1024,
          storagePath: '/storage/path/file.xyz',
          createdAt: new Date(),
          textExcerpt: null, // Epic 18
          parseStatus: 'pending', // Epic 18
          // Epic 18.4: Document classification
          detectedDocType: null,
          detectedVendorName: null,
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Unsupported MIME type')
      })
    })

    describe('LLM scoring errors', () => {
      it('should fail if Claude does not call scoring_complete tool', async () => {
        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report without tool call')
          // No onToolUse call
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('scoring_complete')
      })

      it('should fail if LLM client throws error', async () => {
        mockLLMClient.streamWithTool.mockRejectedValue(new Error('API rate limit exceeded'))

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('API rate limit exceeded')
      })
    })

    describe('validation errors', () => {
      it('should fail if payload validation fails - missing fields', async () => {
        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', { invalid: 'payload' })
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid scoring payload')
      })

      it('should fail if compositeScore is out of range', async () => {
        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', {
            ...validPayload,
            compositeScore: 150, // Invalid - over 100
          })
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid scoring payload')
      })

      it('should fail if missing required dimensions', async () => {
        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', {
            ...validPayload,
            dimensionScores: [
              { dimension: 'clinical_risk', score: 75, riskRating: 'medium' },
            ], // Only 1 dimension, missing 9
          })
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid scoring payload')
      })
    })

    describe('solution type determination', () => {
      it('should use clinical_ai weights when solutionType is clinical_ai', async () => {
        // Story 20.3.4: Now using findByIdWithVendor
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Clinical AI Tool',
            solutionType: 'clinical_ai',
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })

      it('should use administrative_ai weights when solutionType is administrative_ai', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Admin AI Tool',
            solutionType: 'administrative_ai',
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'administrative_ai',
          })
        )
      })

      it('should use patient_facing weights when solutionType is patient_facing', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Patient Portal',
            solutionType: 'patient_facing',
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'patient_facing',
          })
        )
      })

      it('should default to clinical_ai when solutionType is null', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Unknown Tool',
            solutionType: null,
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })

      it('should default to clinical_ai when solutionType is undefined', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Unknown Tool',
            // solutionType not set (undefined)
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })

      it('should handle case-insensitive solutionType (e.g., Clinical_AI)', async () => {
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Clinical Tool',
            solutionType: 'Clinical_AI', // Mixed case
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )
      })

      it('should log warning and default to clinical_ai for invalid solutionType', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Unknown Tool',
            solutionType: 'invalid_type', // Invalid value
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid solutionType "invalid_type"')
        )
        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'clinical_ai',
          })
        )

        consoleSpy.mockRestore()
      })

      it('should ignore assessmentType and use solutionType for weighting', async () => {
        // This test verifies that the old assessmentType field does NOT affect weighting
        mockAssessmentRepo.findByIdWithVendor.mockResolvedValue({
          assessment: {
            id: testAssessmentId,
            createdBy: testUserId,
            solutionName: 'Admin Tool',
            assessmentType: 'quick', // Old field - should be ignored
            solutionType: 'administrative_ai', // New field - should be used
            status: 'exported',
          } as any,
          vendor: { id: 'vendor-1', name: 'Test Vendor' },
        })

        mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
          opts.onTextDelta?.('Report')
          opts.onToolUse?.('scoring_complete', validPayload)
        })

        await service.score(defaultInput, jest.fn())

        // Should use solutionType, not assessmentType
        expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            solutionType: 'administrative_ai',
          })
        )
      })
    })
  })

  describe('abort', () => {
    it('should pass abort signal to document parser (Story 20.3.3)', async () => {
      // Setup successful LLM call
      mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
        opts.onTextDelta?.('Report')
        opts.onToolUse?.('scoring_complete', validPayload)
      })

      await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      // Verify parseForResponses was called with abortSignal
      expect(mockDocumentParser.parseForResponses).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Object),
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        })
      )
    })

    it('should return aborted result when parser returns parse aborted error (Story 20.3.3)', async () => {
      // Mock parser returning aborted result
      mockDocumentParser.parseForResponses.mockResolvedValue({
        success: false,
        error: 'Parse aborted',
        assessmentId: null,
        vendorName: null,
        solutionName: null,
        responses: [],
        parsedQuestionCount: 0,
        expectedQuestionCount: null,
        isComplete: false,
        unparsedQuestions: [],
        confidence: 0,
        metadata: {
          filename: 'questionnaire.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          documentType: 'pdf' as const,
          storagePath: '/storage/path',
          uploadedAt: new Date(),
          uploadedBy: testUserId,
        },
        parseTimeMs: 50,
      })

      const result = await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Scoring aborted')
      // LLM client should not be called since parsing was aborted
      expect(mockLLMClient.streamWithTool).not.toHaveBeenCalled()
    })

    it('should abort in-progress scoring', async () => {
      // Setup LLM call that checks abort signal and waits
      mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
        // Simulate checking abort signal during long operation
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (opts.abortSignal?.aborted) {
          throw new Error('Request aborted')
        }
        opts.onTextDelta?.('Report')
        opts.onToolUse?.('scoring_complete', validPayload)
      })

      const scorePromise = service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      // Give the score operation time to start, then abort
      await new Promise((resolve) => setTimeout(resolve, 20))
      service.abort(testConversationId)

      const result = await scorePromise
      // Either aborted before LLM or LLM threw abort error
      expect(result.success).toBe(false)
      // Error may be 'Scoring aborted', 'Request aborted', or similar
      expect(result.error).toMatch(/abort/i)
    })

    it('should not affect other conversations when aborting', async () => {
      const conv1 = 'conv-1'
      const conv2 = 'conv-2'

      // Abort conv1 (which isn't in progress)
      service.abort(conv1)

      // Setup successful scoring for conv2
      mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
        opts.onTextDelta?.('Report')
        opts.onToolUse?.('scoring_complete', validPayload)
      })

      const result = await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: conv2,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      expect(result.success).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should return STORAGE_FAILED error when transaction fails (Epic 20.2.1)', async () => {
      // Setup successful LLM call
      mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
        opts.onTextDelta?.('Report')
        opts.onToolUse?.('scoring_complete', validPayload)
      })

      // Make dimension score insert fail
      mockDimensionScoreRepo.createBatch.mockRejectedValue(new Error('Unique constraint violation'))

      const result = await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      expect(result.success).toBe(false)
      expect(result.code).toBe('STORAGE_FAILED')
      expect(result.error).toContain('Transaction failed')
      expect(result.error).toContain('Unique constraint violation')
    })

    it('should emit error progress event on failure', async () => {
      // Story 20.3.4: Now using findByIdWithVendor
      mockAssessmentRepo.findByIdWithVendor.mockRejectedValue(new Error('Database connection failed'))

      const progressEvents: ScoringProgressEvent[] = []
      const result = await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        (e) => progressEvents.push(e)
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Database connection failed')
      expect(progressEvents.some((e) => e.status === 'error')).toBe(true)
    })

    it('should clean up abort controller on error', async () => {
      // Story 20.3.4: Now using findByIdWithVendor
      mockAssessmentRepo.findByIdWithVendor.mockRejectedValue(new Error('Test error'))

      await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      // Aborting after error should not throw
      expect(() => service.abort(testConversationId)).not.toThrow()
    })

    it('should clean up abort controller on success', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (opts) => {
        opts.onTextDelta?.('Report')
        opts.onToolUse?.('scoring_complete', validPayload)
      })

      await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        jest.fn()
      )

      // Aborting after success should not throw
      expect(() => service.abort(testConversationId)).not.toThrow()
    })
  })
})
