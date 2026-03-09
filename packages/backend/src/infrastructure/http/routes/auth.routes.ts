/**
 * Auth Routes
 *
 * Infrastructure Layer - Authentication endpoints
 */

import { Router } from 'express'
import { AuthController } from '../controllers/AuthController.js'
import { AuthService } from '../../../application/services/AuthService.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import {
  validateBody,
  registerSchema,
  loginSchema,
} from '../middleware/validation.middleware.js'

export function createAuthRoutes(authController: AuthController, authService?: AuthService): Router {
  const router = Router()

  /**
   * POST /api/auth/register
   * Register new user
   */
  router.post('/register', validateBody(registerSchema), authController.register)

  /**
   * POST /api/auth/login
   * Login user
   */
  router.post('/login', validateBody(loginSchema), authController.login)

  /**
   * POST /api/auth/logout
   * Revoke current token (requires valid auth)
   */
  if (authService) {
    router.post('/logout', authMiddleware(authService), authController.logout)
  }

  /**
   * POST /api/auth/dev-login
   * Quick login for development (no validation, creates test user if needed)
   */
  router.post('/dev-login', authController.devLogin)

  return router
}
