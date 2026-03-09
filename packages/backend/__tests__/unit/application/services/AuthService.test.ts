/**
 * Unit Tests for AuthService
 * Uses mocked repository and token provider
 */

import { AuthService } from '../../../../src/application/services/AuthService'
import { IUserRepository } from '../../../../src/application/interfaces/IUserRepository'
import { ITokenProvider } from '../../../../src/application/interfaces/ITokenProvider'
import { User } from '../../../../src/domain/entities/User'
import bcrypt from 'bcrypt'

// Mock implementations
class MockUserRepository implements IUserRepository {
  private users: User[] = []

  async create(user: User): Promise<User> {
    const userWithId = User.fromPersistence({
      ...user.toPersistence(),
      id: 'mock-user-id',
    })
    this.users.push(userWithId)
    return userWithId
  }

  async findByEmail(email: string): Promise<User | null> {
    return (
      this.users.find((u) => u.getEmail() === email.toLowerCase()) || null
    )
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) || null
  }

  async update(user: User): Promise<User> {
    const index = this.users.findIndex((u) => u.id === user.id)
    if (index === -1) throw new Error('User not found')
    this.users[index] = user
    return user
  }

  async delete(id: string): Promise<boolean> {
    const index = this.users.findIndex((u) => u.id === id)
    if (index === -1) return false
    this.users.splice(index, 1)
    return true
  }

  async listAll(): Promise<User[]> {
    return this.users
  }

  clear(): void {
    this.users = []
  }
}

class MockTokenProvider implements ITokenProvider {
  generateToken(payload: any): string {
    return `mock-token-${payload.userId}`
  }

  validateToken(token: string): any {
    if (token === 'invalid-token') {
      throw new Error('Invalid token')
    }
    if (token === 'expired-token') {
      throw new Error('Token has expired')
    }
    return {
      userId: 'mock-user-id',
      email: 'test@example.com',
      role: 'analyst',
    }
  }
}

describe('AuthService', () => {
  let authService: AuthService
  let mockUserRepository: MockUserRepository
  let mockTokenProvider: MockTokenProvider

  beforeEach(() => {
    mockUserRepository = new MockUserRepository()
    mockTokenProvider = new MockTokenProvider()
    authService = new AuthService(mockUserRepository, mockTokenProvider)
  })

  afterEach(() => {
    mockUserRepository.clear()
  })

  describe('register', () => {
    it('should register new user successfully', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        role: 'analyst',
      })

      expect(result.user.email).toBe('test@example.com')
      expect(result.user.name).toBe('Test User')
      expect(result.user.role).toBe('analyst')
      expect(result.token).toBe('mock-token-mock-user-id')
    })

    it('should hash password with bcrypt', async () => {
      await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      })

      const user = await mockUserRepository.findByEmail('test@example.com')
      expect(user).not.toBeNull()
      expect(user!.passwordHash).not.toBe('password123')
      expect(user!.passwordHash.startsWith('$2b$')).toBe(true)

      // Verify bcrypt hash is valid
      const isValid = await bcrypt.compare('password123', user!.passwordHash)
      expect(isValid).toBe(true)
    })

    it('should throw error for duplicate email', async () => {
      await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      })

      await expect(
        authService.register({
          email: 'test@example.com',
          name: 'Another User',
          password: 'password456',
        })
      ).rejects.toThrow('User with this email already exists')
    })

    it('should throw error for weak password (too short)', async () => {
      await expect(
        authService.register({
          email: 'test@example.com',
          name: 'Test User',
          password: 'pass12',
        })
      ).rejects.toThrow('Password must be at least 8 characters long')
    })

    it('should throw error for password without letters', async () => {
      await expect(
        authService.register({
          email: 'test@example.com',
          name: 'Test User',
          password: '12345678',
        })
      ).rejects.toThrow('Password must contain at least one letter')
    })

    it('should throw error for password without numbers', async () => {
      await expect(
        authService.register({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password',
        })
      ).rejects.toThrow('Password must contain at least one number')
    })

    it('should throw error for invalid email format', async () => {
      await expect(
        authService.register({
          email: 'invalid-email',
          name: 'Test User',
          password: 'password123',
        })
      ).rejects.toThrow('Invalid email format')
    })
  })

  describe('login', () => {
    beforeEach(async () => {
      // Create a test user
      await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      })
    })

    it('should login user with valid credentials', async () => {
      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(result.user.email).toBe('test@example.com')
      expect(result.user.name).toBe('Test User')
      expect(result.token).toBeDefined()
    })

    it('should update lastLoginAt on login', async () => {
      const userBefore = await mockUserRepository.findByEmail(
        'test@example.com'
      )
      expect(userBefore!.lastLoginAt).toBeNull()

      await authService.login({
        email: 'test@example.com',
        password: 'password123',
      })

      const userAfter = await mockUserRepository.findByEmail('test@example.com')
      expect(userAfter!.lastLoginAt).not.toBeNull()
      expect(userAfter!.lastLoginAt).toBeInstanceOf(Date)
    })

    it('should throw error for invalid email', async () => {
      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('Invalid email or password')
    })

    it('should throw error for invalid password', async () => {
      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Invalid email or password')
    })

    it('should be case-insensitive for email', async () => {
      const result = await authService.login({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      })

      expect(result.user.email).toBe('test@example.com')
    })
  })

  describe('validateToken', () => {
    beforeEach(async () => {
      // Create a test user with known ID
      await authService.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      })
    })

    it('should validate valid token and return user', async () => {
      const user = await authService.validateToken('valid-token')

      expect(user).not.toBeNull()
      expect(user.id).toBe('mock-user-id')
      expect(user.getEmail()).toBe('test@example.com')
    })

    it('should throw error for invalid token', async () => {
      await expect(authService.validateToken('invalid-token')).rejects.toThrow(
        'Invalid token'
      )
    })

    it('should throw error for expired token', async () => {
      await expect(authService.validateToken('expired-token')).rejects.toThrow(
        'Token has expired'
      )
    })

    it('should throw error if user not found', async () => {
      // Mock token provider to return non-existent user ID
      mockTokenProvider.validateToken = () => ({
        userId: 'non-existent-id',
        email: 'test@example.com',
        role: 'analyst',
      })

      await expect(authService.validateToken('valid-token')).rejects.toThrow(
        'User not found'
      )
    })

    it('should throw error for revoked token', async () => {
      authService.revokeToken('valid-token')

      await expect(authService.validateToken('valid-token')).rejects.toThrow(
        'Token has been revoked'
      )
    })
  })

  describe('token revocation with TTL', () => {
    it('should report freshly revoked token as revoked', () => {
      authService.revokeToken('some-token')
      expect(authService.isTokenRevoked('some-token')).toBe(true)
    })

    it('should report non-revoked token as not revoked', () => {
      expect(authService.isTokenRevoked('unknown-token')).toBe(false)
    })

    it('should auto-expire revoked token after TTL', () => {
      authService.revokeToken('expiring-token')
      expect(authService.isTokenRevoked('expiring-token')).toBe(true)

      // Fast-forward past the 24h TTL
      jest.useFakeTimers()
      jest.advanceTimersByTime(25 * 60 * 60_000) // 25 hours

      expect(authService.isTokenRevoked('expiring-token')).toBe(false)
      jest.useRealTimers()
    })

    it('should not expire token before TTL', () => {
      jest.useFakeTimers()
      authService.revokeToken('active-token')

      // Advance 23 hours (under 24h TTL)
      jest.advanceTimersByTime(23 * 60 * 60_000)
      expect(authService.isTokenRevoked('active-token')).toBe(true)

      jest.useRealTimers()
    })
  })
})
