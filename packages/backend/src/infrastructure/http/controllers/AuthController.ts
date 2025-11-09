/**
 * Auth Controller
 *
 * Infrastructure Layer - Handles HTTP requests for authentication
 */

import { Request, Response } from 'express'
import { AuthService } from '../../../application/services/AuthService'

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register new user
   * POST /api/auth/register
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name, role } = req.body

      const result = await this.authService.register({
        email,
        password,
        name,
        role,
      })

      res.status(201).json({
        success: true,
        data: result,
      })
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes('already exists') ||
          error.message.includes('Invalid email') ||
          error.message.includes('Password must')
        ) {
          res.status(400).json({
            success: false,
            error: error.message,
          })
          return
        }
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      })
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body

      const result = await this.authService.login({
        email,
        password,
      })

      res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid email or password')) {
          res.status(401).json({
            success: false,
            error: 'Invalid email or password',
          })
          return
        }
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      })
    }
  }

  /**
   * Dev mode quick login (development only)
   * POST /api/auth/dev-login
   */
  devLogin = async (req: Request, res: Response): Promise<void> => {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
      res.status(404).json({
        success: false,
        error: 'Not found',
      })
      return
    }

    try {
      // Try to login with test user
      const result = await this.authService.login({
        email: 'test@guardian.com',
        password: 'Test1234',
      })

      res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      // If test user doesn't exist, create it
      if (error instanceof Error && error.message.includes('Invalid email or password')) {
        try {
          const result = await this.authService.register({
            email: 'test@guardian.com',
            password: 'Test1234',
            name: 'Test User',
            role: 'analyst',
          })

          res.status(200).json({
            success: true,
            data: result,
          })
          return
        } catch (createError) {
          res.status(500).json({
            success: false,
            error: 'Failed to create dev user',
          })
          return
        }
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      })
    }
  }
}
