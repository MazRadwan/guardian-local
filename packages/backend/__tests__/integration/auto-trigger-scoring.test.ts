/**
 * Behavior/Contract test for Sprint 5a: Auto-trigger scoring event emissions
 *
 * PURPOSE: Documents and validates the expected WebSocket event contract for scoring:
 * - scoring_started event shape and timing
 * - scoring_progress event sequence
 * - scoring_complete payload on success
 * - scoring_error payload with structured codes on failure
 *
 * IMPORTANT: This is NOT a true integration test of DocumentUploadController.
 * It uses a test harness that replicates the expected behavior, not the real code.
 * If the controller implementation changes, these tests may still pass.
 *
 * For true integration testing, see Sprint 6 E2E tests (Playwright + WebSocket).
 *
 * This tests the auto-trigger path that replaces the deprecated start_scoring WebSocket event.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import type { IScoringService, ScoringInput, ScoringOutput } from '../../src/application/interfaces/IScoringService.js'
import type { ScoringProgressEvent } from '../../src/domain/scoring/types.js'
import type { ScoringCompletePayload } from '../../src/domain/scoring/types.js'
import { randomUUID } from 'crypto'

// Capture emitted events
interface EmittedEvent {
  room: string
  event: string
  payload: unknown
}

// Mock emit function that captures events
function createEventCapture(): { emit: (room: string, event: string, payload: unknown) => void; events: EmittedEvent[] } {
  const events: EmittedEvent[] = []
  return {
    emit: (room: string, event: string, payload: unknown) => {
      events.push({ room, event, payload })
    },
    events,
  }
}

/**
 * Minimal test harness that replicates DocumentUploadController.runScoring() event emission
 * This tests that the correct WebSocket events are emitted in the correct order
 */
async function runScoringHarness(
  emit: (room: string, event: string, payload: unknown) => void,
  socketRoom: string,
  conversationId: string,
  assessmentId: string,
  fileId: string,
  userId: string,
  scoringService: IScoringService
): Promise<void> {
  try {
    // Emit scoring_started
    emit(socketRoom, 'scoring_started', {
      assessmentId,
      fileId,
      conversationId,
    })

    // Build scoring input
    const scoringInput: ScoringInput = {
      assessmentId,
      conversationId,
      fileId,
      userId,
    }

    // Call scoring service with progress callback
    const scoringResult = await scoringService.score(scoringInput, (event: ScoringProgressEvent) => {
      emit(socketRoom, 'scoring_progress', {
        conversationId,
        status: event.status,
        message: event.message,
        progress: event.progress,
      })
    })

    if (scoringResult.success && scoringResult.report) {
      // Emit scoring complete
      emit(socketRoom, 'scoring_complete', {
        conversationId,
        compositeScore: scoringResult.report.payload.compositeScore,
        recommendation: scoringResult.report.payload.recommendation,
        narrativeReport: scoringResult.report.narrativeReport,
      })
    } else {
      // Emit scoring error
      emit(socketRoom, 'scoring_error', {
        conversationId,
        error: scoringResult.error || 'Scoring failed',
        code: scoringResult.code || 'SCORING_FAILED',
      })
    }
  } catch (error) {
    // Emit scoring error
    emit(socketRoom, 'scoring_error', {
      conversationId,
      error: error instanceof Error ? error.message : 'Scoring failed',
      code: 'SCORING_FAILED',
    })
  }
}

