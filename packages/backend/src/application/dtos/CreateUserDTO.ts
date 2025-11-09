/**
 * Create User DTO
 *
 * Application Layer - Data Transfer Object for user creation
 */

import { UserRole } from '../../domain/entities/User'

export interface CreateUserDTO {
  email: string
  password: string
  name: string
  role?: UserRole
}
