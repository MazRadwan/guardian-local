/**
 * Tests: useUserAssessments Hook
 *
 * Story 5a.6: Persistence-based scoring mode visibility
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useUserAssessments } from '../useUserAssessments';
import { useAuth } from '../useAuth';

// Mock useAuth hook
jest.mock('../useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock fetch
global.fetch = jest.fn();

describe('useUserAssessments', () => {
  const mockToken = 'test-token-123';
  const apiUrl = 'http://localhost:8000';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = apiUrl;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('should return hasExportedAssessments=false when no token', () => {
    mockUseAuth.mockReturnValue({
      token: null,
      user: null,
      login: jest.fn(),
      logout: jest.fn(),
      isAuthenticated: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useUserAssessments());

    expect(result.current.hasExportedAssessments).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should fetch assessment status when token is available', async () => {
    mockUseAuth.mockReturnValue({
      token: mockToken,
      user: { id: 'user-1', email: 'test@example.com' },
      login: jest.fn(),
      logout: jest.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ hasExportedAssessments: true }),
    });

    const { result } = renderHook(() => useUserAssessments());

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${apiUrl}/api/assessments/status`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockToken}`,
        },
      }
    );
    expect(result.current.hasExportedAssessments).toBe(true);
    expect(result.current.error).toBe(null);
  });

  it('should return hasExportedAssessments=false when user has no exported assessments', async () => {
    mockUseAuth.mockReturnValue({
      token: mockToken,
      user: { id: 'user-1', email: 'test@example.com' },
      login: jest.fn(),
      logout: jest.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ hasExportedAssessments: false }),
    });

    const { result } = renderHook(() => useUserAssessments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasExportedAssessments).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle API error gracefully', async () => {
    mockUseAuth.mockReturnValue({
      token: mockToken,
      user: { id: 'user-1', email: 'test@example.com' },
      login: jest.fn(),
      logout: jest.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useUserAssessments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasExportedAssessments).toBe(false);
    expect(result.current.error).not.toBe(null);
    expect(result.current.error?.message).toContain('Failed to check assessment status');
  });

  it('should handle network error gracefully', async () => {
    mockUseAuth.mockReturnValue({
      token: mockToken,
      user: { id: 'user-1', email: 'test@example.com' },
      login: jest.fn(),
      logout: jest.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useUserAssessments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasExportedAssessments).toBe(false);
    expect(result.current.error).not.toBe(null);
    expect(result.current.error?.message).toBe('Network error');
  });

  it('should cleanup on unmount', async () => {
    mockUseAuth.mockReturnValue({
      token: mockToken,
      user: { id: 'user-1', email: 'test@example.com' },
      login: jest.fn(),
      logout: jest.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    // Simulate slow response
    let resolveResponse: (value: any) => void;
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValue(responsePromise);

    const { unmount } = renderHook(() => useUserAssessments());

    // Unmount before response arrives
    unmount();

    // Resolve response after unmount
    resolveResponse!({
      ok: true,
      json: async () => ({ hasExportedAssessments: true }),
    });

    // Should not throw or cause state updates after unmount
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
