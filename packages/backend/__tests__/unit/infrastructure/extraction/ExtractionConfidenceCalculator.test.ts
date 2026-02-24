/**
 * Unit tests for ExtractionConfidenceCalculator
 *
 * Epic 39, Story 39.1.2: Composite confidence scoring for regex extraction.
 * Validates all 5 checks (assessmentId, duplicates, responseFillRate, countRatio, dbKeyMapping).
 */

import type { IQuestionRepository } from '../../../../src/application/interfaces/IQuestionRepository'
import type { Question } from '../../../../src/domain/entities/Question'
import {
  ExtractionConfidenceCalculator,
  type RegexExtractionResult,
} from '../../../../src/infrastructure/extraction/ExtractionConfidenceCalculator'

// ---------- Helpers ----------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const EXPECTED_UUID = '550e8400-e29b-41d4-a716-446655440000'
const DIFFERENT_UUID = '660e8400-e29b-41d4-a716-446655440099'

function makeQuestion(
  sectionNumber: number,
  questionNumber: number,
): Question {
  return {
    id: `q-${sectionNumber}-${questionNumber}`,
    assessmentId: EXPECTED_UUID,
    sectionName: `Section ${sectionNumber}`,
    sectionNumber,
    questionNumber,
    questionText: `Question ${sectionNumber}.${questionNumber} text here?`,
    questionType: 'text' as const,
    createdAt: new Date(),
  } as Question
}

function makeResponse(
  sectionNumber: number,
  questionNumber: number,
): RegexExtractionResult['responses'][number] {
  return {
    sectionNumber,
    questionNumber,
    questionText: `Q ${sectionNumber}.${questionNumber}`,
    responseText: `Answer for ${sectionNumber}.${questionNumber}`,
    confidence: 0.95,
    hasVisualContent: false,
  }
}

function makeExtraction(
  overrides: Partial<RegexExtractionResult> = {},
): RegexExtractionResult {
  return {
    assessmentId: VALID_UUID,
    vendorName: 'TestVendor',
    responses: [
      makeResponse(1, 1),
      makeResponse(1, 2),
      makeResponse(2, 1),
    ],
    parseTimeMs: 42,
    ...overrides,
  }
}

// ---------- Mock ----------

function createMockQuestionRepo(
  questions: Question[] = [],
): IQuestionRepository {
  return {
    bulkCreate: jest.fn(),
    findByAssessmentId: jest.fn().mockResolvedValue(questions),
    findById: jest.fn(),
    deleteByAssessmentId: jest.fn(),
    replaceAllForAssessment: jest.fn(),
  }
}

// ---------- Tests ----------

