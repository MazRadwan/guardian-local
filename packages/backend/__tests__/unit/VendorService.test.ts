/**
 * Unit tests for VendorService
 */

import { VendorService } from '../../src/application/services/VendorService';
import { IVendorRepository } from '../../src/application/interfaces/IVendorRepository';
import { Vendor } from '../../src/domain/entities/Vendor';

describe('VendorService', () => {
  let service: VendorService;
  let mockVendorRepo: jest.Mocked<IVendorRepository>;

  beforeEach(() => {
    mockVendorRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      searchByName: jest.fn(),
    };

    service = new VendorService(mockVendorRepo);
  });

  describe('findOrCreateDefault()', () => {
    const userId = 'user-123';

    it('should return existing default vendor when one exists', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Chat Assessment Vendor',
        industry: 'Healthcare Technology',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findByName.mockResolvedValue(existingVendor);

      const result = await service.findOrCreateDefault(userId);

      expect(result).toBe(existingVendor);
      expect(mockVendorRepo.findByName).toHaveBeenCalledWith('Chat Assessment Vendor');
      expect(mockVendorRepo.create).not.toHaveBeenCalled();
    });

    it('should create default vendor when none exists', async () => {
      mockVendorRepo.findByName.mockResolvedValue(null);

      const createdVendor = Vendor.fromPersistence({
        id: 'vendor-new',
        name: 'Chat Assessment Vendor',
        industry: 'Healthcare Technology',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.create.mockResolvedValue(createdVendor);

      const result = await service.findOrCreateDefault(userId);

      expect(result).toBe(createdVendor);
      expect(mockVendorRepo.findByName).toHaveBeenCalledWith('Chat Assessment Vendor');
      expect(mockVendorRepo.create).toHaveBeenCalledTimes(1);

      // Verify the vendor passed to create has correct properties
      const createCall = mockVendorRepo.create.mock.calls[0][0];
      expect(createCall.name).toBe('Chat Assessment Vendor');
      expect(createCall.industry).toBe('Healthcare Technology');
    });

    it('should be idempotent - multiple calls return same vendor', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Chat Assessment Vendor',
        industry: 'Healthcare Technology',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findByName.mockResolvedValue(existingVendor);

      const result1 = await service.findOrCreateDefault(userId);
      const result2 = await service.findOrCreateDefault(userId);

      expect(result1).toBe(existingVendor);
      expect(result2).toBe(existingVendor);
      expect(mockVendorRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreateVendor()', () => {
    it('should return existing vendor when found by name', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Unknown Vendor',
        industry: null,
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findByName.mockResolvedValue(existingVendor);

      const result = await service.findOrCreateVendor('Unknown Vendor');

      expect(result).toBe(existingVendor);
      expect(mockVendorRepo.findByName).toHaveBeenCalledWith('Unknown Vendor');
      expect(mockVendorRepo.create).not.toHaveBeenCalled();
    });

    it('should create vendor with minimal info when not found', async () => {
      mockVendorRepo.findByName.mockResolvedValue(null);

      const createdVendor = Vendor.fromPersistence({
        id: 'vendor-new',
        name: 'Unknown Vendor',
        industry: null,
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.create.mockResolvedValue(createdVendor);

      const result = await service.findOrCreateVendor('Unknown Vendor');

      expect(result).toBe(createdVendor);
      expect(mockVendorRepo.findByName).toHaveBeenCalledWith('Unknown Vendor');
      expect(mockVendorRepo.create).toHaveBeenCalledTimes(1);

      // Verify vendor created with minimal info
      const createCall = mockVendorRepo.create.mock.calls[0][0];
      expect(createCall.name).toBe('Unknown Vendor');
      // Vendor entity converts undefined to null for optional fields
      expect(createCall.industry).toBeNull();
      expect(createCall.website).toBeNull();
      expect(createCall.contactInfo).toBeNull();
    });

    it('should be idempotent for fallback assessment creation', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Unknown Vendor',
        industry: null,
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findByName.mockResolvedValue(existingVendor);

      const result1 = await service.findOrCreateVendor('Unknown Vendor');
      const result2 = await service.findOrCreateVendor('Unknown Vendor');

      expect(result1).toBe(existingVendor);
      expect(result2).toBe(existingVendor);
      expect(mockVendorRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getVendor()', () => {
    it('should return vendor by ID', async () => {
      const mockVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Test Vendor',
        industry: 'Tech',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findById.mockResolvedValue(mockVendor);

      const result = await service.getVendor('vendor-123');

      expect(result).toBe(mockVendor);
      expect(mockVendorRepo.findById).toHaveBeenCalledWith('vendor-123');
    });

    it('should return null for non-existent vendor', async () => {
      mockVendorRepo.findById.mockResolvedValue(null);

      const result = await service.getVendor('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getVendorByName()', () => {
    it('should return vendor by name', async () => {
      const mockVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Test Vendor',
        industry: 'Tech',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findByName.mockResolvedValue(mockVendor);

      const result = await service.getVendorByName('Test Vendor');

      expect(result).toBe(mockVendor);
      expect(mockVendorRepo.findByName).toHaveBeenCalledWith('Test Vendor');
    });
  });

  describe('listVendors()', () => {
    it('should list vendors with pagination', async () => {
      const mockVendors = [
        Vendor.fromPersistence({
          id: 'vendor-1',
          name: 'Vendor A',
          industry: null,
          website: null,
          contactInfo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        Vendor.fromPersistence({
          id: 'vendor-2',
          name: 'Vendor B',
          industry: null,
          website: null,
          contactInfo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];
      mockVendorRepo.list.mockResolvedValue(mockVendors);

      const result = await service.listVendors(10, 5);

      expect(result).toHaveLength(2);
      expect(mockVendorRepo.list).toHaveBeenCalledWith(10, 5);
    });
  });

  describe('searchVendors()', () => {
    it('should search vendors by name', async () => {
      const mockVendors = [
        Vendor.fromPersistence({
          id: 'vendor-1',
          name: 'Test Vendor',
          industry: null,
          website: null,
          contactInfo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];
      mockVendorRepo.searchByName.mockResolvedValue(mockVendors);

      const result = await service.searchVendors('Test');

      expect(result).toHaveLength(1);
      expect(mockVendorRepo.searchByName).toHaveBeenCalledWith('Test');
    });
  });

  describe('createVendor()', () => {
    it('should create a new vendor', async () => {
      mockVendorRepo.findByName.mockResolvedValue(null);
      const createdVendor = Vendor.fromPersistence({
        id: 'vendor-new',
        name: 'New Vendor',
        industry: 'Tech',
        website: 'https://example.com',
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.create.mockResolvedValue(createdVendor);

      const result = await service.createVendor({
        name: 'New Vendor',
        industry: 'Tech',
        website: 'https://example.com',
      });

      expect(result).toBe(createdVendor);
      expect(mockVendorRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error when vendor already exists', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Existing Vendor',
        industry: null,
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findByName.mockResolvedValue(existingVendor);

      await expect(
        service.createVendor({ name: 'Existing Vendor' })
      ).rejects.toThrow('Vendor with name "Existing Vendor" already exists');

      expect(mockVendorRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateVendor()', () => {
    it('should update vendor properties', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Test Vendor',
        industry: 'Old Industry',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockVendorRepo.findById.mockResolvedValue(existingVendor);
      mockVendorRepo.update.mockResolvedValue(existingVendor);

      const result = await service.updateVendor('vendor-123', {
        industry: 'New Industry',
        website: 'https://new.com',
      });

      expect(result).toBe(existingVendor);
      expect(mockVendorRepo.update).toHaveBeenCalledTimes(1);
    });

    it('should throw error for non-existent vendor', async () => {
      mockVendorRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateVendor('non-existent', { industry: 'Tech' })
      ).rejects.toThrow('Vendor not found: non-existent');
    });
  });

  describe('deleteVendor()', () => {
    it('should delete vendor', async () => {
      mockVendorRepo.delete.mockResolvedValue(undefined);

      await service.deleteVendor('vendor-123');

      expect(mockVendorRepo.delete).toHaveBeenCalledWith('vendor-123');
    });
  });
});
