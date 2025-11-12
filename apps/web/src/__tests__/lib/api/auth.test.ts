/**
 * @jest-environment jsdom
 */

import { login, register, AuthAPIError } from '@/lib/api/auth';

global.fetch = jest.fn();

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockResponse = {
        token: 'mock-jwt-token',
        user: {
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        })
      );
    });

    it('should throw AuthAPIError on invalid credentials (401)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        }),
      });

      try {
        await login({ email: 'test@example.com', password: 'wrong' });
        fail('Should have thrown AuthAPIError');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthAPIError);
        expect((error as AuthAPIError).statusCode).toBe(401);
        expect((error as AuthAPIError).message).toBe('Invalid credentials');
      }
    });

    it('should throw AuthAPIError on validation error (400)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({
          message: 'Email is required',
        }),
      });

      await expect(
        login({ email: '', password: 'password123' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Email is required',
      });
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        login({ email: 'test@example.com', password: 'password123' })
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Network error. Please try again.',
      });
    });
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const mockResponse = {
        token: 'mock-jwt-token',
        user: {
          id: '1',
          email: 'newuser@example.com',
          name: 'New User',
          role: 'viewer',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await register({
        name: 'New User',
        email: 'newuser@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/register',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should throw AuthAPIError on duplicate email (409)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 409,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({
          message: 'Email already exists',
          code: 'EMAIL_EXISTS',
        }),
      });

      await expect(
        register({
          name: 'Test',
          email: 'existing@example.com',
          password: 'password123',
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email already exists',
      });
    });

    it('should throw AuthAPIError on validation error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({
          message: 'Password must be at least 8 characters',
        }),
      });

      await expect(
        register({
          name: 'Test',
          email: 'test@example.com',
          password: 'short',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Password must be at least 8 characters',
      });
    });
  });
});
