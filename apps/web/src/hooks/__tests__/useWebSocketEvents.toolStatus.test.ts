import { renderHook } from '@testing-library/react';
import { useWebSocketEvents } from '../useWebSocketEvents';
import type { ChatMessage, ToolStatusPayload } from '@/lib/websocket';
import type { Conversation } from '@/stores/chatStore';
import { useChatStore } from '@/stores/chatStore';

// Mock refs
const createMockComposerRef = () => ({
  current: {
    focus: jest.fn(),
  },
});

describe('useWebSocketEvents - handleToolStatus (Epic 33.3.2)', () => {
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
    // Reset store state
    useChatStore.setState({
      toolStatus: 'idle',
    });
  });

  describe('handleToolStatus', () => {
    it('should return handleToolStatus handler', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      expect(result.current.handleToolStatus).toBeInstanceOf(Function);
    });

    it('should update toolStatus in store when conversationId matches', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: ToolStatusPayload = {
        conversationId: 'conv-1',
        status: 'searching',
      };

      result.current.handleToolStatus(payload);

      expect(useChatStore.getState().toolStatus).toBe('searching');
    });

    it('should update toolStatus to reading', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: ToolStatusPayload = {
        conversationId: 'conv-1',
        status: 'reading',
      };

      result.current.handleToolStatus(payload);

      expect(useChatStore.getState().toolStatus).toBe('reading');
    });

    it('should update toolStatus to idle', () => {
      // Set initial non-idle state
      useChatStore.setState({ toolStatus: 'searching' });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: ToolStatusPayload = {
        conversationId: 'conv-1',
        status: 'idle',
      };

      result.current.handleToolStatus(payload);

      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should ignore events for inactive conversations', () => {
      useChatStore.setState({ toolStatus: 'idle' });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: ToolStatusPayload = {
        conversationId: 'conv-2', // Different conversation
        status: 'searching',
      };

      result.current.handleToolStatus(payload);

      // Should remain idle since event is for different conversation
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should handle rapid status transitions', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      // Simulate rapid transitions: idle -> searching -> reading -> idle
      result.current.handleToolStatus({ conversationId: 'conv-1', status: 'searching' });
      expect(useChatStore.getState().toolStatus).toBe('searching');

      result.current.handleToolStatus({ conversationId: 'conv-1', status: 'reading' });
      expect(useChatStore.getState().toolStatus).toBe('reading');

      result.current.handleToolStatus({ conversationId: 'conv-1', status: 'idle' });
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('setToolStatus store action', () => {
    it('should correctly update toolStatus state', () => {
      useChatStore.getState().setToolStatus('searching');
      expect(useChatStore.getState().toolStatus).toBe('searching');

      useChatStore.getState().setToolStatus('reading');
      expect(useChatStore.getState().toolStatus).toBe('reading');

      useChatStore.getState().setToolStatus('idle');
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });
  });

  describe('toolStatus resets on setActiveConversation', () => {
    it('should reset toolStatus to idle when conversation changes', () => {
      // Set initial tool status
      useChatStore.setState({
        toolStatus: 'searching',
        activeConversationId: 'conv-1',
      });

      // Switch to a different conversation
      useChatStore.getState().setActiveConversation('conv-2');

      // toolStatus should be reset to idle
      expect(useChatStore.getState().toolStatus).toBe('idle');
    });

    it('should not reset toolStatus when setting same conversation', () => {
      useChatStore.setState({
        toolStatus: 'searching',
        activeConversationId: 'conv-1',
      });

      // Set same conversation (idempotent call)
      useChatStore.getState().setActiveConversation('conv-1');

      // toolStatus should remain (setActiveConversation is idempotent for same ID)
      expect(useChatStore.getState().toolStatus).toBe('searching');
    });
  });

  describe('callback stability', () => {
    it('should maintain stable handleToolStatus reference when unrelated state changes', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useWebSocketEvents({ ...defaultParams, isLoading }),
        { initialProps: { isLoading: false } }
      );

      const handleToolStatusBefore = result.current.handleToolStatus;

      // Change unrelated state
      rerender({ isLoading: true });

      // handleToolStatus should maintain stable reference
      expect(result.current.handleToolStatus).toBe(handleToolStatusBefore);
    });

    it('should update handleToolStatus when activeConversationId changes', () => {
      const { result, rerender } = renderHook(
        ({ activeConversationId }) => useWebSocketEvents({ ...defaultParams, activeConversationId }),
        { initialProps: { activeConversationId: 'conv-1' } }
      );

      const handleToolStatusBefore = result.current.handleToolStatus;

      // Change activeConversationId (dependency)
      rerender({ activeConversationId: 'conv-2' });

      // handleToolStatus should have new reference since dep changed
      expect(result.current.handleToolStatus).not.toBe(handleToolStatusBefore);
    });
  });
});
