/**
 * JWT Token Provider Implementation
 *
 * Infrastructure Layer - Implements ITokenProvider with jsonwebtoken library
 */

import jwt, { SignOptions } from 'jsonwebtoken'
import {
  ITokenProvider,
  TokenPayload,
} from '../../application/interfaces/ITokenProvider'

export class JWTProvider implements ITokenProvider {
  private readonly secret: string
  private readonly expiresIn: string

  constructor(secret?: string, expiresIn?: string) {
    // Only allow hardcoded fallback in test environment
    const isTestEnv = process.env.NODE_ENV === 'test'
    const envSecret = process.env.JWT_SECRET

    if (secret) {
      this.secret = secret
    } else if (envSecret) {
      this.secret = envSecret
    } else if (isTestEnv) {
      // Allow fallback only in test environment
      this.secret = 'test-secret-key-not-for-production'
    } else {
      throw new Error('JWT_SECRET environment variable is required')
    }

    this.expiresIn = expiresIn || '4h' // 4 hours as per requirements
  }

  /**
   * Generate JWT token
   */
  generateToken(payload: TokenPayload): string {
    const options: SignOptions = {
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
    }
    return jwt.sign(payload, this.secret, options)
  }

  /**
   * Validate and decode JWT token
   */
  validateToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload

      // Ensure required fields are present
      if (!decoded.userId || !decoded.email || !decoded.role) {
        throw new Error('Invalid token payload')
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired')
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token')
      }
      throw error
    }
  }
}
