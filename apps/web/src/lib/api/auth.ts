import { User } from '@/hooks/useAuth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export class AuthAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AuthAPIError';
  }
}

/**
 * Login with email and password
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    // Check response.ok BEFORE parsing JSON
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let errorMsg = 'Login failed';

      try {
        if (contentType.includes('application/json')) {
          const errJson = await response.json();
          errorMsg = errJson?.error || errJson?.message || errorMsg;
        } else {
          const errText = await response.text();
          if (errText) errorMsg = errText;
        }
      } catch {
        // Keep default errorMsg if parse fails
      }

      throw new AuthAPIError(errorMsg, response.status, 'HTTP_ERROR');
    }

    // Safe to parse success response
    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof AuthAPIError) {
      throw error;
    }
    throw new AuthAPIError('Network error. Please try again.', 500, 'NETWORK_ERROR');
  }
}

/**
 * Register new user
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    // Check response.ok BEFORE parsing JSON
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let errorMsg = 'Registration failed';

      try {
        if (contentType.includes('application/json')) {
          const errJson = await response.json();
          errorMsg = errJson?.error || errJson?.message || errorMsg;
        } else {
          const errText = await response.text();
          if (errText) errorMsg = errText;
        }
      } catch {
        // Keep default errorMsg if parse fails
      }

      throw new AuthAPIError(errorMsg, response.status, 'HTTP_ERROR');
    }

    // Safe to parse success response
    const responseData = await response.json();
    return responseData;
  } catch (error) {
    if (error instanceof AuthAPIError) {
      throw error;
    }
    throw new AuthAPIError('Network error. Please try again.', 500, 'NETWORK_ERROR');
  }
}

/**
 * Dev mode quick login (development only)
 * Creates test user if needed, returns JWT
 */
export async function devLogin(): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check response.ok BEFORE parsing JSON
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let errorMsg = 'Dev login failed';

      try {
        if (contentType.includes('application/json')) {
          const errJson = await response.json();
          errorMsg = errJson?.error || errJson?.message || errorMsg;
        } else {
          const errText = await response.text();
          if (errText) errorMsg = errText;
        }
      } catch {
        // Keep default errorMsg if parse fails
      }

      throw new AuthAPIError(errorMsg, response.status, 'HTTP_ERROR');
    }

    // Safe to parse success response
    const data = await response.json();
    return data.data; // Extract from { success: true, data: { token, user } }
  } catch (error) {
    if (error instanceof AuthAPIError) {
      throw error;
    }
    throw new AuthAPIError('Network error. Please try again.', 500, 'NETWORK_ERROR');
  }
}
