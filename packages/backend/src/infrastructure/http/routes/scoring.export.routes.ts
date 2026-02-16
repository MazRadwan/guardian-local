/**
 * Scoring Export Routes
 *
 * API endpoints for exporting scoring reports
 */

import { Router } from 'express';
import { ScoringExportController } from '../controllers/ScoringExportController';
import { AuthService } from '../../../application/services/AuthService';
import { authMiddleware } from '../middleware/auth.middleware';

export function createScoringExportRoutes(
  controller: ScoringExportController,
  authService: AuthService
): Router {
  const router = Router();

  /**
   * @route   GET /api/export/scoring/:assessmentId/pdf
   * @desc    Export scoring report to PDF
   * @access  Protected
   */
  router.get(
    '/:assessmentId/pdf',
    authMiddleware(authService),
    controller.exportToPDF
  );

  /**
   * @route   GET /api/export/scoring/:assessmentId/word
   * @desc    Export scoring report to Word (.docx)
   * @access  Protected
   */
  router.get(
    '/:assessmentId/word',
    authMiddleware(authService),
    controller.exportToWord
  );

  /**
   * @route   GET /api/export/scoring/:assessmentId/excel
   * @desc    Export scoring report to Excel (.xlsx)
   * @access  Protected
   */
  router.get(
    '/:assessmentId/excel',
    authMiddleware(authService),
    controller.exportToExcel
  );

  return router;
}
