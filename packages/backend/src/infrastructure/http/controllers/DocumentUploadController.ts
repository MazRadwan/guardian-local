/**
 * DocumentUploadController - HTTP controller for file uploads
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Architecture:
 * - HTTP POST for file upload (multer handles multipart)
 * - WebSocket for parsing progress events
 * - Conversation ownership validated before processing
 */

import { Request, Response } from 'express';
import { Namespace } from 'socket.io';
import { IFileStorage } from '../../../application/interfaces/IFileStorage.js';
import { FileValidationService } from '../../../application/services/FileValidationService.js';
import { IIntakeDocumentParser } from '../../../application/interfaces/IIntakeDocumentParser.js';
import { IScoringDocumentParser } from '../../../application/interfaces/IScoringDocumentParser.js';
import { IConversationRepository } from '../../../application/interfaces/IConversationRepository.js';
import { DocumentMetadata } from '../../../application/interfaces/IDocumentParser.js';
import { User } from '../../../domain/entities/User.js';

/**
 * Authenticated request - matches existing auth middleware pattern
 * Auth middleware sets req.user (full User object), not req.userId
 */
interface AuthenticatedRequest extends Request {
  user?: User;
  file?: Express.Multer.File;
}

export class DocumentUploadController {
  constructor(
    private readonly fileStorage: IFileStorage,
    private readonly fileValidator: FileValidationService,
    private readonly intakeParser: IIntakeDocumentParser,
    private readonly scoringParser: IScoringDocumentParser,
    private readonly conversationRepository: IConversationRepository,
    /** Must be the /chat namespace, not base io - clients connect to /chat */
    private readonly chatNamespace: Namespace
  ) {}

  /**
   * POST /api/documents/upload
   *
   * Body (multipart/form-data):
   * - file: The document file
   * - conversationId: Associated conversation
   * - mode: 'intake' | 'scoring'
   */
  upload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Auth middleware sets req.user (full User object)
    const userId = req.user?.id;
    const { conversationId, mode } = req.body;
    const file = req.file;

    // 1. Validate authentication (should be set by authMiddleware)
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // 2. Validate required fields
    if (!conversationId || !mode || !file) {
      res.status(400).json({
        error: 'Missing required fields: conversationId, mode, file',
      });
      return;
    }

    if (!['intake', 'scoring'].includes(mode)) {
      res.status(400).json({ error: 'Invalid mode. Must be "intake" or "scoring"' });
      return;
    }

