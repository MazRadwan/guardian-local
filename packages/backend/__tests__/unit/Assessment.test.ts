/**
 * Unit tests for Assessment entity and value objects
 */

import { Assessment } from '../../src/domain/entities/Assessment'
import { AssessmentType } from '../../src/domain/value-objects/AssessmentType'
import { AssessmentStatus } from '../../src/domain/value-objects/AssessmentStatus'

describe('Assessment Entity', () => {
  const validAssessmentData = {
    vendorId: 'vendor-123',
    assessmentType: 'comprehensive' as const,
    solutionName: 'NLHS PMO Tool',
    solutionType: 'AI tool',
    createdBy: 'user-123',
  }

  describe('create()', () => {
    it('should create assessment with valid data', () => {
      const assessment = Assessment.create(validAssessmentData)

      expect(assessment.vendorId).toBe('vendor-123')
      expect(assessment.assessmentType).toBe('comprehensive')
      expect(assessment.solutionName).toBe('NLHS PMO Tool')
      expect(assessment.solutionType).toBe('AI tool')
      expect(assessment.status).toBe('draft')
      expect(assessment.createdBy).toBe('user-123')
      expect(assessment.id).toBeDefined()
      expect(assessment.createdAt).toBeInstanceOf(Date)
      expect(assessment.updatedAt).toBeInstanceOf(Date)
    })

    it('should create assessment with minimal data', () => {
      const assessment = Assessment.create({
        vendorId: 'vendor-123',
        assessmentType: 'quick',
        createdBy: 'user-123',
      })

      expect(assessment.vendorId).toBe('vendor-123')
      expect(assessment.assessmentType).toBe('quick')
      expect(assessment.solutionName).toBeNull()
      expect(assessment.solutionType).toBeNull()
      expect(assessment.assessmentMetadata).toBeNull()
      expect(assessment.status).toBe('draft')
    })

    it('should throw error when vendorId is missing', () => {
      expect(() => {
        Assessment.create({
          ...validAssessmentData,
          vendorId: '',
        })
      }).toThrow('Vendor ID is required')
    })

    it('should throw error when createdBy is missing', () => {
      expect(() => {
        Assessment.create({
          ...validAssessmentData,
          createdBy: '',
        })
      }).toThrow('Created by user ID is required')
    })

    it('should throw error for invalid assessment type', () => {
      expect(() => {
        Assessment.create({
          ...validAssessmentData,
          assessmentType: 'invalid' as any,
        })
      }).toThrow('Invalid assessment type')
    })

    it('should start with draft status', () => {
      const assessment = Assessment.create(validAssessmentData)
      expect(assessment.status).toBe('draft')
    })
  })

  describe('updateStatus()', () => {
    it('should allow valid status transitions', () => {
      const assessment = Assessment.create(validAssessmentData)

      // draft -> questions_generated
      assessment.updateStatus('questions_generated')
      expect(assessment.status).toBe('questions_generated')

      // questions_generated -> exported
      assessment.updateStatus('exported')
      expect(assessment.status).toBe('exported')
    })

    it('should throw error for invalid transitions', () => {
      const assessment = Assessment.create(validAssessmentData)

      expect(() => {
        // Cannot go directly from draft to exported
        assessment.updateStatus('exported')
      }).toThrow('Invalid status transition')
    })

    it('should prevent transitions from cancelled status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.updateStatus('cancelled')

      expect(() => {
        assessment.updateStatus('draft')
      }).toThrow('Invalid status transition')
    })
  })

  describe('markQuestionsGenerated()', () => {
    it('should transition from draft to questions_generated', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.markQuestionsGenerated()

      expect(assessment.status).toBe('questions_generated')
    })

    it('should throw error if not in draft status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.markQuestionsGenerated()

      expect(() => {
        assessment.markQuestionsGenerated()
      }).toThrow('Invalid status transition')
    })
  })

  describe('markExported()', () => {
    it('should transition from questions_generated to exported', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.markQuestionsGenerated()
      assessment.markExported()

      expect(assessment.status).toBe('exported')
    })

    it('should throw error if questions not generated', () => {
      const assessment = Assessment.create(validAssessmentData)

      expect(() => {
        assessment.markExported()
      }).toThrow('Invalid status transition')
    })
  })

  describe('cancel()', () => {
    it('should cancel from draft status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.cancel()

      expect(assessment.status).toBe('cancelled')
    })

    it('should cancel from questions_generated status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.markQuestionsGenerated()
      assessment.cancel()

      expect(assessment.status).toBe('cancelled')
    })

    it('should cancel from exported status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.markQuestionsGenerated()
      assessment.markExported()
      assessment.cancel()

      expect(assessment.status).toBe('cancelled')
    })
  })

  describe('canGenerateQuestions()', () => {
    it('should return true for draft status', () => {
      const assessment = Assessment.create(validAssessmentData)
      expect(assessment.canGenerateQuestions()).toBe(true)
    })

    it('should return false for questions_generated status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.markQuestionsGenerated()
      expect(assessment.canGenerateQuestions()).toBe(false)
    })

    it('should return false for cancelled status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.cancel()
      expect(assessment.canGenerateQuestions()).toBe(false)
    })
  })

  describe('canBeModified()', () => {
    it('should return true for draft status', () => {
      const assessment = Assessment.create(validAssessmentData)
      expect(assessment.canBeModified()).toBe(true)
    })

    it('should return false for cancelled status', () => {
      const assessment = Assessment.create(validAssessmentData)
      assessment.cancel()
      expect(assessment.canBeModified()).toBe(false)
    })
  })

  describe('updateMetadata()', () => {
    it('should update assessment metadata', () => {
      const assessment = Assessment.create(validAssessmentData)

      assessment.updateMetadata({
        assessorName: 'John Doe',
        stakeholders: ['Alice', 'Bob'],
        notes: 'High priority assessment',
      })

      expect(assessment.assessmentMetadata).toEqual({
        assessorName: 'John Doe',
        stakeholders: ['Alice', 'Bob'],
        notes: 'High priority assessment',
      })
    })
  })

  describe('fromPersistence() and toPersistence()', () => {
    it('should convert to and from persistence format', () => {
      const original = Assessment.create(validAssessmentData)

      const persistence = original.toPersistence()
      const reconstituted = Assessment.fromPersistence(persistence)

      expect(reconstituted.id).toBe(original.id)
      expect(reconstituted.vendorId).toBe(original.vendorId)
      expect(reconstituted.assessmentType).toBe(original.assessmentType)
      expect(reconstituted.solutionName).toBe(original.solutionName)
      expect(reconstituted.solutionType).toBe(original.solutionType)
      expect(reconstituted.status).toBe(original.status)
      expect(reconstituted.createdBy).toBe(original.createdBy)
    })
  })
})

