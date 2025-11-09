/**
 * Unit tests for Vendor entity
 */

import { Vendor } from '../../src/domain/entities/Vendor'
import { VendorName } from '../../src/domain/value-objects/VendorName'

describe('Vendor Entity', () => {
  describe('create()', () => {
    it('should create a vendor with valid data', () => {
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

      expect(vendor.name).toBe('TechFlow Solutions')
      expect(vendor.industry).toBe('Healthcare IT')
      expect(vendor.website).toBe('https://techflow.com')
      expect(vendor.contactInfo).toEqual({
        primaryContact: 'John Doe',
        email: 'john@techflow.com',
        phone: '555-0123',
      })
      expect(vendor.id).toBeDefined()
      expect(vendor.createdAt).toBeInstanceOf(Date)
      expect(vendor.updatedAt).toBeInstanceOf(Date)
    })

    it('should create a vendor with minimal data (name only)', () => {
      const vendor = Vendor.create({
        name: 'MinimalCorp',
      })

      expect(vendor.name).toBe('MinimalCorp')
      expect(vendor.industry).toBeNull()
      expect(vendor.website).toBeNull()
      expect(vendor.contactInfo).toBeNull()
    })

    it('should throw error when name is empty', () => {
      expect(() => {
        Vendor.create({ name: '' })
      }).toThrow('Vendor name cannot be empty')
    })

    it('should throw error when name is only whitespace', () => {
      expect(() => {
        Vendor.create({ name: '   ' })
      }).toThrow('Vendor name cannot be empty')
    })

    it('should throw error when name exceeds 255 characters', () => {
      const longName = 'A'.repeat(256)
      expect(() => {
        Vendor.create({ name: longName })
      }).toThrow('Vendor name cannot exceed 255 characters')
    })

    it('should trim whitespace from vendor name', () => {
      const vendor = Vendor.create({ name: '  TechCorp  ' })
      expect(vendor.name).toBe('TechCorp')
    })
  })

  describe('updateName()', () => {
    it('should update vendor name', () => {
      const vendor = Vendor.create({ name: 'OldName' })
      const originalUpdatedAt = vendor.updatedAt

      // Wait a bit to ensure timestamps differ
      setTimeout(() => {
        vendor.updateName('NewName')
        expect(vendor.name).toBe('NewName')
        expect(vendor.updatedAt.getTime()).toBeGreaterThanOrEqual(
          originalUpdatedAt.getTime()
        )
      }, 10)
    })

    it('should throw error when updating with invalid name', () => {
      const vendor = Vendor.create({ name: 'ValidName' })
      expect(() => {
        vendor.updateName('')
      }).toThrow('Vendor name cannot be empty')
    })
  })

  describe('updateContactInfo()', () => {
    it('should update contact information', () => {
      const vendor = Vendor.create({ name: 'TestVendor' })

      vendor.updateContactInfo({
        primaryContact: 'Jane Smith',
        email: 'jane@test.com',
      })

      expect(vendor.contactInfo).toEqual({
        primaryContact: 'Jane Smith',
        email: 'jane@test.com',
      })
    })

    it('should allow setting contact info to null', () => {
      const vendor = Vendor.create({
        name: 'TestVendor',
        contactInfo: { email: 'test@example.com' },
      })

      vendor.updateContactInfo(null)
      expect(vendor.contactInfo).toBeNull()
    })
  })

  describe('update()', () => {
    it('should update multiple fields at once', () => {
      const vendor = Vendor.create({ name: 'OldVendor' })

      vendor.update({
        name: 'NewVendor',
        industry: 'Tech',
        website: 'https://newvendor.com',
      })

      expect(vendor.name).toBe('NewVendor')
      expect(vendor.industry).toBe('Tech')
      expect(vendor.website).toBe('https://newvendor.com')
    })

    it('should only update provided fields', () => {
      const vendor = Vendor.create({
        name: 'TestVendor',
        industry: 'Healthcare',
        website: 'https://test.com',
      })

      vendor.update({ industry: 'Finance' })

      expect(vendor.name).toBe('TestVendor')
      expect(vendor.industry).toBe('Finance')
      expect(vendor.website).toBe('https://test.com')
    })
  })

  describe('fromPersistence() and toPersistence()', () => {
    it('should convert to and from persistence format', () => {
      const originalVendor = Vendor.create({
        name: 'PersistTest',
        industry: 'IT',
        contactInfo: { email: 'test@example.com' },
      })

      const persistence = originalVendor.toPersistence()
      const reconstituted = Vendor.fromPersistence(persistence)

      expect(reconstituted.id).toBe(originalVendor.id)
      expect(reconstituted.name).toBe(originalVendor.name)
      expect(reconstituted.industry).toBe(originalVendor.industry)
      expect(reconstituted.contactInfo).toEqual(originalVendor.contactInfo)
      expect(reconstituted.createdAt).toEqual(originalVendor.createdAt)
      expect(reconstituted.updatedAt).toEqual(originalVendor.updatedAt)
    })
  })
})

describe('VendorName Value Object', () => {
  it('should create valid vendor name', () => {
    const name = VendorName.create('TechCorp')
    expect(name.getValue()).toBe('TechCorp')
  })

  it('should trim whitespace', () => {
    const name = VendorName.create('  Spaces  ')
    expect(name.getValue()).toBe('Spaces')
  })

  it('should throw error for empty name', () => {
    expect(() => VendorName.create('')).toThrow('Vendor name cannot be empty')
  })

  it('should throw error for whitespace-only name', () => {
    expect(() => VendorName.create('   ')).toThrow(
      'Vendor name cannot be empty'
    )
  })

  it('should throw error for name exceeding 255 characters', () => {
    const longName = 'A'.repeat(256)
    expect(() => VendorName.create(longName)).toThrow(
      'Vendor name cannot exceed 255 characters'
    )
  })

  it('should throw error for name without alphanumeric characters', () => {
    expect(() => VendorName.create('!!!')).toThrow(
      'Vendor name must contain at least one alphanumeric character'
    )
  })

  it('should allow names with special characters if they contain alphanumerics', () => {
    const name = VendorName.create('Tech-Corp Inc.')
    expect(name.getValue()).toBe('Tech-Corp Inc.')
  })

  it('should check equality correctly', () => {
    const name1 = VendorName.create('TechCorp')
    const name2 = VendorName.create('TechCorp')
    const name3 = VendorName.create('DifferentCorp')

    expect(name1.equals(name2)).toBe(true)
    expect(name1.equals(name3)).toBe(false)
  })

  it('should convert to string', () => {
    const name = VendorName.create('TechCorp')
    expect(name.toString()).toBe('TechCorp')
  })
})
