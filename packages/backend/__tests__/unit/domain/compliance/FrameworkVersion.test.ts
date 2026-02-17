/**
 * Unit Tests for FrameworkVersion Domain Entity
 */

import { FrameworkVersion } from '../../../../src/domain/compliance/FrameworkVersion'

describe('FrameworkVersion', () => {
  describe('create', () => {
    it('should create a version with valid data and default status to active', () => {
      const version = FrameworkVersion.create({
        frameworkId: 'fw-123',
        versionLabel: '2023',
      })

      expect(version.frameworkId).toBe('fw-123')
      expect(version.versionLabel).toBe('2023')
      expect(version.status).toBe('active')
      expect(version.publishedAt).toBeNull()
      expect(version.id).toBe('')
      expect(version.createdAt).toBeInstanceOf(Date)
    })

    it('should create a version with explicit status', () => {
      const version = FrameworkVersion.create({
        frameworkId: 'fw-123',
        versionLabel: '2023',
        status: 'deprecated',
      })

      expect(version.status).toBe('deprecated')
    })

    it('should create a version with publishedAt', () => {
      const publishedAt = new Date('2023-12-15')
      const version = FrameworkVersion.create({
        frameworkId: 'fw-123',
        versionLabel: '2023',
        publishedAt,
      })

      expect(version.publishedAt).toEqual(publishedAt)
    })

    it('should trim the version label', () => {
      const version = FrameworkVersion.create({
        frameworkId: 'fw-123',
        versionLabel: '  2023  ',
      })

      expect(version.versionLabel).toBe('2023')
    })

    it('should throw on empty frameworkId', () => {
      expect(() =>
        FrameworkVersion.create({
          frameworkId: '',
          versionLabel: '2023',
        })
      ).toThrow('Framework ID is required')
    })

    it('should throw on whitespace-only frameworkId', () => {
      expect(() =>
        FrameworkVersion.create({
          frameworkId: '   ',
          versionLabel: '2023',
        })
      ).toThrow('Framework ID is required')
    })

    it('should throw on empty versionLabel', () => {
      expect(() =>
        FrameworkVersion.create({
          frameworkId: 'fw-123',
          versionLabel: '',
        })
      ).toThrow('Version label is required')
    })

    it('should throw on whitespace-only versionLabel', () => {
      expect(() =>
        FrameworkVersion.create({
          frameworkId: 'fw-123',
          versionLabel: '   ',
        })
      ).toThrow('Version label is required')
    })
  })

  describe('fromPersistence', () => {
    it('should hydrate correctly from DTO', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z')
      const publishedAt = new Date('2023-12-15T00:00:00Z')
      const version = FrameworkVersion.fromPersistence({
        id: 'ver-123',
        frameworkId: 'fw-456',
        versionLabel: '2023',
        status: 'active',
        publishedAt,
        createdAt,
      })

      expect(version.id).toBe('ver-123')
      expect(version.frameworkId).toBe('fw-456')
      expect(version.versionLabel).toBe('2023')
      expect(version.status).toBe('active')
      expect(version.publishedAt).toEqual(publishedAt)
      expect(version.createdAt).toEqual(createdAt)
    })

    it('should handle missing publishedAt', () => {
      const version = FrameworkVersion.fromPersistence({
        id: 'ver-789',
        frameworkId: 'fw-456',
        versionLabel: '2025',
        status: 'active',
        createdAt: new Date(),
      })

      expect(version.publishedAt).toBeNull()
    })
  })

  describe('deprecate', () => {
    it('should change status to deprecated', () => {
      const version = FrameworkVersion.create({
        frameworkId: 'fw-123',
        versionLabel: '2023',
      })

      expect(version.status).toBe('active')

      version.deprecate()

      expect(version.status).toBe('deprecated')
    })
  })
})
