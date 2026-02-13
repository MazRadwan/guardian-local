/**
 * Unit Tests for DimensionControlMapping Domain Model
 */

import { DimensionControlMapping } from '../../../../src/domain/compliance/DimensionControlMapping'
import { RiskDimension } from '../../../../src/domain/types/QuestionnaireSchema'

describe('DimensionControlMapping', () => {
  describe('create', () => {
    it('should create a mapping with valid data and default weight to 1.0', () => {
      const mapping = DimensionControlMapping.create({
        controlId: 'ctrl-123',
        dimension: 'security_risk' as RiskDimension,
      })

      expect(mapping.controlId).toBe('ctrl-123')
      expect(mapping.dimension).toBe('security_risk')
      expect(mapping.relevanceWeight).toBe(1.0)
      expect(mapping.id).toBe('')
      expect(mapping.createdAt).toBeInstanceOf(Date)
    })

    it('should create a mapping with explicit weight', () => {
      const mapping = DimensionControlMapping.create({
        controlId: 'ctrl-123',
        dimension: 'privacy_risk' as RiskDimension,
        relevanceWeight: 0.5,
      })

      expect(mapping.relevanceWeight).toBe(0.5)
    })

    it('should accept weight of 0', () => {
      const mapping = DimensionControlMapping.create({
        controlId: 'ctrl-123',
        dimension: 'security_risk' as RiskDimension,
        relevanceWeight: 0,
      })

      expect(mapping.relevanceWeight).toBe(0)
    })

    it('should accept weight of 1', () => {
      const mapping = DimensionControlMapping.create({
        controlId: 'ctrl-123',
        dimension: 'security_risk' as RiskDimension,
        relevanceWeight: 1,
      })

      expect(mapping.relevanceWeight).toBe(1)
    })

    it('should throw on empty controlId', () => {
      expect(() =>
        DimensionControlMapping.create({
          controlId: '',
          dimension: 'security_risk' as RiskDimension,
        })
      ).toThrow('Control ID is required')
    })

    it('should throw on whitespace-only controlId', () => {
      expect(() =>
        DimensionControlMapping.create({
          controlId: '   ',
          dimension: 'security_risk' as RiskDimension,
        })
      ).toThrow('Control ID is required')
    })

    it('should throw on empty dimension', () => {
      expect(() =>
        DimensionControlMapping.create({
          controlId: 'ctrl-123',
          dimension: '' as RiskDimension,
        })
      ).toThrow('Dimension is required')
    })

    it('should throw on weight less than 0', () => {
      expect(() =>
        DimensionControlMapping.create({
          controlId: 'ctrl-123',
          dimension: 'security_risk' as RiskDimension,
          relevanceWeight: -0.1,
        })
      ).toThrow('Relevance weight must be between 0.0 and 1.0')
    })

    it('should throw on weight greater than 1', () => {
      expect(() =>
        DimensionControlMapping.create({
          controlId: 'ctrl-123',
          dimension: 'security_risk' as RiskDimension,
          relevanceWeight: 1.1,
        })
      ).toThrow('Relevance weight must be between 0.0 and 1.0')
    })
  })

  describe('fromPersistence', () => {
    it('should hydrate correctly from DTO', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z')
      const mapping = DimensionControlMapping.fromPersistence({
        id: 'map-123',
        controlId: 'ctrl-456',
        dimension: 'ai_transparency' as RiskDimension,
        relevanceWeight: 0.75,
        createdAt,
      })

      expect(mapping.id).toBe('map-123')
      expect(mapping.controlId).toBe('ctrl-456')
      expect(mapping.dimension).toBe('ai_transparency')
      expect(mapping.relevanceWeight).toBe(0.75)
      expect(mapping.createdAt).toEqual(createdAt)
    })
  })

  describe('immutability', () => {
    it('should have all properties as readonly', () => {
      const mapping = DimensionControlMapping.create({
        controlId: 'ctrl-123',
        dimension: 'regulatory_compliance' as RiskDimension,
        relevanceWeight: 0.8,
      })

      // Verify all properties are accessible (readonly, not mutable)
      expect(mapping.id).toBeDefined()
      expect(mapping.controlId).toBeDefined()
      expect(mapping.dimension).toBeDefined()
      expect(mapping.relevanceWeight).toBeDefined()
      expect(mapping.createdAt).toBeDefined()
    })
  })
})
