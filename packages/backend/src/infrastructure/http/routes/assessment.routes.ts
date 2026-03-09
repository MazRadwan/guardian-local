/**
 * Assessment Routes
 *
 * Defines HTTP routes for assessment operations
 */

import { Router } from 'express'
import { AssessmentController } from '../controllers/AssessmentController.js'
import { AuthService } from '../../../application/services/AuthService.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { analystOrAdmin, adminOnly } from '../middleware/role.middleware.js'

export function createAssessmentRoutes(
  controller: AssessmentController,
  authService: AuthService
): Router {
  const router = Router()

  // All routes require authentication
  router.use(authMiddleware(authService))

  // GET /api/assessments/status - Check if user has exported assessments (must be before /:id)
  router.get('/status', controller.getAssessmentStatus)

  // POST /api/assessments - Create assessment (analyst/admin only)
  router.post('/', analystOrAdmin(), controller.createAssessment)

  // GET /api/assessments - List assessments
  router.get('/', controller.listAssessments)

  // GET /api/assessments/:id - Get assessment by ID
  router.get('/:id', controller.getAssessment)

  // PATCH /api/assessments/:id/status - Update assessment status (analyst/admin only)
  router.patch('/:id/status', analystOrAdmin(), controller.updateAssessmentStatus)

  // DELETE /api/assessments/:id - Delete assessment (admin only)
  router.delete('/:id', adminOnly(), controller.deleteAssessment)

  return router
}
