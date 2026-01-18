import { renderHook } from '@testing-library/react';
import { useWebSocketAdapter, type WebSocketEventHandlers } from '../useWebSocketAdapter';
import { useWebSocket } from '../useWebSocket';

// Mock useWebSocket hook
jest.mock('../useWebSocket');

const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

describe('useWebSocketAdapter', () => {
  // Default mock implementation
  const createMockWebSocket = () => ({
    isConnected: false,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendMessage: jest.fn(),
    requestHistory: jest.fn(),
    fetchConversations: jest.fn(),
    startNewConversation: jest.fn(),
    abortStream: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationMode: jest.fn(),
    generateQuestionnaire: jest.fn(),
    requestExportStatus: jest.fn(),
    // Epic 16: Upload event subscriptions
    subscribeUploadProgress: jest.fn().mockReturnValue(() => {}),
    subscribeIntakeContextReady: jest.fn().mockReturnValue(() => {}),
    subscribeScoringParseReady: jest.fn().mockReturnValue(() => {}),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct config', () => {
      const handlers: WebSocketEventHandlers = {
        onMessage: jest.fn(),
        onError: jest.fn(),
      };

      mockUseWebSocket.mockReturnValue(createMockWebSocket());

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          token: 'test-token',
          conversationId: 'conv-123',
          handlers,
          autoConnect: true,
        })
      );

      // Verify useWebSocket was called with correct params
      expect(mockUseWebSocket).toHaveBeenCalledWith({
        url: '/api/ws',
        token: 'test-token',
        conversationId: 'conv-123',
        onMessage: handlers.onMessage,
        onMessageStream: undefined,
        onError: handlers.onError,
        onConnectionReady: undefined,
        onHistory: undefined,
        onStreamComplete: undefined,
        onConversationsList: undefined,
        onConversationCreated: undefined,
        onConversationTitleUpdated: undefined,
        onStreamAborted: undefined,
        onConversationDeleted: undefined,
        onConversationModeUpdated: undefined,
        onExportReady: undefined,
        onExtractionFailed: undefined,
        onQuestionnaireReady: undefined,
        onGenerationPhase: undefined,
        onExportStatusNotFound: undefined,
        onExportStatusError: undefined,
        autoConnect: true,
      });
    });

    it('should default autoConnect to true', () => {
      const handlers: WebSocketEventHandlers = {};
      mockUseWebSocket.mockReturnValue(createMockWebSocket());

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers,
        })
      );

      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          autoConnect: true,
        })
      );
    });

    it('should accept all event handlers', () => {
      const handlers: WebSocketEventHandlers = {
        onMessage: jest.fn(),
        onMessageStream: jest.fn(),
        onError: jest.fn(),
        onConnectionReady: jest.fn(),
        onHistory: jest.fn(),
        onStreamComplete: jest.fn(),
        onConversationsList: jest.fn(),
        onConversationCreated: jest.fn(),
        onConversationTitleUpdated: jest.fn(),
        onStreamAborted: jest.fn(),
        onConversationDeleted: jest.fn(),
      };

      mockUseWebSocket.mockReturnValue(createMockWebSocket());

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers,
        })
      );

      // Verify all handlers passed through
      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          onMessage: handlers.onMessage,
          onMessageStream: handlers.onMessageStream,
          onError: handlers.onError,
          onConnectionReady: handlers.onConnectionReady,
          onHistory: handlers.onHistory,
          onStreamComplete: handlers.onStreamComplete,
          onConversationsList: handlers.onConversationsList,
          onConversationCreated: handlers.onConversationCreated,
          onConversationTitleUpdated: handlers.onConversationTitleUpdated,
          onStreamAborted: handlers.onStreamAborted,
          onConversationDeleted: handlers.onConversationDeleted,
        })
      );
    });
  });

  describe('Connection State', () => {
    it('should expose isConnected from hook', () => {
      const mockWs = createMockWebSocket();
      mockWs.isConnected = true;
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      expect(result.current.isConnected).toBe(true);
    });

    it('should expose isConnecting from hook', () => {
      const mockWs = createMockWebSocket();
      mockWs.isConnecting = true;
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      expect(result.current.isConnecting).toBe(true);
    });

    it('should update when connection state changes', () => {
      // First render with disconnected state
      const mockWs1 = createMockWebSocket();
      mockWs1.isConnected = false;
      mockUseWebSocket.mockReturnValue(mockWs1);

      const { result, rerender } = renderHook(
        ({ url }) =>
          useWebSocketAdapter({
            url,
            handlers: {},
          }),
        { initialProps: { url: '/api/ws' } }
      );

      // Initially not connected
      expect(result.current.isConnected).toBe(false);

      // Simulate connection by returning new mock with connected state
      const mockWs2 = createMockWebSocket();
      mockWs2.isConnected = true;
      mockUseWebSocket.mockReturnValue(mockWs2);

      // Trigger re-render (changing URL to force new wsHook reference)
      rerender({ url: '/api/ws?refresh=1' });

      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('Connection Operations', () => {
    it('should expose connect method', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.connect();

      expect(mockWs.connect).toHaveBeenCalledTimes(1);
    });

    it('should expose disconnect method', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.disconnect();

      expect(mockWs.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Messaging Operations', () => {
    it('should send messages with correct params', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.sendMessage('Hello!', 'conv-123');

      // Story 24.1: sendMessage now takes optional isRegenerate parameter
      expect(mockWs.sendMessage).toHaveBeenCalledWith('Hello!', 'conv-123', undefined, undefined);
    });

    it('should request history with conversation ID', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.requestHistory('conv-123');

      expect(mockWs.requestHistory).toHaveBeenCalledWith('conv-123', undefined);
    });

    it('should request history with limit', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.requestHistory('conv-123', 50);

      expect(mockWs.requestHistory).toHaveBeenCalledWith('conv-123', 50);
    });
  });

  describe('Conversation Operations', () => {
    it('should fetch conversations', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.fetchConversations();

      expect(mockWs.fetchConversations).toHaveBeenCalledTimes(1);
    });

    it('should start new conversation with default mode', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.startNewConversation('consult');

      expect(mockWs.startNewConversation).toHaveBeenCalledWith('consult');
    });

    it('should start new conversation in assessment mode', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.startNewConversation('assessment');

      expect(mockWs.startNewConversation).toHaveBeenCalledWith('assessment');
    });

    it('should delete conversation', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.deleteConversation('conv-123');

      expect(mockWs.deleteConversation).toHaveBeenCalledWith('conv-123');
    });

    it('should update conversation mode', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.updateConversationMode('conv-123', 'assessment');

      expect(mockWs.updateConversationMode).toHaveBeenCalledWith('conv-123', 'assessment');
    });
  });

  describe('Stream Control', () => {
    it('should abort stream', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      result.current.abortStream();

      expect(mockWs.abortStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memoization', () => {
    it('should return stable reference when deps do not change', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result, rerender } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      const firstReference = result.current;
      rerender();
      const secondReference = result.current;

      // Should be the same reference (memoized)
      expect(firstReference).toBe(secondReference);
    });

    it('should maintain method stability', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result, rerender } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      const firstSendMessage = result.current.sendMessage;
      rerender();
      const secondSendMessage = result.current.sendMessage;

      // Methods should be stable references
      expect(firstSendMessage).toBe(secondSendMessage);
    });
  });

  describe('Integration Scenarios', () => {
    it('should work in connected state', () => {
      const mockWs = createMockWebSocket();
      mockWs.isConnected = true;
      mockUseWebSocket.mockReturnValue(mockWs);

      const handlers: WebSocketEventHandlers = {
        onMessage: jest.fn(),
        onError: jest.fn(),
      };

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          token: 'test-token',
          handlers,
          autoConnect: true,
        })
      );

      // Verify connected state
      expect(result.current.isConnected).toBe(true);

      // Should be able to send message
      // Story 24.1: sendMessage now takes optional isRegenerate parameter
      result.current.sendMessage('Test', 'conv-123');
      expect(mockWs.sendMessage).toHaveBeenCalledWith('Test', 'conv-123', undefined, undefined);

      // Should be able to request history
      result.current.requestHistory('conv-123');
      expect(mockWs.requestHistory).toHaveBeenCalledWith('conv-123', undefined);
    });

    it('should work in disconnected state', () => {
      const mockWs = createMockWebSocket();
      mockWs.isConnected = false;
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      // Verify disconnected state
      expect(result.current.isConnected).toBe(false);

      // Should still expose methods (hook will handle guards)
      expect(typeof result.current.sendMessage).toBe('function');
      expect(typeof result.current.connect).toBe('function');
    });

    it('should work with multiple operations', () => {
      const mockWs = createMockWebSocket();
      mockWs.isConnected = true;
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      // Perform multiple operations
      result.current.fetchConversations();
      result.current.sendMessage('Hello', 'conv-1');
      result.current.startNewConversation('assessment');
      result.current.abortStream();
      result.current.deleteConversation('conv-2');

      // Verify all operations called
      expect(mockWs.fetchConversations).toHaveBeenCalledTimes(1);
      // Story 24.1: sendMessage now takes optional isRegenerate parameter
      expect(mockWs.sendMessage).toHaveBeenCalledWith('Hello', 'conv-1', undefined, undefined);
      expect(mockWs.startNewConversation).toHaveBeenCalledWith('assessment');
      expect(mockWs.abortStream).toHaveBeenCalledTimes(1);
      expect(mockWs.deleteConversation).toHaveBeenCalledWith('conv-2');
    });
  });

  describe('Error Handling', () => {
    it('should pass through errors from underlying hook', () => {
      const mockWs = createMockWebSocket();
      const errorHandler = jest.fn();
      mockUseWebSocket.mockReturnValue(mockWs);

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {
            onError: errorHandler,
          },
        })
      );

      // Error handler should be registered (verified by call check)
      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          onError: errorHandler,
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty handlers object', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      const { result } = renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      // Should still work
      expect(result.current.isConnected).toBe(false);
      expect(typeof result.current.sendMessage).toBe('function');
    });

    it('should handle missing token', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          token: undefined,
        })
      );
    });

    it('should handle missing conversationId', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
        })
      );

      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: undefined,
        })
      );
    });

    it('should handle autoConnect false', () => {
      const mockWs = createMockWebSocket();
      mockUseWebSocket.mockReturnValue(mockWs);

      renderHook(() =>
        useWebSocketAdapter({
          url: '/api/ws',
          handlers: {},
          autoConnect: false,
        })
      );

      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          autoConnect: false,
        })
      );
    });
  });
});
