/**
 * Unit tests for ScoringExportController
 */

import { Request, Response, NextFunction } from 'express';
import { ScoringExportController } from '../../../../src/infrastructure/http/controllers/ScoringExportController';
import { ScoringExportService } from '../../../../src/application/services/ScoringExportService';
import { IAssessmentRepository } from '../../../../src/application/interfaces/IAssessmentRepository';
import { Assessment } from '../../../../src/domain/entities/Assessment';
import { User } from '../../../../src/domain/entities/User';

describe('ScoringExportController', () => {
  let controller: ScoringExportController;
  let mockExportService: jest.Mocked<ScoringExportService>;
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockUser: User;

  beforeEach(() => {
    // Mock user
    mockUser = User.create({
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed',
      role: 'analyst',
    });
    // Override the id for testing
    (mockUser as any).id = 'user-123';

    // Mock export service
    mockExportService = {
      exportToPDF: jest.fn(),
      exportToWord: jest.fn(),
    } as any;

    // Mock assessment repository
    mockAssessmentRepo = {
      findById: jest.fn(),
    } as any;

    controller = new ScoringExportController(mockExportService, mockAssessmentRepo);

    // Mock request
    mockReq = {
      params: { assessmentId: 'assess-123' },
      query: {},
      user: mockUser,
    };

    // Mock response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    mockNext = jest.fn();
  });

  describe('exportToPDF', () => {
    it('returns 404 when assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null);

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Assessment not found' });
      expect(mockExportService.exportToPDF).not.toHaveBeenCalled();
    });

    it('returns 403 when user does not own assessment', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'other-user', // Different user
      } as Assessment;

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(mockExportService.exportToPDF).not.toHaveBeenCalled();
    });

    it('returns PDF with correct headers when successful', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123', // Same user
      } as Assessment;

      const mockBuffer = Buffer.from('%PDF-1.4');
      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToPDF.mockResolvedValue(mockBuffer);

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockExportService.exportToPDF).toHaveBeenCalledWith('assess-123', undefined);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('scoring-report-')
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', mockBuffer.length);
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('passes batchId query parameter when provided', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      mockReq.query = { batchId: 'batch-456' };
      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToPDF.mockResolvedValue(Buffer.from('%PDF-1.4'));

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockExportService.exportToPDF).toHaveBeenCalledWith('assess-123', 'batch-456');
    });

    it('returns 404 when scoring results not found', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToPDF.mockRejectedValue(
        new Error('No scoring results found for assessment: assess-123')
      );

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No scoring results found for assessment: assess-123',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next with error for unexpected errors', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      const unexpectedError = new Error('Database connection failed');
      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToPDF.mockRejectedValue(unexpectedError);

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(unexpectedError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('exportToWord', () => {
    it('returns 404 when assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null);

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Assessment not found' });
      expect(mockExportService.exportToWord).not.toHaveBeenCalled();
    });

    it('returns 403 when user does not own assessment', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'other-user',
      } as Assessment;

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(mockExportService.exportToWord).not.toHaveBeenCalled();
    });

    it('returns Word document with correct headers when successful', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      const mockBuffer = Buffer.from('PK...');
      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToWord.mockResolvedValue(mockBuffer);

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockExportService.exportToWord).toHaveBeenCalledWith('assess-123', undefined);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('scoring-report-')
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', mockBuffer.length);
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('passes batchId query parameter when provided', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      mockReq.query = { batchId: 'batch-789' };
      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToWord.mockResolvedValue(Buffer.from('PK...'));

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockExportService.exportToWord).toHaveBeenCalledWith('assess-123', 'batch-789');
    });

    it('returns 404 when scoring results not found', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToWord.mockRejectedValue(
        new Error('Scoring result not found for batch: batch-999')
      );

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Scoring result not found for batch: batch-999',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next with error for unexpected errors', async () => {
      const mockAssessment = {
        id: 'assess-123',
        createdBy: 'user-123',
      } as Assessment;

      const unexpectedError = new Error('File generation failed');
      mockAssessmentRepo.findById.mockResolvedValue(mockAssessment);
      mockExportService.exportToWord.mockRejectedValue(unexpectedError);

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(unexpectedError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
