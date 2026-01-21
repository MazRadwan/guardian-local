import { renderHook } from '@testing-library/react';
import { useWebSocketEvents } from '../useWebSocketEvents';
import type { ChatMessage, QuestionnaireReadyPayload } from '@/lib/websocket';
import type { Conversation } from '@/stores/chatStore';
import { useChatStore, GENERATION_STEPS } from '@/stores/chatStore';
import type { GenerationPhasePayload } from '@guardian/shared';

// Mock refs
const createMockComposerRef = () => ({
  current: {
    focus: jest.fn(),
  },
});

// Track mock store messages for getState() calls in handleMessageStream
let mockStoreMessages: ChatMessage[] = [];

describe('useWebSocketEvents', () => {
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
    sessionStorage.clear();
    mockStoreMessages = []; // Reset store messages
  });

  describe('Initialization', () => {
    it('should return all 15 event handlers', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      expect(result.current.handleMessage).toBeInstanceOf(Function);
      expect(result.current.handleMessageStream).toBeInstanceOf(Function);
      expect(result.current.handleError).toBeInstanceOf(Function);
      expect(result.current.handleConnectionReady).toBeInstanceOf(Function);
      expect(result.current.handleStreamComplete).toBeInstanceOf(Function);
      expect(result.current.handleConversationsList).toBeInstanceOf(Function);
      expect(result.current.handleConversationCreated).toBeInstanceOf(Function);
      expect(result.current.handleConversationTitleUpdated).toBeInstanceOf(Function);
      expect(result.current.handleStreamAborted).toBeInstanceOf(Function);
      expect(result.current.handleConversationDeleted).toBeInstanceOf(Function);
      expect(result.current.handleConversationModeUpdated).toBeInstanceOf(Function);
      expect(result.current.handleExportReady).toBeInstanceOf(Function);
      expect(result.current.handleExtractionFailed).toBeInstanceOf(Function);
      expect(result.current.handleQuestionnaireReady).toBeInstanceOf(Function);
      expect(result.current.handleGenerationPhase).toBeInstanceOf(Function);
    });

    it('should return stable handler references across re-renders', () => {
      const { result, rerender } = renderHook(() => useWebSocketEvents(defaultParams));

      const handlers = { ...result.current };
      rerender();

      expect(result.current.handleMessage).toBe(handlers.handleMessage);
      expect(result.current.handleMessageStream).toBe(handlers.handleMessageStream);
      expect(result.current.handleError).toBe(handlers.handleError);
      expect(result.current.handleConnectionReady).toBe(handlers.handleConnectionReady);
      expect(result.current.handleStreamComplete).toBe(handlers.handleStreamComplete);
      expect(result.current.handleConversationsList).toBe(handlers.handleConversationsList);
      expect(result.current.handleConversationCreated).toBe(handlers.handleConversationCreated);
      expect(result.current.handleConversationTitleUpdated).toBe(handlers.handleConversationTitleUpdated);
      expect(result.current.handleStreamAborted).toBe(handlers.handleStreamAborted);
      expect(result.current.handleConversationDeleted).toBe(handlers.handleConversationDeleted);
      expect(result.current.handleConversationModeUpdated).toBe(handlers.handleConversationModeUpdated);
      expect(result.current.handleExportReady).toBe(handlers.handleExportReady);
      expect(result.current.handleExtractionFailed).toBe(handlers.handleExtractionFailed);
      expect(result.current.handleQuestionnaireReady).toBe(handlers.handleQuestionnaireReady);
      expect(result.current.handleGenerationPhase).toBe(handlers.handleGenerationPhase);
    });
  });

  describe('handleMessage', () => {
    it('should add message to store', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const message: ChatMessage = {
        role: 'assistant',
        content: 'Test response',
        timestamp: new Date(),
      };

      result.current.handleMessage(message);

      expect(mockAddMessage).toHaveBeenCalledWith(message);
    });

    it('should finish streaming', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const message: ChatMessage = {
        role: 'assistant',
        content: 'Test',
        timestamp: new Date(),
      };

      result.current.handleMessage(message);

      expect(mockFinishStreaming).toHaveBeenCalled();
    });

    it('should clear loading state', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const message: ChatMessage = {
        role: 'assistant',
        content: 'Test',
        timestamp: new Date(),
      };

      result.current.handleMessage(message);

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should auto-focus composer', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const message: ChatMessage = {
        role: 'assistant',
        content: 'Test',
        timestamp: new Date(),
      };

      result.current.handleMessage(message);

      expect(mockFocusComposer).toHaveBeenCalled();
    });
  });

  describe('handleMessageStream', () => {
    it('should ignore chunks for inactive conversations', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      result.current.handleMessageStream('chunk', 'conv-2');

      expect(mockStartStreaming).not.toHaveBeenCalled();
      expect(mockAppendToLastMessage).not.toHaveBeenCalled();
    });

    it('should start streaming on first chunk when no messages exist', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        messages: [],
        activeConversationId: 'conv-1',
      }));

      result.current.handleMessageStream('first chunk', 'conv-1');

      expect(mockStartStreaming).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockAppendToLastMessage).toHaveBeenCalledWith('first chunk');
    });

    it('should start streaming on first chunk when last message is not assistant', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        messages: [
          { role: 'user', content: 'Hello', timestamp: new Date() },
        ],
        activeConversationId: 'conv-1',
      }));

      result.current.handleMessageStream('first chunk', 'conv-1');

      expect(mockStartStreaming).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockAppendToLastMessage).toHaveBeenCalledWith('first chunk');
    });

    it('should append subsequent chunks without starting streaming again', () => {
      // Mock getState to return existing messages
      const messagesWithAssistant = [
        { role: 'user' as const, content: 'Hello', timestamp: new Date() },
        { role: 'assistant' as const, content: 'Partial', timestamp: new Date() },
      ];
      const getStateSpy = jest.spyOn(useChatStore, 'getState').mockReturnValue({
        messages: messagesWithAssistant,
      } as ReturnType<typeof useChatStore.getState>);

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      result.current.handleMessageStream('more text', 'conv-1');

      expect(mockStartStreaming).not.toHaveBeenCalled();
      expect(mockAppendToLastMessage).toHaveBeenCalledWith('more text');

      getStateSpy.mockRestore();
    });

    it('should clear loading state when streaming starts', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        messages: [],
        activeConversationId: 'conv-1',
      }));

      result.current.handleMessageStream('chunk', 'conv-1');

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('handleError', () => {
    it('should set error in store', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleError('Connection failed');

      expect(mockSetError).toHaveBeenCalledWith('Connection failed');
    });

    it('should finish streaming', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleError('Error');

      expect(mockFinishStreaming).toHaveBeenCalled();
    });

    it('should clear loading state', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleError('Error');

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should reset regenerating message index', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleError('Error');

      expect(mockSetRegeneratingMessageIndex).toHaveBeenCalledWith(null);
    });
  });

  describe('handleConnectionReady', () => {
    it('should resume existing conversation', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConnectionReady({
        conversationId: 'conv-1',
        resumed: true,
        hasActiveConversation: true,
      });

      expect(mockSetShouldLoadHistory).toHaveBeenCalledWith(true);
      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-1');
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should auto-create new chat when no active conversation', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        newChatRequested: false,
      }));

      result.current.handleConnectionReady({
        resumed: false,
        hasActiveConversation: false,
      });

      expect(mockRequestNewChat).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should use sessionStorage guard to prevent double creation in React Strict Mode', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        newChatRequested: false,
      }));

      // First call should create
      result.current.handleConnectionReady({
        resumed: false,
        hasActiveConversation: false,
      });

      expect(mockRequestNewChat).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem('guardian_auto_created_chat')).toBe('true');

      // Second call should be blocked by guard
      jest.clearAllMocks();
      result.current.handleConnectionReady({
        resumed: false,
        hasActiveConversation: false,
      });

      expect(mockRequestNewChat).not.toHaveBeenCalled();
    });

    it('should not auto-create if newChatRequested flag is set', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        newChatRequested: true,
      }));

      result.current.handleConnectionReady({
        resumed: false,
        hasActiveConversation: false,
      });

      expect(mockRequestNewChat).not.toHaveBeenCalled();
    });

    it('should always clear loading state', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      // Scenario 1: Resume conversation
      result.current.handleConnectionReady({
        conversationId: 'conv-1',
        resumed: true,
        hasActiveConversation: true,
      });
      expect(mockSetLoading).toHaveBeenCalledWith(false);

      jest.clearAllMocks();

      // Scenario 2: No active conversation
      result.current.handleConnectionReady({
        resumed: false,
        hasActiveConversation: false,
      });
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('handleStreamComplete', () => {
    it('should finish streaming', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamComplete();

      expect(mockFinishStreaming).toHaveBeenCalled();
    });

    it('should clear loading state', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamComplete();

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should reset regenerating message index', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamComplete();

      expect(mockSetRegeneratingMessageIndex).toHaveBeenCalledWith(null);
    });

    it('should auto-focus composer', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamComplete();

      expect(mockFocusComposer).toHaveBeenCalled();
    });
  });

  describe('handleConversationsList', () => {
    it('should set conversations in store', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const conversations: Conversation[] = [
        { id: 'conv-1', title: 'Test 1', mode: 'consult', created_at: new Date(), updated_at: new Date() },
        { id: 'conv-2', title: 'Test 2', mode: 'assessment', created_at: new Date(), updated_at: new Date() },
      ];

      result.current.handleConversationsList(conversations);

      expect(mockSetConversations).toHaveBeenCalledWith(conversations);
    });

    it('should handle empty conversations list', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConversationsList([]);

      expect(mockSetConversations).toHaveBeenCalledWith([]);
    });
  });

  describe('handleConversationCreated', () => {
    it('should add conversation to store with titleLoading flag', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const conversation: Conversation = {
        id: 'conv-new',
        title: 'New Chat',
        mode: 'consult',
        created_at: new Date(),
        updated_at: new Date(),
      };

      result.current.handleConversationCreated(conversation);

      // Story 25.5: New conversations have titleLoading: true for loading placeholder UX
      expect(mockAddConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          ...conversation,
          titleLoading: true,
        })
      );
    });

    it('should mark conversation as just created', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const conversation: Conversation = {
        id: 'conv-new',
        title: 'New',
        mode: 'consult',
        created_at: new Date(),
        updated_at: new Date(),
      };

      result.current.handleConversationCreated(conversation);

      expect(mockMarkConversationAsJustCreated).toHaveBeenCalledWith('conv-new');
    });

    it('should set conversation as active', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));
      const conversation: Conversation = {
        id: 'conv-new',
        title: 'New',
        mode: 'consult',
        created_at: new Date(),
        updated_at: new Date(),
      };

      result.current.handleConversationCreated(conversation);

      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-new');
    });
  });

  describe('handleConversationTitleUpdated', () => {
    it('should update conversation title in store', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConversationTitleUpdated('conv-1', 'Updated Title');

      expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-1', 'Updated Title');
    });
  });

  describe('handleStreamAborted', () => {
    it('should finish streaming', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamAborted('conv-1');

      expect(mockFinishStreaming).toHaveBeenCalled();
    });

    it('should clear loading state', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamAborted('conv-1');

      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should reset regenerating message index', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamAborted('conv-1');

      expect(mockSetRegeneratingMessageIndex).toHaveBeenCalledWith(null);
    });

    it('should auto-focus composer', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleStreamAborted('conv-1');

      expect(mockFocusComposer).toHaveBeenCalled();
    });
  });

  describe('handleConversationDeleted', () => {
    beforeEach(() => {
      // Mock localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: jest.fn(),
          setItem: jest.fn(),
          removeItem: jest.fn(),
          clear: jest.fn(),
        },
        writable: true,
      });
    });

    it('should remove conversation from store', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConversationDeleted('conv-1');

      expect(mockRemoveConversationFromList).toHaveBeenCalledWith('conv-1');
    });

    it('should clear delete request flag', () => {
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConversationDeleted('conv-1');

      expect(mockClearDeleteConversationRequest).toHaveBeenCalled();
    });

    it('should clear localStorage if deleted conversation was saved', () => {
      (window.localStorage.getItem as jest.Mock).mockReturnValue('conv-1');
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConversationDeleted('conv-1');

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('guardian_conversation_id');
    });

    it('should not clear localStorage if different conversation was saved', () => {
      (window.localStorage.getItem as jest.Mock).mockReturnValue('conv-2');
      const { result } = renderHook(() => useWebSocketEvents(defaultParams));

      result.current.handleConversationDeleted('conv-1');

      expect(window.localStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should clear active conversation if it matches deleted conversation', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      result.current.handleConversationDeleted('conv-1');

      expect(mockSetActiveConversation).toHaveBeenCalledWith(null);
    });

    it('should not clear active conversation if it does not match', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-2',
      }));

      result.current.handleConversationDeleted('conv-1');

      expect(mockSetActiveConversation).not.toHaveBeenCalled();
    });

    it('should auto-create new chat if last conversation deleted', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        conversations: [
          { id: 'conv-1', title: 'Only One', mode: 'consult', created_at: new Date(), updated_at: new Date() },
        ],
      }));

      result.current.handleConversationDeleted('conv-1');

      expect(mockRequestNewChat).toHaveBeenCalled();
    });

    it('should not auto-create if conversations remain', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        conversations: [
          { id: 'conv-1', title: 'First', mode: 'consult', created_at: new Date(), updated_at: new Date() },
          { id: 'conv-2', title: 'Second', mode: 'consult', created_at: new Date(), updated_at: new Date() },
        ],
      }));

      result.current.handleConversationDeleted('conv-1');

      expect(mockRequestNewChat).not.toHaveBeenCalled();
    });
  });

  describe('handleQuestionnaireReady', () => {
    beforeEach(() => {
      // Reset store state before each test
      useChatStore.setState({
        pendingQuestionnaire: null,
        isGeneratingQuestionnaire: false,
      });
    });

    it('should set pending questionnaire for active conversation', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: QuestionnaireReadyPayload = {
        conversationId: 'conv-1',
        assessmentType: 'comprehensive',
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        contextSummary: 'Test summary',
        estimatedQuestions: 100,
        selectedCategories: ['security', 'privacy'],
      };

      result.current.handleQuestionnaireReady(payload);

      // Should update store
      expect(useChatStore.getState().pendingQuestionnaire).toEqual(payload);
    });

    it('should ignore events for different conversation', () => {
      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: QuestionnaireReadyPayload = {
        conversationId: 'conv-2', // Different conversation
        assessmentType: 'quick',
        vendorName: 'Other Vendor',
        solutionName: null,
        contextSummary: null,
        estimatedQuestions: 50,
        selectedCategories: null,
      };

      result.current.handleQuestionnaireReady(payload);

      // Should NOT update store
      expect(useChatStore.getState().pendingQuestionnaire).toBeNull();
    });

    it('should ignore events while generation is in progress', () => {
      // Set generation in progress
      useChatStore.setState({
        isGeneratingQuestionnaire: true,
      });

      const { result } = renderHook(() => useWebSocketEvents({
        ...defaultParams,
        activeConversationId: 'conv-1',
      }));

      const payload: QuestionnaireReadyPayload = {
        conversationId: 'conv-1',
        assessmentType: 'comprehensive',
        vendorName: 'Test Vendor',
        solutionName: null,
        contextSummary: null,
        estimatedQuestions: 100,
        selectedCategories: null,
      };

      result.current.handleQuestionnaireReady(payload);

      // Should NOT update store (blocked by guard)
      expect(useChatStore.getState().pendingQuestionnaire).toBeNull();
    });
  });

  describe('handleGenerationPhase (Story 13.5.6)', () => {
    beforeEach(() => {
      // Reset store state before each test
      useChatStore.setState({
        currentGenerationStep: -1,
        questionnaireUIState: 'hidden',
      });
    });

    const createPhasePayload = (
      phase: number,
      phaseId: string,
      conversationId = 'conv-1'
    ): GenerationPhasePayload => ({
      conversationId,
      phase,
      phaseId: phaseId as GenerationPhasePayload['phaseId'],
      timestamp: Date.now(),
    });

    describe('basic phase handling', () => {
      it('should update currentGenerationStep on phase event', () => {
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(1, 'generating'));

        expect(useChatStore.getState().currentGenerationStep).toBe(1);
      });

      it('should progress through all phases in order', () => {
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(0, 'context'));
        expect(useChatStore.getState().currentGenerationStep).toBe(0);

        result.current.handleGenerationPhase(createPhasePayload(1, 'generating'));
        expect(useChatStore.getState().currentGenerationStep).toBe(1);

        result.current.handleGenerationPhase(createPhasePayload(2, 'validating'));
        expect(useChatStore.getState().currentGenerationStep).toBe(2);

        result.current.handleGenerationPhase(createPhasePayload(3, 'saving'));
        expect(useChatStore.getState().currentGenerationStep).toBe(3);
      });
    });

    describe('conversation scoping', () => {
      it('should ignore phase events for other conversations', () => {
        useChatStore.setState({ currentGenerationStep: 0 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(2, 'validating', 'different-convo'));

        // Should stay at 0, not advance to 2
        expect(useChatStore.getState().currentGenerationStep).toBe(0);
      });

      it('should process phase events for active conversation', () => {
        useChatStore.setState({ currentGenerationStep: 0 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(2, 'validating', 'conv-1'));

        expect(useChatStore.getState().currentGenerationStep).toBe(2);
      });
    });

    describe('idempotency', () => {
      it('should ignore out-of-order phase events (lower than current)', () => {
        useChatStore.setState({ currentGenerationStep: 2 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(1, 'generating'));

        // Should stay at 2, not go back to 1
        expect(useChatStore.getState().currentGenerationStep).toBe(2);
      });

      it('should ignore duplicate phase events (equal to current)', () => {
        useChatStore.setState({ currentGenerationStep: 2 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(2, 'validating'));

        expect(useChatStore.getState().currentGenerationStep).toBe(2);
      });

      it('should accept forward phase events', () => {
        useChatStore.setState({ currentGenerationStep: 1 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleGenerationPhase(createPhasePayload(3, 'saving'));

        expect(useChatStore.getState().currentGenerationStep).toBe(3);
      });
    });

    describe('export_ready marks complete', () => {
      it('should set step to GENERATION_STEPS.length on export_ready', () => {
        useChatStore.setState({ currentGenerationStep: 3 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleExportReady({
          conversationId: 'conv-1',
          formats: ['pdf', 'word', 'excel'],
          assessmentId: 'test-123',
          questionCount: 50,
        });

        expect(useChatStore.getState().currentGenerationStep).toBe(GENERATION_STEPS.length);
      });

      it('should not update step on export_ready for other conversations', () => {
        useChatStore.setState({ currentGenerationStep: 3 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleExportReady({
          conversationId: 'different-convo',
          formats: ['pdf'],
          assessmentId: 'test-123',
          questionCount: 50,
        });

        // Should stay at 3, not mark complete
        expect(useChatStore.getState().currentGenerationStep).toBe(3);
      });

      it('should set questionnaire stream complete when export_ready is from resume', () => {
        useChatStore.setState({ isQuestionnaireStreamComplete: false });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleExportReady({
          conversationId: 'conv-1',
          formats: ['pdf', 'word', 'excel'],
          assessmentId: 'test-123',
          questionCount: 50,
          resumed: true,
        });

        expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should reset step to -1 on extraction_failed', () => {
        useChatStore.setState({ currentGenerationStep: 2 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleExtractionFailed({
          conversationId: 'conv-1',
          error: 'Generation failed',
          assessmentId: 'test-123',
        });

        expect(useChatStore.getState().currentGenerationStep).toBe(-1);
      });

      it('should not reset step on extraction_failed for other conversations', () => {
        useChatStore.setState({ currentGenerationStep: 2 });
        const { result } = renderHook(() => useWebSocketEvents({
          ...defaultParams,
          activeConversationId: 'conv-1',
        }));

        result.current.handleExtractionFailed({
          conversationId: 'different-convo',
          error: 'Generation failed',
          assessmentId: 'test-123',
        });

        // Should stay at 2, not reset
        expect(useChatStore.getState().currentGenerationStep).toBe(2);
      });
    });
  });

  describe('Callback Stability', () => {
    it('should maintain stable references when unrelated state changes', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useWebSocketEvents({ ...defaultParams, isLoading }),
        { initialProps: { isLoading: false } }
      );

      const handlersBeforeRerender = { ...result.current };

      // Change unrelated state
      rerender({ isLoading: true });

      // All handlers should maintain stable references
      expect(result.current.handleMessage).toBe(handlersBeforeRerender.handleMessage);
      expect(result.current.handleMessageStream).toBe(handlersBeforeRerender.handleMessageStream);
      expect(result.current.handleError).toBe(handlersBeforeRerender.handleError);
      expect(result.current.handleConnectionReady).toBe(handlersBeforeRerender.handleConnectionReady);
      expect(result.current.handleStreamComplete).toBe(handlersBeforeRerender.handleStreamComplete);
      expect(result.current.handleConversationsList).toBe(handlersBeforeRerender.handleConversationsList);
      expect(result.current.handleConversationCreated).toBe(handlersBeforeRerender.handleConversationCreated);
      expect(result.current.handleConversationTitleUpdated).toBe(handlersBeforeRerender.handleConversationTitleUpdated);
      expect(result.current.handleStreamAborted).toBe(handlersBeforeRerender.handleStreamAborted);
      expect(result.current.handleConversationDeleted).toBe(handlersBeforeRerender.handleConversationDeleted);
      expect(result.current.handleConversationModeUpdated).toBe(handlersBeforeRerender.handleConversationModeUpdated);
      expect(result.current.handleExportReady).toBe(handlersBeforeRerender.handleExportReady);
      expect(result.current.handleExtractionFailed).toBe(handlersBeforeRerender.handleExtractionFailed);
      expect(result.current.handleQuestionnaireReady).toBe(handlersBeforeRerender.handleQuestionnaireReady);
      expect(result.current.handleGenerationPhase).toBe(handlersBeforeRerender.handleGenerationPhase);
    });

    it('should update handlers when dependencies change', () => {
      const { result, rerender } = renderHook(
        ({ activeConversationId }) => useWebSocketEvents({ ...defaultParams, activeConversationId }),
        { initialProps: { activeConversationId: 'conv-1' } }
      );

      const handlersBeforeRerender = { ...result.current };

      // Change dependency
      rerender({ activeConversationId: 'conv-2' });

      // handleMessageStream depends on activeConversationId, so it should update
      expect(result.current.handleMessageStream).not.toBe(handlersBeforeRerender.handleMessageStream);
    });
  });
});