describe('Sprint 5a: Auto-trigger Scoring Event Emissions', () => {
  const testConversationId = randomUUID()
  const testAssessmentId = randomUUID()
  const testFileId = randomUUID()
  const testUserId = randomUUID()
  const testSocketRoom = `user:${testUserId}`

  // Helper to create mock scoring payload
  function createMockPayload(): ScoringCompletePayload {
    return {
      compositeScore: 78,
      recommendation: 'approve',
      overallRiskRating: 'low',
      executiveSummary: 'Test summary',
      keyFindings: ['Finding 1'],
      disqualifyingFactors: [],
      dimensionScores: [
        {
          dimension: 'clinical_risk',
          score: 80,
          riskRating: 'low',
          findings: { subScores: [], keyRisks: [], mitigations: [], evidenceRefs: [] },
        },
      ],
    }
  }

  describe('Successful Scoring Flow', () => {
    it('should emit scoring_started, scoring_progress, and scoring_complete events on success', async () => {
      const capture = createEventCapture()

      // Mock successful scoring service
      const mockScoringService: IScoringService = {
        score: async (_input: ScoringInput, onProgress: (event: ScoringProgressEvent) => void): Promise<ScoringOutput> => {
          // Simulate progress events
          onProgress({ status: 'parsing', message: 'Extracting responses...' })
          onProgress({ status: 'scoring', message: 'Analyzing responses...' })
          onProgress({ status: 'validating', message: 'Validating results...' })

          return {
            success: true,
            batchId: randomUUID(),
            report: {
              assessmentId: testAssessmentId,
              batchId: randomUUID(),
              payload: createMockPayload(),
              narrativeReport: 'Test narrative report',
              rubricVersion: '1.0',
              modelId: 'test-model',
              scoringDurationMs: 5000,
            },
          }
        },
        abort: jest.fn(),
        getResultForConversation: async () => null,
      }

      await runScoringHarness(
        capture.emit,
        testSocketRoom,
        testConversationId,
        testAssessmentId,
        testFileId,
        testUserId,
        mockScoringService
      )

      const events = capture.events

      // Verify scoring_started was emitted first
      const startedEvent = events.find(e => e.event === 'scoring_started')
      expect(startedEvent).toBeDefined()
      expect(startedEvent?.room).toBe(testSocketRoom)
      expect((startedEvent?.payload as Record<string, unknown>).assessmentId).toBe(testAssessmentId)
      expect((startedEvent?.payload as Record<string, unknown>).fileId).toBe(testFileId)
      expect((startedEvent?.payload as Record<string, unknown>).conversationId).toBe(testConversationId)

      // Verify scoring_progress events were emitted
      const progressEvents = events.filter(e => e.event === 'scoring_progress')
      expect(progressEvents.length).toBe(3)
      expect((progressEvents[0].payload as Record<string, unknown>).status).toBe('parsing')
      expect((progressEvents[1].payload as Record<string, unknown>).status).toBe('scoring')
      expect((progressEvents[2].payload as Record<string, unknown>).status).toBe('validating')

      // Verify scoring_complete was emitted
      const completeEvent = events.find(e => e.event === 'scoring_complete')
      expect(completeEvent).toBeDefined()
      expect(completeEvent?.room).toBe(testSocketRoom)
      expect((completeEvent?.payload as Record<string, unknown>).conversationId).toBe(testConversationId)
      expect((completeEvent?.payload as Record<string, unknown>).compositeScore).toBe(78)
      expect((completeEvent?.payload as Record<string, unknown>).narrativeReport).toBe('Test narrative report')
    })
  })

  describe('Failed Scoring Flow', () => {
    it('should emit scoring_started and scoring_error events on failure', async () => {
      const capture = createEventCapture()

      // Mock failed scoring service
      const mockScoringService: IScoringService = {
        score: async (): Promise<ScoringOutput> => {
          return {
            success: false,
            batchId: randomUUID(),
            error: 'Assessment not exported',
            code: 'ASSESSMENT_NOT_EXPORTED',
          }
        },
        abort: jest.fn(),
        getResultForConversation: async () => null,
      }

      await runScoringHarness(
        capture.emit,
        testSocketRoom,
        testConversationId,
        testAssessmentId,
        testFileId,
        testUserId,
        mockScoringService
      )

      const events = capture.events

      // Verify scoring_started was emitted
      const startedEvent = events.find(e => e.event === 'scoring_started')
      expect(startedEvent).toBeDefined()

      // Verify scoring_error was emitted with correct code
      const errorEvent = events.find(e => e.event === 'scoring_error')
      expect(errorEvent).toBeDefined()
      expect(errorEvent?.room).toBe(testSocketRoom)
      expect((errorEvent?.payload as Record<string, unknown>).conversationId).toBe(testConversationId)
      expect((errorEvent?.payload as Record<string, unknown>).error).toBe('Assessment not exported')
      expect((errorEvent?.payload as Record<string, unknown>).code).toBe('ASSESSMENT_NOT_EXPORTED')

      // Verify scoring_complete was NOT emitted
      const completeEvent = events.find(e => e.event === 'scoring_complete')
      expect(completeEvent).toBeUndefined()
    })

    it('should emit scoring_error with SCORING_FAILED code when exception is thrown', async () => {
      const capture = createEventCapture()

      // Mock scoring service that throws
      const mockScoringService: IScoringService = {
        score: async (): Promise<ScoringOutput> => {
          throw new Error('Unexpected database error')
        },
        abort: jest.fn(),
        getResultForConversation: async () => null,
      }

      await runScoringHarness(
        capture.emit,
        testSocketRoom,
        testConversationId,
        testAssessmentId,
        testFileId,
        testUserId,
        mockScoringService
      )

      const events = capture.events

      // Verify scoring_error was emitted with generic code
      const errorEvent = events.find(e => e.event === 'scoring_error')
      expect(errorEvent).toBeDefined()
      expect((errorEvent?.payload as Record<string, unknown>).error).toBe('Unexpected database error')
      expect((errorEvent?.payload as Record<string, unknown>).code).toBe('SCORING_FAILED')
    })
  })

  describe('Event Ordering', () => {
    it('should emit events in correct order: started -> progress* -> complete/error', async () => {
      const capture = createEventCapture()

      const mockScoringService: IScoringService = {
        score: async (_input: ScoringInput, onProgress: (event: ScoringProgressEvent) => void): Promise<ScoringOutput> => {
          onProgress({ status: 'parsing', message: 'Step 1' })
          onProgress({ status: 'scoring', message: 'Step 2' })

          return {
            success: true,
            batchId: randomUUID(),
            report: {
              assessmentId: testAssessmentId,
              batchId: randomUUID(),
              payload: createMockPayload(),
              narrativeReport: 'Report',
              rubricVersion: '1.0',
              modelId: 'model',
              scoringDurationMs: 1000,
            },
          }
        },
        abort: jest.fn(),
        getResultForConversation: async () => null,
      }

      await runScoringHarness(
        capture.emit,
        testSocketRoom,
        testConversationId,
        testAssessmentId,
        testFileId,
        testUserId,
        mockScoringService
      )

      const eventOrder = capture.events.map(e => e.event)

      // Verify order
      const startedIndex = eventOrder.indexOf('scoring_started')
      const progressIndices = eventOrder
        .map((e, i) => e === 'scoring_progress' ? i : -1)
        .filter(i => i !== -1)
      const completeIndex = eventOrder.indexOf('scoring_complete')

      expect(startedIndex).toBe(0) // First event
      expect(progressIndices.every(i => i > startedIndex && i < completeIndex)).toBe(true)
      expect(completeIndex).toBeGreaterThan(Math.max(...progressIndices))
    })
  })

  describe('All Error Codes', () => {
    const errorCodes = [
      { code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment not found' },
      { code: 'UNAUTHORIZED_ASSESSMENT', message: 'User not authorized' },
      { code: 'ASSESSMENT_NOT_EXPORTED', message: 'Assessment not exported' },
      { code: 'PARSE_FAILED', message: 'Failed to parse document' },
      { code: 'PARSE_CONFIDENCE_TOO_LOW', message: 'Parse confidence too low' },
      { code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
    ]

    errorCodes.forEach(({ code, message }) => {
      it(`should emit correct error code: ${code}`, async () => {
        const capture = createEventCapture()

        const mockScoringService: IScoringService = {
          score: async (): Promise<ScoringOutput> => ({
            success: false,
            batchId: randomUUID(),
            error: message,
            code: code as ScoringOutput['code'],
          }),
          abort: jest.fn(),
          getResultForConversation: async () => null,
        }

        await runScoringHarness(
          capture.emit,
          testSocketRoom,
          testConversationId,
          testAssessmentId,
          testFileId,
          testUserId,
          mockScoringService
        )

        const errorEvent = capture.events.find(e => e.event === 'scoring_error')
        expect(errorEvent).toBeDefined()
        expect((errorEvent?.payload as Record<string, unknown>).code).toBe(code)
        expect((errorEvent?.payload as Record<string, unknown>).error).toBe(message)
      })
    })
  })
})
