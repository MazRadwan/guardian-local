import { renderHook, act } from '@testing-library/react';
import { useChatStore } from '../chatStore';

/**
 * Story 26.3: Title Loading Timeout & Cleanup Tests
 *
 * Tests for:
 * 1. Timeout mechanism (5-second hard timeout)
 * 2. Idempotency (no duplicate timeouts)
 * 3. Cleanup on conversation delete
 * 4. Cleanup on disconnect (clearAllTitleLoadingStates)
 * 5. Stale state cleanup (cleanupStaleTitleLoadingStates)
 * 6. No memory leaks from orphaned timeouts
 */
describe('chatStore - Title Loading Timeout (Story 26.3)', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset store state before each test
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.clearMessages();
      result.current.setConversations([]);
      result.current.setActiveConversation(null);
      // Clear any existing timeouts
      result.current.clearAllTitleLoadingStates();
    });

    // Use fake timers for testing timeouts
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockConversation = {
    id: 'conv-123',
    title: 'New Chat',
    createdAt: new Date('2025-01-13T10:00:00Z'),
    updatedAt: new Date('2025-01-13T10:00:00Z'),
    mode: 'consult' as const,
  };

  describe('startTitleLoadingTimeout', () => {
    it('creates a timeout that fires after 5 seconds', () => {
      const { result } = renderHook(() => useChatStore());

      // Setup: Add conversation first, then set title loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      // Verify initial state
      expect(result.current.conversations[0].titleLoading).toBe(true);
      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Advance time past the 5-second timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Verify loading state was cleared by the timeout
      expect(result.current.conversations[0].titleLoading).toBe(false);
      expect(result.current.titleLoadingTimeouts.size).toBe(0);
    });

    it('does not start multiple timeouts for the same conversation (idempotency)', () => {
      const { result } = renderHook(() => useChatStore());

      // Setup: Add conversation
      act(() => {
        result.current.addConversation(mockConversation);
      });

      // Start loading twice
      act(() => {
        result.current.setConversationTitleLoading('conv-123', true);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      // Verify only one timeout exists
      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Advance past timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should still only clear once
      expect(result.current.conversations[0].titleLoading).toBe(false);
    });

    it('clears timeout when loading is set to false', () => {
      const { result } = renderHook(() => useChatStore());

      // Setup: Add conversation and start loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Clear loading before timeout fires
      act(() => {
        result.current.setConversationTitleLoading('conv-123', false);
      });

      // Verify timeout was cleared
      expect(result.current.titleLoadingTimeouts.size).toBe(0);

      // Advance past original timeout time
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should remain false (timeout was cleared, not fired)
      expect(result.current.conversations[0].titleLoading).toBe(false);
    });
  });

  describe('clearTitleLoadingTimeout', () => {
    it('clears a specific conversation timeout', () => {
      const { result } = renderHook(() => useChatStore());

      // Setup: Add two conversations and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.addConversation({
          ...mockConversation,
          id: 'conv-456',
        });
        result.current.setConversationTitleLoading('conv-123', true);
        result.current.setConversationTitleLoading('conv-456', true);
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(2);

      // Clear one specific timeout
      act(() => {
        result.current.clearTitleLoadingTimeout('conv-123');
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(1);
      expect(result.current.titleLoadingTimeouts.has('conv-123')).toBe(false);
      expect(result.current.titleLoadingTimeouts.has('conv-456')).toBe(true);
    });

    it('handles non-existent conversation gracefully', () => {
      const { result } = renderHook(() => useChatStore());

      // Should not throw
      act(() => {
        result.current.clearTitleLoadingTimeout('non-existent');
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(0);
    });
  });

  describe('clearAllTitleLoadingStates', () => {
    it('clears all timeouts and loading states', () => {
      const { result } = renderHook(() => useChatStore());

      // Setup: Add multiple conversations and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.addConversation({
          id: 'conv-456',
          title: 'New Chat 2',
          createdAt: new Date(),
          updatedAt: new Date(),
          mode: 'consult' as const,
        });
        result.current.addConversation({
          id: 'conv-789',
          title: 'New Chat 3',
          createdAt: new Date(),
          updatedAt: new Date(),
          mode: 'assessment' as const,
        });
        result.current.setConversationTitleLoading('conv-123', true);
        result.current.setConversationTitleLoading('conv-456', true);
        result.current.setConversationTitleLoading('conv-789', true);
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(3);
      expect(result.current.conversations.filter(c => c.titleLoading).length).toBe(3);

      // Clear all
      act(() => {
        result.current.clearAllTitleLoadingStates();
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(0);
      expect(result.current.conversations.filter(c => c.titleLoading).length).toBe(0);
    });

    it('prevents orphaned timeouts from firing', () => {
      const { result } = renderHook(() => useChatStore());

      // Setup: Add conversation and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Clear all immediately
      act(() => {
        result.current.clearAllTitleLoadingStates();
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(0);

      // Advance past timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should still be false (timeout was cleared, not fired)
      expect(result.current.conversations[0].titleLoading).toBe(false);
    });
  });

  describe('cleanupStaleTitleLoadingStates', () => {
    it('clears loading states that have no timeout (simulating stale state from reload)', () => {
      const { result } = renderHook(() => useChatStore());

      // Simulate a stale conversation (has titleLoading: true but no timeout)
      // This happens when user reloads page while title was loading
      act(() => {
        // Add conversation normally
        result.current.addConversation(mockConversation);
        // Start loading (creates timeout)
        result.current.setConversationTitleLoading('conv-123', true);
        // Now manually set titleLoading but clear the timeout to simulate stale state
        // (what happens after page reload - titleLoading persisted but timeout lost)
        result.current.clearTitleLoadingTimeout('conv-123');
      });

      // Now the conversation has titleLoading: true but no timeout (stale)
      expect(result.current.conversations[0].titleLoading).toBe(true);
      expect(result.current.titleLoadingTimeouts.has('conv-123')).toBe(false);

      // Run cleanup
      act(() => {
        result.current.cleanupStaleTitleLoadingStates();
      });

      // Should be cleared because it has no timeout tracking (age > 10s assumed)
      expect(result.current.conversations[0].titleLoading).toBe(false);
    });

    it('keeps loading states that are recent (< 10 seconds)', () => {
      const { result } = renderHook(() => useChatStore());

      // Add a conversation and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      // Verify initial state
      expect(result.current.conversations[0].titleLoading).toBe(true);
      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Advance only 3 seconds (within 10 second threshold, but also within 5s timeout)
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Run cleanup
      act(() => {
        result.current.cleanupStaleTitleLoadingStates();
      });

      // Should still be loading (< 10 seconds old, has valid timeout)
      expect(result.current.conversations[0].titleLoading).toBe(true);
    });
  });

  describe('deleteConversation clears timeout', () => {
    it('clears timeout when conversation is deleted', () => {
      const { result } = renderHook(() => useChatStore());

      // Add conversation and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Delete the conversation
      act(() => {
        result.current.deleteConversation('conv-123');
      });

      // Timeout should be cleared
      expect(result.current.titleLoadingTimeouts.size).toBe(0);
    });
  });

  describe('removeConversationFromList clears timeout', () => {
    it('clears timeout when conversation is removed', () => {
      const { result } = renderHook(() => useChatStore());

      // Add conversation and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Remove the conversation from list
      act(() => {
        result.current.removeConversationFromList('conv-123');
      });

      // Timeout should be cleared
      expect(result.current.titleLoadingTimeouts.size).toBe(0);
    });
  });

  describe('integration with title update', () => {
    it('clears loading when title is updated (normal flow)', () => {
      const { result } = renderHook(() => useChatStore());

      // Add conversation and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      expect(result.current.conversations[0].titleLoading).toBe(true);
      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Simulate title update (what happens when backend sends title)
      act(() => {
        result.current.updateConversationTitle('conv-123', 'AI Vendor Assessment');
        result.current.setConversationTitleLoading('conv-123', false);
      });

      expect(result.current.conversations[0].titleLoading).toBe(false);
      expect(result.current.conversations[0].title).toBe('AI Vendor Assessment');
      expect(result.current.titleLoadingTimeouts.size).toBe(0);
    });
  });

  describe('titleLoadingTimeouts is not persisted', () => {
    it('does not persist titleLoadingTimeouts to localStorage', () => {
      const { result } = renderHook(() => useChatStore());

      // Add conversation and set loading
      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setConversationTitleLoading('conv-123', true);
      });

      // Verify timeout exists in memory
      expect(result.current.titleLoadingTimeouts.size).toBe(1);

      // Check localStorage - timeouts should not be there
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);

      // Map doesn't serialize well, so it should not be in persisted state
      expect(parsed.state.titleLoadingTimeouts).toBeUndefined();
    });
  });
});
