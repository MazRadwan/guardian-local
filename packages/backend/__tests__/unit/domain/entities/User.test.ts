/**
 * Unit Tests for User Entity
 */

import { User } from '../../../../src/domain/entities/User'
import bcrypt from 'bcrypt'

describe('User Entity', () => {
  const validPasswordHash = '$2b$10$abcdefghijklmnopqrstuv' // Mock bcrypt hash

  describe('create', () => {
    it('should create valid user with all fields', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
        role: 'analyst',
      })

      expect(user.getEmail()).toBe('test@example.com')
      expect(user.name).toBe('Test User')
      expect(user.passwordHash).toBe(validPasswordHash)
      expect(user.role).toBe('analyst')
      expect(user.lastLoginAt).toBeNull()
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
    })

    it('should default role to analyst', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      expect(user.role).toBe('analyst')
    })

    it('should trim name', () => {
      const user = User.create({
        email: 'test@example.com',
        name: '  Test User  ',
        passwordHash: validPasswordHash,
      })

      expect(user.name).toBe('Test User')
    })

    it('should throw error for invalid email', () => {
      expect(() =>
        User.create({
          email: 'invalid-email',
          name: 'Test User',
          passwordHash: validPasswordHash,
        })
      ).toThrow('Invalid email format')
    })

    it('should throw error for empty name', () => {
      expect(() =>
        User.create({
          email: 'test@example.com',
          name: '',
          passwordHash: validPasswordHash,
        })
      ).toThrow('Name cannot be empty')
    })

    it('should throw error for name too short', () => {
      expect(() =>
        User.create({
          email: 'test@example.com',
          name: 'A',
          passwordHash: validPasswordHash,
        })
      ).toThrow('Name must be at least 2 characters')
    })

    it('should throw error for empty password hash', () => {
      expect(() =>
        User.create({
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: '',
        })
      ).toThrow('Password hash cannot be empty')
    })

    it('should throw error for invalid role', () => {
      expect(() =>
        User.create({
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: validPasswordHash,
          role: 'invalid' as any,
        })
      ).toThrow('Invalid role')
    })

    it('should accept admin role', () => {
      const user = User.create({
        email: 'admin@example.com',
        name: 'Admin User',
        passwordHash: validPasswordHash,
        role: 'admin',
      })

      expect(user.role).toBe('admin')
    })

    it('should accept viewer role', () => {
      const user = User.create({
        email: 'viewer@example.com',
        name: 'Viewer User',
        passwordHash: validPasswordHash,
        role: 'viewer',
      })

      expect(user.role).toBe('viewer')
    })
  })

  describe('fromPersistence', () => {
    it('should reconstruct user from database data', () => {
      const userData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        passwordHash: validPasswordHash,
        name: 'Test User',
        role: 'analyst' as const,
        lastLoginAt: new Date('2025-01-01'),
        createdAt: new Date('2024-12-01'),
        updatedAt: new Date('2025-01-02'),
      }

      const user = User.fromPersistence(userData)

      expect(user.id).toBe(userData.id)
      expect(user.getEmail()).toBe(userData.email)
      expect(user.name).toBe(userData.name)
      expect(user.role).toBe(userData.role)
      expect(user.lastLoginAt).toEqual(userData.lastLoginAt)
      expect(user.createdAt).toEqual(userData.createdAt)
      expect(user.updatedAt).toEqual(userData.updatedAt)
    })
  })

  describe('updatePassword', () => {
    it('should update password hash', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      const newHash = '$2b$10$newHashValue'
      const oldUpdatedAt = user.updatedAt

      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        user.updatePassword(newHash)

        expect(user.passwordHash).toBe(newHash)
        expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(
          oldUpdatedAt.getTime()
        )
      }, 10)
    })

    it('should throw error for empty password hash', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      expect(() => user.updatePassword('')).toThrow(
        'Password hash cannot be empty'
      )
    })
  })

  describe('updateName', () => {
    it('should update name', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      user.updateName('New Name')

      expect(user.name).toBe('New Name')
    })

    it('should trim name', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      user.updateName('  New Name  ')

      expect(user.name).toBe('New Name')
    })

    it('should throw error for name too short', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      expect(() => user.updateName('A')).toThrow(
        'Name must be at least 2 characters'
      )
    })
  })

  describe('updateRole', () => {
    it('should update role', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
        role: 'analyst',
      })

      user.updateRole('admin')

      expect(user.role).toBe('admin')
    })

    it('should throw error for invalid role', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      expect(() => user.updateRole('invalid' as any)).toThrow('Invalid role')
    })
  })

  describe('recordLogin', () => {
    it('should set lastLoginAt timestamp', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
      })

      expect(user.lastLoginAt).toBeNull()

      user.recordLogin()

      expect(user.lastLoginAt).toBeInstanceOf(Date)
      expect(user.lastLoginAt!.getTime()).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('isAdmin', () => {
    it('should return true for admin role', () => {
      const user = User.create({
        email: 'admin@example.com',
        name: 'Admin User',
        passwordHash: validPasswordHash,
        role: 'admin',
      })

      expect(user.isAdmin()).toBe(true)
    })

    it('should return false for analyst role', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
        role: 'analyst',
      })

      expect(user.isAdmin()).toBe(false)
    })
  })

  describe('canCreateAssessments', () => {
    it('should return true for admin', () => {
      const user = User.create({
        email: 'admin@example.com',
        name: 'Admin User',
        passwordHash: validPasswordHash,
        role: 'admin',
      })

      expect(user.canCreateAssessments()).toBe(true)
    })

    it('should return true for analyst', () => {
      const user = User.create({
        email: 'analyst@example.com',
        name: 'Analyst User',
        passwordHash: validPasswordHash,
        role: 'analyst',
      })

      expect(user.canCreateAssessments()).toBe(true)
    })

    it('should return false for viewer', () => {
      const user = User.create({
        email: 'viewer@example.com',
        name: 'Viewer User',
        passwordHash: validPasswordHash,
        role: 'viewer',
      })

      expect(user.canCreateAssessments()).toBe(false)
    })
  })

  describe('toPersistence', () => {
    it('should convert to plain object', () => {
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: validPasswordHash,
        role: 'analyst',
      })

      const data = user.toPersistence()

      expect(data.email).toBe('test@example.com')
      expect(data.name).toBe('Test User')
      expect(data.passwordHash).toBe(validPasswordHash)
      expect(data.role).toBe('analyst')
      expect(data.lastLoginAt).toBeNull()
      expect(data.createdAt).toBeInstanceOf(Date)
      expect(data.updatedAt).toBeInstanceOf(Date)
    })
  })
})
