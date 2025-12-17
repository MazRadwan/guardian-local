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
import { IIntakeDocumentParser, IntakeContext } from '../../../application/interfaces/IIntakeDocumentParser.js';
import { IScoringDocumentParser } from '../../../application/interfaces/IScoringDocumentParser.js';
import { ConversationService } from '../../../application/services/ConversationService.js';
import { DocumentMetadata } from '../../../application/interfaces/IDocumentParser.js';
import { User } from '../../../domain/entities/User.js';
import { IFileRepository } from '../../../application/interfaces/IFileRepository.js';

/**
 * Sanitize filename for use in Content-Disposition header.
 * Prevents header injection attacks and handles special characters.
 *
 * @param filename - Original filename from database
 * @returns Sanitized filename safe for HTTP headers
 */
function sanitizeFilenameForHeader(filename: string): string {
  // 1. Remove control characters (prevents header injection)
  //    Includes: \r, \n, \t, and other ASCII control chars (0x00-0x1F, 0x7F)
  let sanitized = filename.replace(/[\x00-\x1F\x7F]/g, '');

  // 2. Remove/escape characters that break Content-Disposition syntax
  //    Double quotes and backslashes need escaping or removal
  sanitized = sanitized.replace(/["\\]/g, '_');

  // 3. Limit length to prevent header overflow (255 is common filesystem limit)
  if (sanitized.length > 200) {
    const ext = sanitized.slice(sanitized.lastIndexOf('.'));
    const base = sanitized.slice(0, 200 - ext.length);
    sanitized = base + ext;
  }

  // 4. Fallback if filename becomes empty
  if (!sanitized || sanitized === '.') {
    sanitized = 'download';
  }

  return sanitized;
}

/**
 * Build Content-Disposition header value with proper encoding.
 * Uses RFC 5987 filename* for non-ASCII characters.
 *
 * @param filename - Original filename
 * @returns Header value string
 */
export function buildContentDisposition(filename: string): string {
  const sanitized = sanitizeFilenameForHeader(filename);

  // Check if filename contains non-ASCII characters
  const hasNonAscii = /[^\x20-\x7E]/.test(sanitized);

  if (hasNonAscii) {
    // RFC 5987: Use filename* with UTF-8 encoding for non-ASCII
    const encoded = encodeURIComponent(sanitized).replace(/'/g, '%27');
    return `attachment; filename="${sanitized.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encoded}`;
  }

  return `attachment; filename="${sanitized}"`;
}

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
    /** ConversationService for ownership validation + saving assistant messages */
    private readonly conversationService: ConversationService,
    /** Must be the /chat namespace, not base io - clients connect to /chat */
    private readonly chatNamespace: Namespace,
    /** FileRepository for registering uploaded files (Epic 16.6.9) */
    private readonly fileRepository: IFileRepository
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

    // 3. SECURITY: Validate conversation ownership (via service layer)
    try {
      const conversation = await this.conversationService.getConversation(conversationId);
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
    // Epic 16.6.9: Generate uploadId for progress tracking
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    res.status(202).json({
      message: 'Upload accepted, processing started',
      uploadId,
      conversationId,
      // Epic 16.6.9: Partial file metadata (fileId comes from database after storage)
      fileMetadata: {
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
    });

    // 6. Process async with WebSocket progress events
    // Epic 16.6.9: fileId generated after file is stored and registered in database
    this.processUpload(uploadId, userId, conversationId, mode, file, validation.documentType!);
  };

  /**
   * Process upload asynchronously with WebSocket progress updates
   * Epic 16.6.9: Creates file record in database after storage, uses UUID as fileId
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

      // Epic 16.6.9: Register file in database after storage
      const fileRecord = await this.fileRepository.create({
        userId,
        conversationId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
      });

      // Use database UUID as fileId
      const fileId = fileRecord.id;

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
      // Epic 16.6.9: Pass fileId (database UUID) for attachment metadata
      let parseResult: { success: boolean; error?: string };
      if (mode === 'intake') {
        parseResult = await this.parseForIntake(socketRoom, file.buffer, metadata, conversationId, uploadId, fileId);
      } else {
        parseResult = await this.parseForScoring(socketRoom, file.buffer, metadata, conversationId, uploadId, fileId);
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
   *
   * Epic 16.6.1: Silent context storage (no visible assistant message)
   * - Store context in conversation.context using existing updateContext()
   * - Emit 'intake_context_ready' for UI state updates only
   * - Claude sees context via synthetic message injection in ChatServer
   *
   * Epic 16.6.9: File metadata includes fileId (database UUID), NOT storagePath
   *
   * @returns { success: boolean, error?: string } - parse result with error details
   */
  private async parseForIntake(
    socketRoom: string,
    buffer: Buffer,
    metadata: DocumentMetadata,
    conversationId: string,
    uploadId: string,
    fileId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.intakeParser.parseForContext(buffer, metadata, {
      conversationId,
    });

    if (result.success && result.context) {
      // Epic 16.6.1: Store context silently (NOT as a visible message)
      // Uses existing ConversationService.updateContext() - merges with existing context
      await this.conversationService.updateContext(conversationId, {
        intakeContext: {
          vendorName: result.context.vendorName,
          solutionName: result.context.solutionName,
          solutionType: result.context.solutionType,
          industry: result.context.industry,
          features: result.context.features,
          claims: result.context.claims,
          complianceMentions: result.context.complianceMentions,
        },
        intakeGapCategories: result.gapCategories,
        intakeParsedAt: new Date().toISOString(),
      });

      // Emit 'intake_context_ready' for UI state updates
      // Epic 16.6.9: File metadata includes fileId (database UUID), NOT storagePath
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
        // Epic 16.6.9: File metadata for message attachment (NO storagePath)
        fileMetadata: {
          fileId,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          size: metadata.sizeBytes,
        },
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
   * Epic 16.6.9: File metadata includes fileId (database UUID), NOT storagePath
   * @returns { success: boolean, error?: string } - parse result with error details
   */
  private async parseForScoring(
    socketRoom: string,
    buffer: Buffer,
    metadata: DocumentMetadata,
    conversationId: string,
    uploadId: string,
    fileId: string
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
        // Epic 16.6.9: File metadata for message attachment (NO storagePath)
        fileMetadata: {
          fileId,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          size: metadata.sizeBytes,
        },
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

  /**
   * GET /api/documents/:fileId/download
   * Download a previously uploaded file
   *
   * Epic 16.6.9: Secure download endpoint using fileId and database lookup
   *
   * Path params:
   * - fileId: Database UUID of the file
   *
   * Security: Validates file exists and belongs to authenticated user via database lookup
   */
  download = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const { fileId } = req.params;

    // 1. Validate authentication
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // 2. Validate required params
    if (!fileId) {
      res.status(400).json({ error: 'Missing required parameter: fileId' });
      return;
    }

    // 3. Look up file by ID and user (authorization check)
    const file = await this.fileRepository.findByIdAndUser(fileId, userId);
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // 4. Retrieve file from storage
    try {
      const buffer = await this.fileStorage.retrieve(file.storagePath);

      // Set headers for download (sanitized to prevent header injection)
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', buildContentDisposition(file.filename));
      res.setHeader('Content-Length', buffer.length);

      res.send(buffer);
    } catch (error) {
      console.error('[DocumentUploadController] Download error:', error);
      res.status(500).json({ error: 'Failed to retrieve file' });
    }
  };
}
