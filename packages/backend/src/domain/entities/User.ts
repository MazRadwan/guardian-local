/**
 * User Domain Entity
 *
 * Domain Layer - Pure TypeScript, ZERO dependencies on frameworks
 * Represents a system user with authentication and authorization
 */

import { Email } from '../value-objects/Email'

export type UserRole = 'admin' | 'analyst' | 'viewer'

export interface CreateUserData {
  email: string
  name: string
  passwordHash: string
  role?: UserRole
}

export interface UserData {
  id: string
  email: string
  passwordHash: string
  name: string
  role: UserRole
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: Email,
    public passwordHash: string,
    public name: string,
    public role: UserRole,
    public lastLoginAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  /**
   * Create new User (factory method)
   * @param data - User creation data
   * @returns User instance
   * @throws Error if validation fails
   */
  static create(data: CreateUserData): User {
    // Validate email
    const email = Email.create(data.email)

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Name cannot be empty')
    }

    if (data.name.trim().length < 2) {
      throw new Error('Name must be at least 2 characters')
    }

    // Validate password hash
    if (!data.passwordHash || data.passwordHash.length === 0) {
      throw new Error('Password hash cannot be empty')
    }

    // Default role
    const role = data.role || 'analyst'

    // Validate role
    const validRoles: UserRole[] = ['admin', 'analyst', 'viewer']
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
    }

    const now = new Date()

    return new User(
      '', // ID will be set by repository
      email,
      data.passwordHash,
      data.name.trim(),
      role,
      null,
      now,
      now
    )
  }

  /**
   * Reconstruct User from persistence (e.g., database)
   * @param data - Persisted user data
   * @returns User instance
   */
  static fromPersistence(data: UserData): User {
    const email = Email.create(data.email)

    return new User(
      data.id,
      email,
      data.passwordHash,
      data.name,
      data.role,
      data.lastLoginAt,
      data.createdAt,
      data.updatedAt
    )
  }

  /**
   * Update user's password hash
   * @param newPasswordHash - New bcrypt hash
   */
  updatePassword(newPasswordHash: string): void {
    if (!newPasswordHash || newPasswordHash.length === 0) {
      throw new Error('Password hash cannot be empty')
    }

    this.passwordHash = newPasswordHash
    this.updatedAt = new Date()
  }

  /**
   * Update user's name
   * @param newName - New name
   */
  updateName(newName: string): void {
    if (!newName || newName.trim().length < 2) {
      throw new Error('Name must be at least 2 characters')
    }

    this.name = newName.trim()
    this.updatedAt = new Date()
  }

  /**
   * Update user's role
   * @param newRole - New role
   */
  updateRole(newRole: UserRole): void {
    const validRoles: UserRole[] = ['admin', 'analyst', 'viewer']
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
    }

    this.role = newRole
    this.updatedAt = new Date()
  }

  /**
   * Record login timestamp
   */
  recordLogin(): void {
    this.lastLoginAt = new Date()
    this.updatedAt = new Date()
  }

  /**
   * Check if user has admin privileges
   */
  isAdmin(): boolean {
    return this.role === 'admin'
  }

  /**
   * Check if user can create assessments
   */
  canCreateAssessments(): boolean {
    return this.role === 'admin' || this.role === 'analyst'
  }

  /**
   * Get email string
   */
  getEmail(): string {
    return this.email.getValue()
  }

  /**
   * Convert to plain object (for persistence)
   */
  toPersistence(): UserData {
    return {
      id: this.id,
      email: this.email.getValue(),
      passwordHash: this.passwordHash,
      name: this.name,
      role: this.role,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
