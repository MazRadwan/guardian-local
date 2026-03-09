/**
 * Vendor Routes
 *
 * Defines HTTP routes for vendor operations
 */

import { Router } from 'express'
import { VendorController } from '../controllers/VendorController.js'
import { AuthService } from '../../../application/services/AuthService.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { analystOrAdmin } from '../middleware/role.middleware.js'

export function createVendorRoutes(
  controller: VendorController,
  authService: AuthService
): Router {
  const router = Router()

  // All routes require authentication
  router.use(authMiddleware(authService))

  // POST /api/vendors - Create vendor (analyst/admin only)
  router.post('/', analystOrAdmin(), controller.createVendor)

  // GET /api/vendors - List vendors
  router.get('/', controller.listVendors)

  // GET /api/vendors/:id - Get vendor by ID
  router.get('/:id', controller.getVendor)

  // GET /api/vendors/:id/assessments - Get vendor assessment history
  router.get('/:id/assessments', controller.getVendorAssessments)

  return router
}
