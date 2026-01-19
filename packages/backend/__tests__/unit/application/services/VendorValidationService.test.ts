/**
 * Unit tests for VendorValidationService
 *
 * Epic 18.4: Vendor validation for multi-vendor clarification
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { VendorValidationService } from '../../../../src/application/services/VendorValidationService.js';
import type { IFileRepository, FileRecord } from '../../../../src/application/interfaces/IFileRepository.js';

// Create a partial mock type for IFileRepository
type MockFileRepository = {
  findByIds: jest.Mock<(fileIds: string[]) => Promise<FileRecord[]>>;
  findById: jest.Mock<() => Promise<FileRecord | null>>;
  create: jest.Mock<() => Promise<FileRecord>>;
  findByIdAndUser: jest.Mock<() => Promise<FileRecord | null>>;
  findByIdAndConversation: jest.Mock<() => Promise<FileRecord | null>>;
  updateIntakeContext: jest.Mock<() => Promise<void>>;
  findByConversationWithContext: jest.Mock<() => Promise<never[]>>;
  updateTextExcerpt: jest.Mock<() => Promise<void>>;
  updateParseStatus: jest.Mock<() => Promise<void>>;
  tryStartParsing: jest.Mock<() => Promise<boolean>>;
  findByConversationWithExcerpt: jest.Mock<() => Promise<never[]>>;
  deleteByConversationId: jest.Mock<() => Promise<void>>;
};

/**
 * Create a minimal file record for testing
 */
function createFileRecord(
  id: string,
  vendorName: string | null
): Partial<FileRecord> {
  return {
    id,
    detectedVendorName: vendorName,
    userId: 'user-1',
    conversationId: 'conv-1',
    filename: `${id}.pdf`,
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: `/files/${id}.pdf`,
    createdAt: new Date(),
    textExcerpt: null,
    parseStatus: 'pending',
    detectedDocType: null,
  };
}

