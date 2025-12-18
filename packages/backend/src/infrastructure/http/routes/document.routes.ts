/**
 * Document Routes
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Follows existing route pattern: createXxxRoutes(controller, authService)
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DocumentUploadController } from '../controllers/DocumentUploadController.js';
import { AuthService } from '../../../application/services/AuthService.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

// Epic 17.1.1: Multi-file upload configuration
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total per request

// Configure multer for memory storage (buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    // Allow PDF, DOCX, and images
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * Epic 17.1.1: Validate total upload size across all files
 * Middleware to enforce MAX_TOTAL_SIZE limit
 * Handles both upload.fields() structure and upload.array() structure
 */
const validateTotalSize = (req: Request, res: Response, next: NextFunction): void => {
  // Handle both upload.fields() (object) and upload.array() (array) structures
  let files: Express.Multer.File[] = [];
  if (req.files) {
    if (Array.isArray(req.files)) {
      files = req.files;
    } else {
      // upload.fields() returns { [fieldname]: File[] }
      files = Object.values(req.files).flat();
    }
  }

  if (files.length > 0) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      res.status(400).json({
        error: `Total upload size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds limit (${MAX_TOTAL_SIZE / 1024 / 1024}MB)`,
      });
      return;
    }
  }
  next();
};

/**
 * Epic 17: Multer error handler middleware
 * Converts Multer errors to user-friendly JSON responses
 */
const multerErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      LIMIT_FILE_COUNT: `Maximum ${MAX_FILES} files allowed`,
      LIMIT_UNEXPECTED_FILE: 'Unexpected field name. Use "file" for single or "files" for multiple.',
    };
    res.status(400).json({
      error: messages[err.code] || err.message,
      code: err.code,
    });
    return;
  }
  // Non-Multer errors (e.g., unsupported file type from fileFilter)
  if (err.message?.includes('Unsupported file type')) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
};

export function createDocumentRoutes(
  controller: DocumentUploadController,
  authService: AuthService
): Router {
  const router = Router();

  /**
   * POST /api/documents/upload
   * Upload documents for parsing (Epic 17: Multi-file support)
   *
   * Body (multipart/form-data):
   * - file: Single document (backward compatible) - field name 'file'
   * - files: Multiple documents - field name 'files', max 10 files
   * - conversationId: string
   * - mode: 'intake' | 'scoring'
   *
   * Returns: 202 Accepted with uploadId array (one per file)
   * Progress events sent via WebSocket (per-file)
   *
   * Limits:
   * - Max files: 10 total (combined 'file' + 'files')
   * - Max file size: 20MB per file
   * - Max total size: 50MB per request
   *
   * Backward compatible: Both 'file' (single) and 'files' (multi) field names supported
   */
  router.post(
    '/upload',
    authMiddleware(authService),
    // Epic 17: Support both field names for backward compatibility
    // - 'file': Legacy single-file uploads (Epic 16 clients)
    // - 'files': New multi-file uploads (Epic 17 clients)
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'files', maxCount: MAX_FILES },
    ]),
    multerErrorHandler,
    validateTotalSize,
    controller.upload
  );

  /**
   * GET /api/documents/:fileId/download
   * Download a previously uploaded file
   *
   * Epic 16.6.9: Secure file download using fileId
   *
   * Path params:
   * - fileId: Database UUID of the file
   *
   * Returns: File binary with appropriate Content-Type
   */
  router.get('/:fileId/download', authMiddleware(authService), controller.download);

  return router;
}
