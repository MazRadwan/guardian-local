/**
 * Document Routes
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Follows existing route pattern: createXxxRoutes(controller, authService)
 */

import { Router } from 'express';
import multer from 'multer';
import { DocumentUploadController } from '../controllers/DocumentUploadController.js';
import { AuthService } from '../../../application/services/AuthService.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

// Configure multer for memory storage (buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
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

export function createDocumentRoutes(
  controller: DocumentUploadController,
  authService: AuthService
): Router {
  const router = Router();

  /**
   * POST /api/documents/upload
   * Upload a document for parsing
   *
   * Body (multipart/form-data):
   * - file: Document file (PDF, DOCX, PNG, JPEG)
   * - conversationId: string
   * - mode: 'intake' | 'scoring'
   *
   * Returns: 202 Accepted with uploadId
   * Progress events sent via WebSocket
   */
  router.post(
    '/upload',
    authMiddleware(authService),
    upload.single('file'),
    controller.upload
  );

  /**
   * GET /api/documents/download
   * Download a previously uploaded file
   *
   * Epic 16.6.8: File download for chat attachments
   *
   * Query params:
   * - path: Base64-encoded storage path
   * - filename: Original filename for Content-Disposition header
   *
   * Returns: File binary with appropriate Content-Type
   */
  router.get('/download', authMiddleware(authService), controller.download);

  return router;
}
