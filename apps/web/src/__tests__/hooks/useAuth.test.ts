/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useAuth', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should initialize with no user when localStorage is empty', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should restore user from localStorage on mount', () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin' as const,
    };
    const mockToken = 'mock-jwt-token';

    localStorageMock.setItem('guardian_token', mockToken);
    localStorageMock.setItem('guardian_user', JSON.stringify(mockUser));

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.token).toBe(mockToken);
  });

  it('should login user and store in localStorage', () => {
    const { result } = renderHook(() => useAuth());

    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'analyst' as const,
    };
    const mockToken = 'mock-jwt-token';

    act(() => {
      result.current.login(mockToken, mockUser);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.token).toBe(mockToken);
    expect(localStorageMock.getItem('guardian_token')).toBe(mockToken);
    expect(localStorageMock.getItem('guardian_user')).toBe(JSON.stringify(mockUser));
  });

  it('should logout user and clear localStorage', () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'viewer' as const,
    };
    const mockToken = 'mock-jwt-token';

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login(mockToken, mockUser);
    });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorageMock.getItem('guardian_token')).toBeNull();
    expect(localStorageMock.getItem('guardian_user')).toBeNull();
  });

  it('should handle corrupted user data in localStorage', () => {
    localStorageMock.setItem('guardian_token', 'mock-token');
    localStorageMock.setItem('guardian_user', 'invalid-json{');

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorageMock.getItem('guardian_token')).toBeNull();
    expect(localStorageMock.getItem('guardian_user')).toBeNull();
  });
});
