/**
 * Authentication Service
 *
 * Application Layer - Orchestrates user authentication workflows
 * Uses interfaces for dependencies (repository, token provider)
 */

import bcrypt from 'bcrypt'
import { IUserRepository } from '../interfaces/IUserRepository'
import { ITokenProvider } from '../interfaces/ITokenProvider'
import { User } from '../../domain/entities/User'
import { CreateUserDTO } from '../dtos/CreateUserDTO'
import { LoginDTO } from '../dtos/LoginDTO'

export interface AuthResult {
  user: {
    id: string
    email: string
    name: string
    role: string
  }
  token: string
}

export class AuthService {
  private readonly saltRounds = 10

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenProvider: ITokenProvider
  ) {}

  /**
   * Register new user
   * @param data - User registration data
   * @returns Auth result with user and token
   * @throws Error if email already exists or validation fails
   */
  async register(data: CreateUserDTO): Promise<AuthResult> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(data.email)
    if (existingUser) {
      throw new Error('User with this email already exists')
    }

    // Validate password strength
    this.validatePassword(data.password)

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, this.saltRounds)

    // Create user entity
    const user = User.create({
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role,
    })

    // Save to repository
    const savedUser = await this.userRepository.create(user)

    // Generate JWT token
    const token = this.tokenProvider.generateToken({
      userId: savedUser.id,
      email: savedUser.getEmail(),
      role: savedUser.role,
    })

    return {
      user: {
        id: savedUser.id,
        email: savedUser.getEmail(),
        name: savedUser.name,
        role: savedUser.role,
      },
      token,
    }
  }

  /**
   * Login user
   * @param data - Login credentials
   * @returns Auth result with user and token
   * @throws Error if credentials are invalid
   */
  async login(data: LoginDTO): Promise<AuthResult> {
    // Find user by email
    const user = await this.userRepository.findByEmail(data.email)
    if (!user) {
      throw new Error('Invalid email or password')
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash
    )
    if (!isPasswordValid) {
      throw new Error('Invalid email or password')
    }

    // Update last login timestamp
    user.recordLogin()
    await this.userRepository.update(user)

    // Generate JWT token
    const token = this.tokenProvider.generateToken({
      userId: user.id,
      email: user.getEmail(),
      role: user.role,
    })

    return {
      user: {
        id: user.id,
        email: user.getEmail(),
        name: user.name,
        role: user.role,
      },
      token,
    }
  }

  /**
   * Validate JWT token and return user
   * @param token - JWT token string
   * @returns User object
   * @throws Error if token is invalid or user not found
   */
  async validateToken(token: string): Promise<User> {
    // Validate token
    const payload = this.tokenProvider.validateToken(token)

    // Find user
    const user = await this.userRepository.findById(payload.userId)
    if (!user) {
      throw new Error('User not found')
    }

    return user
  }

  /**
   * Validate password strength
   * @param password - Password to validate
   * @throws Error if password is too weak
   */
  private validatePassword(password: string): void {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long')
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
      throw new Error('Password must contain at least one letter')
    }

    // Check for at least one number
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number')
    }
  }
}
