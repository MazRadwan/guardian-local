/**
 * Validation Middleware
 *
 * Infrastructure Layer - Validates incoming requests
 */

import { Request, Response, NextFunction } from 'express'

export interface ValidationSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array'
    required?: boolean
    minLength?: number
    maxLength?: number
    pattern?: RegExp
    enum?: string[]
  }
}

/**
 * Validate request body against schema
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = []

    // Check all schema fields
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field]

      // Required check
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${field} is required`)
        continue
      }

      // Skip validation if field is not required and not present
      if (!rules.required && (value === undefined || value === null)) {
        continue
      }

      // Type check
      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (actualType !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`)
        continue
      }

      // String validations
      if (rules.type === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`)
        }

        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`)
        }

        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} format is invalid`)
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${field} must be one of: ${rules.enum.join(', ')}`)
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      })
      return
    }

    next()
  }
}

/**
 * Validation schemas
 */
export const registerSchema: ValidationSchema = {
  email: {
    type: 'string',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  password: {
    type: 'string',
    required: true,
    minLength: 8,
  },
  name: {
    type: 'string',
    required: true,
    minLength: 2,
  },
  role: {
    type: 'string',
    required: false,
    enum: ['admin', 'analyst', 'viewer'],
  },
}

export const loginSchema: ValidationSchema = {
  email: {
    type: 'string',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  password: {
    type: 'string',
    required: true,
    minLength: 1,
  },
}
