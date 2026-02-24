/**
 * Unit tests for ScoringService
 *
 * Tests the scoring orchestration workflow:
 * - Authorization checks
 * - Document parsing
 * - LLM scoring via ScoringLLMService
 * - Payload validation
 * - Score storage via ScoringStorageService
 * - Abort handling
 * - Query delegation via ScoringQueryService
 *
 * Epic 37 Sprint 1 Story 3: Updated to use sub-service mocks
 * (ScoringStorageService, ScoringLLMService, ScoringQueryService)
 * instead of individual repository/client mocks.
 */

// Jest provides describe, it, expect, beforeEach, jest globals
import { ScoringService, UnauthorizedError } from '../../../../src/application/services/ScoringService.js'
import { ScoringPayloadValidator } from '../../../../src/domain/scoring/ScoringPayloadValidator.js'
import { ALL_DIMENSIONS } from '../../../../src/domain/scoring/rubric.js'
import type { IAssessmentResultRepository } from '../../../../src/application/interfaces/IAssessmentResultRepository.js'
import type { IAssessmentRepository } from '../../../../src/application/interfaces/IAssessmentRepository.js'
import type { IFileRepository } from '../../../../src/application/interfaces/IFileRepository.js'
import type { IFileStorage } from '../../../../src/application/interfaces/IFileStorage.js'
import type { IScoringDocumentParser } from '../../../../src/application/interfaces/IScoringDocumentParser.js'
import type { ScoringProgressEvent } from '../../../../src/domain/scoring/types.js'
import type { ScoringStorageService } from '../../../../src/application/services/ScoringStorageService.js'
import type { ScoringLLMService } from '../../../../src/application/services/ScoringLLMService.js'
import type { ScoringQueryService } from '../../../../src/application/services/ScoringQueryService.js'
import type { ScoringRetryService } from '../../../../src/application/services/ScoringRetryService.js'
import { Conversation } from '../../../../src/domain/entities/Conversation.js'

