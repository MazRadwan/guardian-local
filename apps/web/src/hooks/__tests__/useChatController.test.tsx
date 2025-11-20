import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatController } from '../useChatController';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocketAdapter } from '@/hooks/useWebSocketAdapter';
import { ChatService } from '@/services/ChatService';
import { ConversationService } from '@/services/ConversationService';
import { useConversationMode } from '@/hooks/useConversationMode';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';

// Mock all dependencies
jest.mock('@/stores/chatStore');
jest.mock('@/hooks/useWebSocketAdapter');
jest.mock('@/services/ChatService');
jest.mock('@/services/ConversationService');
jest.mock('@/hooks/useConversationMode');
jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/useDelayedLoading');
jest.mock('@/hooks/useHistoryManager');
jest.mock('@/hooks/useConversationSync');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

describe('useChatController', () => {
  // Mock functions - Store actions
  const mockAddMessage = jest.fn();
  const mockSetMessages = jest.fn();
  const mockStartStreaming = jest.fn();
  const mockAppendToLastMessage = jest.fn();
  const mockFinishStreaming = jest.fn();
  const mockSetLoading = jest.fn();
  const mockSetError = jest.fn();
  const mockClearMessages = jest.fn();
  const mockSetActiveConversation = jest.fn();
  const mockSetConversations = jest.fn();
  const mockAddConversation = jest.fn();
  const mockUpdateConversationTitle = jest.fn();
  const mockRequestNewChat = jest.fn();
  const mockClearNewChatRequest = jest.fn();
  const mockClearDeleteConversationRequest = jest.fn();
  const mockRemoveConversationFromList = jest.fn();

  // Mock functions - Adapter operations
  const mockAdapterSendMessage = jest.fn();
  const mockAdapterRequestHistory = jest.fn();
  const mockAdapterFetchConversations = jest.fn();
  const mockAdapterStartNewConversation = jest.fn();
  const mockAdapterAbortStream = jest.fn();
  const mockAdapterDeleteConversation = jest.fn();

  // Mock functions - Service operations
  const mockChatServiceSendMessage = jest.fn();
  const mockChatServiceRegenerateMessage = jest.fn();
  const mockChatServiceAbortStream = jest.fn();

  const mockConversationServiceCreateConversation = jest.fn();
  const mockConversationServiceDeleteConversation = jest.fn();
  const mockConversationServiceFetchConversations = jest.fn();

  const mockChangeMode = jest.fn();
  const mockReplace = jest.fn();
  const mockGet = jest.fn();

  // Mock localStorage and sessionStorage
  const localStorageMock: Record<string, string> = {};
  const sessionStorageMock: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mock implementations to prevent test pollution
    mockAdapterSendMessage.mockReset();
    mockAdapterRequestHistory.mockReset();
    mockAdapterFetchConversations.mockReset();
    mockAdapterStartNewConversation.mockReset();
    mockAdapterAbortStream.mockReset();
    mockAdapterDeleteConversation.mockReset();

    mockChatServiceSendMessage.mockReset();
    mockChatServiceRegenerateMessage.mockReset();
    mockChatServiceAbortStream.mockReset();

    mockConversationServiceCreateConversation.mockReset();
    mockConversationServiceDeleteConversation.mockReset();
    mockConversationServiceFetchConversations.mockReset();

    mockChangeMode.mockReset();

    // Reset storage mocks
    Object.keys(localStorageMock).forEach(key => delete localStorageMock[key]);
    Object.keys(sessionStorageMock).forEach(key => delete sessionStorageMock[key]);

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => localStorageMock[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          localStorageMock[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete localStorageMock[key];
        }),
        clear: jest.fn(() => {
          Object.keys(localStorageMock).forEach(key => delete localStorageMock[key]);
        }),
      },
      writable: true,
    });

    // Mock sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn((key: string) => sessionStorageMock[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          sessionStorageMock[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete sessionStorageMock[key];
        }),
        clear: jest.fn(() => {
          Object.keys(sessionStorageMock).forEach(key => delete sessionStorageMock[key]);
        }),
      },
      writable: true,
    });

    // Mock next/navigation
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      push: jest.fn(),
    });
    (useSearchParams as jest.Mock).mockReturnValue({
      get: mockGet,
    });

    // Mock useAuth
    (useAuth as jest.Mock).mockReturnValue({
      token: 'mock-token',
      user: { id: 'user-123', email: 'test@example.com' },
    });

    // Mock useDelayedLoading
    const { useDelayedLoading } = require('@/hooks/useDelayedLoading');
    (useDelayedLoading as jest.Mock).mockReturnValue(false);

    // Default useChatStore mock
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: false,
      error: null,
      isStreaming: false,
      addMessage: mockAddMessage,
      setMessages: mockSetMessages,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setLoading: mockSetLoading,
      setError: mockSetError,
      clearMessages: mockClearMessages,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      setConversations: mockSetConversations,
      addConversation: mockAddConversation,
      updateConversationTitle: mockUpdateConversationTitle,
      conversations: [],
      newChatRequested: false,
      clearNewChatRequest: mockClearNewChatRequest,
      requestNewChat: mockRequestNewChat,
      deleteConversationRequested: null,
      clearDeleteConversationRequest: mockClearDeleteConversationRequest,
      removeConversationFromList: mockRemoveConversationFromList,
    });

    // Default useWebSocketAdapter mock
    (useWebSocketAdapter as jest.Mock).mockReturnValue({
      isConnected: true,
      isConnecting: false,
      sendMessage: mockAdapterSendMessage,
      requestHistory: mockAdapterRequestHistory,
      fetchConversations: mockAdapterFetchConversations,
      startNewConversation: mockAdapterStartNewConversation,
      abortStream: mockAdapterAbortStream,
      deleteConversation: mockAdapterDeleteConversation,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    // Default ChatService mock
    (ChatService as jest.Mock).mockImplementation(() => ({
      sendMessage: mockChatServiceSendMessage,
      regenerateMessage: mockChatServiceRegenerateMessage,
      abortStream: mockChatServiceAbortStream,
    }));

    // Default ConversationService mock
    (ConversationService as jest.Mock).mockImplementation(() => ({
      createConversation: mockConversationServiceCreateConversation,
      deleteConversation: mockConversationServiceDeleteConversation,
      fetchConversations: mockConversationServiceFetchConversations,
      switchConversation: jest.fn(),
    }));

    // Default useConversationMode mock
    (useConversationMode as jest.Mock).mockReturnValue({
      mode: 'consult',
      changeMode: mockChangeMode,
      isChanging: false,
    });

    // Default useHistoryManager mock
    const { useHistoryManager } = require('@/hooks/useHistoryManager');
    (useHistoryManager as jest.Mock).mockReturnValue({
      shouldLoadHistory: false,
      setShouldLoadHistory: jest.fn(),
      handleHistory: jest.fn(),
    });

    // Default useConversationSync mock
    const { useConversationSync } = require('@/hooks/useConversationSync');
    (useConversationSync as jest.Mock).mockReturnValue({
      savedConversationId: null,
      isJustCreatedConversation: jest.fn(() => false),
      markConversationAsJustCreated: jest.fn(),
      handleConversationChange: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('initializes with default state from stores', () => {
      const { result } = renderHook(() => useChatController());

      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.mode).toBe('consult');
      expect(result.current.isChanging).toBe(false);
      expect(result.current.regeneratingMessageIndex).toBe(null);
      expect(result.current.activeConversationId).toBe(null);
    });

    it('exposes refs for external access', () => {
      const { result } = renderHook(() => useChatController());

      expect(result.current.composerRef).toBeDefined();
      expect(result.current.messageListRef).toBeDefined();
      expect(result.current.composerRef.current).toBe(null); // Not attached to DOM in test
      expect(result.current.messageListRef.current).toBe(null);
    });

    it('exposes all required handlers', () => {
      const { result } = renderHook(() => useChatController());

      expect(typeof result.current.handleSendMessage).toBe('function');
      expect(typeof result.current.handleModeChange).toBe('function');
      expect(typeof result.current.handleRegenerate).toBe('function');
      expect(typeof result.current.abortStream).toBe('function');
      expect(typeof result.current.setError).toBe('function');
    });

    // NOTE: localStorage loading now handled by useConversationSync (tested separately with 33 tests, 100% coverage)
    it.skip('loads savedConversationId from localStorage on mount - moved to useConversationSync', () => {});

    it('handles missing savedConversationId gracefully', () => {
      // No saved conversation in localStorage
      const { result} = renderHook(() => useChatController());

      // Should not crash
      expect(result.current.activeConversationId).toBe(null);
    });
  });

  describe('Handler: handleSendMessage', () => {
    it('sends message when connected and has active conversation', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-123',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.handleSendMessage('Hello, world!');
      });

      // Now delegated to ChatService
      expect(mockChatServiceSendMessage).toHaveBeenCalledWith('Hello, world!', 'conv-123');
    });

    it('delegates to chat service (validation is service responsibility)', () => {
      (useWebSocketAdapter as jest.Mock).mockReturnValue({
        isConnected: false,
        isConnecting: false,
        sendMessage: mockAdapterSendMessage,
        requestHistory: mockAdapterRequestHistory,
        fetchConversations: mockAdapterFetchConversations,
        startNewConversation: mockAdapterStartNewConversation,
        abortStream: mockAdapterAbortStream,
        deleteConversation: mockAdapterDeleteConversation,
        connect: jest.fn(),
        disconnect: jest.fn(),
      });

      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.handleSendMessage('Hello');
      });

      // Controller delegates to service - validation happens in service layer
      expect(mockChatServiceSendMessage).toHaveBeenCalledWith('Hello', null);
    });

    it('handles sendMessage error gracefully', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-123',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      mockChatServiceSendMessage.mockImplementation(() => {
        throw new Error('Network error');
      });

      const { result } = renderHook(() => useChatController());

      expect(() => {
        act(() => {
          result.current.handleSendMessage('Hello');
        });
      }).toThrow('Network error');
    });
  });

  describe('Handler: handleModeChange', () => {
    it('changes mode and adds system message', async () => {
      const { result } = renderHook(() => useChatController());

      await act(async () => {
        await result.current.handleModeChange('assessment');
      });

      expect(mockChangeMode).toHaveBeenCalledWith('assessment');
      expect(mockAddMessage).toHaveBeenCalledWith({
        role: 'system',
        content: 'Switched to assessment mode',
        timestamp: expect.any(Date),
      });
    });

    it('handles mode change error', async () => {
      mockChangeMode.mockRejectedValue(new Error('Mode change failed'));

      const { result } = renderHook(() => useChatController());

      await act(async () => {
        await result.current.handleModeChange('assessment');
      });

      expect(mockSetError).toHaveBeenCalledWith('Failed to change mode');
    });
  });

  describe('Handler: handleRegenerate', () => {
    it('delegates to ChatService with conversation context', () => {
      const messages = [
        { role: 'user' as const, content: 'Question 1', timestamp: new Date() },
        { role: 'assistant' as const, content: 'Answer 1', timestamp: new Date() },
      ];

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages,
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-123',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.handleRegenerate(1);
      });

      expect(mockChatServiceRegenerateMessage).toHaveBeenCalledWith(
        1,
        'conv-123',
        messages,
        expect.any(Function)
      );
    });

    it('passes null activeConversationId when none selected', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.handleRegenerate(2);
      });

      expect(mockChatServiceRegenerateMessage).toHaveBeenCalledWith(
        2,
        null,
        [],
        expect.any(Function)
      );
    });
  });

  describe('Handler: abortStream', () => {
    it('delegates to WebSocket abortStream', () => {
      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.abortStream();
      });

      expect(mockChatServiceAbortStream).toHaveBeenCalled();
    });
  });

  describe('Handler: setError', () => {
    it('delegates to store setError', () => {
      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.setError('Test error');
      });

      expect(mockSetError).toHaveBeenCalledWith('Test error');
    });

    it('clears error when passed null', () => {
      const { result } = renderHook(() => useChatController());

      act(() => {
        result.current.setError(null);
      });

      expect(mockSetError).toHaveBeenCalledWith(null);
    });
  });

  // NOTE: localStorage and URL syncing now handled by useConversationSync (tested separately with 33 tests, 100% coverage)
  describe.skip('Effect: Load saved conversation from localStorage - moved to useConversationSync', () => {
    it('loads savedConversationId from localStorage on mount', () => {});
    it('handles missing localStorage gracefully', () => {});
  });

  describe.skip('Effect: Sync activeConversationId from URL - moved to useConversationSync', () => {
    it('syncs conversationId from URL params on mount', () => {});
    it('does not sync if activeConversationId already set', () => {});
  });

  describe('Effect: Fetch conversations on connect', () => {
    it('fetches conversations when connected', () => {
      renderHook(() => useChatController());

      // Fast-forward the setTimeout
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockConversationServiceFetchConversations).toHaveBeenCalled();
    });

    it('does not fetch when not connected', () => {
      (useWebSocketAdapter as jest.Mock).mockReturnValue({
        isConnected: false,
        isConnecting: true,
        sendMessage: mockAdapterSendMessage,
        requestHistory: mockAdapterRequestHistory,
        fetchConversations: mockAdapterFetchConversations,
        startNewConversation: mockAdapterStartNewConversation,
        abortStream: mockAdapterAbortStream,
        deleteConversation: mockAdapterDeleteConversation,
      });

      renderHook(() => useChatController());

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockConversationServiceFetchConversations).not.toHaveBeenCalled();
    });
  });

  // NOTE: History request logic now handled by useHistoryManager (tested separately with 29 tests, 100% coverage)
  describe.skip('Effect: Request history after connection - moved to useHistoryManager', () => {
    it('requests history when shouldLoadHistory flag is set', () => {
      // Setup: connectionReady event sets shouldLoadHistory = true
      let onConnectionReady: ((data: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      // Trigger connectionReady with existing conversation
      act(() => {
        onConnectionReady!({
          conversationId: 'existing-conv',
          resumed: true,
          hasActiveConversation: true,
        });
      });

      expect(mockAdapterRequestHistory).toHaveBeenCalledWith('existing-conv');
    });

    it('sets timeout for history request', () => {
      let onConnectionReady: ((data: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      // Need to set isLoading to true for timeout check to trigger
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: true, // Loading state
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      // Trigger connectionReady
      act(() => {
        onConnectionReady!({
          conversationId: 'conv-timeout',
          resumed: true,
          hasActiveConversation: true,
        });
      });

      // Fast-forward to timeout (5 seconds)
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockSetError).toHaveBeenCalledWith('Failed to load conversation. Please try again.');
    });

    it('clears timeout when history loads successfully', () => {
      let onConnectionReady: ((data: any) => void) | undefined;
      let onHistory: ((messages: any[]) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        onHistory = handlers.onHistory;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      // Need loading state for timeout
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: true,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      // Trigger connectionReady
      act(() => {
        onConnectionReady!({
          conversationId: 'conv-success',
          resumed: true,
          hasActiveConversation: true,
        });
      });

      // History loads before timeout
      act(() => {
        onHistory!([{ role: 'user', content: 'Hello', timestamp: new Date() }]);
      });

      // Fast-forward past timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should NOT show error (timeout was cleared)
      expect(mockSetError).not.toHaveBeenCalledWith('Failed to load conversation. Please try again.');
    });
  });

  describe('Effect: Handle conversation switching', () => {
    it('loads history when switching to existing conversation', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'switch-to-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(mockClearMessages).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(true);
      expect(mockAdapterRequestHistory).toHaveBeenCalledWith('switch-to-conv');
      // URL updates now handled by useConversationSync
    });

    // NOTE: localStorage updates now handled by useConversationSync (tested separately)
    it.skip('updates localStorage when switching conversations - moved to useConversationSync', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'new-active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(window.localStorage.setItem).toHaveBeenCalledWith('guardian_conversation_id', 'new-active-conv');
    });

    // NOTE: URL navigation loop prevention now handled by useConversationSync (tested separately)
    it.skip('does not update URL if already matches - moved to useConversationSync', () => {});

    it('handles conversation switch error gracefully', () => {
      mockAdapterRequestHistory.mockImplementation(() => {
        throw new Error('Network error');
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'error-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(mockSetError).toHaveBeenCalledWith('Failed to load conversation');
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('Effect: Handle explicit new chat requests', () => {
    it('creates new conversation when newChatRequested flag is set', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: true,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(mockConversationServiceCreateConversation).toHaveBeenCalledWith('consult');
      expect(mockClearNewChatRequest).toHaveBeenCalled();
    });

    it('aborts active stream before creating new chat', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: true, // Active stream
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: true,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(mockFinishStreaming).toHaveBeenCalled();
      expect(mockChatServiceAbortStream).toHaveBeenCalled();
    });

    it('handles new conversation creation error', () => {
      mockConversationServiceCreateConversation.mockImplementation(() => {
        throw new Error('Backend error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: true,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(consoleSpy).toHaveBeenCalledWith('Failed to start new conversation:', expect.any(Error));
      expect(mockClearNewChatRequest).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Effect: Handle explicit delete requests', () => {
    it('deletes conversation when deleteConversationRequested is set', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: 'conv-to-delete',
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(mockConversationServiceDeleteConversation).toHaveBeenCalledWith('conv-to-delete');
    });

    it('handles delete error gracefully', () => {
      mockConversationServiceDeleteConversation.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: 'conv-error',
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ChatInterface] Error deleting conversation:',
        expect.any(Error)
      );
      expect(mockClearDeleteConversationRequest).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('WebSocket Event Handler: handleMessage', () => {
    it('adds message to store and finishes streaming', () => {
      let onMessage: ((message: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onMessage = handlers.onMessage;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      const message = {
        role: 'assistant',
        content: 'Response from AI',
        timestamp: new Date(),
      };

      act(() => {
        onMessage!(message);
      });

      expect(mockAddMessage).toHaveBeenCalledWith(message);
      expect(mockFinishStreaming).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('WebSocket Event Handler: handleMessageStream', () => {
    it('starts streaming on first chunk', () => {
      let onMessageStream: ((chunk: string, conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onMessageStream = handlers.onMessageStream;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      act(() => {
        onMessageStream!('First chunk', 'active-conv');
      });

      expect(mockStartStreaming).toHaveBeenCalled();
      expect(mockAppendToLastMessage).toHaveBeenCalledWith('First chunk');
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('appends subsequent chunks without starting streaming again', () => {
      let onMessageStream: ((chunk: string, conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onMessageStream = handlers.onMessageStream;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [
          { role: 'user', content: 'Question', timestamp: new Date() },
          { role: 'assistant', content: 'Already streaming...', timestamp: new Date() },
        ],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      act(() => {
        onMessageStream!('Next chunk', 'active-conv');
      });

      expect(mockStartStreaming).not.toHaveBeenCalled(); // Already streaming
      expect(mockAppendToLastMessage).toHaveBeenCalledWith('Next chunk');
    });

    it('ignores chunks for inactive conversation', () => {
      let onMessageStream: ((chunk: string, conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onMessageStream = handlers.onMessageStream;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      // Chunk from inactive conversation
      act(() => {
        onMessageStream!('Chunk from wrong conv', 'inactive-conv');
      });

      expect(mockStartStreaming).not.toHaveBeenCalled();
      expect(mockAppendToLastMessage).not.toHaveBeenCalled();
    });
  });

  describe('WebSocket Event Handler: handleError', () => {
    it('sets error and finishes streaming', () => {
      let onError: ((errorMessage: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onError = handlers.onError;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onError!('Network error occurred');
      });

      expect(mockSetError).toHaveBeenCalledWith('Network error occurred');
      expect(mockFinishStreaming).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  // NOTE: handleHistory logic now in useHistoryManager (tested separately with 29 tests, 100% coverage)
  describe.skip('WebSocket Event Handler: handleHistory - moved to useHistoryManager', () => {
    it('sets messages and clears loading state', () => {
      let onHistory: ((messages: any[]) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onHistory = handlers.onHistory;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      const historyMessages = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi!', timestamp: new Date() },
      ];

      act(() => {
        onHistory!(historyMessages);
      });

      expect(mockSetMessages).toHaveBeenCalledWith(historyMessages);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('clears history timeout on successful load', () => {
      let onHistory: ((messages: any[]) => void) | undefined;
      let onConnectionReady: ((data: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onHistory = handlers.onHistory;
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      // Trigger history request (starts timeout)
      act(() => {
        onConnectionReady!({
          conversationId: 'conv-123',
          resumed: true,
          hasActiveConversation: true,
        });
      });

      // History loads successfully
      act(() => {
        onHistory!([{ role: 'user', content: 'Test', timestamp: new Date() }]);
      });

      // Fast-forward past timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should NOT show error (timeout was cleared)
      expect(mockSetError).not.toHaveBeenCalledWith('Failed to load conversation. Please try again.');
    });
  });

  describe('WebSocket Event Handler: handleStreamComplete', () => {
    it('finishes streaming and clears loading', () => {
      let onStreamComplete: (() => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onStreamComplete = handlers.onStreamComplete;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onStreamComplete!();
      });

      expect(mockFinishStreaming).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('WebSocket Event Handler: handleConversationsList', () => {
    it('updates conversations in store', () => {
      let onConversationsList: ((conversations: any[]) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationsList = handlers.onConversationsList;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      const conversations = [
        { id: 'conv-1', title: 'Conv 1', timestamp: new Date() },
        { id: 'conv-2', title: 'Conv 2', timestamp: new Date() },
      ];

      act(() => {
        onConversationsList!(conversations);
      });

      expect(mockSetConversations).toHaveBeenCalledWith(conversations);
    });
  });

  describe('WebSocket Event Handler: handleConversationCreated', () => {
    it('adds conversation and sets as active', () => {
      let onConversationCreated: ((conversation: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationCreated = handlers.onConversationCreated;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      const newConversation = {
        id: 'new-conv-123',
        title: 'New Chat',
        timestamp: new Date(),
      };

      act(() => {
        onConversationCreated!(newConversation);
      });

      expect(mockAddConversation).toHaveBeenCalledWith(newConversation);
      expect(mockSetActiveConversation).toHaveBeenCalledWith('new-conv-123');
      // localStorage.setItem and router.replace now handled by useConversationSync
    });
  });

  describe('WebSocket Event Handler: handleConversationTitleUpdated', () => {
    it('updates conversation title in store', () => {
      let onConversationTitleUpdated: ((conversationId: string, title: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationTitleUpdated = handlers.onConversationTitleUpdated;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onConversationTitleUpdated!('conv-123', 'Updated Title');
      });

      expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-123', 'Updated Title');
    });
  });

  describe('WebSocket Event Handler: handleStreamAborted', () => {
    it('finishes streaming and clears loading', () => {
      let onStreamAborted: ((conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onStreamAborted = handlers.onStreamAborted;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onStreamAborted!('conv-123');
      });

      expect(mockFinishStreaming).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('WebSocket Event Handler: handleConversationDeleted', () => {
    it('removes conversation from store and clears request flag', () => {
      let onConversationDeleted: ((conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationDeleted = handlers.onConversationDeleted;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onConversationDeleted!('conv-to-delete');
      });

      expect(mockRemoveConversationFromList).toHaveBeenCalledWith('conv-to-delete');
      expect(mockClearDeleteConversationRequest).toHaveBeenCalled();
    });

    it('clears localStorage if deleted conversation was saved', () => {
      localStorageMock['guardian_conversation_id'] = 'conv-saved';

      let onConversationDeleted: ((conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationDeleted = handlers.onConversationDeleted;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onConversationDeleted!('conv-saved');
      });

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('guardian_conversation_id');
    });

    it('clears activeConversationId if deleted conversation was active', () => {
      let onConversationDeleted: ((conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationDeleted = handlers.onConversationDeleted;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'active-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [
          { id: 'active-conv', title: 'Active', timestamp: new Date() },
        ],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      act(() => {
        onConversationDeleted!('active-conv');
      });

      expect(mockSetActiveConversation).toHaveBeenCalledWith(null);
    });

    it('auto-creates new chat when last conversation is deleted', () => {
      let onConversationDeleted: ((conversationId: string) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationDeleted = handlers.onConversationDeleted;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'last-conv',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [
          { id: 'last-conv', title: 'Last Conversation', timestamp: new Date() },
        ],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      renderHook(() => useChatController());

      act(() => {
        onConversationDeleted!('last-conv');
      });

      expect(mockRequestNewChat).toHaveBeenCalled();
    });
  });

  describe('WebSocket Event Handler: handleConnectionReady', () => {
    it('resumes existing conversation and loads history', async () => {
      const mockSetShouldLoadHistory = jest.fn();
      let onConnectionReady: ((data: any) => void) | undefined;

      const { useHistoryManager } = require('@/hooks/useHistoryManager');
      (useHistoryManager as jest.Mock).mockReturnValue({
        shouldLoadHistory: false,
        setShouldLoadHistory: mockSetShouldLoadHistory,
        handleHistory: jest.fn(),
      });

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      await act(async () => {
        onConnectionReady!({
          conversationId: 'resumed-conv',
          resumed: true,
          hasActiveConversation: true,
        });
        // Allow effects to run
        await Promise.resolve();
      });

      expect(mockSetActiveConversation).toHaveBeenCalledWith('resumed-conv');
      expect(mockSetShouldLoadHistory).toHaveBeenCalledWith(true);
      // localStorage.setItem and requestHistory now handled by useConversationSync and useHistoryManager
    });

    it('auto-creates new chat when no active conversation', () => {
      let onConnectionReady: ((data: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onConnectionReady!({
          resumed: false,
          hasActiveConversation: false,
        });
      });

      expect(mockRequestNewChat).toHaveBeenCalled();
      expect(sessionStorageMock['guardian_auto_created_chat']).toBe('true');
    });

    it('guards against React Strict Mode double auto-create', () => {
      sessionStorageMock['guardian_auto_created_chat'] = 'true';

      let onConnectionReady: ((data: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onConnectionReady!({
          resumed: false,
          hasActiveConversation: false,
        });
      });

      expect(mockRequestNewChat).not.toHaveBeenCalled();
    });

    it('always clears loading state', () => {
      let onConnectionReady: ((data: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConnectionReady = handlers.onConnectionReady;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      act(() => {
        onConnectionReady!({
          resumed: false,
          hasActiveConversation: false,
        });
      });

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('Guard Flags', () => {
    it('prevents duplicate new conversation creation', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: null,
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: true,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      // First render - should create
      const { rerender } = renderHook(() => useChatController());

      expect(mockConversationServiceCreateConversation).toHaveBeenCalledTimes(1);

      // Rerender with same flag (simulates React Strict Mode)
      rerender();

      // Should NOT create again (guard flag prevents it)
      expect(mockConversationServiceCreateConversation).toHaveBeenCalledTimes(1);
    });

    it('skips history loading for newly created conversations', () => {
      let onConversationCreated: ((conversation: any) => void) | undefined;

      (useWebSocketAdapter as jest.Mock).mockImplementation(({ handlers }: any) => {
        onConversationCreated = handlers.onConversationCreated;
        return {
          isConnected: true,
          isConnecting: false,
          sendMessage: mockAdapterSendMessage,
          requestHistory: mockAdapterRequestHistory,
          fetchConversations: mockAdapterFetchConversations,
          startNewConversation: mockAdapterStartNewConversation,
          abortStream: mockAdapterAbortStream,
          deleteConversation: mockAdapterDeleteConversation,
        };
      });

      renderHook(() => useChatController());

      const newConversation = {
        id: 'just-created',
        title: 'New Chat',
        timestamp: new Date(),
      };

      // Simulate conversation created event
      act(() => {
        onConversationCreated!(newConversation);
      });

      // Should NOT request history for newly created conversation
      expect(mockAdapterRequestHistory).not.toHaveBeenCalledWith('just-created');
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid conversation switching', () => {
      const { rerender } = renderHook(() => useChatController());

      // Switch to conv-1
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-1',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      rerender();

      // Switch to conv-2
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        isStreaming: false,
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setLoading: mockSetLoading,
        setError: mockSetError,
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-2',
        setActiveConversation: mockSetActiveConversation,
        setConversations: mockSetConversations,
        addConversation: mockAddConversation,
        updateConversationTitle: mockUpdateConversationTitle,
        conversations: [],
        newChatRequested: false,
        clearNewChatRequest: mockClearNewChatRequest,
        requestNewChat: mockRequestNewChat,
        deleteConversationRequested: null,
        clearDeleteConversationRequest: mockClearDeleteConversationRequest,
        removeConversationFromList: mockRemoveConversationFromList,
      });

      rerender();

      // Both should have been loaded
      expect(mockAdapterRequestHistory).toHaveBeenCalledWith('conv-1');
      expect(mockAdapterRequestHistory).toHaveBeenCalledWith('conv-2');
      expect(mockClearMessages).toHaveBeenCalledTimes(2);
    });

    it('handles unmount cleanup', () => {
      const { unmount } = renderHook(() => useChatController());

      // Should not crash on unmount
      expect(() => unmount()).not.toThrow();
    });

    it('handles missing token gracefully', () => {
      (useAuth as jest.Mock).mockReturnValue({
        token: null,
        user: null,
      });

      const { result } = renderHook(() => useChatController());

      // Should not crash
      expect(result.current).toBeDefined();
    });

    it('handles missing WebSocket methods gracefully', () => {
      (useWebSocketAdapter as jest.Mock).mockReturnValue({
        isConnected: false,
        isConnecting: false,
        sendMessage: undefined,
        requestHistory: undefined,
        fetchConversations: undefined,
        startNewConversation: undefined,
        abortStream: undefined,
        deleteConversation: undefined,
      });

      const { result } = renderHook(() => useChatController());

      // Should not crash when handlers are called
      expect(() => {
        act(() => {
          result.current.handleSendMessage('Test');
        });
      }).not.toThrow();
    });
  });
});
