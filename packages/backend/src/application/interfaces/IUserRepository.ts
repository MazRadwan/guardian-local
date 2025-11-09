/**
 * User Repository Interface
 *
 * Application Layer - Defines contract for user persistence
 * Infrastructure layer implements this with concrete database access
 */

import { User } from '../../domain/entities/User'

export interface IUserRepository {
  /**
   * Create a new user
   * @param user - User entity to persist
   * @returns Persisted user with generated ID
   */
  create(user: User): Promise<User>

  /**
   * Find user by email
   * @param email - User's email address
   * @returns User if found, null otherwise
   */
  findByEmail(email: string): Promise<User | null>

  /**
   * Find user by ID
   * @param id - User's unique identifier
   * @returns User if found, null otherwise
   */
  findById(id: string): Promise<User | null>

  /**
   * Update existing user
   * @param user - User entity with updated data
   * @returns Updated user
   */
  update(user: User): Promise<User>

  /**
   * Delete user by ID
   * @param id - User's unique identifier
   * @returns True if deleted, false if not found
   */
  delete(id: string): Promise<boolean>

  /**
   * List all users (for admin purposes)
   * @returns Array of all users
   */
  listAll(): Promise<User[]>
}
