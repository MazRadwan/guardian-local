import { DocumentUploadController } from '../../src/infrastructure/http/controllers/DocumentUploadController';
import { Request, Response } from 'express';

describe('DocumentUploadController', () => {
  let controller: DocumentUploadController;
  let mockFileStorage: jest.Mocked<any>;
  let mockFileValidator: jest.Mocked<any>;
  let mockIntakeParser: jest.Mocked<any>;
  let mockScoringParser: jest.Mocked<any>;
  let mockConversationRepo: jest.Mocked<any>;
  let mockChatNamespace: jest.Mocked<any>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockFileStorage = {
      store: jest.fn().mockResolvedValue('/uploads/test.pdf'),
    };

    mockFileValidator = {
      validate: jest.fn().mockResolvedValue({
        valid: true,
        documentType: 'pdf',
        warnings: [],
      }),
    };

    mockIntakeParser = {
      parseForContext: jest.fn().mockResolvedValue({
        success: true,
        context: { vendorName: 'Test Vendor', features: [], complianceMentions: [] },
        suggestedQuestions: [],
        coveredCategories: [],
        gapCategories: ['privacy_risk'],
        confidence: 0.9,
      }),
    };

    mockScoringParser = {
      parseForResponses: jest.fn(),
    };

    mockConversationRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'conv-123',
        userId: 'user-123',
      }),
    };

    // Mock the /chat namespace (not base io)
    mockChatNamespace = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    controller = new DocumentUploadController(
      mockFileStorage,
      mockFileValidator,
      mockIntakeParser,
      mockScoringParser,
      mockConversationRepo,
      mockChatNamespace // /chat namespace
    );

    // Auth middleware sets req.user (full User object), not req.userId
    mockReq = {
      user: { id: 'user-123', email: 'test@example.com', role: 'user' } as any,
      body: {
        conversationId: 'conv-123',
        mode: 'intake',
      },
      file: {
        buffer: Buffer.from('test'),
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as Express.Multer.File,
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('upload', () => {
    it('should reject unauthenticated request', async () => {
      // No user means not authenticated
      mockReq.user = undefined;

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    it('should reject missing required fields', async () => {
      mockReq.body = {};

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject invalid mode', async () => {
      mockReq.body = {
        conversationId: 'conv-123',
        mode: 'invalid',
      };

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid mode. Must be "intake" or "scoring"' });
    });

    it('should reject unauthorized conversation access', async () => {
      mockConversationRepo.findById.mockResolvedValue({
        id: 'conv-123',
        userId: 'other-user', // Different user
      });

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 for non-existent conversation', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should accept valid upload and return 202', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Upload accepted, processing started',
          uploadId: expect.any(String),
          conversationId: 'conv-123',
        })
      );
    });

    it('should validate file before accepting', async () => {
      mockFileValidator.validate.mockResolvedValue({
        valid: false,
        documentType: null,
        error: 'Invalid file type',
        warnings: [],
      });

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid file type' });
    });

    it('should emit progress events on successful processing', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise(process.nextTick);

      // Verify progress events emitted
      expect(mockChatNamespace.to).toHaveBeenCalledWith('user:user-123');
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'upload_progress',
        expect.objectContaining({
          conversationId: 'conv-123',
          uploadId: expect.any(String),
        })
      );
    });

    it('should emit intake_context_ready on successful intake parse', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise(process.nextTick);

      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'intake_context_ready',
        expect.objectContaining({
          success: true,
          context: expect.objectContaining({
            vendorName: 'Test Vendor',
          }),
        })
      );
    });
  });
});
