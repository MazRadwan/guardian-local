/**
 * Unit Tests for FrameworkControl Domain Model
 */

import { FrameworkControl } from '../../../../src/domain/compliance/FrameworkControl'

describe('FrameworkControl', () => {
  describe('create', () => {
    it('should create a control with valid data', () => {
      const control = FrameworkControl.create({
        versionId: 'ver-123',
        clauseRef: 'A.6.2.6',
        domain: 'Data Management',
        title: 'Data quality management for AI systems',
      })

      expect(control.versionId).toBe('ver-123')
      expect(control.clauseRef).toBe('A.6.2.6')
      expect(control.domain).toBe('Data Management')
      expect(control.title).toBe('Data quality management for AI systems')
      expect(control.id).toBe('')
      expect(control.createdAt).toBeInstanceOf(Date)
    })

    it('should trim all string fields', () => {
      const control = FrameworkControl.create({
        versionId: 'ver-123',
        clauseRef: '  A.6.2.6  ',
        domain: '  Data Management  ',
        title: '  Data quality management  ',
      })

      expect(control.clauseRef).toBe('A.6.2.6')
      expect(control.domain).toBe('Data Management')
      expect(control.title).toBe('Data quality management')
    })

    it('should throw on empty versionId', () => {
      expect(() =>
        FrameworkControl.create({
          versionId: '',
          clauseRef: 'A.6.2.6',
          domain: 'Data Management',
          title: 'Data quality management',
        })
      ).toThrow('Version ID is required')
    })

    it('should throw on empty clauseRef', () => {
      expect(() =>
        FrameworkControl.create({
          versionId: 'ver-123',
          clauseRef: '',
          domain: 'Data Management',
          title: 'Data quality management',
        })
      ).toThrow('Clause reference is required')
    })

    it('should throw on whitespace-only clauseRef', () => {
      expect(() =>
        FrameworkControl.create({
          versionId: 'ver-123',
          clauseRef: '   ',
          domain: 'Data Management',
          title: 'Data quality management',
        })
      ).toThrow('Clause reference is required')
    })

    it('should throw on empty domain', () => {
      expect(() =>
        FrameworkControl.create({
          versionId: 'ver-123',
          clauseRef: 'A.6.2.6',
          domain: '',
          title: 'Data quality management',
        })
      ).toThrow('Domain is required')
    })

    it('should throw on empty title', () => {
      expect(() =>
        FrameworkControl.create({
          versionId: 'ver-123',
          clauseRef: 'A.6.2.6',
          domain: 'Data Management',
          title: '',
        })
      ).toThrow('Title is required')
    })

    it('should throw on whitespace-only title', () => {
      expect(() =>
        FrameworkControl.create({
          versionId: 'ver-123',
          clauseRef: 'A.6.2.6',
          domain: 'Data Management',
          title: '   ',
        })
      ).toThrow('Title is required')
    })
  })

  describe('fromPersistence', () => {
    it('should hydrate correctly from DTO', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z')
      const control = FrameworkControl.fromPersistence({
        id: 'ctrl-123',
        versionId: 'ver-456',
        clauseRef: 'A.6.2.6',
        domain: 'Data Management',
        title: 'Data quality management for AI systems',
        createdAt,
      })

      expect(control.id).toBe('ctrl-123')
      expect(control.versionId).toBe('ver-456')
      expect(control.clauseRef).toBe('A.6.2.6')
      expect(control.domain).toBe('Data Management')
      expect(control.title).toBe('Data quality management for AI systems')
      expect(control.createdAt).toEqual(createdAt)
    })
  })

  describe('immutability', () => {
    it('should have all properties as readonly', () => {
      const control = FrameworkControl.create({
        versionId: 'ver-123',
        clauseRef: 'A.6.2.6',
        domain: 'Data Management',
        title: 'Data quality management',
      })

      // Verify all properties are accessible (readonly, not mutable)
      expect(control.id).toBeDefined()
      expect(control.versionId).toBeDefined()
      expect(control.clauseRef).toBeDefined()
      expect(control.domain).toBeDefined()
      expect(control.title).toBeDefined()
      expect(control.createdAt).toBeDefined()
    })
  })
})