describe('VendorValidationService', () => {
  let service: VendorValidationService;
  let mockFileRepository: MockFileRepository;

  beforeEach(() => {
    mockFileRepository = {
      findByIds: jest.fn<(fileIds: string[]) => Promise<FileRecord[]>>(),
      findById: jest.fn<() => Promise<FileRecord | null>>(),
      create: jest.fn<() => Promise<FileRecord>>(),
      findByIdAndUser: jest.fn<() => Promise<FileRecord | null>>(),
      findByIdAndConversation: jest.fn<() => Promise<FileRecord | null>>(),
      updateIntakeContext: jest.fn<() => Promise<void>>(),
      findByConversationWithContext: jest.fn<() => Promise<never[]>>(),
      updateTextExcerpt: jest.fn<() => Promise<void>>(),
      updateParseStatus: jest.fn<() => Promise<void>>(),
      tryStartParsing: jest.fn<() => Promise<boolean>>(),
      findByConversationWithExcerpt: jest.fn<() => Promise<never[]>>(),
      deleteByConversationId: jest.fn<() => Promise<void>>(),
    };
    service = new VendorValidationService(
      mockFileRepository as unknown as IFileRepository
    );
  });

  describe('validateSingleVendor', () => {
    it('should return valid for empty file list', async () => {
      const result = await service.validateSingleVendor([]);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBeUndefined();
      expect(result.vendors).toBeUndefined();
      // findByIds should not be called for empty list
      expect(mockFileRepository.findByIds).not.toHaveBeenCalled();
    });

    it('should return valid when no files found (all IDs invalid)', async () => {
      mockFileRepository.findByIds.mockResolvedValue([]);

      const result = await service.validateSingleVendor(['non-existent-id']);

      expect(result.valid).toBe(true);
      expect(mockFileRepository.findByIds).toHaveBeenCalledWith([
        'non-existent-id',
      ]);
    });

    it('should return valid for single vendor', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Acme Corp') as FileRecord,
        createFileRecord('2', 'Acme Corp') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBe('Acme Corp');
      expect(result.vendors).toBeUndefined();
    });

    it('should return valid for all unknown vendors (null)', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', null) as FileRecord,
        createFileRecord('2', null) as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBeUndefined();
      expect(result.vendors).toBeUndefined();
    });

    it('should return valid for explicit vendor + unknown (null)', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Acme Corp') as FileRecord,
        createFileRecord('2', null) as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBe('Acme Corp');
    });

    it('should return invalid for multiple vendors', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Acme Corp') as FileRecord,
        createFileRecord('2', 'Acme Corp') as FileRecord,
        createFileRecord('3', 'CloudSec Inc') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3']);

      expect(result.valid).toBe(false);
      expect(result.vendorName).toBeUndefined();
      expect(result.vendors).toHaveLength(2);
      expect(result.vendors![0].name).toBe('Acme Corp');
      expect(result.vendors![0].fileCount).toBe(2);
      expect(result.vendors![1].name).toBe('CloudSec Inc');
      expect(result.vendors![1].fileCount).toBe(1);
    });

    it('should sort vendors by file count descending', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'CloudSec Inc') as FileRecord,
        createFileRecord('2', 'Acme Corp') as FileRecord,
        createFileRecord('3', 'Acme Corp') as FileRecord,
        createFileRecord('4', 'Acme Corp') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3', '4']);

      expect(result.valid).toBe(false);
      expect(result.vendors![0].name).toBe('Acme Corp'); // 3 files
      expect(result.vendors![0].fileCount).toBe(3);
      expect(result.vendors![1].name).toBe('CloudSec Inc'); // 1 file
      expect(result.vendors![1].fileCount).toBe(1);
    });

    it('should treat empty string vendor as unknown', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', '') as FileRecord,
        createFileRecord('2', null) as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBeUndefined();
    });

    it('should include correct fileIds in vendor info', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('file-1', 'Acme Corp') as FileRecord,
        createFileRecord('file-2', 'CloudSec Inc') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['file-1', 'file-2']);

      expect(result.valid).toBe(false);
      const acme = result.vendors!.find((v) => v.name === 'Acme Corp');
      const cloudsec = result.vendors!.find((v) => v.name === 'CloudSec Inc');
      expect(acme!.fileIds).toEqual(['file-1']);
      expect(cloudsec!.fileIds).toEqual(['file-2']);
    });

    it('should handle three different vendors', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Vendor A') as FileRecord,
        createFileRecord('2', 'Vendor B') as FileRecord,
        createFileRecord('3', 'Vendor C') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3']);

      expect(result.valid).toBe(false);
      expect(result.vendors).toHaveLength(3);
      // All have equal count (1), so order depends on iteration
      const vendorNames = result.vendors!.map((v) => v.name).sort();
      expect(vendorNames).toEqual(['Vendor A', 'Vendor B', 'Vendor C']);
    });

    it('should handle mix of explicit vendors and unknown', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Acme Corp') as FileRecord,
        createFileRecord('2', null) as FileRecord,
        createFileRecord('3', 'CloudSec Inc') as FileRecord,
        createFileRecord('4', '') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3', '4']);

      expect(result.valid).toBe(false);
      // Only explicit vendors (Acme and CloudSec) should be in the list
      expect(result.vendors).toHaveLength(2);
      const vendorNames = result.vendors!.map((v) => v.name).sort();
      expect(vendorNames).toEqual(['Acme Corp', 'CloudSec Inc']);
    });

    it('should skip non-existent IDs gracefully', async () => {
      // Only return one file even though two IDs were requested
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('file-1', 'Acme Corp') as FileRecord,
      ]);

      const result = await service.validateSingleVendor([
        'file-1',
        'non-existent',
      ]);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBe('Acme Corp');
    });

    it('should normalize vendor names for comparison (case + whitespace)', async () => {
      // "Acme Corp", "ACME CORP", and "acme corp " should all be treated as the same vendor
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Acme Corp') as FileRecord,
        createFileRecord('2', 'ACME CORP') as FileRecord,
        createFileRecord('3', 'acme corp ') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3']);

      // Should be valid (single vendor after normalization)
      expect(result.valid).toBe(true);
      // Display name preserved from first file
      expect(result.vendorName).toBe('Acme Corp');
    });

    it('should treat normalized duplicates as single vendor', async () => {
      // Mix of case variations with another vendor
      mockFileRepository.findByIds.mockResolvedValue([
        createFileRecord('1', 'Acme Corp') as FileRecord,
        createFileRecord('2', 'ACME CORP') as FileRecord,
        createFileRecord('3', 'CloudSec') as FileRecord,
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3']);

      // Should be invalid (2 distinct vendors after normalization)
      expect(result.valid).toBe(false);
      expect(result.vendors).toHaveLength(2);
      // Acme has 2 files, CloudSec has 1
      expect(result.vendors![0].fileCount).toBe(2);
      expect(result.vendors![0].name).toBe('Acme Corp'); // Original case preserved
      expect(result.vendors![1].fileCount).toBe(1);
      expect(result.vendors![1].name).toBe('CloudSec');
    });
  });
});
