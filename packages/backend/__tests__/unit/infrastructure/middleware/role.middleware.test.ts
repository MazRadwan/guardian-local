/**
 * Unit Tests for Role Middleware
 */

import { Request, Response, NextFunction } from 'express'
import {
  roleMiddleware,
  adminOnly,
  analystOrAdmin,
} from '../../../../src/infrastructure/http/middleware/role.middleware'
import { User } from '../../../../src/domain/entities/User'

describe('roleMiddleware', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    req = {}

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    next = jest.fn()
  })

  describe('roleMiddleware', () => {
    it('should allow user with correct role', () => {
      const adminUser = User.fromPersistence({
        id: 'user-123',
        email: 'admin@example.com',
        passwordHash: 'hash',
        name: 'Admin User',
        role: 'admin',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = adminUser

      const middleware = roleMiddleware(['admin'])
      middleware(req as Request, res as Response, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should allow user with any of the allowed roles', () => {
      const analystUser = User.fromPersistence({
        id: 'user-123',
        email: 'analyst@example.com',
        passwordHash: 'hash',
        name: 'Analyst User',
        role: 'analyst',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = analystUser

      const middleware = roleMiddleware(['admin', 'analyst'])
      middleware(req as Request, res as Response, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should return 403 for user without required role', () => {
      const viewerUser = User.fromPersistence({
        id: 'user-123',
        email: 'viewer@example.com',
        passwordHash: 'hash',
        name: 'Viewer User',
        role: 'viewer',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = viewerUser

      const middleware = roleMiddleware(['admin'])
      middleware(req as Request, res as Response, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient permissions',
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should return 401 if no user attached to request', () => {
      req.user = undefined

      const middleware = roleMiddleware(['admin'])
      middleware(req as Request, res as Response, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('adminOnly', () => {
    it('should allow admin', () => {
      const adminUser = User.fromPersistence({
        id: 'user-123',
        email: 'admin@example.com',
        passwordHash: 'hash',
        name: 'Admin User',
        role: 'admin',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = adminUser

      const middleware = adminOnly()
      middleware(req as Request, res as Response, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should block analyst', () => {
      const analystUser = User.fromPersistence({
        id: 'user-123',
        email: 'analyst@example.com',
        passwordHash: 'hash',
        name: 'Analyst User',
        role: 'analyst',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = analystUser

      const middleware = adminOnly()
      middleware(req as Request, res as Response, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('analystOrAdmin', () => {
    it('should allow admin', () => {
      const adminUser = User.fromPersistence({
        id: 'user-123',
        email: 'admin@example.com',
        passwordHash: 'hash',
        name: 'Admin User',
        role: 'admin',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = adminUser

      const middleware = analystOrAdmin()
      middleware(req as Request, res as Response, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should allow analyst', () => {
      const analystUser = User.fromPersistence({
        id: 'user-123',
        email: 'analyst@example.com',
        passwordHash: 'hash',
        name: 'Analyst User',
        role: 'analyst',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = analystUser

      const middleware = analystOrAdmin()
      middleware(req as Request, res as Response, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should block viewer', () => {
      const viewerUser = User.fromPersistence({
        id: 'user-123',
        email: 'viewer@example.com',
        passwordHash: 'hash',
        name: 'Viewer User',
        role: 'viewer',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      req.user = viewerUser

      const middleware = analystOrAdmin()
      middleware(req as Request, res as Response, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })
  })
})
