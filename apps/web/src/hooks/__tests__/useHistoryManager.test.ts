import { renderHook, act, waitFor } from '@testing-library/react';
import { useHistoryManager } from '../useHistoryManager';
import { ChatMessage, ExportReadyPayload } from '@/lib/websocket';

// Mock timer functions
jest.useFakeTimers();

describe('useHistoryManager', () => {
  const mockRequestHistory = jest.fn();
  const mockSetMessages = jest.fn();
  const mockSetLoading = jest.fn();
  const mockSetError = jest.fn();
  const mockGetExportReady = jest.fn();
  const mockAppendComponentToLastAssistantMessage = jest.fn();
  const mockMessageListRef = { current: null as HTMLDivElement | null };

  const defaultParams = {
    conversationId: 'conv-123',
    isConnected: true,
    requestHistory: mockRequestHistory,
    messageListRef: mockMessageListRef,
    setMessages: mockSetMessages,
    setLoading: mockSetLoading,
    setError: mockSetError,
    messages: [] as ChatMessage[],
    isLoading: false,
    getExportReady: mockGetExportReady,
    appendComponentToLastAssistantMessage: mockAppendComponentToLastAssistantMessage,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockMessageListRef.current = {
      scrollTop: 0,
      scrollHeight: 1000,
    } as HTMLDivElement;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  describe('Initialization', () => {
    it('should return initial state with shouldLoadHistory false', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      expect(result.current.shouldLoadHistory).toBe(false);
    });

    it('should provide setShouldLoadHistory action', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      expect(typeof result.current.setShouldLoadHistory).toBe('function');
    });

    it('should provide handleHistory callback', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      expect(typeof result.current.handleHistory).toBe('function');
    });
  });

  describe('History Request Trigger', () => {
    it('should request history when shouldLoadHistory is true and all conditions met', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).toHaveBeenCalledWith('conv-123');
      expect(mockRequestHistory).toHaveBeenCalledTimes(1);
    });

    it('should NOT request history when shouldLoadHistory is false', () => {
      renderHook(() => useHistoryManager(defaultParams));

      expect(mockRequestHistory).not.toHaveBeenCalled();
    });

    it('should NOT request history when not connected', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isConnected: false,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).not.toHaveBeenCalled();
    });

    it('should NOT request history when conversationId is null', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          conversationId: null,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).not.toHaveBeenCalled();
    });

    it('should NOT request history when conversationId is undefined', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          conversationId: undefined,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).not.toHaveBeenCalled();
    });

    it('should NOT request history when requestHistory is undefined', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          requestHistory: undefined,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Should not throw error, just silently skip
      expect(true).toBe(true);
    });
  });

  describe('Timeout Handling', () => {
    it('should set 5-second timeout when requesting history', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).toHaveBeenCalled();

      // Timeout should be set but not triggered yet
      expect(mockSetLoading).not.toHaveBeenCalled();
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it('should show error and clear loading if timeout expires', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
          messages: [],
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Fast-forward 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockSetError).toHaveBeenCalledWith('Failed to load conversation. Please try again.');
    });

    it('should NOT show error if timeout expires but messages loaded', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello', timestamp: new Date() },
      ];

      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
          messages,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Fast-forward 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should NOT show error because messages exist
      expect(mockSetLoading).not.toHaveBeenCalled();
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it('should NOT show error if timeout expires but loading already finished', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: false, // Already finished loading
          messages: [],
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Fast-forward 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should NOT show error because not loading
      expect(mockSetLoading).not.toHaveBeenCalled();
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it('should clear timeout when component unmounts', () => {
      const { result, unmount } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
        })
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Unmount before timeout expires
      unmount();

      // Fast-forward to ensure no timeout fires
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockSetError).not.toHaveBeenCalled();
    });

    it('should clear timeout when dependencies change', () => {
      const { result, rerender } = renderHook(
        (props) => useHistoryManager(props),
        { initialProps: { ...defaultParams, isLoading: true } }
      );

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Change conversationId to trigger cleanup
      rerender({
        ...defaultParams,
        conversationId: 'conv-456',
        isLoading: true,
      });

      // Fast-forward original timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should only be called once for the new request, not the old one
      expect(mockSetError).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleHistory Callback', () => {
    it('should set messages from loaded history', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      const loadedMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
      ];

      act(() => {
        result.current.handleHistory(loadedMessages);
      });

      expect(mockSetMessages).toHaveBeenCalledWith(loadedMessages);
    });

    it('should clear loading state', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.handleHistory([]);
      });

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should reset shouldLoadHistory flag', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(result.current.shouldLoadHistory).toBe(true);

      act(() => {
        result.current.handleHistory([]);
      });

      expect(result.current.shouldLoadHistory).toBe(false);
    });

    it('should scroll to bottom after 50ms delay', async () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.handleHistory([]);
      });

      // Scroll should not happen immediately
      expect(mockMessageListRef.current?.scrollTop).toBe(0);

      // Fast-forward 50ms
      act(() => {
        jest.advanceTimersByTime(50);
      });

      // Now scroll should have happened
      expect(mockMessageListRef.current?.scrollTop).toBe(1000);
    });

    it('should handle missing messageListRef gracefully', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          messageListRef: { current: null },
        })
      );

      act(() => {
        result.current.handleHistory([]);
      });

      // Should not throw error
      expect(true).toBe(true);

      // Fast-forward scroll delay
      act(() => {
        jest.advanceTimersByTime(50);
      });

      // Still should not throw error
      expect(true).toBe(true);
    });

    it('should clear timeout to prevent false error after successful load', () => {
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
        })
      );

      // Trigger history request (starts timeout)
      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // History loads successfully before timeout
      act(() => {
        result.current.handleHistory([
          { role: 'user', content: 'Test', timestamp: new Date() },
        ]);
      });

      // Fast-forward past timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Error should NOT be shown because timeout was cleared
      expect(mockSetError).not.toHaveBeenCalled();
    });

    it('should log history load with message count', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi!', timestamp: new Date() },
      ];

      act(() => {
        result.current.handleHistory(messages);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useHistoryManager] handleHistory called with:',
        2,
        'messages'
      );

      consoleSpy.mockRestore();
    });

    it('should log when clearing timeout', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
        })
      );

      // Start timeout
      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      // Clear it via handleHistory
      act(() => {
        result.current.handleHistory([]);
      });

      expect(consoleSpy).toHaveBeenCalledWith('[useHistoryManager] Clearing history timeout');

      consoleSpy.mockRestore();
    });
  });

  describe('Scroll Restoration', () => {
    it('should scroll messageListRef to bottom after history loads', () => {
      const scrollElement = {
        scrollTop: 0,
        scrollHeight: 2000,
      } as HTMLDivElement;

      mockMessageListRef.current = scrollElement;

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.handleHistory([
          { role: 'user', content: 'Test', timestamp: new Date() },
        ]);
      });

      // Fast-forward scroll delay
      act(() => {
        jest.advanceTimersByTime(50);
      });

      expect(scrollElement.scrollTop).toBe(2000);
    });

    it('should use 50ms delay for scroll restoration', () => {
      const scrollElement = {
        scrollTop: 0,
        scrollHeight: 1500,
      } as HTMLDivElement;

      mockMessageListRef.current = scrollElement;

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.handleHistory([]);
      });

      // Before 50ms - no scroll
      expect(scrollElement.scrollTop).toBe(0);

      // After 49ms - still no scroll
      act(() => {
        jest.advanceTimersByTime(49);
      });
      expect(scrollElement.scrollTop).toBe(0);

      // After 50ms - scroll happens
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(scrollElement.scrollTop).toBe(1500);
    });

    it('should not scroll if messageListRef becomes null', () => {
      const { result } = renderHook(() => useHistoryManager(defaultParams));

      // Start with valid ref
      mockMessageListRef.current = {
        scrollTop: 0,
        scrollHeight: 1000,
      } as HTMLDivElement;

      act(() => {
        result.current.handleHistory([]);
      });

      // Ref becomes null before delay
      mockMessageListRef.current = null;

      // Fast-forward delay - should not throw
      act(() => {
        jest.advanceTimersByTime(50);
      });

      expect(true).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete history load flow', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
        })
      );

      // 1. Trigger history request
      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).toHaveBeenCalledWith('conv-123');
      expect(result.current.shouldLoadHistory).toBe(true);

      // 2. History loads successfully
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi!', timestamp: new Date() },
      ];

      act(() => {
        result.current.handleHistory(messages);
      });

      expect(mockSetMessages).toHaveBeenCalledWith(messages);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(result.current.shouldLoadHistory).toBe(false);

      // 3. Scroll happens after delay
      act(() => {
        jest.advanceTimersByTime(50);
      });

      expect(mockMessageListRef.current?.scrollTop).toBe(1000);

      // 4. Timeout does not fire error
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockSetError).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle history timeout scenario', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          isLoading: true,
          messages: [],
        })
      );

      // 1. Trigger history request
      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).toHaveBeenCalled();

      // 2. Timeout expires before history loads
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[useHistoryManager] History request timeout - clearing loading state'
      );
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockSetError).toHaveBeenCalledWith('Failed to load conversation. Please try again.');

      consoleWarnSpy.mockRestore();
    });

    it('should handle rapid conversation switching', () => {
      const { result, rerender } = renderHook(
        (props) => useHistoryManager(props),
        {
          initialProps: {
            ...defaultParams,
            conversationId: 'conv-1',
            isLoading: true,
          },
        }
      );

      // Request history for conv-1
      act(() => {
        result.current.setShouldLoadHistory(true);
      });

      expect(mockRequestHistory).toHaveBeenCalledWith('conv-1');

      // Switch to conv-2 before conv-1 history loads
      rerender({
        ...defaultParams,
        conversationId: 'conv-2',
        isLoading: true,
      });

      // The old timeout should be cleaned up
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should have error from new request, not old one
      expect(mockSetError).toHaveBeenCalledTimes(1);
    });
  });

  describe('Export State Rehydration', () => {
    it('should rehydrate download component from cache when history lacks it', () => {
      const cachedExport: ExportReadyPayload = {
        conversationId: 'conv-123',
        assessmentId: 'assessment-456',
        formats: ['pdf', 'word'],
        questionCount: 25,
      };
      mockGetExportReady.mockReturnValue(cachedExport);

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      // History loads without download component
      const loadedMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Here is your questionnaire.', timestamp: new Date() },
      ];

      act(() => {
        result.current.handleHistory(loadedMessages);
      });

      // Run setTimeout(0) for rehydration
      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(mockGetExportReady).toHaveBeenCalledWith('conv-123');
      expect(mockAppendComponentToLastAssistantMessage).toHaveBeenCalledWith({
        type: 'download',
        data: {
          assessmentId: 'assessment-456',
          formats: ['pdf', 'word'],
          questionCount: 25,
        },
      });
    });

    it('should NOT rehydrate if history already has download component', () => {
      const cachedExport: ExportReadyPayload = {
        conversationId: 'conv-123',
        assessmentId: 'assessment-456',
        formats: ['pdf'],
        questionCount: 10,
      };
      mockGetExportReady.mockReturnValue(cachedExport);

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      // History already has download component
      const loadedMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        {
          role: 'assistant',
          content: 'Here is your questionnaire.',
          timestamp: new Date(),
          components: [
            {
              type: 'download',
              data: { assessmentId: 'existing-assessment', formats: ['pdf'] },
            },
          ],
        },
      ];

      act(() => {
        result.current.handleHistory(loadedMessages);
      });

      // Run all timers
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Should NOT have called append because component already exists
      expect(mockAppendComponentToLastAssistantMessage).not.toHaveBeenCalled();
    });

    it('should NOT rehydrate if no cached export exists', () => {
      mockGetExportReady.mockReturnValue(undefined);

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      const loadedMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Response', timestamp: new Date() },
      ];

      act(() => {
        result.current.handleHistory(loadedMessages);
      });

      // Run all timers
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockGetExportReady).toHaveBeenCalledWith('conv-123');
      expect(mockAppendComponentToLastAssistantMessage).not.toHaveBeenCalled();
    });

    it('should NOT rehydrate if conversationId is null', () => {
      const cachedExport: ExportReadyPayload = {
        conversationId: 'conv-123',
        assessmentId: 'assessment-456',
        formats: ['pdf'],
        questionCount: 10,
      };
      mockGetExportReady.mockReturnValue(cachedExport);

      const { result } = renderHook(() =>
        useHistoryManager({
          ...defaultParams,
          conversationId: null,
        })
      );

      act(() => {
        result.current.handleHistory([]);
      });

      // Run all timers
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // getExportReady should never be called if conversationId is null
      expect(mockGetExportReady).not.toHaveBeenCalled();
      expect(mockAppendComponentToLastAssistantMessage).not.toHaveBeenCalled();
    });

    it('should log rehydration when it occurs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const cachedExport: ExportReadyPayload = {
        conversationId: 'conv-123',
        assessmentId: 'assessment-789',
        formats: ['excel'],
        questionCount: 50,
      };
      mockGetExportReady.mockReturnValue(cachedExport);

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.handleHistory([
          { role: 'assistant', content: 'Done', timestamp: new Date() },
        ]);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useHistoryManager] Rehydrating download component from cache:',
        'assessment-789'
      );

      consoleSpy.mockRestore();
    });

    it('should log skip message when download component already in history', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const cachedExport: ExportReadyPayload = {
        conversationId: 'conv-123',
        assessmentId: 'assessment-456',
        formats: ['pdf'],
        questionCount: 10,
      };
      mockGetExportReady.mockReturnValue(cachedExport);

      const { result } = renderHook(() => useHistoryManager(defaultParams));

      act(() => {
        result.current.handleHistory([
          {
            role: 'assistant',
            content: 'Done',
            timestamp: new Date(),
            components: [{ type: 'download', data: { assessmentId: 'x' } }],
          },
        ]);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useHistoryManager] Download component already in history, skipping rehydration'
      );

      consoleSpy.mockRestore();
    });
  });
});
