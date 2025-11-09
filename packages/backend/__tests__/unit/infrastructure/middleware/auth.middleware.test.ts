/**
 * Unit Tests for Auth Middleware
 */

import { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../../../src/infrastructure/http/middleware/auth.middleware'
import { AuthService } from '../../../../src/application/services/AuthService'
import { User } from '../../../../src/domain/entities/User'

// Mock AuthService
class MockAuthService {
  async validateToken(token: string): Promise<User> {
    if (token === 'valid-token') {
      return User.fromPersistence({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hash',
        name: 'Test User',
        role: 'analyst',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    if (token === 'expired-token') {
      throw new Error('Token has expired')
    }

    throw new Error('Invalid token')
  }
}

describe('authMiddleware', () => {
  let mockAuthService: AuthService
  let middleware: ReturnType<typeof authMiddleware>
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    mockAuthService = new MockAuthService() as any
    middleware = authMiddleware(mockAuthService)

    req = {
      headers: {},
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    next = jest.fn()
  })

  it('should attach user to request for valid token', async () => {
    req.headers = {
      authorization: 'Bearer valid-token',
    }

    await middleware(req as Request, res as Response, next)

    expect(req.user).toBeDefined()
    expect(req.user!.id).toBe('user-123')
    expect(req.user!.getEmail()).toBe('test@example.com')
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should return 401 for missing authorization header', async () => {
    req.headers = {}

    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No authorization token provided',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for invalid authorization header format', async () => {
    req.headers = {
      authorization: 'InvalidFormat token',
    }

    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid authorization header format. Use: Bearer <token>',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for missing Bearer prefix', async () => {
    req.headers = {
      authorization: 'valid-token',
    }

    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid authorization header format. Use: Bearer <token>',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for expired token', async () => {
    req.headers = {
      authorization: 'Bearer expired-token',
    }

    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token has expired',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for invalid token', async () => {
    req.headers = {
      authorization: 'Bearer invalid-token',
    }

    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid token',
    })
    expect(next).not.toHaveBeenCalled()
  })
})
