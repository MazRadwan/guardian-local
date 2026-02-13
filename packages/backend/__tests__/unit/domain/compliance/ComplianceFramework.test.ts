/**
 * Unit Tests for ComplianceFramework Domain Entity
 */

import { ComplianceFramework } from '../../../../src/domain/compliance/ComplianceFramework'

describe('ComplianceFramework', () => {
  describe('create', () => {
    it('should create a framework with valid data', () => {
      const framework = ComplianceFramework.create({
        name: 'ISO/IEC 42001',
        description: 'AI Management System',
      })

      expect(framework.name).toBe('ISO/IEC 42001')
      expect(framework.description).toBe('AI Management System')
      expect(framework.id).toBe('')
      expect(framework.createdAt).toBeInstanceOf(Date)
    })

    it('should create a framework without description', () => {
      const framework = ComplianceFramework.create({
        name: 'ISO/IEC 42001',
      })

      expect(framework.name).toBe('ISO/IEC 42001')
      expect(framework.description).toBeNull()
    })

    it('should trim the name', () => {
      const framework = ComplianceFramework.create({
        name: '  ISO/IEC 42001  ',
      })

      expect(framework.name).toBe('ISO/IEC 42001')
    })

    it('should trim the description', () => {
      const framework = ComplianceFramework.create({
        name: 'ISO/IEC 42001',
        description: '  AI Management System  ',
      })

      expect(framework.description).toBe('AI Management System')
    })

    it('should throw on empty name', () => {
      expect(() =>
        ComplianceFramework.create({ name: '' })
      ).toThrow('Framework name is required')
    })

    it('should throw on whitespace-only name', () => {
      expect(() =>
        ComplianceFramework.create({ name: '   ' })
      ).toThrow('Framework name is required')
    })
  })

  describe('fromPersistence', () => {
    it('should hydrate correctly from DTO', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z')
      const framework = ComplianceFramework.fromPersistence({
        id: 'fw-123',
        name: 'ISO/IEC 42001',
        description: 'AI Management System',
        createdAt,
      })

      expect(framework.id).toBe('fw-123')
      expect(framework.name).toBe('ISO/IEC 42001')
      expect(framework.description).toBe('AI Management System')
      expect(framework.createdAt).toEqual(createdAt)
    })

    it('should handle missing description', () => {
      const framework = ComplianceFramework.fromPersistence({
        id: 'fw-456',
        name: 'ISO/IEC 23894',
        createdAt: new Date(),
      })

      expect(framework.description).toBeNull()
    })
  })
})
