/**
 * Drizzle User Repository Implementation
 *
 * Infrastructure Layer - Implements IUserRepository with Drizzle ORM
 */

import { eq } from 'drizzle-orm'
import { db as defaultDb } from '../client'
import { users } from '../schema'
import { IUserRepository } from '../../../application/interfaces/IUserRepository'
import { User, UserData } from '../../../domain/entities/User'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export class DrizzleUserRepository implements IUserRepository {
  private db: PostgresJsDatabase<typeof import('../schema')>

  constructor(dbClient?: PostgresJsDatabase<typeof import('../schema')>) {
    // Allow dependency injection for testing
    this.db = dbClient || defaultDb
  }

  /**
   * Create a new user
   */
  async create(user: User): Promise<User> {
    const userData = user.toPersistence()

    const [inserted] = await this.db
      .insert(users)
      .values({
        email: userData.email,
        passwordHash: userData.passwordHash,
        name: userData.name,
        role: userData.role,
        lastLoginAt: userData.lastLoginAt,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      })
      .returning()

    return User.fromPersistence({
      id: inserted.id,
      email: inserted.email,
      passwordHash: inserted.passwordHash,
      name: inserted.name,
      role: inserted.role as 'admin' | 'analyst' | 'viewer',
      lastLoginAt: inserted.lastLoginAt,
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    })
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (!row) {
      return null
    }

    return User.fromPersistence({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      role: row.role as 'admin' | 'analyst' | 'viewer',
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!row) {
      return null
    }

    return User.fromPersistence({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      role: row.role as 'admin' | 'analyst' | 'viewer',
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  /**
   * Update existing user
   */
  async update(user: User): Promise<User> {
    const userData = user.toPersistence()

    const [updated] = await this.db
      .update(users)
      .set({
        email: userData.email,
        passwordHash: userData.passwordHash,
        name: userData.name,
        role: userData.role,
        lastLoginAt: userData.lastLoginAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userData.id))
      .returning()

    if (!updated) {
      throw new Error(`User with ID ${userData.id} not found`)
    }

    return User.fromPersistence({
      id: updated.id,
      email: updated.email,
      passwordHash: updated.passwordHash,
      name: updated.name,
      role: updated.role as 'admin' | 'analyst' | 'viewer',
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })
  }

  /**
   * Delete user by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id)).returning()

    return result.length > 0
  }

  /**
   * List all users
   */
  async listAll(): Promise<User[]> {
    const rows = await this.db.select().from(users)

    return rows.map((row) =>
      User.fromPersistence({
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        name: row.name,
        role: row.role as 'admin' | 'analyst' | 'viewer',
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    )
  }
}
