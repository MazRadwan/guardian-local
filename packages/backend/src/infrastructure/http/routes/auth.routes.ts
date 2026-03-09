/**
 * Auth Routes
 *
 * Infrastructure Layer - Authentication endpoints
 */

import { Router, Request, Response, NextFunction } from 'express'
import { AuthController } from '../controllers/AuthController.js'
import { AuthService } from '../../../application/services/AuthService.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import {
  validateBody,
  registerSchema,
  loginSchema,
} from '../middleware/validation.middleware.js'

/** IP-based rate limiter for auth routes (prevents brute-force) */
const authAttempts = new Map<string, { count: number; resetAt: number }>();

/** Evict expired rate-limit entries every 5 minutes to prevent memory leak */
const _rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts) {
    if (now > entry.resetAt) authAttempts.delete(ip);
  }
}, 5 * 60_000);
if (_rateLimitCleanup.unref) _rateLimitCleanup.unref();

function authRateLimit(maxAttempts = 20, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = authAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
      authAttempts.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count < maxAttempts) {
      entry.count++;
      return next();
    }
    res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' });
  };
}

export function createAuthRoutes(authController: AuthController, authService: AuthService): Router {
  const router = Router()

  /**
   * POST /api/auth/register
   * Register new user
   */
  router.post('/register', authRateLimit(10), validateBody(registerSchema), authController.register)

  /**
   * POST /api/auth/login
   * Login user
   */
  router.post('/login', authRateLimit(20), validateBody(loginSchema), authController.login)

  /**
   * POST /api/auth/logout
   * Revoke current token (requires valid auth)
   */
  router.post('/logout', authMiddleware(authService), authController.logout)

  /**
   * POST /api/auth/dev-login
   * Quick login for development (no validation, creates test user if needed)
   */
  router.post('/dev-login', authController.devLogin)

  return router
}
