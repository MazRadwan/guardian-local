/**
 * Assessment Routes
 *
 * Defines HTTP routes for assessment operations
 */

import { Router } from 'express'
import { AssessmentController } from '../controllers/AssessmentController'
import { authMiddleware } from '../middleware/auth.middleware'

export function createAssessmentRoutes(
  controller: AssessmentController
): Router {
  const router = Router()

  // All routes require authentication
  router.use(authMiddleware)

  // POST /api/assessments - Create assessment
  router.post('/', controller.createAssessment)

  // GET /api/assessments - List assessments
  router.get('/', controller.listAssessments)

  // GET /api/assessments/:id - Get assessment by ID
  router.get('/:id', controller.getAssessment)

  // PATCH /api/assessments/:id/status - Update assessment status
  router.patch('/:id/status', controller.updateAssessmentStatus)

  // DELETE /api/assessments/:id - Delete assessment
  router.delete('/:id', controller.deleteAssessment)

  return router
}
