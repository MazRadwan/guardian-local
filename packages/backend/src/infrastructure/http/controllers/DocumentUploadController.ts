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
import { IScoringService, ScoringInput } from '../../../application/interfaces/IScoringService.js';
import { ConversationService } from '../../../application/services/ConversationService.js';
import { DocumentMetadata } from '../../../application/interfaces/IDocumentParser.js';
import { User } from '../../../domain/entities/User.js';
import { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import { ScoringProgressEvent } from '../../../domain/scoring/types.js';
import { ITextExtractionService, ValidatedDocumentType } from '../../../application/interfaces/ITextExtractionService.js';
import { detectDocumentType, extractVendorName, DetectedDocType } from '../../extraction/DocumentClassifier.js';

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
 * Epic 17: Support both single file (req.file) and multi-file (req.files)
 */
interface AuthenticatedRequest extends Request {
  user?: User;
  file?: Express.Multer.File; // Backward compatibility (single file)
  // Multer can return files as array or object, we use array via upload.array()
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

/**
 * Epic 17.1.2: Per-file upload result for HTTP response
 */
interface FileUploadResult {
  index: number;
  filename: string;
  uploadId: string;
  status: 'accepted' | 'rejected';
  error?: string;
}

/**
 * Epic 18: file_attached event - emitted when file is stored and ready for UI display
 * Does NOT wait for Claude enrichment to complete.
 *
 * SECURITY NOTE:
 * - Event contains ONLY metadata (hasExcerpt: boolean)
 * - textExcerpt content is NEVER emitted to clients
 * - textExcerpt is used internally only for context injection
 *
 * Epic 18.4: Includes document type detection results for smart scoring UX
 */
interface FileAttachedEvent {
  conversationId: string;
  uploadId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  hasExcerpt: boolean;
  // Epic 18.4: Document classification (heuristics)
  detectedDocType: DetectedDocType | null;
  detectedVendorName: string | null;
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
    private readonly fileRepository: IFileRepository,
    /** ScoringService for auto-triggering scoring after parse (Epic 15 Sprint 5a) */
    private readonly scoringService: IScoringService | undefined,
    /** Epic 18: Text extraction service for fast context injection */
    private readonly textExtractionService: ITextExtractionService
  ) {}

  /**
   * POST /api/documents/upload
   * Epic 17.1.2: Multi-file upload with non-blocking processing
   *
   * Body (multipart/form-data):
   * - files: The document file(s) - max 10
   * - conversationId: Associated conversation
   * - mode: 'intake' | 'scoring'
   */
  upload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Auth middleware sets req.user (full User object)
    const userId = req.user?.id;
    const { conversationId, mode } = req.body;

    // Epic 17.1.2: Support both single and multi-file (backward compatible)
    // Route uses upload.fields() with both 'file' (single) and 'files' (multi) field names
    let filesArray: Express.Multer.File[] = [];
    let usedLegacyFieldName = false; // Track if Epic 16 client (uses 'file' field)

    if (req.files && !Array.isArray(req.files)) {
      // upload.fields() returns { [fieldname]: File[] }
      const reqFiles = req.files as { [fieldname: string]: Express.Multer.File[] };
      const singleFile = reqFiles['file'] || [];
      const multiFiles = reqFiles['files'] || [];

      // Reject if both field names are provided (ambiguous intent)
      if (singleFile.length > 0 && multiFiles.length > 0) {
        res.status(400).json({
          error: 'Cannot use both "file" and "files" field names. Use "file" for single upload or "files" for multiple.',
        });
        return;
      }

      // Use whichever field was provided
      if (multiFiles.length > 0) {
        filesArray = multiFiles;
      } else {
        filesArray = singleFile;
        usedLegacyFieldName = singleFile.length > 0;
      }
    } else if (Array.isArray(req.files)) {
      // Fallback for upload.array() (shouldn't happen with current route config)
      filesArray = req.files;
    }
    const files = filesArray;

    // 1. Validate authentication (should be set by authMiddleware)
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // 2. Validate required fields
    if (!conversationId || !mode || files.length === 0) {
      res.status(400).json({
        error: 'Missing required fields: conversationId, mode, files',
      });
      return;
    }

    if (!['intake', 'scoring'].includes(mode)) {
      res.status(400).json({ error: 'Invalid mode. Must be "intake" or "scoring"' });
      return;
    }

    // 3. SECURITY: Validate conversation ownership once (not per-file)
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

    // 4. Validate all files synchronously (fast - no parsing, just magic bytes)
    // Store documentType from first validation to avoid validating twice
    const results: FileUploadResult[] = [];
    const validFiles: {
      file: Express.Multer.File;
      uploadId: string;
      index: number;
      documentType: string;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Epic 17.1.2: Generate unique uploadId per file (includes index for uniqueness)
      const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;

      const validation = await this.fileValidator.validate(
        file.buffer,
        file.mimetype,
        file.originalname
      );

      if (validation.valid && validation.documentType) {
        // Store documentType to avoid re-validating in async processing
        validFiles.push({ file, uploadId, index: i, documentType: validation.documentType });
        results.push({
          index: i,
          filename: file.originalname,
          uploadId,
          status: 'accepted',
        });
      } else {
        results.push({
          index: i,
          filename: file.originalname,
          uploadId,
          status: 'rejected',
          error: validation.error,
        });
      }
    }

    // 5. Return 202 immediately (even if some rejected)
    const acceptedCount = results.filter((r) => r.status === 'accepted').length;
    const firstAcceptedUploadId = results.find((r) => r.status === 'accepted')?.uploadId;

    if (acceptedCount === 0) {
      res.status(400).json({
        error: 'All files rejected',
        files: results,
      });
      return;
    }

    // Epic 17: Response includes both legacy `uploadId` (for Epic 16 clients) and `files[]` (for Epic 17)
    // Legacy clients read `uploadId`, new clients read `files[].uploadId`
    res.status(202).json({
      message: 'Upload accepted',
      // BACKWARD COMPAT: Top-level uploadId for Epic 16 single-file clients
      // Always present when at least one file accepted (first accepted file's uploadId)
      uploadId: firstAcceptedUploadId,
      totalFiles: files.length,
      acceptedCount,
      rejectedCount: files.length - acceptedCount,
      files: results,
    });

    // 6. Process valid files async (fire-and-forget, NOT blocking)
    // CRITICAL: This happens AFTER response is sent
    // documentType is already validated and stored - no need to validate again
    for (const { file, uploadId, documentType } of validFiles) {
      this.processUpload(uploadId, userId, conversationId, mode, file, documentType)
        .catch((err) => {
          console.error(`[Upload] Async processing failed for ${file.originalname}:`, err);
          // Error already emitted via WS in processUpload
        });
    }
  };

  /**
   * Process upload asynchronously with WebSocket progress updates
   *
   * Epic 18: Two-phase upload processing (Trigger-on-Send)
   *
   * UPLOAD PHASE (this method - target: <3s):
   * 1. Store file to S3
   * 2. Extract text excerpt (for immediate context injection)
   * 3. Create file record with excerpt (parseStatus: 'pending')
   * 4. Emit file_attached - UPLOAD COMPLETE
   *
   * PARSING PHASE (Sprint 2 - triggers on user Send):
   * - Parsing/scoring happens when user clicks Send
   * - This handler does NOT do parsing
   *
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
      // =========================================
      // UPLOAD PHASE: Fast Attach (target: <3s)
      // =========================================
      // This is ALL the upload handler does. Parsing triggers on Send.

      // 1. Store file to S3
      this.emitProgress(socketRoom, conversationId, uploadId, 30, 'storing', 'Storing file...');
      const storagePath = await this.fileStorage.store(file.buffer, {
        filename: file.originalname,
        mimeType: file.mimetype,
        userId,
        conversationId,
      });

      // 2. Extract text excerpt (with timeout, for context injection)
      this.emitProgress(socketRoom, conversationId, uploadId, 60, 'storing', 'Extracting text...');
      const extraction = await this.textExtractionService.extract(
        file.buffer,
        documentType as ValidatedDocumentType
      );

      // 3. Epic 18.4: Classify document type using heuristics (<100ms, regex only)
      // This runs synchronously on the excerpt, no external API calls
      let detectedDocType: DetectedDocType | null = null;
      let detectedVendorName: string | null = null;

      if (extraction.success && extraction.excerpt.length > 0) {
        const classifyStart = Date.now();
        detectedDocType = detectDocumentType(extraction.excerpt, file.mimetype);
        detectedVendorName = extractVendorName(extraction.excerpt);
        const classifyMs = Date.now() - classifyStart;
        console.log(`[DocumentUpload] Document classified: type=${detectedDocType}, vendor=${detectedVendorName || 'none'}, ms=${classifyMs}`);
      }

      // 4. Create file record with excerpt and classification (parseStatus: 'pending')
      const fileRecord = await this.fileRepository.create({
        userId,
        conversationId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
        textExcerpt: extraction.excerpt || null,
        // Epic 18.4: Document classification
        detectedDocType,
        detectedVendorName,
        // parseStatus defaults to 'pending' in schema
      });

      const fileId = fileRecord.id;

      // 5. Emit file_attached - UPLOAD COMPLETE
      // Frontend shows "Attached", Send button enabled
      // NO parsing/scoring here - that happens on Send (Sprint 2)
      this.emitFileAttached(
        socketRoom,
        conversationId,
        uploadId,
        fileId,
        file.originalname,
        file.mimetype,
        file.size,
        extraction.success && extraction.excerpt.length > 0,
        detectedDocType,
        detectedVendorName
      );

      // =========================================
      // END OF UPLOAD HANDLER
      // =========================================
      // Parsing/scoring triggers in ChatServer.handleMessage()
      // when user clicks Send (see Sprint 2)

      // Log extraction result for debugging
      if (extraction.success) {
        console.log(`[DocumentUpload] Text extracted: ${extraction.excerpt.length} chars in ${extraction.extractionMs}ms`);
      } else {
        console.warn(`[DocumentUpload] Text extraction failed: ${extraction.error}`);
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
        'Upload failed',
        errorMessage
      );
    }
  }

  /**
   * Epic 18: Emit file_attached event
   *
   * Called after S3 storage + text extraction, marks upload phase complete.
   * Allows frontend to show "Attached" state immediately.
   *
   * SECURITY: Only emits hasExcerpt (boolean), never the excerpt content.
   * Epic 18.4: Includes document classification results for smart scoring UX.
   */
  private emitFileAttached(
    socketRoom: string,
    conversationId: string,
    uploadId: string,
    fileId: string,
    filename: string,
    mimeType: string,
    size: number,
    hasExcerpt: boolean,
    detectedDocType: DetectedDocType | null,
    detectedVendorName: string | null
  ): void {
    const event: FileAttachedEvent = {
      conversationId,
      uploadId,
      fileId,
      filename,
      mimeType,
      size,
      hasExcerpt,
      // Epic 18.4: Document classification
      detectedDocType,
      detectedVendorName,
    };

    this.chatNamespace.to(socketRoom).emit('file_attached', event);
  }

  /**
   * Parse document for intake context
   *
   * @deprecated Epic 18: This method is LEGACY and NOT called in trigger-on-send pattern.
   * Parsing now happens in ChatServer.buildFileContext() when user clicks Send.
   * Kept for reference and potential rollback - do not use in new code.
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
      // Epic 17.3.3: Store context in file row (NOT conversation row)
      // This allows multiple documents per conversation without overwriting
      await this.fileRepository.updateIntakeContext(
        fileId,
        {
          vendorName: result.context.vendorName,
          solutionName: result.context.solutionName,
          solutionType: result.context.solutionType,
          industry: result.context.industry,
          features: result.context.features,
          claims: result.context.claims,
          complianceMentions: result.context.complianceMentions,
        },
        result.gapCategories
      );

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
   * Parse document for scoring responses and auto-trigger scoring
   *
   * @deprecated Epic 18: This method is LEGACY and NOT called in trigger-on-send pattern.
   * Scoring parsing now happens in ChatServer.handleScoringModeMessage() when user clicks Send.
   * Kept for reference and potential rollback - do not use in new code.
   *
   * Epic 16.6.9: File metadata includes fileId (database UUID), NOT storagePath
   * Epic 15 Sprint 5a: Auto-trigger scoring after successful parse (no manual button click)
   * @returns { success: boolean, error?: string } - parse result with error details
   */
  private async parseForScoring(
    socketRoom: string,
    buffer: Buffer,
    metadata: DocumentMetadata,
    conversationId: string,
    uploadId: string,
    fileId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.scoringParser.parseForResponses(buffer, metadata, {
      conversationId,
    });

    if (result.success && result.assessmentId) {
      // Emit parse ready event first
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

      // Epic 15 Sprint 5a: Auto-trigger scoring (no manual approval required)
      if (this.scoringService) {
        console.log(`[DocumentUpload] Auto-triggering scoring: assessmentId=${result.assessmentId}, fileId=${fileId}, userId=${userId}`);
        try {
          await this.runScoring(socketRoom, conversationId, result.assessmentId, fileId, userId);
          console.log(`[DocumentUpload] Scoring auto-trigger completed successfully`);
        } catch (scoringError) {
          console.error(`[DocumentUpload] Scoring auto-trigger failed:`, scoringError);
          // The error is already handled in runScoring, but log it here too
        }
      } else {
        console.warn('[DocumentUpload] ScoringService not configured - scoring not auto-triggered');
      }

      return { success: true };
    } else {
      // Provide clear, actionable error message for common failure cases
      let errorMessage: string;
      if (result.error?.includes('Assessment ID') || result.error?.includes('assessmentId') || !result.assessmentId) {
        errorMessage = 'This document doesn\'t appear to be a Guardian questionnaire. Only questionnaires exported from Guardian (with an embedded Assessment ID) can be scored. Did you mean to upload a different file, or switch to a different mode?';
      } else {
        errorMessage = result.error || 'Failed to extract responses. Please ensure this is a completed Guardian questionnaire.';
      }
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
   * Run scoring workflow and emit events to room
   * Epic 15 Sprint 5a: Auto-triggered after successful document parse
   */
  private async runScoring(
    socketRoom: string,
    conversationId: string,
    assessmentId: string,
    fileId: string,
    userId: string
  ): Promise<void> {
    if (!this.scoringService) {
      console.warn('[DocumentUpload] runScoring called but scoringService is null');
      return;
    }

    console.log(`[DocumentUpload] runScoring START: socketRoom=${socketRoom}, conversationId=${conversationId}, assessmentId=${assessmentId}`);

    try {
      // Emit scoring_started
      console.log(`[DocumentUpload] Emitting scoring_started event`);
      this.chatNamespace.to(socketRoom).emit('scoring_started', {
        assessmentId,
        fileId,
        conversationId,
      });

      // Build scoring input
      const scoringInput: ScoringInput = {
        assessmentId,
        conversationId,
        fileId,
        userId,
      };

      // Call scoring service with progress callback
      console.log(`[DocumentUpload] Calling scoringService.score() with input:`, scoringInput);
      const scoringResult = await this.scoringService.score(scoringInput, (event: ScoringProgressEvent) => {
        console.log(`[DocumentUpload] Scoring progress: ${event.status} - ${event.message}`);
        this.chatNamespace.to(socketRoom).emit('scoring_progress', {
          conversationId,
          status: event.status,
          message: event.message,
          progress: event.progress,
        });
      });

      if (scoringResult.success && scoringResult.report) {
        // Build result data for frontend
        const resultData = {
          compositeScore: scoringResult.report.payload.compositeScore,
          recommendation: scoringResult.report.payload.recommendation,
          overallRiskRating: scoringResult.report.payload.overallRiskRating,
          executiveSummary: scoringResult.report.payload.executiveSummary,
          keyFindings: scoringResult.report.payload.keyFindings,
          dimensionScores: scoringResult.report.payload.dimensionScores.map(ds => ({
            dimension: ds.dimension,
            score: ds.score,
            riskRating: ds.riskRating,
          })),
          batchId: scoringResult.batchId,
          assessmentId,
        };

        // Emit scoring complete with results
        this.chatNamespace.to(socketRoom).emit('scoring_complete', {
          conversationId,
          result: resultData,
          narrativeReport: scoringResult.report.narrativeReport,
        });

        // Save narrative report as assistant message with scoring_result component
        // The component embeds scoring data directly in the message for persistence
        const narrativeText = scoringResult.report.narrativeReport ||
          `Risk assessment complete. Composite score: ${scoringResult.report.payload.compositeScore}/100. ` +
          `Overall risk: ${scoringResult.report.payload.overallRiskRating}. ` +
          `Recommendation: ${scoringResult.report.payload.recommendation}.`;

        // Embed scoring result as component - survives page refresh via message history
        const scoringComponent = {
          type: 'scoring_result' as const,
          data: resultData,
        };

        const reportMessage = await this.conversationService.sendMessage({
          conversationId,
          role: 'assistant',
          content: {
            text: narrativeText,
            components: [scoringComponent],
          },
        });

        // Emit the message for display (include components)
        this.chatNamespace.to(socketRoom).emit('message', {
          id: reportMessage.id,
          conversationId: reportMessage.conversationId,
          role: reportMessage.role,
          content: reportMessage.content,
          components: [scoringComponent],
          createdAt: reportMessage.createdAt,
        });

        console.log(`[DocumentUpload] Scoring complete: assessmentId=${assessmentId}, score=${scoringResult.report.payload.compositeScore}`);
      } else {
        // Scoring failed - emit structured error
        this.chatNamespace.to(socketRoom).emit('scoring_error', {
          conversationId,
          error: scoringResult.error || 'Scoring failed',
          code: scoringResult.code || 'SCORING_FAILED',
        });

        // Save error message
        await this.conversationService.sendMessage({
          conversationId,
          role: 'system',
          content: { text: `[System: Scoring failed - ${scoringResult.error || 'Unknown error'}]` },
        });
      }
    } catch (error) {
      console.error('[DocumentUpload] Error in scoring:', error);
      this.chatNamespace.to(socketRoom).emit('scoring_error', {
        conversationId,
        error: error instanceof Error ? error.message : 'Scoring failed',
        code: 'SCORING_FAILED',
      });
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
