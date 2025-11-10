'use client';

import { useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'analyst' | 'viewer';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const [isHydrated, setIsHydrated] = useState(false);

  // Mark as hydrated on mount (client-side only)
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Check for existing token after hydration
  useEffect(() => {
    if (!isHydrated) return;

    const token = localStorage.getItem('guardian_token');
    const userStr = localStorage.getItem('guardian_user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        setAuthState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        console.error('[useAuth] Failed to parse user from localStorage:', error);
        localStorage.removeItem('guardian_token');
        localStorage.removeItem('guardian_user');
        setAuthState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } else {
      setAuthState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, [isHydrated]);

  const login = useCallback((token: string, user: User) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('guardian_token', token);
      localStorage.setItem('guardian_user', JSON.stringify(user));
    }
    setAuthState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('guardian_token');
      localStorage.removeItem('guardian_user');
      localStorage.removeItem('guardian_conversation_id'); // Clear conversation session
    }
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  return {
    ...authState,
    login,
    logout,
  };
}
