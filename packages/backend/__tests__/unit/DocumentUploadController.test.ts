import { DocumentUploadController, buildContentDisposition } from '../../src/infrastructure/http/controllers/DocumentUploadController';
import { Request, Response } from 'express';

describe('DocumentUploadController', () => {
  let controller: DocumentUploadController;
  let mockFileStorage: jest.Mocked<any>;
  let mockFileValidator: jest.Mocked<any>;
  let mockIntakeParser: jest.Mocked<any>;
  let mockScoringParser: jest.Mocked<any>;
  let mockConversationService: jest.Mocked<any>;
  let mockChatNamespace: jest.Mocked<any>;
  let mockFileRepository: jest.Mocked<any>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockFileStorage = {
      store: jest.fn().mockResolvedValue('/uploads/test.pdf'),
      retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
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

    // ConversationService for ownership validation + silent context storage (Epic 16.6.1)
    mockConversationService = {
      getConversation: jest.fn().mockResolvedValue({
        id: 'conv-123',
        userId: 'user-123',
      }),
      // Epic 16.6.1: updateContext used instead of sendMessage (silent storage)
      updateContext: jest.fn().mockResolvedValue(undefined),
    };

    // Mock the /chat namespace (not base io)
    mockChatNamespace = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Epic 16.6.9: Mock FileRepository for file registration
    mockFileRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'file-uuid-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }),
      findByIdAndUser: jest.fn().mockResolvedValue({
        id: 'file-uuid-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
        createdAt: new Date(),
      }),
    };

    controller = new DocumentUploadController(
      mockFileStorage,
      mockFileValidator,
      mockIntakeParser,
      mockScoringParser,
      mockConversationService, // Ownership validation + assistant messages
      mockChatNamespace,       // /chat namespace
      mockFileRepository       // Epic 16.6.9: File registration
    );

    // Auth middleware sets req.user (full User object), not req.userId
    // Epic 17: Route uses upload.fields() so files come in req.files as { fieldname: File[] }
    mockReq = {
      user: { id: 'user-123', email: 'test@example.com', role: 'user' } as any,
      body: {
        conversationId: 'conv-123',
        mode: 'intake',
      },
      // upload.fields() format: { 'file': [File] } for single, { 'files': [...] } for multi
      files: {
        file: [{
          buffer: Buffer.from('test'),
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          fieldname: 'file',
          encoding: '7bit',
          stream: null as any,
          destination: '',
          filename: '',
          path: '',
        } as Express.Multer.File],
      },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('upload', () => {
    // Helper to create mock files for multi-file tests
    const createMockFile = (name: string, type: string, size = 1024): Express.Multer.File => ({
      originalname: name,
      mimetype: type,
      buffer: Buffer.alloc(size),
      size,
      fieldname: 'files',
      encoding: '7bit',
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    });

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
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'other-user', // Different user
      });

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 for non-existent conversation', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should accept valid upload and return 202 with top-level uploadId', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(202);
      // Epic 17: Response includes both legacy `uploadId` and `files[]` for backward compat
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Upload accepted',
          // BACKWARD COMPAT: Top-level uploadId for Epic 16 single-file clients
          uploadId: expect.any(String),
          totalFiles: 1,
          acceptedCount: 1,
          files: expect.arrayContaining([
            expect.objectContaining({
              uploadId: expect.any(String),
              status: 'accepted',
            }),
          ]),
        })
      );

      // Verify top-level uploadId matches first file's uploadId
      const response = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(response.uploadId).toBe(response.files[0].uploadId);
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
      // Epic 17: All files rejected returns 400 with files array
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'All files rejected',
          files: expect.arrayContaining([
            expect.objectContaining({
              status: 'rejected',
              error: 'Invalid file type',
            }),
          ]),
        })
      );
    });

    it('should emit progress events on successful processing', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing (setImmediate is more stable than nextTick)
      await new Promise((resolve) => setImmediate(resolve));

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

      // Wait for async processing (setImmediate is more stable than nextTick)
      await new Promise((resolve) => setImmediate(resolve));

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

    // Epic 16.6.1: Context stored silently (no visible assistant message)
    it('should store context silently via updateContext on successful intake parse', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify conversationService.updateContext was called with intake context
      expect(mockConversationService.updateContext).toHaveBeenCalledWith(
        'conv-123',
        expect.objectContaining({
          intakeContext: expect.objectContaining({
            vendorName: 'Test Vendor',
            features: [],
            complianceMentions: [],
          }),
          intakeGapCategories: ['privacy_risk'],
          intakeParsedAt: expect.any(String),
        })
      );

      // Verify NO 'message' event emitted (silent storage, not visible in chat)
      const messageCall = mockChatNamespace.emit.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      );
      expect(messageCall).toBeUndefined();
    });

    it('should emit upload_progress with stage "complete" on successful parse', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing (setImmediate is more stable than nextTick)
      await new Promise((resolve) => setImmediate(resolve));

      // Verify final stage is 'complete' for success
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'upload_progress',
        expect.objectContaining({
          stage: 'complete',
          progress: 100,
          message: 'Document processed successfully',
        })
      );
    });

    it('should emit upload_progress with stage "error" and error details when parsing fails', async () => {
      // Make parser return failure (success: false, not throw)
      mockIntakeParser.parseForContext.mockResolvedValue({
        success: false,
        context: null,
        error: 'Failed to parse document',
      });

      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify intake_context_ready emitted with success: false
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'intake_context_ready',
        expect.objectContaining({
          success: false,
          error: 'Failed to parse document',
        })
      );

      // Verify final stage is 'error' with specific error message
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'upload_progress',
        expect.objectContaining({
          stage: 'error',
          progress: 0,
          message: 'Document parsing failed',
          error: 'Failed to parse document', // Parser error included
        })
      );

      // Verify 'complete' was NOT emitted
      const completeCall = mockChatNamespace.emit.mock.calls.find(
        (call: any[]) => call[0] === 'upload_progress' && call[1]?.stage === 'complete'
      );
      expect(completeCall).toBeUndefined();
    });

    it('should emit upload_progress with stage "error" and error details when scoring parse fails', async () => {
      // Switch to scoring mode
      mockReq.body = {
        conversationId: 'conv-123',
        mode: 'scoring',
      };

      // Make scoring parser return failure
      mockScoringParser.parseForResponses.mockResolvedValue({
        success: false,
        assessmentId: null,
        error: 'Not a Guardian questionnaire',
      });

      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify scoring_parse_ready emitted with success: false
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'scoring_parse_ready',
        expect.objectContaining({
          success: false,
          error: 'Not a Guardian questionnaire',
        })
      );

      // Verify final stage is 'error' with specific error
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'upload_progress',
        expect.objectContaining({
          stage: 'error',
          error: 'Not a Guardian questionnaire', // Parser error included
        })
      );
    });

    // Epic 16.6.9: File registration tests
    it('should register file in database after storage', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify file was registered in database
      expect(mockFileRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: '/uploads/test.pdf',
      });
    });

    it('should include fileId in intake_context_ready event', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify intake_context_ready includes fileId from database
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'intake_context_ready',
        expect.objectContaining({
          fileMetadata: {
            fileId: 'file-uuid-123',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        })
      );
    });

    it('should NOT include storagePath in intake_context_ready event', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify storagePath is NOT in fileMetadata
      const intakeReadyCall = mockChatNamespace.emit.mock.calls.find(
        (call: any[]) => call[0] === 'intake_context_ready'
      );
      expect(intakeReadyCall).toBeDefined();
      expect(intakeReadyCall![1].fileMetadata).not.toHaveProperty('storagePath');
    });

    it('should NOT include storagePath in HTTP 202 response', async () => {
      await controller.upload(mockReq as any, mockRes as any);

      // Epic 17: Response doesn't include fileMetadata anymore (only files array with uploadIds)
      // storagePath is never exposed in HTTP responses
      const jsonMock = mockRes.json as jest.Mock;
      const response = jsonMock.mock.calls[0][0];
      expect(response).not.toHaveProperty('storagePath');
      expect(response.files[0]).not.toHaveProperty('storagePath');
    });

    it('should include fileId in scoring_parse_ready event', async () => {
      // Switch to scoring mode
      mockReq.body = {
        conversationId: 'conv-123',
        mode: 'scoring',
      };

      mockScoringParser.parseForResponses.mockResolvedValue({
        success: true,
        assessmentId: 'assess-123',
        vendorName: 'Test Vendor',
        responses: [],
        expectedQuestionCount: 0,
        isComplete: true,
        confidence: 0.9,
      });

      await controller.upload(mockReq as any, mockRes as any);

      // Wait for async processing
      await new Promise((resolve) => setImmediate(resolve));

      // Verify scoring_parse_ready includes fileId
      expect(mockChatNamespace.emit).toHaveBeenCalledWith(
        'scoring_parse_ready',
        expect.objectContaining({
          fileMetadata: {
            fileId: 'file-uuid-123',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        })
      );
    });

    // Epic 17.1.4: Multi-file upload tests
    describe('Multi-file upload', () => {
      it('should accept multiple valid files', async () => {
        const fileList = [
          createMockFile('doc1.pdf', 'application/pdf'),
          createMockFile('doc2.pdf', 'application/pdf'),
        ];

        mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
        // Epic 17: Multi-file via 'files' field name in upload.fields() format
        mockReq.files = { files: fileList };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(202);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Upload accepted',
            totalFiles: 2,
            acceptedCount: 2,
            rejectedCount: 0,
            files: expect.arrayContaining([
              expect.objectContaining({ status: 'accepted', filename: 'doc1.pdf' }),
              expect.objectContaining({ status: 'accepted', filename: 'doc2.pdf' }),
            ]),
          })
        );
      });

      it('should handle partial failures (some files rejected)', async () => {
        const fileList = [
          createMockFile('valid.pdf', 'application/pdf'),
          createMockFile('invalid.exe', 'application/x-msdownload'),
        ];

        mockFileValidator.validate
          .mockResolvedValueOnce({ valid: true, documentType: 'pdf' })
          .mockResolvedValueOnce({ valid: false, error: 'Invalid type' });

        // Epic 17: Multi-file via 'files' field name in upload.fields() format
        mockReq.files = { files: fileList };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(202); // Partial success = 202
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            acceptedCount: 1,
            rejectedCount: 1,
            files: expect.arrayContaining([
              expect.objectContaining({ status: 'accepted' }),
              expect.objectContaining({ status: 'rejected', error: 'Invalid type' }),
            ]),
          })
        );
      });

      it('should return 400 if all files rejected', async () => {
        const fileList = [
          createMockFile('bad1.exe', 'application/x-msdownload'),
          createMockFile('bad2.exe', 'application/x-msdownload'),
        ];

        mockFileValidator.validate.mockResolvedValue({ valid: false, error: 'Invalid type' });
        // Epic 17: Multi-file via 'files' field name in upload.fields() format
        mockReq.files = { files: fileList };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'All files rejected',
          })
        );
      });

      it('should generate unique uploadId per file', async () => {
        const fileList = [
          createMockFile('doc1.pdf', 'application/pdf'),
          createMockFile('doc2.pdf', 'application/pdf'),
          createMockFile('doc3.pdf', 'application/pdf'),
        ];

        mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
        // Epic 17: Multi-file via 'files' field name in upload.fields() format
        mockReq.files = { files: fileList };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        const jsonMock = mockRes.json as jest.Mock;
        const response = jsonMock.mock.calls[0][0];
        const uploadIds = response.files.map((f: any) => f.uploadId);

        // All uploadIds should be unique
        expect(new Set(uploadIds).size).toBe(uploadIds.length);
        expect(uploadIds.length).toBe(3);
      });

      it('should maintain backward compatibility with single file (using "file" field name)', async () => {
        mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
        // Epic 17: Backward compat - single file via 'file' field name in upload.fields() format
        mockReq.files = {
          file: [createMockFile('single.pdf', 'application/pdf')],
        };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(202);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            // CRITICAL: Top-level uploadId for Epic 16 clients
            uploadId: expect.any(String),
            totalFiles: 1,
            acceptedCount: 1,
          })
        );

        // Epic 16 clients read response.uploadId directly
        const response = (mockRes.json as jest.Mock).mock.calls[0][0];
        expect(response.uploadId).toBeDefined();
        expect(typeof response.uploadId).toBe('string');
      });

      it('should reject request when both "file" and "files" fields are provided', async () => {
        mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
        // Both field names provided - ambiguous intent, should reject
        mockReq.files = {
          file: [createMockFile('single.pdf', 'application/pdf')],
          files: [createMockFile('multi1.pdf', 'application/pdf')],
        };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.stringContaining('Cannot use both'),
          })
        );
      });

      it('should validate conversation ownership once, not per-file', async () => {
        const fileList = [
          createMockFile('doc1.pdf', 'application/pdf'),
          createMockFile('doc2.pdf', 'application/pdf'),
          createMockFile('doc3.pdf', 'application/pdf'),
        ];

        mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
        // Epic 17: Multi-file via 'files' field name in upload.fields() format
        mockReq.files = { files: fileList };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        await controller.upload(mockReq as any, mockRes as any);

        // Conversation lookup should happen exactly once
        expect(mockConversationService.getConversation).toHaveBeenCalledTimes(1);
      });

      it('should return 202 immediately without waiting for parsing', async () => {
        const fileList = [createMockFile('slow.pdf', 'application/pdf')];

        mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
        // Epic 17: Multi-file via 'files' field name in upload.fields() format
        mockReq.files = { files: fileList };
        mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

        // Response should be sent before async processing completes
        await controller.upload(mockReq as any, mockRes as any);

        expect(mockRes.status).toHaveBeenCalledWith(202);
        // The async processing happens after this point (fire-and-forget)
      });
    });
  });

  describe('download', () => {
    beforeEach(() => {
      mockReq = {
        user: { id: 'user-123', email: 'test@example.com', role: 'user' } as any,
        params: { fileId: 'file-uuid-123' },
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        send: jest.fn(),
      };
    });

    it('should reject unauthenticated request', async () => {
      mockReq.user = undefined;

      await controller.download(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    it('should reject missing fileId', async () => {
      mockReq.params = {};

      await controller.download(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing required parameter: fileId' });
    });

    it('should return 404 if file not found', async () => {
      mockFileRepository.findByIdAndUser.mockResolvedValue(null);

      await controller.download(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 404 if file belongs to different user', async () => {
      mockFileRepository.findByIdAndUser.mockResolvedValue(null);

      await controller.download(mockReq as any, mockRes as any);

      expect(mockFileRepository.findByIdAndUser).toHaveBeenCalledWith('file-uuid-123', 'user-123');
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should stream file with correct headers on success', async () => {
      const fileBuffer = Buffer.from('test');
      mockFileStorage.retrieve.mockResolvedValue(fileBuffer);

      await controller.download(mockReq as any, mockRes as any);

      expect(mockFileRepository.findByIdAndUser).toHaveBeenCalledWith('file-uuid-123', 'user-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledWith('/uploads/test.pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="test.pdf"');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', fileBuffer.length);
      expect(mockRes.send).toHaveBeenCalledWith(fileBuffer);
    });

    it('should handle DOCX files with correct MIME type', async () => {
      const docxBuffer = Buffer.from('docx content');
      mockFileRepository.findByIdAndUser.mockResolvedValue({
        id: 'file-uuid-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        filename: 'document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
        storagePath: '/uploads/document.docx',
        createdAt: new Date(),
      });
      mockFileStorage.retrieve.mockResolvedValue(docxBuffer);

      await controller.download(mockReq as any, mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="document.docx"');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', docxBuffer.length);
      expect(mockRes.send).toHaveBeenCalledWith(docxBuffer);
    });

    it('should return 500 on storage retrieval error', async () => {
      mockFileStorage.retrieve.mockRejectedValue(new Error('Storage error'));

      await controller.download(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to retrieve file' });
    });
  });
});

describe('buildContentDisposition', () => {
  describe('header injection prevention', () => {
    it('should strip newline characters', () => {
      const result = buildContentDisposition('file\nname.pdf');
      expect(result).toBe('attachment; filename="filename.pdf"');
      expect(result).not.toContain('\n');
    });

    it('should strip carriage return characters', () => {
      const result = buildContentDisposition('file\rname.pdf');
      expect(result).toBe('attachment; filename="filename.pdf"');
      expect(result).not.toContain('\r');
    });

    it('should strip CRLF injection attempts', () => {
      const result = buildContentDisposition('file\r\nX-Injected: header\r\n.pdf');
      // Colons are preserved (safe), only control chars stripped
      expect(result).toBe('attachment; filename="fileX-Injected: header.pdf"');
      expect(result).not.toMatch(/\r|\n/);
    });

    it('should strip tab characters', () => {
      const result = buildContentDisposition('file\tname.pdf');
      expect(result).toBe('attachment; filename="filename.pdf"');
      expect(result).not.toContain('\t');
    });
  });

  describe('special character handling', () => {
    it('should replace double quotes with underscore', () => {
      const result = buildContentDisposition('file"name.pdf');
      expect(result).toBe('attachment; filename="file_name.pdf"');
    });

    it('should replace backslashes with underscore', () => {
      const result = buildContentDisposition('file\\name.pdf');
      expect(result).toBe('attachment; filename="file_name.pdf"');
    });

    it('should handle multiple special characters', () => {
      const result = buildContentDisposition('file"with\\quotes.pdf');
      expect(result).toBe('attachment; filename="file_with_quotes.pdf"');
    });
  });

  describe('non-ASCII character handling', () => {
    it('should use RFC 5987 encoding for non-ASCII filenames', () => {
      const result = buildContentDisposition('文档.pdf');
      // Should have both ASCII fallback and UTF-8 encoded version
      expect(result).toContain('filename="');
      expect(result).toContain("filename*=UTF-8''");
      expect(result).toContain('%E6%96%87%E6%A1%A3.pdf');
    });

    it('should handle mixed ASCII and non-ASCII', () => {
      const result = buildContentDisposition('report_日本語.pdf');
      expect(result).toContain("filename*=UTF-8''");
    });
  });

  describe('edge cases', () => {
    it('should handle empty filename', () => {
      const result = buildContentDisposition('');
      expect(result).toBe('attachment; filename="download"');
    });

    it('should handle filename with only dots', () => {
      const result = buildContentDisposition('.');
      expect(result).toBe('attachment; filename="download"');
    });

    it('should truncate very long filenames', () => {
      const longName = 'a'.repeat(250) + '.pdf';
      const result = buildContentDisposition(longName);
      // Should be truncated to ~200 chars + extension
      expect(result.length).toBeLessThan(250);
      expect(result).toContain('.pdf');
    });

    it('should preserve normal filenames unchanged', () => {
      const result = buildContentDisposition('normal-file_name.pdf');
      expect(result).toBe('attachment; filename="normal-file_name.pdf"');
    });

    it('should preserve spaces in filenames', () => {
      const result = buildContentDisposition('my document.pdf');
      expect(result).toBe('attachment; filename="my document.pdf"');
    });
  });
});