describe('ScoringService', () => {
  let service: ScoringService
  let mockAssessmentResultRepo: jest.Mocked<IAssessmentResultRepository>
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>
  let mockFileRepo: jest.Mocked<IFileRepository>
  let mockFileStorage: jest.Mocked<IFileStorage>
  let mockDocumentParser: jest.Mocked<IScoringDocumentParser>
  let mockStorageService: jest.Mocked<ScoringStorageService>
  let mockLLMService: jest.Mocked<ScoringLLMService>
  let mockQueryService: jest.Mocked<ScoringQueryService>
  let mockRetryService: jest.Mocked<ScoringRetryService>
  let validator: ScoringPayloadValidator

  const testUserId = 'user-1'
  const testAssessmentId = 'test-assessment'
  const testFileId = 'file-1'
  const testConversationId = 'conv-1'

  // Valid scoring payload matching all 10 dimensions
  // compositeScore=53 matches weighted average for clinical_ai (v1.1) with all scores=75:
  // risk dims: 25%*75 + 15%*75 + 15%*75 = 41.25; capability dims (inverted=25): 10%*25 + 10%*25 + 5%*25 + 5%*25 + 5%*25 + 5%*25 + 5%*25 = 11.25; total=52.5 -> 53
  const validPayload = {
    compositeScore: 53,
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
      updateExcerptAndClassification: jest.fn(),
      updateParseStatus: jest.fn(),
      tryStartParsing: jest.fn(),
      findByConversationWithExcerpt: jest.fn(),
      deleteByConversationId: jest.fn(),
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

    // Epic 37: Mock ScoringStorageService (replaces individual repo mocks for storage)
    mockStorageService = {
      storeResponses: jest.fn().mockResolvedValue(undefined),
      storeScores: jest.fn().mockResolvedValue(undefined),
      deriveDocumentType: jest.fn().mockReturnValue('pdf'),
      determineSolutionType: jest.fn().mockReturnValue('clinical_ai'),
    } as unknown as jest.Mocked<ScoringStorageService>

    // Epic 37: Mock ScoringLLMService (replaces llmClient + promptBuilder mocks)
    mockLLMService = {
      scoreWithClaude: jest.fn().mockResolvedValue({
        narrativeReport: 'Narrative report content for the assessment.',
        payload: validPayload,
      }),
      getModelId: jest.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
      fetchISOCatalog: jest.fn().mockResolvedValue([]),
      fetchApplicableControls: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ScoringLLMService>

    // Epic 37: Mock ScoringQueryService (replaces inline getResultForConversation)
    mockQueryService = {
      getResultForConversation: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ScoringQueryService>

    mockRetryService = {
      retryWithCorrection: jest.fn(),
    } as unknown as jest.Mocked<ScoringRetryService>

    validator = new ScoringPayloadValidator()

    service = new ScoringService(
      mockAssessmentResultRepo,
      mockAssessmentRepo,
      mockFileRepo,
      mockFileStorage,
      mockDocumentParser,
      validator,
      mockStorageService,
      mockLLMService,
      mockQueryService,
      mockRetryService
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

      it('should emit granular progress events with percentages (Story 39.2.1)', async () => {
        const progressEvents: ScoringProgressEvent[] = []
        await service.score(defaultInput, (e) => progressEvents.push(e))

        // Verify all 9 granular progress events are emitted
        const expected = [
          { status: 'parsing', message: 'Processing uploaded document...', progress: 5 },
          { status: 'parsing', message: 'Extracting text from document...', progress: 10 },
          { status: 'parsing', message: 'Analyzing document format...', progress: 15 },
          { status: 'parsing', message: 'Found 1 of 111 responses', progress: 50 },
          { status: 'scoring', message: 'Loading compliance controls...', progress: 55 },
          { status: 'scoring', message: 'Analyzing vendor responses against risk rubric...', progress: 60 },
          { status: 'validating', message: 'Validating scoring results...', progress: 90 },
          { status: 'validating', message: 'Storing assessment results...', progress: 95 },
          { status: 'complete', message: 'Risk assessment complete -- score: 53/100', progress: 100 },
        ]

        for (const exp of expected) {
          const found = progressEvents.find(
            (e) => e.status === exp.status && e.message === exp.message && e.progress === exp.progress
          )
          expect(found).toBeDefined()
        }
      })

      it('should emit progress values that are monotonically increasing (Story 39.2.1)', async () => {
        const progressEvents: ScoringProgressEvent[] = []
        await service.score(defaultInput, (e) => progressEvents.push(e))

        const progressValues = progressEvents
          .filter((e) => e.progress !== undefined && e.status !== 'error')
          .map((e) => e.progress!)

        for (let i = 1; i < progressValues.length; i++) {
          expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1])
        }
      })

      it('should delegate storeResponses to storageService', async () => {
        await service.score(defaultInput, jest.fn())

        expect(mockStorageService.storeResponses).toHaveBeenCalledWith(
          expect.objectContaining({
            assessmentId: testAssessmentId,
            responses: expect.arrayContaining([
              expect.objectContaining({
                questionText: 'Q1',
                responseText: 'A1',
              }),
            ]),
          }),
          testAssessmentId,
          expect.any(String), // batchId
          testFileId
        )
      })

      it('should delegate storeScores to storageService', async () => {
        await service.score(defaultInput, jest.fn())

        expect(mockStorageService.storeScores).toHaveBeenCalledWith(
          testAssessmentId,
          expect.any(String), // batchId
          validPayload,
          'Narrative report content for the assessment.',
          expect.any(Number) // durationMs
        )
      })

      it('should delegate scoreWithClaude to llmService', async () => {
        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.objectContaining({
            assessmentId: testAssessmentId,
          }),
          'Test Vendor',
          'Test Solution',
          'clinical_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          { catalogControls: [], applicableControls: [] }
        )
      })

      it('should fetch ISO catalog before scoring (Epic 37)', async () => {
        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.fetchISOCatalog).toHaveBeenCalledTimes(1)
      })

      it('should pass catalogControls for cached block and empty applicableControls to avoid duplication (Epic 39)', async () => {
        const mockCatalog = [{ clauseRef: 'A.6.1' }]
        mockLLMService.fetchISOCatalog.mockResolvedValue(mockCatalog as any)

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(AbortSignal),
          expect.any(Function),
          { catalogControls: mockCatalog, applicableControls: [] }
        )
      })

      it('should gracefully degrade when ISO fetch fails (Epic 37)', async () => {
        mockLLMService.fetchISOCatalog.mockRejectedValue(new Error('DB error'))

        const result = await service.score(defaultInput, jest.fn())
        expect(result.success).toBe(true)
        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(AbortSignal),
          expect.any(Function),
          { catalogControls: [], applicableControls: [] }
        )
      })

      it('should use llmService.getModelId() for report data', async () => {
        const result = await service.score(defaultInput, jest.fn())

        expect(mockLLMService.getModelId).toHaveBeenCalled()
        expect(result.report?.modelId).toBe('claude-3-5-sonnet-20241022')
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

        // Make deriveDocumentType throw for unsupported MIME type
        mockStorageService.deriveDocumentType.mockImplementation(() => {
          throw new Error('Unsupported MIME type: application/xyz')
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Unsupported MIME type')
      })
    })

    describe('LLM scoring errors', () => {
      it('should fail if Claude does not call scoring_complete tool', async () => {
        mockLLMService.scoreWithClaude.mockRejectedValue(
          new Error('Claude did not call scoring_complete tool')
        )

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('scoring_complete')
      })

      it('should fail if LLM service throws error', async () => {
        mockLLMService.scoreWithClaude.mockRejectedValue(new Error('API rate limit exceeded'))

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('API rate limit exceeded')
      })
    })

    describe('validation errors', () => {
      it('should fail if payload validation fails - missing fields', async () => {
        mockLLMService.scoreWithClaude.mockResolvedValue({
          narrativeReport: 'Report',
          payload: { invalid: 'payload' },
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid scoring payload')
      })

      it('should fail if compositeScore is out of range', async () => {
        mockLLMService.scoreWithClaude.mockResolvedValue({
          narrativeReport: 'Report',
          payload: {
            ...validPayload,
            compositeScore: 150, // Invalid - over 100
          },
        })

        const result = await service.score(defaultInput, jest.fn())

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid scoring payload')
      })

      it('should fail if missing required dimensions', async () => {
        mockLLMService.scoreWithClaude.mockResolvedValue({
          narrativeReport: 'Report',
          payload: {
            ...validPayload,
            dimensionScores: [
              { dimension: 'clinical_risk', score: 75, riskRating: 'medium' },
            ], // Only 1 dimension, missing 9
          },
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

        mockStorageService.determineSolutionType.mockReturnValue('clinical_ai')

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Clinical AI Tool',
          'clinical_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
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

        mockStorageService.determineSolutionType.mockReturnValue('administrative_ai')

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Admin AI Tool',
          'administrative_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
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

        mockStorageService.determineSolutionType.mockReturnValue('patient_facing')

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Patient Portal',
          'patient_facing',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
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

        mockStorageService.determineSolutionType.mockReturnValue('clinical_ai')

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Unknown Tool',
          'clinical_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
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

        mockStorageService.determineSolutionType.mockReturnValue('clinical_ai')

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Unknown Tool',
          'clinical_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
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

        mockStorageService.determineSolutionType.mockReturnValue('clinical_ai')

        await service.score(defaultInput, jest.fn())

        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Clinical Tool',
          'clinical_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
        )
      })

      it('should log warning and default to clinical_ai for invalid solutionType', async () => {
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

        // ScoringStorageService.determineSolutionType handles the warning + default
        mockStorageService.determineSolutionType.mockReturnValue('clinical_ai')

        await service.score(defaultInput, jest.fn())

        expect(mockStorageService.determineSolutionType).toHaveBeenCalled()
        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Unknown Tool',
          'clinical_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
        )
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

        mockStorageService.determineSolutionType.mockReturnValue('administrative_ai')

        await service.score(defaultInput, jest.fn())

        // Should use solutionType, not assessmentType
        expect(mockLLMService.scoreWithClaude).toHaveBeenCalledWith(
          expect.anything(),
          'Test Vendor',
          'Admin Tool',
          'administrative_ai',
          expect.any(AbortSignal),
          expect.any(Function),
          expect.objectContaining({ catalogControls: expect.any(Array), applicableControls: expect.any(Array) })
        )
      })
    })
  })

  describe('abort', () => {
    it('should pass abort signal to document parser (Story 20.3.3)', async () => {
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

    it('should pass onProgress to document parser (Story 39.2.4)', async () => {
      const onProgress = jest.fn()
      await service.score(
        {
          assessmentId: testAssessmentId,
          conversationId: testConversationId,
          fileId: testFileId,
          userId: testUserId,
        },
        onProgress
      )

      // Verify parseForResponses was called with onProgress callback
      expect(mockDocumentParser.parseForResponses).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Object),
        expect.objectContaining({
          onProgress: expect.any(Function),
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
      // LLM service should not be called since parsing was aborted
      expect(mockLLMService.scoreWithClaude).not.toHaveBeenCalled()
    })

    it('should abort in-progress scoring', async () => {
      // Setup LLM service that checks abort signal and waits
      mockLLMService.scoreWithClaude.mockImplementation(
        async (_parseResult, _vendorName, _solutionName, _solutionType, abortSignal) => {
          // Simulate checking abort signal during long operation
          await new Promise((resolve) => setTimeout(resolve, 100))
          if (abortSignal?.aborted) {
            throw new Error('Request aborted')
          }
          return { narrativeReport: 'Report', payload: validPayload }
        }
      )

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
    it('should return STORAGE_FAILED error when storeScores fails (Epic 20.2.1)', async () => {
      // Make storageService.storeScores fail with ScoringError
      const { ScoringError: ScoringErrorClass } = await import('../../../../src/domain/scoring/errors.js')
      mockStorageService.storeScores.mockRejectedValue(
        new ScoringErrorClass('STORAGE_FAILED', 'Transaction failed while storing scores: Unique constraint violation')
      )

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

  describe('structural violation retry orchestration', () => {
    const defaultInput = {
      assessmentId: testAssessmentId,
      conversationId: testConversationId,
      fileId: testFileId,
      userId: testUserId,
    }

    it('should call retryWithCorrection when structural violations are present', async () => {
      // Return payload that passes schema but has structural violations
      const payloadWithViolations = { ...validPayload }
      // Mock validator to return valid=true but with structural violations
      const origValidate = validator.validate.bind(validator)
      jest.spyOn(validator, 'validate').mockImplementation((payload, solutionType) => {
        const base = origValidate(payload, solutionType)
        // First call: inject structural violations
        if (mockRetryService.retryWithCorrection.mock.calls.length === 0) {
          return { ...base, structuralViolations: ['sub-score sum mismatch'] }
        }
        return base
      })

      // Mock retry service to succeed
      mockRetryService.retryWithCorrection.mockResolvedValue({
        validationResult: {
          valid: true,
          errors: [],
          warnings: [],
          structuralViolations: [],
          sanitized: validPayload,
        },
        llmResult: {
          narrativeReport: 'Corrected narrative',
          payload: validPayload,
        },
      })

      const result = await service.score(defaultInput, jest.fn())

      expect(result.success).toBe(true)
      expect(mockRetryService.retryWithCorrection).toHaveBeenCalledTimes(1)
      expect(mockRetryService.retryWithCorrection).toHaveBeenCalledWith(
        ['sub-score sum mismatch'],
        expect.objectContaining({ vendorName: 'Test Vendor', solutionType: 'clinical_ai' })
      )
    })

    it('should use corrected narrative from retry result', async () => {
      jest.spyOn(validator, 'validate').mockReturnValueOnce({
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: ['composite mismatch'],
        sanitized: validPayload,
      })

      mockRetryService.retryWithCorrection.mockResolvedValue({
        validationResult: {
          valid: true,
          errors: [],
          warnings: [],
          structuralViolations: [],
          sanitized: validPayload,
        },
        llmResult: {
          narrativeReport: 'Corrected narrative after retry',
          payload: validPayload,
        },
      })

      const result = await service.score(defaultInput, jest.fn())

      expect(result.success).toBe(true)
      // storeScores should receive the corrected narrative
      expect(mockStorageService.storeScores).toHaveBeenCalledWith(
        testAssessmentId,
        expect.any(String),
        validPayload,
        'Corrected narrative after retry',
        expect.any(Number)
      )
    })

    it('should return STRUCTURAL_VALIDATION_FAILED when retry fails', async () => {
      const { ScoringError: ScoringErrorClass } = await import('../../../../src/domain/scoring/errors.js')

      jest.spyOn(validator, 'validate').mockReturnValueOnce({
        valid: true,
        errors: [],
        warnings: [],
        structuralViolations: ['sub-score value not in allowed set'],
        sanitized: validPayload,
      })

      mockRetryService.retryWithCorrection.mockRejectedValue(
        new ScoringErrorClass('STRUCTURAL_VALIDATION_FAILED', 'Structural violations persist after retry')
      )

      const result = await service.score(defaultInput, jest.fn())

      expect(result.success).toBe(false)
      expect(result.code).toBe('STRUCTURAL_VALIDATION_FAILED')
      expect(result.error).toContain('Structural violations persist')
      expect(mockStorageService.storeScores).not.toHaveBeenCalled()
    })

    it('should not call retryService when no structural violations', async () => {
      const result = await service.score(defaultInput, jest.fn())

      expect(result.success).toBe(true)
      expect(mockRetryService.retryWithCorrection).not.toHaveBeenCalled()
    })
  })

  describe('getResultForConversation (Epic 22.1.1)', () => {
    it('should delegate to queryService', async () => {
      const mockResult = {
        compositeScore: 75,
        recommendation: 'conditional' as const,
        overallRiskRating: 'medium' as const,
        executiveSummary: 'Test executive summary',
        keyFindings: ['Finding 1', 'Finding 2'],
        dimensionScores: [
          { dimension: 'clinical_risk', score: 80, riskRating: 'low' as const },
        ],
        batchId: 'batch-1',
        assessmentId: testAssessmentId,
      }
      mockQueryService.getResultForConversation.mockResolvedValue(mockResult)

      const result = await service.getResultForConversation(testConversationId, testUserId)

      expect(mockQueryService.getResultForConversation).toHaveBeenCalledWith(
        testConversationId,
        testUserId
      )
      expect(result).toEqual(mockResult)
    })

    it('should return null when queryService returns null', async () => {
      mockQueryService.getResultForConversation.mockResolvedValue(null)

      const result = await service.getResultForConversation('nonexistent', testUserId)

      expect(result).toBeNull()
    })

    it('should propagate errors from queryService', async () => {
      mockQueryService.getResultForConversation.mockRejectedValue(
        new UnauthorizedError('User other-user does not own conversation conv-1')
      )

      await expect(
        service.getResultForConversation(testConversationId, 'other-user')
      ).rejects.toThrow(UnauthorizedError)
    })
  })
})
