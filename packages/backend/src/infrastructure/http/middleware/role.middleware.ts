/**
 * Role Middleware
 *
 * Infrastructure Layer - Role-based authorization
 */

import { Request, Response, NextFunction } from 'express'
import { UserRole } from '../../../domain/entities/User'

/**
 * Middleware to check if user has required role(s)
 * Must be used after authMiddleware
 */
export function roleMiddleware(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // User should be attached by authMiddleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      })
      return
    }

    // Check if user's role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      })
      return
    }

    next()
  }
}

/**
 * Convenience middleware for admin-only routes
 */
export function adminOnly() {
  return roleMiddleware(['admin'])
}

/**
 * Convenience middleware for admin and analyst routes
 */
export function analystOrAdmin() {
  return roleMiddleware(['admin', 'analyst'])
}
