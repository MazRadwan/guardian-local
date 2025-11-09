/**
 * Auth Middleware
 *
 * Infrastructure Layer - JWT validation and user authentication
 */

import { Request, Response, NextFunction } from 'express'
import { AuthService } from '../../../application/services/AuthService'
import { User } from '../../../domain/entities/User'

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

/**
 * Middleware to validate JWT token and attach user to request
 */
export function authMiddleware(authService: AuthService) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: 'No authorization token provided',
        })
        return
      }

      // Extract token from "Bearer <token>"
      const parts = authHeader.split(' ')
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.status(401).json({
          success: false,
          error: 'Invalid authorization header format. Use: Bearer <token>',
        })
        return
      }

      const token = parts[1]

      // Validate token and get user
      const user = await authService.validateToken(token)

      // Attach user to request
      req.user = user

      next()
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.toLowerCase().includes('expired') ||
          error.message.toLowerCase().includes('invalid') ||
          error.message.toLowerCase().includes('token')
        ) {
          res.status(401).json({
            success: false,
            error: error.message,
          })
          return
        }
      }

      res.status(500).json({
        success: false,
        error: 'Authentication failed',
      })
    }
  }
}
