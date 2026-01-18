/**
 * Unit tests for ScoringRehydrationController
 *
 * Epic 22.1.1: Tests for the scoring rehydration endpoint controller.
 */

import { Request, Response, NextFunction } from 'express'
import { ScoringRehydrationController } from '../../../../src/infrastructure/http/controllers/ScoringRehydrationController.js'
import type { IScoringService, ScoringRehydrationResult } from '../../../../src/application/interfaces/IScoringService.js'
import { UnauthorizedError } from '../../../../src/domain/scoring/errors.js'
import { User } from '../../../../src/domain/entities/User.js'

describe('ScoringRehydrationController', () => {
  let controller: ScoringRehydrationController
  let mockScoringService: jest.Mocked<IScoringService>
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction

  const testUserId = 'user-1'
  const testConversationId = 'conv-1'
  const testAssessmentId = 'assessment-1'
  const testBatchId = 'batch-1'

  const mockScoringResult: ScoringRehydrationResult = {
    compositeScore: 75,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Test executive summary',
    keyFindings: ['Finding 1', 'Finding 2'],
    dimensionScores: [
      { dimension: 'clinical_risk', score: 80, riskRating: 'low' },
      { dimension: 'data_governance', score: 70, riskRating: 'medium' },
    ],
    batchId: testBatchId,
    assessmentId: testAssessmentId,
  }

  beforeEach(() => {
    mockScoringService = {
      score: jest.fn(),
      abort: jest.fn(),
      getResultForConversation: jest.fn(),
    } as jest.Mocked<IScoringService>

    controller = new ScoringRehydrationController(mockScoringService)

    mockRequest = {
      params: { conversationId: testConversationId },
      user: User.fromPersistence({
        id: testUserId,
        email: 'test@example.com',
        passwordHash: 'hash',
        name: 'Test User',
        role: 'analyst',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    }

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    mockNext = jest.fn()
  })

  describe('getForConversation', () => {
    it('should return 200 with scoring result on success', async () => {
      mockScoringService.getResultForConversation.mockResolvedValue(mockScoringResult)

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockScoringService.getResultForConversation).toHaveBeenCalledWith(
        testConversationId,
        testUserId
      )
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith(mockScoringResult)
    })

    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockResponse.status).toHaveBeenCalledWith(401)
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Not authenticated' })
      expect(mockScoringService.getResultForConversation).not.toHaveBeenCalled()
    })

    it('should return 400 if conversationId is missing', async () => {
      mockRequest.params = {}

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockResponse.status).toHaveBeenCalledWith(400)
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing conversationId parameter' })
      expect(mockScoringService.getResultForConversation).not.toHaveBeenCalled()
    })

    it('should return 404 if no scoring results exist', async () => {
      mockScoringService.getResultForConversation.mockResolvedValue(null)

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockResponse.status).toHaveBeenCalledWith(404)
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'No scoring results found for conversation',
      })
    })

    it('should return 403 if user does not own conversation', async () => {
      mockScoringService.getResultForConversation.mockRejectedValue(
        new UnauthorizedError(`User ${testUserId} does not own conversation ${testConversationId}`)
      )

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockResponse.status).toHaveBeenCalledWith(403)
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Access denied' })
    })

    it('should pass unexpected errors to error handler', async () => {
      const unexpectedError = new Error('Database connection failed')
      mockScoringService.getResultForConversation.mockRejectedValue(unexpectedError)

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockNext).toHaveBeenCalledWith(unexpectedError)
    })

    it('should handle empty dimensionScores array', async () => {
      const resultWithNoDimensions: ScoringRehydrationResult = {
        ...mockScoringResult,
        dimensionScores: [],
      }
      mockScoringService.getResultForConversation.mockResolvedValue(resultWithNoDimensions)

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith(resultWithNoDimensions)
    })

    it('should pass correct conversationId from params', async () => {
      const customConversationId = 'custom-conv-123'
      mockRequest.params = { conversationId: customConversationId }
      mockScoringService.getResultForConversation.mockResolvedValue(mockScoringResult)

      await controller.getForConversation(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockScoringService.getResultForConversation).toHaveBeenCalledWith(
        customConversationId,
        testUserId
      )
    })
  })
})