describe('AssessmentType Value Object', () => {
  it('should create valid assessment types', () => {
    expect(AssessmentType.create('quick').getValue()).toBe('quick')
    expect(AssessmentType.create('comprehensive').getValue()).toBe(
      'comprehensive'
    )
    expect(AssessmentType.create('renewal').getValue()).toBe('renewal')
  })

  it('should throw error for invalid type', () => {
    expect(() => AssessmentType.create('invalid')).toThrow(
      'Invalid assessment type'
    )
  })

  it('should provide static factory methods', () => {
    expect(AssessmentType.quick().isQuick()).toBe(true)
    expect(AssessmentType.comprehensive().isComprehensive()).toBe(true)
    expect(AssessmentType.renewal().isRenewal()).toBe(true)
  })

  it('should check type correctly', () => {
    const quickType = AssessmentType.quick()
    expect(quickType.isQuick()).toBe(true)
    expect(quickType.isComprehensive()).toBe(false)
  })

  it('should check equality', () => {
    const type1 = AssessmentType.quick()
    const type2 = AssessmentType.quick()
    const type3 = AssessmentType.comprehensive()

    expect(type1.equals(type2)).toBe(true)
    expect(type1.equals(type3)).toBe(false)
  })
})

describe('AssessmentStatus Value Object', () => {
  it('should create valid statuses', () => {
    expect(AssessmentStatus.create('draft').getValue()).toBe('draft')
    expect(AssessmentStatus.create('questions_generated').getValue()).toBe(
      'questions_generated'
    )
    expect(AssessmentStatus.create('exported').getValue()).toBe('exported')
    expect(AssessmentStatus.create('cancelled').getValue()).toBe('cancelled')
  })

  it('should throw error for invalid status', () => {
    expect(() => AssessmentStatus.create('invalid')).toThrow(
      'Invalid assessment status'
    )
  })

  it('should validate allowed transitions', () => {
    const draft = AssessmentStatus.draft()
    const questionsGenerated = AssessmentStatus.questionsGenerated()
    const exported = AssessmentStatus.exported()
    const cancelled = AssessmentStatus.cancelled()

    // Valid transitions
    expect(draft.canTransitionTo(questionsGenerated)).toBe(true)
    expect(draft.canTransitionTo(cancelled)).toBe(true)
    expect(questionsGenerated.canTransitionTo(exported)).toBe(true)
    expect(questionsGenerated.canTransitionTo(cancelled)).toBe(true)
    expect(exported.canTransitionTo(cancelled)).toBe(true)

    // Invalid transitions
    expect(draft.canTransitionTo(exported)).toBe(false)
    expect(cancelled.canTransitionTo(draft)).toBe(false)
  })

  it('should throw error on invalid transition validation', () => {
    const draft = AssessmentStatus.draft()
    const exported = AssessmentStatus.exported()

    expect(() => {
      draft.validateTransition(exported)
    }).toThrow('Invalid status transition')
  })

  it('should identify terminal status', () => {
    expect(AssessmentStatus.cancelled().isTerminal()).toBe(true)
    expect(AssessmentStatus.draft().isTerminal()).toBe(false)
  })

  it('should provide static factory methods', () => {
    expect(AssessmentStatus.draft().isDraft()).toBe(true)
    expect(AssessmentStatus.questionsGenerated().isQuestionsGenerated()).toBe(
      true
    )
    expect(AssessmentStatus.exported().isExported()).toBe(true)
    expect(AssessmentStatus.cancelled().isCancelled()).toBe(true)
  })
})
