import { renderHook } from '@testing-library/react';
import type { ExportReadyPayload } from '@/lib/websocket';
import { useChatController } from '../useChatController';

const mockUseChatStore = jest.fn();
(mockUseChatStore as any).getState = jest.fn();
jest.mock('@/stores/chatStore', () => ({
  useChatStore: mockUseChatStore,
}));

const mockUseQuestionnairePersistence = jest.fn();
jest.mock('@/hooks/useQuestionnairePersistence', () => ({
  useQuestionnairePersistence: mockUseQuestionnairePersistence,
}));

const mockUseWebSocketAdapter = jest.fn();
jest.mock('@/hooks/useWebSocketAdapter', () => ({
  useWebSocketAdapter: mockUseWebSocketAdapter,
}));

jest.mock('@/hooks/useWebSocketEvents', () => ({
  useWebSocketEvents: () => ({
    handleMessage: jest.fn(),
    handleMessageStream: jest.fn(),
    handleError: jest.fn(),
    handleConnectionReady: jest.fn(),
    handleStreamComplete: jest.fn(),
    handleConversationsList: jest.fn(),
    handleConversationCreated: jest.fn(),
    handleConversationTitleUpdated: jest.fn(),
    handleStreamAborted: jest.fn(),
    handleConversationDeleted: jest.fn(),
    handleConversationModeUpdated: jest.fn(),
    handleExportReady: jest.fn(),
    handleExtractionFailed: jest.fn(),
    handleQuestionnaireReady: jest.fn(),
    handleGenerationPhase: jest.fn(),
  }),
}));

jest.mock('@/services/ChatService', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
    regenerateMessage: jest.fn(),
    abortStream: jest.fn(),
  })),
}));

jest.mock('@/services/ConversationService', () => ({
  ConversationService: jest.fn().mockImplementation(() => ({
    createConversation: jest.fn(),
    deleteConversation: jest.fn(),
    fetchConversations: jest.fn(),
    updateMode: jest.fn(),
  })),
}));

jest.mock('@/hooks/useConversationMode', () => ({
  useConversationMode: () => ({
    mode: 'consult',
    changeMode: jest.fn(),
    isChanging: false,
    setModeFromConversation: jest.fn(),
  }),
}));

jest.mock('@/hooks/useDelayedLoading', () => ({
  useDelayedLoading: () => false,
}));

jest.mock('@/hooks/useHistoryManager', () => ({
  useHistoryManager: () => ({
    shouldLoadHistory: false,
    setShouldLoadHistory: jest.fn(),
    handleHistory: jest.fn(),
  }),
}));

jest.mock('@/hooks/useConversationSync', () => ({
  useConversationSync: () => ({
    savedConversationId: 'conv-123',
    isJustCreatedConversation: () => false,
    markConversationAsJustCreated: jest.fn(),
    handleConversationChange: jest.fn(),
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'token',
    user: { id: 'user-1', email: 'user@example.com' },
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn() }),
}));

describe('useChatController export persistence', () => {
  const mockRequestExportStatus = jest.fn();
  const mockSetExportReady = jest.fn();
  const mockSetQuestionnaireUIState = jest.fn();
  const mockGetExportReady = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rehydrates export from persistence before requesting status', () => {
    const storedExport: ExportReadyPayload = {
      conversationId: 'conv-123',
      assessmentId: 'assessment-1',
      formats: ['pdf', 'docx'],
    };

    const storeState = {
      messages: [],
      isLoading: false,
      error: null,
      isStreaming: false,
      addMessage: jest.fn(),
      setMessages: jest.fn(),
      startStreaming: jest.fn(),
      appendToLastMessage: jest.fn(),
      appendComponentToLastAssistantMessage: jest.fn(),
      finishStreaming: jest.fn(),
      setLoading: jest.fn(),
      setError: jest.fn(),
      clearMessages: jest.fn(),
      activeConversationId: 'conv-123',
      setActiveConversation: jest.fn(),
      setConversations: jest.fn(),
      addConversation: jest.fn(),
      updateConversationTitle: jest.fn(),
      conversations: [],
      newChatRequested: false,
      clearNewChatRequest: jest.fn(),
      requestNewChat: jest.fn(),
      deleteConversationRequested: null,
      clearDeleteConversationRequest: jest.fn(),
      removeConversationFromList: jest.fn(),
      setExportReady: mockSetExportReady,
      clearExportReady: jest.fn(),
      getExportReady: mockGetExportReady,
    };

    mockUseChatStore.mockReturnValue(storeState);
    (mockUseChatStore as any).getState.mockReturnValue({
      setQuestionnaireUIState: mockSetQuestionnaireUIState,
      setPendingQuestionnaire: jest.fn(),
      setQuestionnaireError: jest.fn(),
      setGenerating: jest.fn(),
    });

    const mockPersistence = {
      dismiss: jest.fn(),
      isDismissed: jest.fn(),
      clearDismiss: jest.fn(),
      savePayload: jest.fn(),
      loadPayload: jest.fn().mockReturnValue(null),
      clearPayload: jest.fn(),
      clearAllForUser: jest.fn(),
      saveExport: jest.fn(),
      loadExport: jest.fn().mockReturnValue(storedExport),
      clearExport: jest.fn(),
    };
    mockUseQuestionnairePersistence.mockReturnValue(mockPersistence);

    mockGetExportReady.mockReturnValue(null);

    mockUseWebSocketAdapter.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      sendMessage: jest.fn(),
      requestHistory: jest.fn(),
      fetchConversations: jest.fn(),
      startNewConversation: jest.fn(),
      abortStream: jest.fn(),
      deleteConversation: jest.fn(),
      updateConversationMode: jest.fn(),
      generateQuestionnaire: jest.fn(),
      requestExportStatus: mockRequestExportStatus,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    renderHook(() => useChatController());

    expect(mockPersistence.loadExport).toHaveBeenCalledWith('conv-123');
    expect(mockSetExportReady).toHaveBeenCalledWith('conv-123', storedExport);
    expect(mockSetQuestionnaireUIState).toHaveBeenCalledWith('download');
    expect(mockRequestExportStatus).not.toHaveBeenCalled();
  });
});