describe('ExtractionConfidenceCalculator', () => {
  const dbQuestions = [
    makeQuestion(1, 1),
    makeQuestion(1, 2),
    makeQuestion(2, 1),
  ]

  describe('all checks pass', () => {
    it('should return confident: true when all 5 checks pass', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction()
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(true)
      expect(result.checks).toHaveLength(5)
      expect(result.checks.every((c) => c.passed)).toBe(true)
    })

    it('should return overallScore near 1.0 when all checks pass', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction()
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.overallScore).toBe(1.0)
    })
  })

  describe('Check 1: assessmentId', () => {
    it('should fail when assessmentId is null', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ assessmentId: null })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'assessmentId')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0)
      expect(check.detail).toContain('No assessment ID')
    })

    it('should fail when assessmentId is not a valid UUID', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ assessmentId: 'not-a-uuid' })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'assessmentId')!
      expect(check.passed).toBe(false)
      expect(check.detail).toContain('Invalid UUID')
    })

    it('should fail when assessmentId does not match expected', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ assessmentId: DIFFERENT_UUID })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'assessmentId')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0)
      expect(check.detail).toContain('mismatch')
    })

    it('should pass when no expectedAssessmentId is provided and extracted ID is valid UUID', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction()
      const result = await calc.evaluate(extraction)

      const check = result.checks.find((c) => c.name === 'assessmentId')!
      expect(check.passed).toBe(true)
      expect(check.score).toBe(1)
      // Verify extracted ID was used for DB fallback lookup
      expect(repo.findByAssessmentId).toHaveBeenCalledWith(VALID_UUID)
    })
  })

  describe('Check 2: duplicates', () => {
    it('should fail when duplicate question markers are detected', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        responses: [
          makeResponse(1, 1),
          makeResponse(1, 1), // duplicate
          makeResponse(2, 1),
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'duplicates')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0)
      expect(check.detail).toContain('1 duplicate')
    })

    it('should pass when no duplicates exist', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction()
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'duplicates')!
      expect(check.passed).toBe(true)
      expect(check.score).toBe(1)
    })
  })

  describe('Check 3: responseFillRate', () => {
    it('should pass when all responses have text', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction() // default responses all have text
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'responseFillRate')!
      expect(check.passed).toBe(true)
      expect(check.score).toBe(1)
      expect(check.detail).toContain('3/3 responses filled')
    })

    it('should fail when 50% of responses are empty (no visual content)', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        responses: [
          makeResponse(1, 1),
          { ...makeResponse(1, 2), responseText: '' },
          { ...makeResponse(2, 1), responseText: '   ' },
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'responseFillRate')!
      expect(check.passed).toBe(false)
      expect(check.score).toBeCloseTo(1 / 3)
      expect(check.detail).toContain('1/3 responses filled')
    })

    it('should count empty responses with hasVisualContent as filled', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        responses: [
          makeResponse(1, 1),
          { ...makeResponse(1, 2), responseText: '', hasVisualContent: true },
          { ...makeResponse(2, 1), responseText: '', hasVisualContent: true },
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'responseFillRate')!
      expect(check.passed).toBe(true)
      expect(check.score).toBe(1)
      expect(check.detail).toContain('3/3 responses filled')
    })

    it('should fail when 0 responses are provided', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ responses: [] })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'responseFillRate')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0)
      expect(check.detail).toContain('No responses to check fill rate')
    })
  })

  describe('Check 4: countRatio', () => {
    it('should fail when count ratio is below 0.9', async () => {
      // 5 DB questions but only 3 parsed -> ratio = 0.6
      const fiveQuestions = [
        makeQuestion(1, 1),
        makeQuestion(1, 2),
        makeQuestion(2, 1),
        makeQuestion(2, 2),
        makeQuestion(3, 1),
      ]
      const repo = createMockQuestionRepo(fiveQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        responses: [
          makeResponse(1, 1),
          makeResponse(1, 2),
          makeResponse(2, 1),
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'countRatio')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0.6)
      expect(check.detail).toContain('below 0.9')
    })

    it('should use extracted assessmentId for DB lookup when no expectedAssessmentId', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction() // has VALID_UUID as assessmentId
      // No expectedAssessmentId -> falls back to extraction.assessmentId for DB lookup
      const result = await calc.evaluate(extraction)

      // Should have used extraction.assessmentId for DB lookup
      expect(repo.findByAssessmentId).toHaveBeenCalledWith(VALID_UUID)
      const check = result.checks.find((c) => c.name === 'countRatio')!
      expect(check.passed).toBe(true) // 3 parsed / 3 expected = 1.0
    })

    it('should fail when no expectedAssessmentId and invalid extracted ID', async () => {
      const repo = createMockQuestionRepo([])
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ assessmentId: 'not-a-uuid' })
      const result = await calc.evaluate(extraction)

      const check = result.checks.find((c) => c.name === 'countRatio')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0)
      expect(check.detail).toContain('No expected questions')
    })

    it('should pass when ratio is exactly 0.9', async () => {
      // 10 DB questions, 9 parsed -> ratio = 0.9
      const tenQuestions = Array.from({ length: 10 }, (_, i) =>
        makeQuestion(1, i + 1),
      )
      const repo = createMockQuestionRepo(tenQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const nineResponses = Array.from({ length: 9 }, (_, i) =>
        makeResponse(1, i + 1),
      )
      const extraction = makeExtraction({ responses: nineResponses })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'countRatio')!
      expect(check.passed).toBe(true)
      expect(check.score).toBe(0.9)
    })

    it('should cap score at 1.0 when parsed count exceeds expected', async () => {
      const repo = createMockQuestionRepo(dbQuestions) // 3 questions
      const calc = new ExtractionConfidenceCalculator(repo)

      // 4 responses for 3 DB questions -> ratio = 1.33, capped at 1.0
      const extraction = makeExtraction({
        responses: [
          makeResponse(1, 1),
          makeResponse(1, 2),
          makeResponse(2, 1),
          makeResponse(3, 1),
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'countRatio')!
      expect(check.score).toBeLessThanOrEqual(1.0)
    })
  })

  describe('Check 5: dbKeyMapping', () => {
    it('should fail when extracted key is not in DB', async () => {
      const repo = createMockQuestionRepo(dbQuestions) // 1.1, 1.2, 2.1
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        responses: [
          makeResponse(1, 1),
          makeResponse(1, 2),
          makeResponse(9, 9), // not in DB
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'dbKeyMapping')!
      expect(check.passed).toBe(false)
      expect(check.score).toBeCloseTo(2 / 3)
      expect(check.detail).toContain('9.9')
    })

    it('should fail when responses array is empty', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ responses: [] })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const check = result.checks.find((c) => c.name === 'dbKeyMapping')!
      expect(check.passed).toBe(false)
      expect(check.score).toBe(0)
      expect(check.detail).toContain('No responses')
    })

    it('should pass when all extracted keys exist in DB', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction()
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'dbKeyMapping')!
      expect(check.passed).toBe(true)
      expect(check.score).toBe(1)
    })
  })

  describe('empty responses array', () => {
    it('should return confident: false when responses are empty', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ responses: [] })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)
      // countRatio and dbKeyMapping both fail
      const countCheck = result.checks.find((c) => c.name === 'countRatio')!
      expect(countCheck.passed).toBe(false)
    })
  })

  describe('partial failures produce meaningful detail messages', () => {
    it('should include specific detail for each failed check', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        assessmentId: null,
        responses: [
          makeResponse(1, 1),
          makeResponse(1, 1), // duplicate
        ],
      })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      expect(result.confident).toBe(false)

      const idCheck = result.checks.find((c) => c.name === 'assessmentId')!
      expect(idCheck.detail).toBe('No assessment ID extracted')

      const dupeCheck = result.checks.find((c) => c.name === 'duplicates')!
      expect(dupeCheck.detail).toContain('duplicate')

      // overallScore should reflect partial scores
      expect(result.overallScore).toBeGreaterThan(0)
      expect(result.overallScore).toBeLessThan(1)
    })

    it('should report multiple unmatched keys (truncated to 5)', async () => {
      const repo = createMockQuestionRepo([]) // no DB questions
      const calc = new ExtractionConfidenceCalculator(repo)

      const manyBadResponses = Array.from({ length: 7 }, (_, i) =>
        makeResponse(99, i + 1),
      )
      const extraction = makeExtraction({ responses: manyBadResponses })
      const result = await calc.evaluate(extraction, EXPECTED_UUID)

      const check = result.checks.find((c) => c.name === 'dbKeyMapping')!
      expect(check.passed).toBe(false)
      // Should show at most 5 unmatched keys
      const commaCount = (check.detail.match(/99\.\d/g) || []).length
      expect(commaCount).toBeLessThanOrEqual(5)
    })
  })

  describe('security: DB query uses expectedAssessmentId', () => {
    it('should query DB with expectedAssessmentId, NOT extraction.assessmentId', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({
        assessmentId: DIFFERENT_UUID, // malicious ID
      })
      await calc.evaluate(extraction, EXPECTED_UUID)

      // The repo should have been called with the expected (authorized) ID
      expect(repo.findByAssessmentId).toHaveBeenCalledWith(EXPECTED_UUID)
      expect(repo.findByAssessmentId).not.toHaveBeenCalledWith(DIFFERENT_UUID)
    })

    it('should fall back to extracted assessmentId when no expectedAssessmentId', async () => {
      const repo = createMockQuestionRepo(dbQuestions)
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction() // has VALID_UUID
      await calc.evaluate(extraction) // no expectedAssessmentId

      // Falls back to extraction.assessmentId for read-only DB lookup
      expect(repo.findByAssessmentId).toHaveBeenCalledWith(VALID_UUID)
    })

    it('should not call DB when no expectedAssessmentId and extracted ID is invalid', async () => {
      const repo = createMockQuestionRepo([])
      const calc = new ExtractionConfidenceCalculator(repo)

      const extraction = makeExtraction({ assessmentId: 'not-a-uuid' })
      await calc.evaluate(extraction)

      expect(repo.findByAssessmentId).not.toHaveBeenCalled()
    })
  })
})
