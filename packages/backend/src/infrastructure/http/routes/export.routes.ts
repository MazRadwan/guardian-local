/**
 * Export Routes
 *
 * API endpoints for exporting assessment questionnaires
 */

import { Router } from 'express'
import { ExportController } from '../controllers/ExportController'
import { AuthService } from '../../../application/services/AuthService'
import { authMiddleware } from '../middleware/auth.middleware'

export function createExportRoutes(
  exportController: ExportController,
  authService: AuthService
): Router {
  const router = Router()

  /**
   * @route   GET /api/assessments/:id/export/pdf
   * @desc    Export assessment questionnaire to PDF
   * @access  Protected
   */
  router.get(
    '/:id/export/pdf',
    authMiddleware(authService),
    exportController.exportToPDF
  )

  /**
   * @route   GET /api/assessments/:id/export/word
   * @desc    Export assessment questionnaire to Word (.docx)
   * @access  Protected
   */
  router.get(
    '/:id/export/word',
    authMiddleware(authService),
    exportController.exportToWord
  )

  /**
   * @route   GET /api/assessments/:id/export/excel
   * @desc    Export assessment questionnaire to Excel (.xlsx)
   * @access  Protected
   */
  router.get(
    '/:id/export/excel',
    authMiddleware(authService),
    exportController.exportToExcel
  )

  return router
}
