/**
 * Integration test for Story 5a.4: Scoring Mode Trigger Implementation
 *
 * Tests all validation gates and error codes:
 * - ASSESSMENT_NOT_FOUND
 * - UNAUTHORIZED_ASSESSMENT
 * - ASSESSMENT_NOT_EXPORTED
 * - PARSE_CONFIDENCE_TOO_LOW
 * - RATE_LIMITED
 * - PARSE_FAILED
 * - SCORING_FAILED
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { ScoringService, ScoringError } from '../../src/application/services/ScoringService.js'
import type { IScoringService, ScoringInput } from '../../src/application/interfaces/IScoringService.js'
import type { IResponseRepository } from '../../src/application/interfaces/IResponseRepository.js'
import type { IDimensionScoreRepository } from '../../src/application/interfaces/IDimensionScoreRepository.js'
import type { IAssessmentResultRepository } from '../../src/application/interfaces/IAssessmentResultRepository.js'
import type { IAssessmentRepository } from '../../src/application/interfaces/IAssessmentRepository.js'
import type { IScoringDocumentParser } from '../../src/application/interfaces/IScoringDocumentParser.js'
import type { IFileRepository } from '../../src/application/interfaces/IFileRepository.js'
import type { IFileStorage } from '../../src/application/interfaces/IFileStorage.js'
import type { ILLMClient } from '../../src/application/interfaces/ILLMClient.js'
import type { IPromptBuilder } from '../../src/application/interfaces/IPromptBuilder.js'
import type { ITransactionRunner } from '../../src/application/interfaces/ITransactionRunner.js'
import type { OrphanedBatchRef } from '../../src/application/interfaces/IResponseRepository.js'
import { ScoringPayloadValidator } from '../../src/domain/scoring/ScoringPayloadValidator.js'
import { Assessment } from '../../src/domain/entities/Assessment.js'
import type { ScoringParseResult } from '../../src/application/interfaces/IScoringDocumentParser.js'
import type { CreateAssessmentResultDTO } from '../../src/domain/scoring/dtos.js'
import { randomUUID } from 'crypto'

// Mock implementations
class MockResponseRepository implements IResponseRepository {
  async createBatch(_responses: any[]): Promise<any[]> { return [] }
  async findByAssessmentId(_assessmentId: string): Promise<any[]> { return [] }
  async findByBatchId(_assessmentId: string, _batchId: string): Promise<any[]> { return [] }
  async deleteByBatchId(_assessmentId: string, _batchId: string): Promise<void> {}
  // Epic 20: Orphan cleanup methods (updated interface)
  async findOrphanedBatches(_olderThanHours: number): Promise<OrphanedBatchRef[]> { return [] }
  async deleteByBatchIdIfOrphaned(_assessmentId: string, _batchId: string): Promise<number> { return 0 }
}

class MockTransactionRunner implements ITransactionRunner {
  async run<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    return callback({})
  }
}

class MockDimensionScoreRepository implements IDimensionScoreRepository {
  async createBatch(_scores: any[], _tx?: unknown): Promise<any[]> { return [] }
  async findByAssessmentId(_assessmentId: string): Promise<any[]> { return [] }
  async findByBatchId(_assessmentId: string, _batchId: string): Promise<any[]> { return [] }
  async findLatestByAssessmentId(_assessmentId: string): Promise<any[]> { return [] }
}

class MockAssessmentResultRepository implements IAssessmentResultRepository {
  private results: CreateAssessmentResultDTO[] = []
  private rateLimitCount = 0

  async create(result: CreateAssessmentResultDTO, _tx?: unknown): Promise<any> {
    this.results.push(result)
    return { ...result, id: randomUUID(), scoredAt: new Date() }
  }
  async findByAssessmentId(_assessmentId: string): Promise<any[]> { return [] }
  async findByBatchId(_assessmentId: string, _batchId: string): Promise<any | null> { return null }
  async findLatestByAssessmentId(_assessmentId: string): Promise<any | null> { return null }
  async updateNarrativeReport(_assessmentId: string, _batchId: string, _narrativeReport: string): Promise<void> {}

  // Story 5a.4 methods
  async countTodayForAssessment(_assessmentId: string): Promise<number> {
    return this.rateLimitCount
  }

  async findRecentByFileHash(_fileHash: string, _hoursWindow: number): Promise<any | null> {
    // Not implemented for MVP
    return null
  }

  // Epic 20: Narrative generation concurrency control
  async claimNarrativeGeneration(_assessmentId: string, _batchId: string, _ttlMs?: number): Promise<boolean> {
    return true
  }
  async finalizeNarrativeGeneration(_assessmentId: string, _batchId: string, _narrativeReport: string): Promise<void> {}
  async failNarrativeGeneration(_assessmentId: string, _batchId: string, _error: string): Promise<void> {}
  async getNarrativeStatus(_assessmentId: string, _batchId: string): Promise<{ status: any; error: string | null } | null> {
    return null
  }

  // Test helper
  setRateLimitCount(count: number): void {
    this.rateLimitCount = count
  }
}

class MockAssessmentRepository implements IAssessmentRepository {
  private assessments = new Map<string, Assessment>()

  async create(assessment: Assessment): Promise<Assessment> {
    this.assessments.set(assessment.id, assessment)
    return assessment
  }

  async findById(id: string): Promise<Assessment | null> {
    return this.assessments.get(id) || null
  }

  async findByVendorId(_vendorId: string): Promise<Assessment[]> { return [] }
  async findByCreatedBy(_userId: string): Promise<Assessment[]> { return [] }
  async update(assessment: Assessment): Promise<Assessment> {
    this.assessments.set(assessment.id, assessment)
    return assessment
  }
  async updateStatus(_id: string, _status: any): Promise<void> {}
  async getVendor(_assessmentId: string): Promise<{ id: string; name: string }> {
    return { id: randomUUID(), name: 'Test Vendor' }
  }
  // Story 20.3.4: Combined assessment+vendor lookup
  async findByIdWithVendor(id: string): Promise<{ assessment: Assessment; vendor: { id: string; name: string } } | null> {
    const assessment = this.assessments.get(id)
    if (!assessment) return null
    return {
      assessment,
      vendor: { id: assessment.vendorId, name: 'Test Vendor' },
    }
  }
  async delete(_id: string): Promise<void> {}
  async list(_limit?: number, _offset?: number): Promise<Assessment[]> { return [] }
  async hasExportedAssessments(_userId: string): Promise<boolean> { return false }

  // Test helper
  addAssessment(assessment: Assessment): void {
    this.assessments.set(assessment.id, assessment)
  }
}

class MockFileRepository implements IFileRepository {
  private files = new Map<string, any>()

  async findByIdAndUser(fileId: string, userId: string): Promise<any | null> {
    const file = this.files.get(fileId)
    if (!file) return null
    if (file.userId !== userId) return null
    return file
  }

  async create(_file: any): Promise<any> { return { id: randomUUID(), textExcerpt: null, parseStatus: 'pending' } }
  async findById(_id: string): Promise<any | null> { return null }
  async findByIds(fileIds: string[]): Promise<any[]> {
    return fileIds.map(id => this.files.get(id)).filter(Boolean)
  }
  async findByConversation(_conversationId: string): Promise<any[]> { return [] }
  async findByIdAndConversation(_fileId: string, _conversationId: string): Promise<any | null> { return null }
  async findByConversationWithContext(_conversationId: string): Promise<any[]> { return [] }
  async updateIntakeContext(_fileId: string, _context: any, _gapCategories?: string[]): Promise<void> {}
  async updateScoringParseResult(_fileId: string, _result: any): Promise<void> {}
  async delete(_id: string): Promise<void> {}
  async deleteByConversation(_conversationId: string): Promise<void> {}
  async deleteByConversationId(_conversationId: string): Promise<void> {}
  // Epic 18 methods
  async updateTextExcerpt(_fileId: string, _excerpt: string): Promise<void> {}
  async updateParseStatus(_fileId: string, _status: any): Promise<void> {}
  async tryStartParsing(_fileId: string): Promise<boolean> { return true }
  async findByConversationWithExcerpt(_conversationId: string): Promise<any[]> { return [] }

  // Test helper
  addFile(file: any): void {
    this.files.set(file.id, file)
  }
}

class MockFileStorage implements IFileStorage {
  async store(_buffer: Buffer, _options: any): Promise<string> {
    return '/mock/storage/path'
  }
  async retrieve(_path: string): Promise<Buffer> {
    return Buffer.from('mock file content')
  }
  async delete(_path: string): Promise<void> {}
  async exists(_path: string): Promise<boolean> {
    return true
  }
}

class MockDocumentParser implements IScoringDocumentParser {
  private parseResult: ScoringParseResult | null = null

  async parseForResponses(_buffer: Buffer, _metadata: any, _options: any): Promise<ScoringParseResult> {
    if (!this.parseResult) {
      throw new Error('Mock parser not configured')
    }
    return this.parseResult
  }

  // Test helper
  setParseResult(result: ScoringParseResult): void {
    this.parseResult = result
  }
}

class MockLLMClient implements ILLMClient {
  async streamMessage(_messages: any[], _options: any): Promise<any> {
    return { isComplete: true, content: '', toolUse: [] }
  }
  async streamWithTool(_options: any): Promise<void> {
    // Call onTextDelta with narrative
    if (_options.onTextDelta) {
      _options.onTextDelta('Mock narrative report')
    }
    // Call onToolUse with mock payload
    if (_options.onToolUse) {
      // All 10 required dimensions with valid scores
      const allDimensions = [
        'clinical_risk', 'privacy_risk', 'security_risk', 'technical_credibility',
        'vendor_capability', 'ai_transparency', 'ethical_considerations',
        'regulatory_compliance', 'operational_excellence', 'sustainability'
      ]
      _options.onToolUse('scoring_complete', {
        compositeScore: 75,
        recommendation: 'approve',
        overallRiskRating: 'low',
        executiveSummary: 'Mock summary',
        keyFindings: ['Finding 1'],
        disqualifyingFactors: [],
        dimensionScores: allDimensions.map(dim => ({
          dimension: dim,
          score: 75,
          riskRating: 'low',
          findings: {
            subScores: [],
            keyRisks: [],
            mitigations: [],
            evidenceRefs: [],
          },
        })),
      })
    }
  }
  getModelId(): string {
    return 'mock-model'
  }
}

class MockPromptBuilder implements IPromptBuilder {
  buildScoringSystemPrompt(): string {
    return 'Mock scoring system prompt'
  }
  buildScoringUserPrompt(_input: any): string {
    return 'Mock scoring user prompt'
  }
  buildQuestionGenerationSystemPrompt(): string { return '' }
  buildQuestionGenerationUserPrompt(_input: any): string { return '' }
  buildIntakeSystemPrompt(): string { return '' }
  buildIntakeUserPrompt(_input: any): string { return '' }
}

describe('Story 5a.4: Scoring Mode Trigger - Validation Gates', () => {
  let scoringService: IScoringService
  let mockAssessmentRepo: MockAssessmentRepository
  let mockFileRepo: MockFileRepository
  let mockDocumentParser: MockDocumentParser
  let mockAssessmentResultRepo: MockAssessmentResultRepository

  const testUserId = randomUUID()
  const testConversationId = randomUUID()

  beforeAll(() => {
    // Initialize mocks
    mockAssessmentRepo = new MockAssessmentRepository()
    mockFileRepo = new MockFileRepository()
    mockDocumentParser = new MockDocumentParser()
    mockAssessmentResultRepo = new MockAssessmentResultRepository()

    // Initialize service
    scoringService = new ScoringService(
      new MockResponseRepository(),
      new MockDimensionScoreRepository(),
      mockAssessmentResultRepo,
      mockAssessmentRepo,
      mockFileRepo,
      new MockFileStorage(),
      mockDocumentParser,
      new MockLLMClient(),
      new MockPromptBuilder(),
      new ScoringPayloadValidator(),
      new MockTransactionRunner()
    )
  })

  beforeEach(() => {
    // Reset rate limit
    mockAssessmentResultRepo.setRateLimitCount(0)
  })

  afterAll(() => {
    // Cleanup
  })

  describe('Error Code: ASSESSMENT_NOT_FOUND', () => {
    it('should throw ASSESSMENT_NOT_FOUND when assessment does not exist', async () => {
      // Epic 18: File ownership is checked BEFORE assessment existence
      // Must set up an owned file first to reach the assessment check
      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Configure parser to return a valid result with the non-existent assessment ID
      const nonExistentAssessmentId = randomUUID()
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.9,
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: testUserId },
        parseTimeMs: 100,
        assessmentId: nonExistentAssessmentId,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [{ sectionNumber: 1, sectionTitle: 'Test', questionNumber: 1, questionText: 'Q1', responseText: 'A1', confidence: 0.9, hasVisualContent: false, visualContentDescription: null }],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      const input: ScoringInput = {
        assessmentId: nonExistentAssessmentId,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('ASSESSMENT_NOT_FOUND')
      expect(result.error).toContain('Assessment not found')
    })
  })

  describe('Error Code: UNAUTHORIZED_ASSESSMENT', () => {
    it('should throw UNAUTHORIZED_ASSESSMENT when user does not own assessment', async () => {
      // Epic 18: File ownership is checked BEFORE assessment ownership
      // Must set up an owned file first to reach the assessment owner check
      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'exported',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: randomUUID(), // Different user owns the assessment
      })
      mockAssessmentRepo.addAssessment(assessment)

      // Configure parser to return the assessment ID
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.9,
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: testUserId },
        parseTimeMs: 100,
        assessmentId: assessment.id,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [{ sectionNumber: 1, sectionTitle: 'Test', questionNumber: 1, questionText: 'Q1', responseText: 'A1', confidence: 0.9, hasVisualContent: false, visualContentDescription: null }],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId, // Different from assessment owner
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('UNAUTHORIZED_ASSESSMENT')
      expect(result.error).toContain('does not own assessment')
    })
  })

  describe('Error Code: ASSESSMENT_NOT_EXPORTED', () => {
    it('should throw ASSESSMENT_NOT_EXPORTED when assessment status is draft', async () => {
      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'draft', // Not exported
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUserId,
      })
      mockAssessmentRepo.addAssessment(assessment)

      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Epic 18: Parser is called before assessment status check, must configure it
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.9,
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: testUserId },
        parseTimeMs: 100,
        assessmentId: assessment.id,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [{ sectionNumber: 1, sectionTitle: 'Test', questionNumber: 1, questionText: 'Q1', responseText: 'A1', confidence: 0.9, hasVisualContent: false, visualContentDescription: null }],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('ASSESSMENT_NOT_EXPORTED')
      expect(result.error).toContain('must be exported before scoring')
    })
  })

  describe('Error Code: PARSE_CONFIDENCE_TOO_LOW', () => {
    it('should throw PARSE_CONFIDENCE_TOO_LOW when confidence < 0.7', async () => {
      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'exported',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUserId,
      })
      mockAssessmentRepo.addAssessment(assessment)

      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Configure parser to return low confidence
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.5, // Below 0.7 threshold
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: 'test-user' },
        parseTimeMs: 100,
        assessmentId: assessment.id,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [
          {
            sectionNumber: 1,
            sectionTitle: 'Test Section',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: 'Test response',
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          },
        ],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('PARSE_CONFIDENCE_TOO_LOW')
      expect(result.error).toContain('Parse confidence')
      expect(result.error).toContain('below minimum')
    })
  })

  describe('Error Code: RATE_LIMITED', () => {
    it('should throw RATE_LIMITED when 5 attempts exceeded', async () => {
      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'exported',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUserId,
      })
      mockAssessmentRepo.addAssessment(assessment)

      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Configure parser to return valid parse
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.8,
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: 'test-user' },
        parseTimeMs: 100,
        assessmentId: assessment.id,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [
          {
            sectionNumber: 1,
            sectionTitle: 'Test Section',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: 'Test response',
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          },
        ],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      // Set rate limit to 5 (max allowed)
      mockAssessmentResultRepo.setRateLimitCount(5)

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('RATE_LIMITED')
      expect(result.error).toContain('Maximum 5 scoring attempts')
    })
  })

  describe('Error Code: PARSE_FAILED', () => {
    it('should throw PARSE_FAILED when no responses found', async () => {
      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'exported',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUserId,
      })
      mockAssessmentRepo.addAssessment(assessment)

      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Configure parser to return empty responses
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.8,
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: 'test-user' },
        parseTimeMs: 100,
        assessmentId: assessment.id,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [], // Empty
        expectedQuestionCount: 10,
        parsedQuestionCount: 0,
        unparsedQuestions: ['1.1', '1.2'],
        isComplete: false,
      })

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('PARSE_FAILED')
      expect(result.error).toContain('No responses found')
    })

    it('should throw PARSE_FAILED when assessment ID mismatch', async () => {
      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'exported',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUserId,
      })
      mockAssessmentRepo.addAssessment(assessment)

      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Configure parser to return different assessment ID
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.8,
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: 'test-user' },
        parseTimeMs: 100,
        assessmentId: randomUUID(), // Different ID
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [
          {
            sectionNumber: 1,
            sectionTitle: 'Test Section',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: 'Test response',
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          },
        ],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(false)
      expect(result.code).toBe('PARSE_FAILED')
      expect(result.error).toContain('Assessment ID mismatch')
    })
  })

  describe('Successful Flow', () => {
    it('should successfully score when all validation gates pass', async () => {
      const assessment = Assessment.fromPersistence({
        id: randomUUID(),
        vendorId: randomUUID(),
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'exported',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUserId,
      })
      mockAssessmentRepo.addAssessment(assessment)

      const fileId = randomUUID()
      mockFileRepo.addFile({
        id: fileId,
        userId: testUserId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/test/path',
        createdAt: new Date(),
      })

      // Configure parser to return valid parse
      mockDocumentParser.setParseResult({
        success: true,
        confidence: 0.85, // Above threshold
        metadata: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024, documentType: 'pdf', storagePath: '/test/path', uploadedAt: new Date(), uploadedBy: 'test-user' },
        parseTimeMs: 100,
        assessmentId: assessment.id,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        responses: [
          {
            sectionNumber: 1,
            sectionTitle: 'Test Section',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: 'Test response',
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          },
        ],
        expectedQuestionCount: 1,
        parsedQuestionCount: 1,
        unparsedQuestions: [],
        isComplete: true,
      })

      // Rate limit is 0 (below max)
      mockAssessmentResultRepo.setRateLimitCount(0)

      const input: ScoringInput = {
        assessmentId: assessment.id,
        conversationId: testConversationId,
        fileId,
        userId: testUserId,
      }

      const result = await scoringService.score(input, () => {})

      expect(result.success).toBe(true)
      expect(result.report).toBeDefined()
      expect(result.report?.payload.compositeScore).toBe(75)
      expect(result.code).toBeUndefined()
    })
  })
})
