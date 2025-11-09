/**
 * Unit Tests for Email Value Object
 */

import { Email } from '../../../../src/domain/value-objects/Email'

describe('Email Value Object', () => {
  describe('create', () => {
    it('should create valid email', () => {
      const email = Email.create('test@example.com')
      expect(email.getValue()).toBe('test@example.com')
    })

    it('should normalize email to lowercase', () => {
      const email = Email.create('Test@Example.COM')
      expect(email.getValue()).toBe('test@example.com')
    })

    it('should trim whitespace', () => {
      const email = Email.create('  test@example.com  ')
      expect(email.getValue()).toBe('test@example.com')
    })

    it('should throw error for empty email', () => {
      expect(() => Email.create('')).toThrow('Email cannot be empty')
    })

    it('should throw error for whitespace-only email', () => {
      expect(() => Email.create('   ')).toThrow('Email cannot be empty')
    })

    it('should throw error for invalid email format (no @)', () => {
      expect(() => Email.create('invalid')).toThrow('Invalid email format')
    })

    it('should throw error for invalid email format (no domain)', () => {
      expect(() => Email.create('test@')).toThrow('Invalid email format')
    })

    it('should throw error for invalid email format (no local part)', () => {
      expect(() => Email.create('@example.com')).toThrow('Invalid email format')
    })

    it('should throw error for invalid email format (missing TLD)', () => {
      expect(() => Email.create('test@example')).toThrow('Invalid email format')
    })

    it('should accept email with plus sign', () => {
      const email = Email.create('test+label@example.com')
      expect(email.getValue()).toBe('test+label@example.com')
    })

    it('should accept email with dots', () => {
      const email = Email.create('test.user@example.co.uk')
      expect(email.getValue()).toBe('test.user@example.co.uk')
    })

    it('should accept email with hyphens in domain', () => {
      const email = Email.create('test@my-domain.com')
      expect(email.getValue()).toBe('test@my-domain.com')
    })
  })

  describe('equals', () => {
    it('should return true for identical emails', () => {
      const email1 = Email.create('test@example.com')
      const email2 = Email.create('test@example.com')
      expect(email1.equals(email2)).toBe(true)
    })

    it('should return true for emails with different casing', () => {
      const email1 = Email.create('test@example.com')
      const email2 = Email.create('TEST@EXAMPLE.COM')
      expect(email1.equals(email2)).toBe(true)
    })

    it('should return false for different emails', () => {
      const email1 = Email.create('test1@example.com')
      const email2 = Email.create('test2@example.com')
      expect(email1.equals(email2)).toBe(false)
    })
  })

  describe('toString', () => {
    it('should return email string', () => {
      const email = Email.create('test@example.com')
      expect(email.toString()).toBe('test@example.com')
    })
  })
})
