/**
 * Integration Tests for DrizzleUserRepository
 * Tests repository with real database connection
 */

import { DrizzleUserRepository } from '../../../src/infrastructure/database/repositories/DrizzleUserRepository'
import { User } from '../../../src/domain/entities/User'
import { testDb, closeTestDb } from '../../setup/test-db'
import { users } from '../../../src/infrastructure/database/schema'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcrypt'

describe('DrizzleUserRepository Integration Tests', () => {
  let repository: DrizzleUserRepository

  beforeAll(async () => {
    // Use test database client
    repository = new DrizzleUserRepository(testDb)
  })

  beforeEach(async () => {
    // Clean users table before each test
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
  })

  afterAll(async () => {
    // Clean up and close connection
    await testDb.execute(sql`TRUNCATE TABLE users CASCADE`)
    await closeTestDb()
  })

  describe('create', () => {
    it('should create user and return with generated ID', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
        role: 'analyst',
      })

      const created = await repository.create(user)

      expect(created.id).toBeDefined()
      expect(created.id.length).toBeGreaterThan(0)
      expect(created.getEmail()).toBe('test@example.com')
      expect(created.name).toBe('Test User')
      expect(created.role).toBe('analyst')
    })

    it('should throw error for duplicate email', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user1 = User.create({
        email: 'test@example.com',
        name: 'Test User 1',
        passwordHash,
      })

      await repository.create(user1)

      const user2 = User.create({
        email: 'test@example.com',
        name: 'Test User 2',
        passwordHash,
      })

      await expect(repository.create(user2)).rejects.toThrow()
    })
  })

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
        role: 'admin',
      })

      await repository.create(user)

      const found = await repository.findByEmail('test@example.com')

      expect(found).not.toBeNull()
      expect(found!.getEmail()).toBe('test@example.com')
      expect(found!.name).toBe('Test User')
      expect(found!.role).toBe('admin')
    })

    it('should find user by email case-insensitive', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
      })

      await repository.create(user)

      const found = await repository.findByEmail('TEST@EXAMPLE.COM')

      expect(found).not.toBeNull()
      expect(found!.getEmail()).toBe('test@example.com')
    })

    it('should return null for non-existent email', async () => {
      const found = await repository.findByEmail('nonexistent@example.com')

      expect(found).toBeNull()
    })
  })

  describe('findById', () => {
    it('should find user by ID', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
      })

      const created = await repository.create(user)

      const found = await repository.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.getEmail()).toBe('test@example.com')
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(found).toBeNull()
    })
  })

  describe('update', () => {
    it('should update user', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
        role: 'analyst',
      })

      const created = await repository.create(user)

      created.updateName('Updated Name')
      created.updateRole('admin')

      const updated = await repository.update(created)

      expect(updated.name).toBe('Updated Name')
      expect(updated.role).toBe('admin')
    })

    it('should update lastLoginAt', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
      })

      const created = await repository.create(user)

      expect(created.lastLoginAt).toBeNull()

      created.recordLogin()
      const updated = await repository.update(created)

      expect(updated.lastLoginAt).not.toBeNull()
      expect(updated.lastLoginAt).toBeInstanceOf(Date)
    })

    it('should throw error for non-existent user', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.fromPersistence({
        id: '00000000-0000-0000-0000-000000000000',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
        role: 'analyst',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await expect(repository.update(user)).rejects.toThrow('not found')
    })
  })

  describe('delete', () => {
    it('should delete user', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)
      const user = User.create({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
      })

      const created = await repository.create(user)

      const deleted = await repository.delete(created.id)

      expect(deleted).toBe(true)

      const found = await repository.findById(created.id)
      expect(found).toBeNull()
    })

    it('should return false for non-existent user', async () => {
      const deleted = await repository.delete(
        '00000000-0000-0000-0000-000000000000'
      )

      expect(deleted).toBe(false)
    })
  })

  describe('listAll', () => {
    it('should return empty array when no users', async () => {
      const users = await repository.listAll()

      expect(users).toEqual([])
    })

    it('should return all users', async () => {
      const passwordHash = await bcrypt.hash('password123', 10)

      const user1 = User.create({
        email: 'user1@example.com',
        name: 'User 1',
        passwordHash,
        role: 'admin',
      })

      const user2 = User.create({
        email: 'user2@example.com',
        name: 'User 2',
        passwordHash,
        role: 'analyst',
      })

      const user3 = User.create({
        email: 'user3@example.com',
        name: 'User 3',
        passwordHash,
        role: 'viewer',
      })

      await repository.create(user1)
      await repository.create(user2)
      await repository.create(user3)

      const allUsers = await repository.listAll()

      expect(allUsers).toHaveLength(3)
      expect(allUsers.map((u) => u.getEmail())).toContain('user1@example.com')
      expect(allUsers.map((u) => u.getEmail())).toContain('user2@example.com')
      expect(allUsers.map((u) => u.getEmail())).toContain('user3@example.com')
    })
  })
})
