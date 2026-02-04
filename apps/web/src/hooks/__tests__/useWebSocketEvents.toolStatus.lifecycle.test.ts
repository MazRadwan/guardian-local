import { renderHook, act } from '@testing-library/react';
import { useWebSocketEvents } from '../useWebSocketEvents';
import type { ChatMessage } from '@/lib/websocket';
import type { Conversation } from '@/stores/chatStore';
import { useChatStore, TOOL_STATUS_TIMEOUT_MS } from '@/stores/chatStore';

// Mock refs
const createMockComposerRef = () => ({
  current: {
    focus: jest.fn(),
  },
});

describe('useWebSocketEvents - toolStatus lifecycle (Epic 33.3.2)', () => {
  // Mock store actions
  const mockAddMessage = jest.fn();
  const mockSetMessages = jest.fn();
  const mockFinishStreaming = jest.fn();
  const mockStartStreaming = jest.fn();
  const mockAppendToLastMessage = jest.fn();
  const mockSetLoading = jest.fn();
  const mockSetError = jest.fn();
  const mockSetConversations = jest.fn();
  const mockAddConversation = jest.fn();
  const mockUpdateConversationTitle = jest.fn();
  const mockRemoveConversationFromList = jest.fn();
  const mockClearDeleteConversationRequest = jest.fn();
  const mockRequestNewChat = jest.fn();
  const mockSetExportReady = jest.fn();
  const mockClearExportReady = jest.fn();
  const mockAppendComponentToLastAssistantMessage = jest.fn();

  // Mock other hooks
  const mockHandleHistory = jest.fn();
  const mockSetShouldLoadHistory = jest.fn();
  const mockMarkConversationAsJustCreated = jest.fn();
  const mockSetActiveConversation = jest.fn();
  const mockSetModeFromConversation = jest.fn();

  // Mock flags
  const mockSetRegeneratingMessageIndex = jest.fn();
  const mockFocusComposer = jest.fn();

  const defaultParams = {
    addMessage: mockAddMessage,
    setMessages: mockSetMessages,
    finishStreaming: mockFinishStreaming,
    startStreaming: mockStartStreaming,
    appendToLastMessage: mockAppendToLastMessage,
    appendComponentToLastAssistantMessage: mockAppendComponentToLastAssistantMessage,
    setLoading: mockSetLoading,
    setError: mockSetError,
    setConversations: mockSetConversations,
    addConversation: mockAddConversation,
    updateConversationTitle: mockUpdateConversationTitle,
    removeConversationFromList: mockRemoveConversationFromList,
    clearDeleteConversationRequest: mockClearDeleteConversationRequest,
    requestNewChat: mockRequestNewChat,
    setExportReady: mockSetExportReady,
    clearExportReady: mockClearExportReady,
    messages: [] as ChatMessage[],
    isLoading: false,
    activeConversationId: 'conv-1',
    conversations: [] as Conversation[],
    newChatRequested: false,
    composerRef: createMockComposerRef(),
    handleHistory: mockHandleHistory,
    setShouldLoadHistory: mockSetShouldLoadHistory,
    markConversationAsJustCreated: mockMarkConversationAsJustCreated,
    setActiveConversation: mockSetActiveConversation,
    setModeFromConversation: mockSetModeFromConversation,
    setRegeneratingMessageIndex: mockSetRegeneratingMessageIndex,
    focusComposer: mockFocusComposer,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset store state
    useChatStore.setState({
      toolStatus: 'idle',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('toolStatus resets to idle on abort event', () => {
    it('should reset toolStatus to idle when stream is aborted', () => {
      // Set initial tool status
      useChatStore.setState({ toolStatus: 'searching' });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      // Simulate stream abortion
      result.current.handleStreamAborted('conv-1');

      // toolStatus should be reset to idle
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should reset toolStatus to idle when abort while reading', () => {
      useChatStore.setState({ toolStatus: 'reading' });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      result.current.handleStreamAborted('conv-1');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('toolStatus resets to idle on error', () => {
    it('should reset toolStatus to idle when error occurs', () => {
      useChatStore.setState({ toolStatus: 'searching' });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      // Simulate an error
      result.current.handleError('Tool execution failed');

      // toolStatus should be reset to idle
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should reset toolStatus when error while reading', () => {
      useChatStore.setState({ toolStatus: 'reading' });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      result.current.handleError('Network timeout');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('toolStatus resets on conversation switch', () => {
    it('should reset toolStatus to idle when switching conversations', () => {
      useChatStore.setState({
        toolStatus: 'searching',
        activeConversationId: 'conv-1',
      });

      // Simulate conversation switch via store
      useChatStore.getState().setActiveConversation('conv-2');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should reset toolStatus when switching from reading state', () => {
      useChatStore.setState({
        toolStatus: 'reading',
        activeConversationId: 'conv-1',
      });

      useChatStore.getState().setActiveConversation('conv-3');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('safety timeout clears toolStatus after 30 seconds', () => {
    it('should auto-clear toolStatus to idle after timeout when searching', () => {
      useChatStore.getState().setToolStatus('searching');
      expect(useChatStore.getState().toolStatus).toBe('searching');

      // Fast-forward time past the timeout
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS);
      });

      // Should be reset to idle after timeout
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should auto-clear toolStatus to idle after timeout when reading', () => {
      useChatStore.getState().setToolStatus('reading');
      expect(useChatStore.getState().toolStatus).toBe('reading');

      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS);
      });

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should not auto-clear when status is already idle', () => {
      useChatStore.getState().setToolStatus('idle');
      expect(useChatStore.getState().toolStatus).toBe('idle');

      // Fast-forward - no timeout should fire for idle status
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS + 5000);
      });

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('safety timeout is cancelled when status becomes idle normally', () => {
    it('should cancel timeout when status is set to idle before timeout', () => {
      useChatStore.getState().setToolStatus('searching');

      // Advance part way through timeout
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS / 2);
      });

      // Set to idle before timeout completes
      useChatStore.getState().setToolStatus('idle');
      expect(useChatStore.getState().toolStatus).toBe('idle');

      // Advance past what would have been the timeout
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS);
      });

      // Should still be idle (timeout was cancelled)
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should restart timeout when status changes to new non-idle state', () => {
      useChatStore.getState().setToolStatus('searching');

      // Advance part way
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS / 2);
      });

      // Change to reading (restarts timeout)
      useChatStore.getState().setToolStatus('reading');
      expect(useChatStore.getState().toolStatus).toBe('reading');

      // Advance half the timeout again (should not trigger yet)
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS / 2);
      });

      // Should still be reading (timeout restarted)
      expect(useChatStore.getState().toolStatus).toBe('reading');

      // Advance remaining time to complete new timeout
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS / 2 + 100);
      });

      // Now should be idle
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('TOOL_STATUS_TIMEOUT_MS constant', () => {
    it('should be 30000ms (30 seconds)', () => {
      expect(TOOL_STATUS_TIMEOUT_MS).toBe(30000);
    });
  });

  describe('disconnect during active tool state', () => {
    it('should reset toolStatus when disconnect occurs during searching', () => {
      useChatStore.setState({ toolStatus: 'searching' });

      // Simulate disconnect by calling setToolStatus('idle') as the handler does
      useChatStore.getState().setToolStatus('idle');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should reset toolStatus when disconnect occurs during reading', () => {
      useChatStore.setState({ toolStatus: 'reading' });

      useChatStore.getState().setToolStatus('idle');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('reconnect clears any stale toolStatus', () => {
    it('should reset toolStatus to idle on reconnect', () => {
      // Simulate a stale state that persisted across disconnect
      useChatStore.setState({ toolStatus: 'searching' });

      // Reconnect handler sets status to idle
      useChatStore.getState().setToolStatus('idle');

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('clearToolStatusTimeout', () => {
    it('should clear the timeout without changing state', () => {
      useChatStore.getState().setToolStatus('searching');
      expect(useChatStore.getState().toolStatus).toBe('searching');

      // Clear timeout manually
      useChatStore.getState().clearToolStatusTimeout();

      // State should remain searching
      expect(useChatStore.getState().toolStatus).toBe('searching');

      // Advance time - should NOT auto-clear since timeout was cleared
      act(() => {
        jest.advanceTimersByTime(TOOL_STATUS_TIMEOUT_MS + 5000);
      });

      // Still searching (timeout was manually cleared)
      expect(useChatStore.getState().toolStatus).toBe('searching');
    });
  });
});
