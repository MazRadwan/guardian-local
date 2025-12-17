/**
 * Unit tests for AssessmentService
 */

import { AssessmentService } from '../../src/application/services/AssessmentService'
import { IVendorRepository } from '../../src/application/interfaces/IVendorRepository'
import { IAssessmentRepository } from '../../src/application/interfaces/IAssessmentRepository'
import { CreateAssessmentDTO } from '../../src/application/dtos/CreateAssessmentDTO'
import { Vendor } from '../../src/domain/entities/Vendor'
import { Assessment } from '../../src/domain/entities/Assessment'

describe('AssessmentService', () => {
  let service: AssessmentService
  let mockVendorRepo: IVendorRepository
  let mockAssessmentRepo: IAssessmentRepository

  beforeEach(() => {
    // Create mock repositories
    mockVendorRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      searchByName: jest.fn(),
    }

    mockAssessmentRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByVendorId: jest.fn(),
      findByCreatedBy: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    }

    service = new AssessmentService(mockVendorRepo, mockAssessmentRepo)
  })

  describe('createAssessment()', () => {
    const createAssessmentData: CreateAssessmentDTO = {
      vendorName: 'TechFlow Solutions',
      vendorIndustry: 'Healthcare IT',
      vendorWebsite: 'https://techflow.com',
      assessmentType: 'comprehensive',
      solutionName: 'NLHS PMO Tool',
      solutionType: 'AI tool',
      createdBy: 'user-123',
    }

    it('should create new vendor when vendor does not exist', async () => {
      // Mock: vendor not found
      (mockVendorRepo.findByName as jest.Mock).mockResolvedValue(null)

      // Mock: vendor created
      const mockVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'TechFlow Solutions',
        industry: 'Healthcare IT',
        website: 'https://techflow.com',
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockVendorRepo.create as jest.Mock).mockResolvedValue(mockVendor);

      // Mock: assessment created
      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: mockVendor.id,
        assessmentType: 'comprehensive',
        solutionName: 'NLHS PMO Tool',
        solutionType: 'AI tool',
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.create as jest.Mock).mockResolvedValue(mockAssessment);

      const result = await service.createAssessment(createAssessmentData)

      // Verify vendor was created
      expect(mockVendorRepo.create).toHaveBeenCalledTimes(1)
      expect(mockVendorRepo.findByName).toHaveBeenCalledWith(
        'TechFlow Solutions'
      )

      // Verify assessment was created
      expect(mockAssessmentRepo.create).toHaveBeenCalledTimes(1)

      // Verify response
      expect(result.vendorName).toBe('TechFlow Solutions')
      expect(result.assessmentType).toBe('comprehensive')
      expect(result.status).toBe('draft')
    })

    it('should reuse existing vendor when vendor exists', async () => {
      // Mock: vendor exists
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-existing',
        name: 'TechFlow Solutions',
        industry: 'Old Industry',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockVendorRepo.findByName as jest.Mock).mockResolvedValue(existingVendor);
      (mockVendorRepo.update as jest.Mock).mockResolvedValue(existingVendor);

      // Mock: assessment created
      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: existingVendor.id,
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.create as jest.Mock).mockResolvedValue(mockAssessment);

      const result = await service.createAssessment(createAssessmentData)

      // Verify vendor was NOT created (but was updated)
      expect(mockVendorRepo.create).not.toHaveBeenCalled()
      expect(mockVendorRepo.update).toHaveBeenCalledTimes(1)

      // Verify assessment was created with existing vendor
      expect(mockAssessmentRepo.create).toHaveBeenCalledTimes(1)

      expect(result.vendorId).toBe(existingVendor.id)
    })

    it('should update existing vendor with new information', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-existing',
        name: 'TechFlow Solutions',
        industry: null,
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockVendorRepo.findByName as jest.Mock).mockResolvedValue(existingVendor);
      (mockVendorRepo.update as jest.Mock).mockResolvedValue(existingVendor);

      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: existingVendor.id,
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.create as jest.Mock).mockResolvedValue(mockAssessment);

      await service.createAssessment(createAssessmentData)

      // Verify vendor was updated with new data
      expect(mockVendorRepo.update).toHaveBeenCalledTimes(1)
    })

    it('should not update vendor if no new information provided', async () => {
      const existingVendor = Vendor.fromPersistence({
        id: 'vendor-existing',
        name: 'TechFlow Solutions',
        industry: 'Healthcare IT',
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockVendorRepo.findByName as jest.Mock).mockResolvedValue(existingVendor);

      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: existingVendor.id,
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.create as jest.Mock).mockResolvedValue(mockAssessment);

      // Create assessment without vendor details
      await service.createAssessment({
        vendorName: 'TechFlow Solutions',
        assessmentType: 'comprehensive',
        createdBy: 'user-123',
      })

      // Verify vendor was NOT updated
      expect(mockVendorRepo.update).not.toHaveBeenCalled()
    })

    it('should set assessment status to draft', async () => {
      const mockVendor = Vendor.fromPersistence({
        id: 'vendor-123',
        name: 'Test Vendor',
        industry: null,
        website: null,
        contactInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockVendorRepo.findByName as jest.Mock).mockResolvedValue(null);
      (mockVendorRepo.create as jest.Mock).mockResolvedValue(mockVendor);

      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: mockVendor.id,
        assessmentType: 'quick',
        solutionName: null,
        solutionType: null,
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.create as jest.Mock).mockResolvedValue(mockAssessment);

      const result = await service.createAssessment({
        vendorName: 'Test Vendor',
        assessmentType: 'quick',
        createdBy: 'user-123',
      })

      expect(result.status).toBe('draft')
    })
  })

  describe('getAssessment()', () => {
    it('should return assessment by ID', async () => {
      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: 'vendor-123',
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.findById as jest.Mock).mockResolvedValue(mockAssessment);

      const result = await service.getAssessment(mockAssessment.id)

      expect(result).toBe(mockAssessment)
      expect(mockAssessmentRepo.findById).toHaveBeenCalledWith(
        mockAssessment.id
      )
    })

    it('should return null for non-existent assessment', async () => {
      (mockAssessmentRepo.findById as jest.Mock).mockResolvedValue(null)

      const result = await service.getAssessment('non-existent-id')

      expect(result).toBeNull()
    })
  })

  describe('getVendorHistory()', () => {
    it('should return all assessments for vendor', async () => {
      const vendorId = 'vendor-123'
      const mockAssessments = [
        Assessment.fromPersistence({
          id: 'assessment-1',
          vendorId,
          assessmentType: 'quick',
          solutionName: null,
          solutionType: null,
          status: 'draft',
          assessmentMetadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-123',
        }),
        Assessment.fromPersistence({
          id: 'assessment-2',
          vendorId,
          assessmentType: 'comprehensive',
          solutionName: null,
          solutionType: null,
          status: 'draft',
          assessmentMetadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user-123',
        }),
      ];
      (mockAssessmentRepo.findByVendorId as jest.Mock).mockResolvedValue(
        mockAssessments
      )

      const result = await service.getVendorHistory(vendorId)

      expect(result).toHaveLength(2)
      expect(mockAssessmentRepo.findByVendorId).toHaveBeenCalledWith(vendorId)
    })

    it('should return empty array for vendor with no assessments', async () => {
      (mockAssessmentRepo.findByVendorId as jest.Mock).mockResolvedValue([])

      const result = await service.getVendorHistory('vendor-123')

      expect(result).toHaveLength(0)
    })
  })

  describe('updateAssessmentStatus()', () => {
    it('should update assessment status', async () => {
      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: 'vendor-123',
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'draft',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.findById as jest.Mock).mockResolvedValue(mockAssessment);
      (mockAssessmentRepo.update as jest.Mock).mockResolvedValue(mockAssessment);

      const result = await service.updateAssessmentStatus(
        mockAssessment.id,
        'questions_generated'
      )

      expect(result.status).toBe('questions_generated')
      expect(mockAssessmentRepo.update).toHaveBeenCalledTimes(1)
    })

    it('should throw error for non-existent assessment', async () => {
      (mockAssessmentRepo.findById as jest.Mock).mockResolvedValue(null)

      await expect(
        service.updateAssessmentStatus('non-existent-id', 'exported')
      ).rejects.toThrow('Assessment not found')
    })

    it('should throw error for invalid status transition', async () => {
      const mockAssessment = Assessment.fromPersistence({
        id: 'assessment-123',
        vendorId: 'vendor-123',
        assessmentType: 'comprehensive',
        solutionName: null,
        solutionType: null,
        status: 'cancelled',
        assessmentMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-123',
      });
      (mockAssessmentRepo.findById as jest.Mock).mockResolvedValue(mockAssessment);

      await expect(
        service.updateAssessmentStatus(mockAssessment.id, 'exported')
      ).rejects.toThrow('Invalid status transition')
    })
  })

  describe('getUserAssessments()', () => {
    it('should return assessments created by user', async () => {
      const userId = 'user-123'
      const mockAssessments = [
        Assessment.fromPersistence({
          id: 'assessment-1',
          vendorId: 'vendor-1',
          assessmentType: 'quick',
          solutionName: null,
          solutionType: null,
          status: 'draft',
          assessmentMetadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userId,
        }),
        Assessment.fromPersistence({
          id: 'assessment-2',
          vendorId: 'vendor-2',
          assessmentType: 'comprehensive',
          solutionName: null,
          solutionType: null,
          status: 'draft',
          assessmentMetadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userId,
        }),
      ];
      (mockAssessmentRepo.findByCreatedBy as jest.Mock).mockResolvedValue(
        mockAssessments
      )

      const result = await service.getUserAssessments(userId)

      expect(result).toHaveLength(2)
      expect(mockAssessmentRepo.findByCreatedBy).toHaveBeenCalledWith(userId)
    })
  })

  describe('listVendors()', () => {
    it('should list vendors with default pagination', async () => {
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
      (mockVendorRepo.list as jest.Mock).mockResolvedValue(mockVendors);

      const result = await service.listVendors()

      expect(result).toHaveLength(2)
      expect(mockVendorRepo.list).toHaveBeenCalledWith(undefined, undefined)
    })

    it('should list vendors with custom pagination', async () => {
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
      ];
      (mockVendorRepo.list as jest.Mock).mockResolvedValue(mockVendors);

      await service.listVendors(10, 5)

      expect(mockVendorRepo.list).toHaveBeenCalledWith(10, 5)
    })
  })

  describe('deleteAssessment()', () => {
    it('should delete assessment', async () => {
      (mockAssessmentRepo.delete as jest.Mock).mockResolvedValue(undefined)

      await service.deleteAssessment('assessment-123')

      expect(mockAssessmentRepo.delete).toHaveBeenCalledWith('assessment-123')
    })
  })
})