    // 3. SECURITY: Validate conversation ownership
    try {
      const conversation = await this.conversationRepository.findById(conversationId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (conversation.userId !== userId) {
        console.warn(
          `[DocumentUpload] SECURITY: User ${userId} attempted upload to conversation ${conversationId} owned by ${conversation.userId}`
        );
        res.status(403).json({ error: 'You do not have access to this conversation' });
        return;
      }
    } catch (error) {
      console.error('[DocumentUpload] Conversation validation error:', error);
      res.status(500).json({ error: 'Failed to validate conversation' });
      return;
    }

    // 4. Validate file (full validation with magic bytes)
    const validation = await this.fileValidator.validate(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // 5. Return upload accepted, process async
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    res.status(202).json({
      message: 'Upload accepted, processing started',
      uploadId,
      conversationId,
    });

    // 6. Process async with WebSocket progress events
    this.processUpload(uploadId, userId, conversationId, mode, file, validation.documentType!);
  };

  /**
   * Process upload asynchronously with WebSocket progress updates
   */
  private async processUpload(
    uploadId: string,
    userId: string,
    conversationId: string,
    mode: 'intake' | 'scoring',
    file: Express.Multer.File,
    documentType: string
  ): Promise<void> {
    const socketRoom = `user:${userId}`;

    try {
      // Emit: storing
      this.emitProgress(socketRoom, conversationId, uploadId, 30, 'storing', 'Storing file...');

      // Store file
      const storagePath = await this.fileStorage.store(file.buffer, {
        filename: file.originalname,
        mimeType: file.mimetype,
        userId,
        conversationId,
      });

      // Build metadata (storagePath is internal-only, never emitted to client)
      const metadata: DocumentMetadata = {
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        documentType: documentType as 'pdf' | 'docx' | 'image',
        storagePath,
        uploadedAt: new Date(),
        uploadedBy: userId,
      };

      // Emit: parsing
      this.emitProgress(socketRoom, conversationId, uploadId, 50, 'parsing', 'Analyzing document...');

      // Parse based on mode - track success and error for correct stage emission
      let parseResult: { success: boolean; error?: string };
      if (mode === 'intake') {
        parseResult = await this.parseForIntake(socketRoom, file.buffer, metadata, conversationId, uploadId);
      } else {
        parseResult = await this.parseForScoring(socketRoom, file.buffer, metadata, conversationId, uploadId);
      }

      // Emit final stage based on parse result
      if (parseResult.success) {
        this.emitProgress(socketRoom, conversationId, uploadId, 100, 'complete', 'Document processed successfully');
      } else {
        // Parser failed - emit error stage with specific error message
        // Note: *_ready event with success:false was already emitted by parser
        this.emitProgress(
          socketRoom,
          conversationId,
          uploadId,
          0,
          'error',
          'Document parsing failed',
          parseResult.error
        );
      }

    } catch (error) {
      console.error('[DocumentUpload] Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Emit progress error
      this.emitProgress(
        socketRoom,
        conversationId,
        uploadId,
        0,
        'error',
        'Processing failed',
        errorMessage
      );

      // IMPORTANT: Also emit the *_ready event with success: false
      // This ensures clients have a consistent contract for completion
      if (mode === 'intake') {
        this.chatNamespace.to(socketRoom).emit('intake_context_ready', {
          conversationId,
          uploadId,
          success: false,
          context: null,
          error: errorMessage,
        });
      } else {
        this.chatNamespace.to(socketRoom).emit('scoring_parse_ready', {
          conversationId,
          uploadId,
          success: false,
          assessmentId: null,
          error: errorMessage,
        });
      }
    }
  }

  /**
   * Parse document for intake context
   * @returns { success: boolean, error?: string } - parse result with error details
   */
  private async parseForIntake(
    socketRoom: string,
    buffer: Buffer,
    metadata: DocumentMetadata,
    conversationId: string,
    uploadId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.intakeParser.parseForContext(buffer, metadata, {
      conversationId,
    });

    if (result.success && result.context) {
      this.chatNamespace.to(socketRoom).emit('intake_context_ready', {
        conversationId,
        uploadId,
        success: true,
        context: {
          vendorName: result.context.vendorName,
          solutionName: result.context.solutionName,
          solutionType: result.context.solutionType,
          industry: result.context.industry,
          features: result.context.features,
          claims: result.context.claims,
          complianceMentions: result.context.complianceMentions,
        },
        suggestedQuestions: result.suggestedQuestions,
        coveredCategories: result.coveredCategories,
        gapCategories: result.gapCategories,
        confidence: result.confidence,
      });
      return { success: true };
    } else {
      const errorMessage = result.error || 'Failed to extract context from document';
      this.chatNamespace.to(socketRoom).emit('intake_context_ready', {
        conversationId,
        uploadId,
        success: false,
        context: null,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Parse document for scoring responses
   * @returns { success: boolean, error?: string } - parse result with error details
   */
  private async parseForScoring(
    socketRoom: string,
    buffer: Buffer,
    metadata: DocumentMetadata,
    conversationId: string,
    uploadId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.scoringParser.parseForResponses(buffer, metadata, {
      conversationId,
    });

    if (result.success && result.assessmentId) {
      this.chatNamespace.to(socketRoom).emit('scoring_parse_ready', {
        conversationId,
        uploadId,
        success: true,
        assessmentId: result.assessmentId,
        vendorName: result.vendorName,
        responseCount: result.responses.length,
        expectedCount: result.expectedQuestionCount,
        isComplete: result.isComplete,
        confidence: result.confidence,
      });
      return { success: true };
    } else {
      const errorMessage = result.error || 'Failed to extract responses. Ensure this is a Guardian-exported questionnaire.';
      this.chatNamespace.to(socketRoom).emit('scoring_parse_ready', {
        conversationId,
        uploadId,
        success: false,
        assessmentId: null,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Emit progress update via WebSocket (on /chat namespace)
   */
  private emitProgress(
    socketRoom: string,
    conversationId: string,
    uploadId: string,
    progress: number,
    stage: 'storing' | 'parsing' | 'complete' | 'error',
    message: string,
    error?: string
  ): void {
    this.chatNamespace.to(socketRoom).emit('upload_progress', {
      conversationId,
      uploadId,
      progress,
      stage,
      message,
      error,
    });
  }
}
