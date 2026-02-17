/**
 * Unit Tests for InterpretiveCriteria Domain Model
 */

import { InterpretiveCriteria } from '../../../../src/domain/compliance/InterpretiveCriteria'

describe('InterpretiveCriteria', () => {
  const validData = {
    controlId: 'ctrl-123',
    criteriaVersion: '1.0',
    criteriaText: 'The vendor must demonstrate data quality processes.',
    assessmentGuidance: 'Look for documented data quality procedures.',
  }

  describe('create', () => {
    it('should create criteria with valid data and default to draft status', () => {
      const criteria = InterpretiveCriteria.create(validData)

      expect(criteria.controlId).toBe('ctrl-123')
      expect(criteria.criteriaVersion).toBe('1.0')
      expect(criteria.criteriaText).toBe('The vendor must demonstrate data quality processes.')
      expect(criteria.assessmentGuidance).toBe('Look for documented data quality procedures.')
      expect(criteria.reviewStatus).toBe('draft')
      expect(criteria.approvedAt).toBeNull()
      expect(criteria.approvedBy).toBeNull()
      expect(criteria.id).toBe('')
      expect(criteria.createdAt).toBeInstanceOf(Date)
    })

    it('should create criteria without assessmentGuidance', () => {
      const criteria = InterpretiveCriteria.create({
        controlId: 'ctrl-123',
        criteriaVersion: '1.0',
        criteriaText: 'The vendor must demonstrate data quality processes.',
      })

      expect(criteria.assessmentGuidance).toBeNull()
    })

    it('should trim string fields', () => {
      const criteria = InterpretiveCriteria.create({
        controlId: 'ctrl-123',
        criteriaVersion: '  1.0  ',
        criteriaText: '  The vendor must demonstrate data quality processes.  ',
        assessmentGuidance: '  Look for documented procedures.  ',
      })

      expect(criteria.criteriaVersion).toBe('1.0')
      expect(criteria.criteriaText).toBe('The vendor must demonstrate data quality processes.')
      expect(criteria.assessmentGuidance).toBe('Look for documented procedures.')
    })

    it('should throw on empty controlId', () => {
      expect(() =>
        InterpretiveCriteria.create({ ...validData, controlId: '' })
      ).toThrow('Control ID is required')
    })

    it('should throw on whitespace-only controlId', () => {
      expect(() =>
        InterpretiveCriteria.create({ ...validData, controlId: '   ' })
      ).toThrow('Control ID is required')
    })

    it('should throw on empty criteriaVersion', () => {
      expect(() =>
        InterpretiveCriteria.create({ ...validData, criteriaVersion: '' })
      ).toThrow('Criteria version is required')
    })

    it('should throw on whitespace-only criteriaVersion', () => {
      expect(() =>
        InterpretiveCriteria.create({ ...validData, criteriaVersion: '   ' })
      ).toThrow('Criteria version is required')
    })

    it('should throw on empty criteriaText', () => {
      expect(() =>
        InterpretiveCriteria.create({ ...validData, criteriaText: '' })
      ).toThrow('Criteria text is required')
    })

    it('should throw on whitespace-only criteriaText', () => {
      expect(() =>
        InterpretiveCriteria.create({ ...validData, criteriaText: '   ' })
      ).toThrow('Criteria text is required')
    })
  })

  describe('fromPersistence', () => {
    it('should hydrate correctly from DTO', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z')
      const approvedAt = new Date('2025-01-20T14:30:00Z')
      const criteria = InterpretiveCriteria.fromPersistence({
        id: 'ic-123',
        controlId: 'ctrl-456',
        criteriaVersion: '1.0',
        criteriaText: 'The vendor must demonstrate data quality processes.',
        assessmentGuidance: 'Look for documented procedures.',
        reviewStatus: 'approved',
        approvedAt,
        approvedBy: 'admin-user',
        createdAt,
      })

      expect(criteria.id).toBe('ic-123')
      expect(criteria.controlId).toBe('ctrl-456')
      expect(criteria.criteriaVersion).toBe('1.0')
      expect(criteria.criteriaText).toBe('The vendor must demonstrate data quality processes.')
      expect(criteria.assessmentGuidance).toBe('Look for documented procedures.')
      expect(criteria.reviewStatus).toBe('approved')
      expect(criteria.approvedAt).toEqual(approvedAt)
      expect(criteria.approvedBy).toBe('admin-user')
      expect(criteria.createdAt).toEqual(createdAt)
    })

    it('should handle missing optional fields', () => {
      const criteria = InterpretiveCriteria.fromPersistence({
        id: 'ic-789',
        controlId: 'ctrl-456',
        criteriaVersion: '1.0',
        criteriaText: 'The vendor must demonstrate data quality processes.',
        reviewStatus: 'draft',
        createdAt: new Date(),
      })

      expect(criteria.assessmentGuidance).toBeNull()
      expect(criteria.approvedAt).toBeNull()
      expect(criteria.approvedBy).toBeNull()
    })
  })

  describe('approve', () => {
    it('should set status to approved with approver and timestamp', () => {
      const criteria = InterpretiveCriteria.create(validData)

      expect(criteria.reviewStatus).toBe('draft')

      criteria.approve('admin-user')

      expect(criteria.reviewStatus).toBe('approved')
      expect(criteria.approvedBy).toBe('admin-user')
      expect(criteria.approvedAt).toBeInstanceOf(Date)
    })
  })

  describe('deprecate', () => {
    it('should set status to deprecated', () => {
      const criteria = InterpretiveCriteria.create(validData)

      expect(criteria.reviewStatus).toBe('draft')

      criteria.deprecate()

      expect(criteria.reviewStatus).toBe('deprecated')
    })

    it('should deprecate an approved criteria', () => {
      const criteria = InterpretiveCriteria.create(validData)
      criteria.approve('admin-user')

      expect(criteria.reviewStatus).toBe('approved')

      criteria.deprecate()

      expect(criteria.reviewStatus).toBe('deprecated')
    })
  })
})
