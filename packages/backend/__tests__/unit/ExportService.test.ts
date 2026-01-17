/**
 * Export Service Unit Tests
 *
 * Tests export service orchestration logic
 */

import { ExportService } from '../../src/application/services/ExportService'
import { IAssessmentRepository } from '../../src/application/interfaces/IAssessmentRepository'
import { IQuestionRepository } from '../../src/application/interfaces/IQuestionRepository'
import { IVendorRepository } from '../../src/application/interfaces/IVendorRepository'
import { IPDFExporter } from '../../src/application/interfaces/IPDFExporter'
import { IWordExporter } from '../../src/application/interfaces/IWordExporter'
import { IExcelExporter } from '../../src/application/interfaces/IExcelExporter'
import { Assessment } from '../../src/domain/entities/Assessment'
import { Vendor } from '../../src/domain/entities/Vendor'
import { Question } from '../../src/domain/entities/Question'

describe('ExportService', () => {
  let exportService: ExportService
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>
  let mockQuestionRepo: jest.Mocked<IQuestionRepository>
  let mockVendorRepo: jest.Mocked<IVendorRepository>
  let mockPDFExporter: jest.Mocked<IPDFExporter>
  let mockWordExporter: jest.Mocked<IWordExporter>
  let mockExcelExporter: jest.Mocked<IExcelExporter>

  beforeEach(() => {
    // Create mock repositories
    mockAssessmentRepo = {
      findById: jest.fn(),
      findByIdWithVendor: jest.fn(), // Story 20.3.4: Combined lookup
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      findByVendorId: jest.fn(),
      list: jest.fn(),
      findByCreatedBy: jest.fn(),
      getVendor: jest.fn(),
      hasExportedAssessments: jest.fn(),
    } as jest.Mocked<IAssessmentRepository>

    mockQuestionRepo = {
      findById: jest.fn(),
      findByAssessmentId: jest.fn(),
      bulkCreate: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByAssessmentId: jest.fn(),
      replaceAllForAssessment: jest.fn(),
    } as jest.Mocked<IQuestionRepository>

    mockVendorRepo = {
      findById: jest.fn(),
      findByName: jest.fn(),
      searchByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    } as jest.Mocked<IVendorRepository>

    // Create mock exporters
    mockPDFExporter = {
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
    } as jest.Mocked<IPDFExporter>

    mockWordExporter = {
      generateWord: jest.fn().mockResolvedValue(Buffer.from('Word content')),
    } as jest.Mocked<IWordExporter>

    mockExcelExporter = {
      generateExcel: jest.fn().mockResolvedValue(Buffer.from('Excel content')),
    } as jest.Mocked<IExcelExporter>

    exportService = new ExportService(
      mockAssessmentRepo,
      mockQuestionRepo,
      mockVendorRepo,
      mockPDFExporter,
      mockWordExporter,
      mockExcelExporter
    )
  })

  describe('exportToPDF', () => {
    it('should throw error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null)

      await expect(
        exportService.exportToPDF('non-existent-id')
      ).rejects.toThrow('Assessment not found')
    })

    it('should throw error if vendor not found', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'quick',
        solutionName: 'Test Solution',
        solutionType: 'AI Tool',
        createdBy: 'user-1',
      })

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockVendorRepo.findById.mockResolvedValue(null)

      await expect(
        exportService.exportToPDF('assessment-1')
      ).rejects.toThrow('Vendor not found for assessment')
    })

    it('should throw error if no questions found', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'quick',
        solutionName: 'Test Solution',
        solutionType: 'AI Tool',
        createdBy: 'user-1',
      })

      const mockVendor = Vendor.create({
        name: 'Test Vendor',
        industry: 'Healthcare',
      })

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockVendorRepo.findById.mockResolvedValue(mockVendor)
      mockQuestionRepo.findByAssessmentId.mockResolvedValue([])

      await expect(
        exportService.exportToPDF('assessment-1')
      ).rejects.toThrow('No questions found for assessment')
    })

    it('should call PDFExporter when all data is valid', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'quick',
        solutionName: 'Test Solution',
        solutionType: 'AI Tool',
        createdBy: 'user-1',
      })

      const mockVendor = Vendor.create({
        name: 'Test Vendor',
        industry: 'Healthcare',
      })

      const mockQuestions = [
        Question.create({
          assessmentId: 'assessment-1',
          sectionName: 'Privacy',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question?',
          questionType: 'text',
        }),
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockVendorRepo.findById.mockResolvedValue(mockVendor)
      mockQuestionRepo.findByAssessmentId.mockResolvedValue(mockQuestions)

      const result = await exportService.exportToPDF('assessment-1')

      expect(mockAssessmentRepo.findById).toHaveBeenCalledWith('assessment-1')
      expect(mockVendorRepo.findById).toHaveBeenCalledWith('vendor-1')
      expect(mockQuestionRepo.findByAssessmentId).toHaveBeenCalledWith(
        'assessment-1'
      )
      expect(mockPDFExporter.generatePDF).toHaveBeenCalledWith({
        assessment: mockAssessment,
        vendor: mockVendor,
        questions: mockQuestions,
      })
      expect(result).toBeInstanceOf(Buffer)
    })
  })

  describe('exportToWord', () => {
    it('should throw error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null)

      await expect(
        exportService.exportToWord('non-existent-id')
      ).rejects.toThrow('Assessment not found')
    })

    it('should call WordExporter when all data is valid', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'comprehensive',
        solutionName: 'Test Solution',
        solutionType: 'AI Tool',
        createdBy: 'user-1',
      })

      const mockVendor = Vendor.create({
        name: 'Test Vendor',
        industry: 'Finance',
      })

      const mockQuestions = [
        Question.create({
          assessmentId: 'assessment-1',
          sectionName: 'Security',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Security question?',
          questionType: 'text',
        }),
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockVendorRepo.findById.mockResolvedValue(mockVendor)
      mockQuestionRepo.findByAssessmentId.mockResolvedValue(mockQuestions)

      const result = await exportService.exportToWord('assessment-1')

      expect(mockAssessmentRepo.findById).toHaveBeenCalled()
      expect(mockVendorRepo.findById).toHaveBeenCalled()
      expect(mockQuestionRepo.findByAssessmentId).toHaveBeenCalled()
      expect(mockWordExporter.generateWord).toHaveBeenCalledWith({
        assessment: mockAssessment,
        vendor: mockVendor,
        questions: mockQuestions,
      })
      expect(result).toBeInstanceOf(Buffer)
    })
  })

  describe('exportToExcel', () => {
    it('should throw error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null)

      await expect(
        exportService.exportToExcel('non-existent-id')
      ).rejects.toThrow('Assessment not found')
    })

    it('should call ExcelExporter when all data is valid', async () => {
      const mockAssessment = Assessment.create({
        vendorId: 'vendor-1',
        assessmentType: 'category_focused',
        solutionName: 'Test Solution',
        solutionType: 'Cloud Platform',
        createdBy: 'user-1',
      })

      const mockVendor = Vendor.create({
        name: 'Test Vendor',
        industry: 'Technology',
      })

      const mockQuestions = [
        Question.create({
          assessmentId: 'assessment-1',
          sectionName: 'Compliance',
          sectionNumber: 3,
          questionNumber: 1,
          questionText: 'Compliance question?',
          questionType: 'text',
        }),
      ]

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment)
      mockVendorRepo.findById.mockResolvedValue(mockVendor)
      mockQuestionRepo.findByAssessmentId.mockResolvedValue(mockQuestions)

      const result = await exportService.exportToExcel('assessment-1')

      expect(mockAssessmentRepo.findById).toHaveBeenCalled()
      expect(mockVendorRepo.findById).toHaveBeenCalled()
      expect(mockQuestionRepo.findByAssessmentId).toHaveBeenCalled()
      expect(mockExcelExporter.generateExcel).toHaveBeenCalledWith({
        assessment: mockAssessment,
        vendor: mockVendor,
        questions: mockQuestions,
      })
      expect(result).toBeInstanceOf(Buffer)
    })
  })
})
