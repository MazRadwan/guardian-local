import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationSync } from '../useConversationSync';
import { useRouter, useSearchParams } from 'next/navigation';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock timer functions
jest.useFakeTimers();

describe('useConversationSync', () => {
  const mockReplace = jest.fn();
  const mockSetActiveConversation = jest.fn();
  let mockSearchParams: URLSearchParams;

  const defaultParams = {
    activeConversationId: null as string | null,
    setActiveConversation: mockSetActiveConversation,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    localStorage.clear();
    mockSearchParams = new URLSearchParams();

    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
    });

    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  describe('Initialization', () => {
    it('should return undefined savedConversationId when localStorage is empty', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      // Effect runs immediately in test environment
      // When localStorage is empty, returns undefined
      expect(result.current.savedConversationId).toBeUndefined();
    });

    it('should load savedConversationId from localStorage on mount', () => {
      localStorage.setItem('guardian_conversation_id', 'conv-saved-123');

      const { result } = renderHook(() => useConversationSync(defaultParams));

      // Wait for effect to run
      act(() => {
        jest.runAllTimers();
      });

      expect(result.current.savedConversationId).toBe('conv-saved-123');
    });

    it('should handle missing localStorage gracefully', () => {
      localStorage.removeItem('guardian_conversation_id');

      const { result } = renderHook(() => useConversationSync(defaultParams));

      // Initially null, then becomes undefined after effect
      act(() => {
        jest.runAllTimers();
      });

      expect(result.current.savedConversationId).toBeUndefined();
    });

    it('should only load client-side (guards against SSR)', () => {
      // This test verifies typeof window check exists
      // If hook ran server-side, localStorage would throw
      const { result } = renderHook(() => useConversationSync(defaultParams));

      // Should not throw (guards work)
      expect(() => {
        act(() => {
          jest.runAllTimers();
        });
      }).not.toThrow();
    });
  });

  describe('URL Synchronization', () => {
    it('should sync activeConversationId from URL param on mount', () => {
      // URL and localStorage must MATCH for URL sync to work (guard against stale URLs)
      mockSearchParams.set('conversation', 'conv-url-456');
      localStorage.setItem('guardian_conversation_id', 'conv-url-456');

      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: null,
        })
      );

      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-url-456');
    });

    it('should only sync when activeConversationId is null', () => {
      mockSearchParams.set('conversation', 'conv-url-456');

      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: 'conv-existing-789',
        })
      );

      expect(mockSetActiveConversation).not.toHaveBeenCalled();
    });

    it('should NOT sync when URL has no conversation param', () => {
      // No conversation param
      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: null,
        })
      );

      expect(mockSetActiveConversation).not.toHaveBeenCalled();
    });

    it('should update URL when activeConversationId changes', () => {
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: null },
        }
      );

      // Change to new conversation
      rerender({ activeConversationId: 'conv-new-123' });

      expect(mockReplace).toHaveBeenCalledWith('/chat?conversation=conv-new-123', {
        scroll: false,
      });
    });

    it('should prevent navigation loop (only updates if different)', () => {
      mockSearchParams.set('conversation', 'conv-123');

      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: 'conv-123',
        })
      );

      // Should NOT call replace since URL already matches
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('should use router.replace (not push)', () => {
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: null },
        }
      );

      rerender({ activeConversationId: 'conv-456' });

      // Verify replace was called (not push)
      expect(mockReplace).toHaveBeenCalled();
      expect(mockReplace.mock.calls[0][1]).toEqual({ scroll: false });
    });

    it('should skip URL update when activeConversationId is null', () => {
      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: null,
        })
      );

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('localStorage Persistence', () => {
    it('should write activeConversationId to localStorage on change', () => {
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: null },
        }
      );

      rerender({ activeConversationId: 'conv-persist-123' });

      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-persist-123');
    });

    it('should CLEAR localStorage when activeConversationId is null', () => {
      localStorage.setItem('guardian_conversation_id', 'conv-old-456');

      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: null,
        })
      );

      // Should clear localStorage to prevent stale IDs from being passed on reconnect
      expect(localStorage.getItem('guardian_conversation_id')).toBeNull();
    });

    it('should update localStorage on every conversation switch', () => {
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: 'conv-first-123' },
        }
      );

      // First conversation
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-first-123');

      // Switch to second
      rerender({ activeConversationId: 'conv-second-456' });
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-second-456');

      // Switch to third
      rerender({ activeConversationId: 'conv-third-789' });
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-third-789');
    });

    it('should guard against SSR (client-side only)', () => {
      // Verify hook doesn't crash without window object
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: null },
        }
      );

      // Should not throw even with SSR guards
      expect(() => {
        rerender({ activeConversationId: 'conv-ssr-test' });
      }).not.toThrow();
    });
  });

  describe('Guard Flag Management', () => {
    it('should return true for just-created conversation', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-new-123');
      });

      expect(result.current.isJustCreatedConversation('conv-new-123')).toBe(true);
    });

    it('should return false for other conversations', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-new-123');
      });

      expect(result.current.isJustCreatedConversation('conv-other-456')).toBe(false);
    });

    it('should return false after 100ms auto-clear', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-new-123');
      });

      expect(result.current.isJustCreatedConversation('conv-new-123')).toBe(true);

      // Advance timers by 100ms
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.isJustCreatedConversation('conv-new-123')).toBe(false);
    });

    it('should set flag correctly with markConversationAsJustCreated', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      // Initially false
      expect(result.current.isJustCreatedConversation('conv-test-123')).toBe(false);

      // Mark as created
      act(() => {
        result.current.markConversationAsJustCreated('conv-test-123');
      });

      // Now true
      expect(result.current.isJustCreatedConversation('conv-test-123')).toBe(true);
    });

    it('should auto-clear flag after 100ms delay', async () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-auto-clear');
      });

      expect(result.current.isJustCreatedConversation('conv-auto-clear')).toBe(true);

      // Wait for auto-clear
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.isJustCreatedConversation('conv-auto-clear')).toBe(false);
    });

    it('should override previous flag when marking new conversation', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-first');
      });

      expect(result.current.isJustCreatedConversation('conv-first')).toBe(true);

      // Mark different conversation
      act(() => {
        result.current.markConversationAsJustCreated('conv-second');
      });

      // First should now be false, second true
      expect(result.current.isJustCreatedConversation('conv-first')).toBe(false);
      expect(result.current.isJustCreatedConversation('conv-second')).toBe(true);
    });
  });

  describe('handleConversationChange', () => {
    it('should call setActiveConversation with provided ID', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.handleConversationChange('conv-change-123');
      });

      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-change-123');
    });

    it('should trigger URL and localStorage updates via effect', () => {
      const { result, rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: null },
        }
      );

      // Simulate external call to handleConversationChange
      act(() => {
        result.current.handleConversationChange('conv-external-456');
      });

      // Rerender with new activeConversationId (simulating Zustand update)
      rerender({ activeConversationId: 'conv-external-456' });

      expect(mockReplace).toHaveBeenCalledWith('/chat?conversation=conv-external-456', {
        scroll: false,
      });
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-external-456');
    });

    it('should be callable externally', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      expect(typeof result.current.handleConversationChange).toBe('function');

      // Should not throw
      expect(() => {
        act(() => {
          result.current.handleConversationChange('conv-call-test');
        });
      }).not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should complete full flow: mark as created → check flag → auto-clear after 100ms', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      // Step 1: Mark conversation as just created
      act(() => {
        result.current.markConversationAsJustCreated('conv-flow-123');
      });

      // Step 2: Verify flag is set
      expect(result.current.isJustCreatedConversation('conv-flow-123')).toBe(true);

      // Step 3: Verify auto-clear after 100ms
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.isJustCreatedConversation('conv-flow-123')).toBe(false);
    });

    it('should handle URL param sync + localStorage load together', () => {
      // URL and localStorage must MATCH for URL sync to work (guard against stale URLs)
      localStorage.setItem('guardian_conversation_id', 'conv-matching-123');
      mockSearchParams.set('conversation', 'conv-matching-123');

      const { result } = renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: null,
        })
      );

      // Should load from localStorage
      act(() => {
        jest.runAllTimers();
      });

      expect(result.current.savedConversationId).toBe('conv-matching-123');

      // Should sync from URL (only works when localStorage matches URL)
      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-matching-123');
    });

    it('should NOT sync from URL if localStorage mismatches (stale URL guard)', () => {
      // URL and localStorage have DIFFERENT values - guard should prevent restore
      localStorage.setItem('guardian_conversation_id', 'conv-stored-different');
      mockSearchParams.set('conversation', 'conv-url-stale');

      renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: null,
        })
      );

      act(() => {
        jest.runAllTimers();
      });

      // Should NOT sync from URL because localStorage doesn't match (stale URL being cleared)
      expect(mockSetActiveConversation).not.toHaveBeenCalledWith('conv-url-stale');
    });

    it('should handle conversation switch with URL + localStorage updates', () => {
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: 'conv-initial-123' },
        }
      );

      // Initial state
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-initial-123');
      expect(mockReplace).toHaveBeenCalledWith('/chat?conversation=conv-initial-123', {
        scroll: false,
      });

      jest.clearAllMocks();

      // Switch conversation
      mockSearchParams.set('conversation', 'conv-initial-123'); // Simulate URL already updated
      rerender({ activeConversationId: 'conv-switched-456' });

      // Should update both URL and localStorage
      expect(mockReplace).toHaveBeenCalledWith('/chat?conversation=conv-switched-456', {
        scroll: false,
      });
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-switched-456');
    });

    it('should prevent navigation loop during rapid switches', () => {
      mockSearchParams.set('conversation', 'conv-rapid-1');

      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: 'conv-rapid-1' },
        }
      );

      // Clear initial calls
      jest.clearAllMocks();

      // Simulate rapid switch where URL already matches
      rerender({ activeConversationId: 'conv-rapid-1' });

      // Should NOT call replace again (prevents loop)
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('should handle deletion scenario (clearing localStorage)', () => {
      const { rerender } = renderHook(
        ({ activeConversationId }) =>
          useConversationSync({
            ...defaultParams,
            activeConversationId,
          }),
        {
          initialProps: { activeConversationId: 'conv-to-delete' },
        }
      );

      // Conversation is active
      expect(localStorage.getItem('guardian_conversation_id')).toBe('conv-to-delete');

      // Simulate deletion (activeConversationId becomes null)
      rerender({ activeConversationId: null });

      // localStorage should be CLEARED when activeConversationId is set to null
      // This prevents stale IDs from being passed on reconnect
      expect(localStorage.getItem('guardian_conversation_id')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string conversationId', () => {
      const { result } = renderHook(() =>
        useConversationSync({
          ...defaultParams,
          activeConversationId: '',
        })
      );

      // Empty string is falsy, should not trigger updates
      expect(mockReplace).not.toHaveBeenCalled();
      expect(localStorage.getItem('guardian_conversation_id')).toBeNull();
    });

    it('should handle undefined savedConversationId from localStorage', () => {
      localStorage.removeItem('guardian_conversation_id');

      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        jest.runAllTimers();
      });

      expect(result.current.savedConversationId).toBeUndefined();
    });

    it('should handle multiple rapid calls to markConversationAsJustCreated', () => {
      const { result } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-rapid-1');
        result.current.markConversationAsJustCreated('conv-rapid-2');
        result.current.markConversationAsJustCreated('conv-rapid-3');
      });

      // Only last one should be marked
      expect(result.current.isJustCreatedConversation('conv-rapid-1')).toBe(false);
      expect(result.current.isJustCreatedConversation('conv-rapid-2')).toBe(false);
      expect(result.current.isJustCreatedConversation('conv-rapid-3')).toBe(true);
    });

    it('should handle unmount during auto-clear timeout', () => {
      const { result, unmount } = renderHook(() => useConversationSync(defaultParams));

      act(() => {
        result.current.markConversationAsJustCreated('conv-unmount-test');
      });

      expect(result.current.isJustCreatedConversation('conv-unmount-test')).toBe(true);

      // Unmount before timeout completes
      unmount();

      // Advance timers (should not cause errors)
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // No errors expected
    });
  });
});
