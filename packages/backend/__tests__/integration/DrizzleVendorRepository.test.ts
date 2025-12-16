/**
 * Integration tests for DrizzleVendorRepository
 */

import { db } from '../../src/infrastructure/database/client'
import { vendors } from '../../src/infrastructure/database/schema/vendors'
import { DrizzleVendorRepository } from '../../src/infrastructure/database/repositories/DrizzleVendorRepository'
import { Vendor } from '../../src/domain/entities/Vendor'

describe('DrizzleVendorRepository Integration Tests', () => {
  let repository: DrizzleVendorRepository

  beforeAll(() => {
    repository = new DrizzleVendorRepository()
  })

  afterEach(async () => {
    // Clean up test data after each test
    await db.delete(vendors)
  })

  describe('create()', () => {
    it('should save vendor to database', async () => {
      const vendor = Vendor.create({
        name: 'TechFlow Solutions',
        industry: 'Healthcare IT',
        website: 'https://techflow.com',
        contactInfo: {
          primaryContact: 'John Doe',
          email: 'john@techflow.com',
          phone: '555-0123',
        },
      })

      const created = await repository.create(vendor)

      expect(created.id).toBe(vendor.id)
      expect(created.name).toBe('TechFlow Solutions')
      expect(created.industry).toBe('Healthcare IT')
      expect(created.website).toBe('https://techflow.com')
      expect(created.contactInfo).toEqual({
        primaryContact: 'John Doe',
        email: 'john@techflow.com',
        phone: '555-0123',
      })
    })

    it('should persist JSONB contactInfo correctly', async () => {
      const vendor = Vendor.create({
        name: 'TestVendor',
        contactInfo: {
          primaryContact: 'Jane Smith',
          email: 'jane@example.com',
          phone: '555-9999',
        },
      })

      const created = await repository.create(vendor)
      const found = await repository.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.contactInfo).toEqual({
        primaryContact: 'Jane Smith',
        email: 'jane@example.com',
        phone: '555-9999',
      })
    })

    it('should save vendor with null optional fields', async () => {
      const vendor = Vendor.create({ name: 'MinimalVendor' })

      const created = await repository.create(vendor)

      expect(created.industry).toBeNull()
      expect(created.website).toBeNull()
      expect(created.contactInfo).toBeNull()
    })
  })

  describe('findById()', () => {
    it('should find vendor by ID', async () => {
      const vendor = Vendor.create({ name: 'FindByIdTest' })
      await repository.create(vendor)

      const found = await repository.findById(vendor.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(vendor.id)
      expect(found!.name).toBe('FindByIdTest')
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000')
      expect(found).toBeNull()
    })
  })

  describe('findByName()', () => {
    it('should find vendor by exact name', async () => {
      const vendor = Vendor.create({ name: 'UniqueVendor' })
      await repository.create(vendor)

      const found = await repository.findByName('UniqueVendor')

      expect(found).not.toBeNull()
      expect(found!.name).toBe('UniqueVendor')
    })

    it('should return null for non-existent name', async () => {
      const found = await repository.findByName('NonExistentVendor')
      expect(found).toBeNull()
    })

    it('should be case-sensitive for exact match', async () => {
      const vendor = Vendor.create({ name: 'CaseSensitive' })
      await repository.create(vendor)

      const found = await repository.findByName('casesensitive')
      expect(found).toBeNull()
    })
  })

  describe('update()', () => {
    it('should update vendor fields', async () => {
      const vendor = Vendor.create({
        name: 'OriginalName',
        industry: 'Tech',
      })
      await repository.create(vendor)

      vendor.update({
        name: 'UpdatedName',
        industry: 'Finance',
        website: 'https://updated.com',
      })

      const updated = await repository.update(vendor)

      expect(updated.name).toBe('UpdatedName')
      expect(updated.industry).toBe('Finance')
      expect(updated.website).toBe('https://updated.com')
    })

    it('should update contactInfo', async () => {
      const vendor = Vendor.create({
        name: 'ContactTest',
        contactInfo: { email: 'old@example.com' },
      })
      await repository.create(vendor)

      vendor.updateContactInfo({
        email: 'new@example.com',
        phone: '555-1234',
      })

      const updated = await repository.update(vendor)

      expect(updated.contactInfo).toEqual({
        email: 'new@example.com',
        phone: '555-1234',
      })
    })

    it('should update updatedAt timestamp', async () => {
      const vendor = Vendor.create({ name: 'TimestampTest' })
      const created = await repository.create(vendor)
      const originalUpdatedAt = created.updatedAt

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10))

      vendor.updateIndustry('New Industry')
      const updated = await repository.update(vendor)

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      )
    })
  })

  describe('delete()', () => {
    it('should delete vendor from database', async () => {
      const vendor = Vendor.create({ name: 'DeleteTest' })
      await repository.create(vendor)

      await repository.delete(vendor.id)

      const found = await repository.findById(vendor.id)
      expect(found).toBeNull()
    })

    it('should not throw error when deleting non-existent vendor', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000')
      ).resolves.not.toThrow()
    })
  })

  describe('list()', () => {
    it('should list all vendors', async () => {
      await repository.create(Vendor.create({ name: 'Vendor A' }))
      await repository.create(Vendor.create({ name: 'Vendor B' }))
      await repository.create(Vendor.create({ name: 'Vendor C' }))

      const vendors = await repository.list()

      expect(vendors).toHaveLength(3)
      expect(vendors.map((v) => v.name).sort()).toEqual([
        'Vendor A',
        'Vendor B',
        'Vendor C',
      ])
    })

    it('should order vendors by name', async () => {
      await repository.create(Vendor.create({ name: 'Zebra' }))
      await repository.create(Vendor.create({ name: 'Alpha' }))
      await repository.create(Vendor.create({ name: 'Beta' }))

      const vendors = await repository.list()

      expect(vendors[0].name).toBe('Alpha')
      expect(vendors[1].name).toBe('Beta')
      expect(vendors[2].name).toBe('Zebra')
    })

    it('should respect limit parameter', async () => {
      await repository.create(Vendor.create({ name: 'Vendor 1' }))
      await repository.create(Vendor.create({ name: 'Vendor 2' }))
      await repository.create(Vendor.create({ name: 'Vendor 3' }))

      const vendors = await repository.list(2)

      expect(vendors).toHaveLength(2)
    })

    it('should respect offset parameter', async () => {
      await repository.create(Vendor.create({ name: 'Vendor A' }))
      await repository.create(Vendor.create({ name: 'Vendor B' }))
      await repository.create(Vendor.create({ name: 'Vendor C' }))

      const vendors = await repository.list(2, 1)

      expect(vendors).toHaveLength(2)
      expect(vendors[0].name).toBe('Vendor B')
      expect(vendors[1].name).toBe('Vendor C')
    })
  })

  describe('searchByName()', () => {
    it('should find vendors with partial name match', async () => {
      await repository.create(Vendor.create({ name: 'TechFlow Solutions' }))
      await repository.create(Vendor.create({ name: 'TechCorp' }))
      await repository.create(Vendor.create({ name: 'Healthcare Inc' }))

      const results = await repository.searchByName('Tech')

      expect(results).toHaveLength(2)
      expect(results.some((v) => v.name === 'TechFlow Solutions')).toBe(true)
      expect(results.some((v) => v.name === 'TechCorp')).toBe(true)
    })

    it('should be case-insensitive', async () => {
      await repository.create(Vendor.create({ name: 'TechCorp' }))

      const results = await repository.searchByName('techcorp')

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('TechCorp')
    })

    it('should return empty array when no matches', async () => {
      await repository.create(Vendor.create({ name: 'TechCorp' }))

      const results = await repository.searchByName('Healthcare')

      expect(results).toHaveLength(0)
    })
  })
})
