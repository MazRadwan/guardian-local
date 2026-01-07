/**
 * Shared test utilities for ChatInterface and related component tests
 *
 * This module provides:
 * - Mock factory functions for Zustand store
 * - Helper to properly mock useChatStore with selector support
 * - Controller mock factory
 * - Common mock function references
 */

import { useChatStore } from '@/stores/chatStore';
import { GENERATION_STEPS } from '@/types/stepper';

// Common mock functions - tests can import and use these
export const createMockFunctions = () => ({
  addMessage: jest.fn(),
  startStreaming: jest.fn(),
  appendToLastMessage: jest.fn(),
  finishStreaming: jest.fn(),
  setError: jest.fn(),
  sendMessage: jest.fn(),
  changeMode: jest.fn(),
  requestHistory: jest.fn(),
  clearMessages: jest.fn(),
  setActiveConversation: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  get: jest.fn(),
});

/**
 * Creates a complete chat store mock with all required fields
 * Use this to create base state, then override specific fields as needed
 */
export const createStoreMock = (overrides: Record<string, unknown> = {}) => ({
  // Message state
  messages: [],
  isLoading: false,
  error: null,
  isStreaming: false,
  currentStreamingMessage: null,

  // Message actions
  addMessage: jest.fn(),
  startStreaming: jest.fn(),
  appendToLastMessage: jest.fn(),
  appendComponentToLastAssistantMessage: jest.fn(),
  finishStreaming: jest.fn(),
  setError: jest.fn(),
  setLoading: jest.fn(),
  setMessages: jest.fn(),
  clearMessages: jest.fn(),
  updateLastMessage: jest.fn(),

  // Sidebar state
  sidebarOpen: false,
  sidebarMinimized: false,
  toggleSidebar: jest.fn(),
  setSidebarOpen: jest.fn(),
  toggleSidebarMinimized: jest.fn(),
  setSidebarMinimized: jest.fn(),

  // Conversation state
  conversations: [],
  activeConversationId: null,
  newChatRequested: false,
  deleteConversationRequested: null,

  // Conversation actions
  setActiveConversation: jest.fn(),
  setConversations: jest.fn(),
  addConversation: jest.fn(),
  deleteConversation: jest.fn(),
  removeConversationFromList: jest.fn(),
  updateConversationTitle: jest.fn(),
  requestNewChat: jest.fn(),
  clearNewChatRequest: jest.fn(),
  requestDeleteConversation: jest.fn(),
  clearDeleteConversationRequest: jest.fn(),

  // Export state
  exportReadyByConversation: {},
  setExportReady: jest.fn(),
  clearExportReady: jest.fn(),
  getExportReady: jest.fn(),

  // Questionnaire state
  pendingQuestionnaire: null,
  isGeneratingQuestionnaire: false,
  questionnaireUIState: 'hidden' as const,
  questionnaireError: null,
  questionnaireMessageIndex: -1, // Story 14.1.2
  isQuestionnaireStreamComplete: false, // Story 14.1.5

  // Questionnaire actions
  setPendingQuestionnaire: jest.fn(),
  clearPendingQuestionnaire: jest.fn(),
  setGenerating: jest.fn(),
  setQuestionnaireUIState: jest.fn(),
  setQuestionnaireError: jest.fn(),
  setQuestionnaireMessageIndex: jest.fn(), // Story 14.1.2
  setQuestionnaireStreamComplete: jest.fn(), // Story 14.1.5

  // Stepper state (Story 13.4.2)
  generationSteps: GENERATION_STEPS,
  currentGenerationStep: -1,
  setCurrentGenerationStep: jest.fn(),
  resetGenerationStep: jest.fn(),

  // Scoring state (Epic 15 Story 5c)
  scoringProgress: {
    status: 'idle' as const,
    message: '',
  },
  scoringResult: null,
  scoringResultByConversation: {}, // Story 5c persistence cache
  updateScoringProgress: jest.fn(),
  setScoringResult: jest.fn(),
  resetScoring: jest.fn(),
  setScoringResultForConversation: jest.fn(), // Story 5c
  getScoringResultForConversation: jest.fn(), // Story 5c
  clearScoringResultForConversation: jest.fn(), // Story 5c

  // Apply overrides
  ...overrides,
});

/**
 * Sets up useChatStore mock with proper selector support
 *
 * When Zustand's useChatStore is called with a selector function,
 * this mock will apply the selector to the state (matching real behavior).
 * When called without a selector, returns the full state.
 *
 * Also sets up getState() to return the same state object.
 *
 * @example
 * // In test setup:
 * mockChatStoreWithState(createStoreMock({
 *   activeConversationId: 'conv-123',
 *   messages: [{ role: 'user', content: 'test' }]
 * }));
 */
export const mockChatStoreWithState = (storeState: ReturnType<typeof createStoreMock>) => {
  (useChatStore as unknown as jest.Mock).mockImplementation(
    (selector?: (state: typeof storeState) => unknown) => {
      return typeof selector === 'function' ? selector(storeState) : storeState;
    }
  );
  (useChatStore as unknown as { getState: jest.Mock }).getState = jest.fn().mockReturnValue(storeState);
};

/**
 * Creates a mock for useChatController hook
 */
export const createControllerMock = (overrides: Record<string, unknown> = {}) => ({
  messages: [],
  isLoading: false,
  error: null,
  isStreaming: false,
  isConnected: true,
  isConnecting: false,
  mode: 'consult',
  isChanging: false,
  showDelayedLoading: false,
  regeneratingMessageIndex: null,
  composerRef: { current: null },
  messageListRef: { current: null },
  handleSendMessage: jest.fn(),
  handleModeChange: jest.fn(),
  handleRegenerate: jest.fn(),
  abortStream: jest.fn(),
  setError: jest.fn(),
  activeConversationId: null,
  adapter: {
    sendMessage: jest.fn(),
    requestHistory: jest.fn(),
    generateQuestionnaire: jest.fn(),
  },
  ...overrides,
});

/**
 * Creates a mock for useWebSocket hook
 */
export const createWebSocketMock = (overrides: Record<string, unknown> = {}) => ({
  isConnected: true,
  isConnecting: false,
  sendMessage: jest.fn(),
  requestHistory: jest.fn(),
  fetchConversations: jest.fn(),
  startNewConversation: jest.fn(),
  abortStream: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  ...overrides,
});

/**
 * Creates a mock for useConversationMode hook
 */
export const createConversationModeMock = (overrides: Record<string, unknown> = {}) => ({
  mode: 'consult',
  changeMode: jest.fn(),
  isChanging: false,
  ...overrides,
});

/**
 * Creates a mock for useAuth hook
 */
export const createAuthMock = (overrides: Record<string, unknown> = {}) => ({
  token: 'mock-token',
  user: { id: 'user-123', email: 'test@example.com' },
  login: jest.fn(),
  logout: jest.fn(),
  isLoading: false,
  ...overrides,
});

/**
 * Creates a mock for useQuestionnairePersistence hook
 */
export const createPersistenceMock = (overrides: Record<string, unknown> = {}) => ({
  isDismissed: jest.fn().mockReturnValue(false),
  loadPayload: jest.fn().mockReturnValue(null),
  savePayload: jest.fn(),
  clearPayload: jest.fn(),
  dismiss: jest.fn(),
  clearDismiss: jest.fn(),
  clearAllForUser: jest.fn(),
  saveExport: jest.fn(),
  loadExport: jest.fn().mockReturnValue(null),
  clearExport: jest.fn(),
  ...overrides,
});

/**
 * Creates a mock for useUserAssessments hook
 * Story 5a.6: Persistence-based scoring mode visibility
 */
export const createUserAssessmentsMock = (overrides: Record<string, unknown> = {}) => ({
  hasExportedAssessments: false,
  isLoading: false,
  error: null,
  ...overrides,
});

/**
 * Creates a mock for next/navigation hooks
 */
export const createNavigationMock = () => ({
  useRouter: jest.fn().mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: jest.fn().mockReturnValue({
    get: jest.fn(),
  }),
});

/**
 * Sample questionnaire payload for testing
 */
export const createQuestionnairePayload = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-123',
  assessmentType: 'comprehensive' as const,
  vendorName: 'TestVendor',
  solutionName: 'TestSolution',
  contextSummary: 'Test context',
  selectedCategories: ['data-privacy', 'security'],
  estimatedQuestions: 90,
  ...overrides,
});

/**
 * Sample export data for testing
 */
export const createExportData = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-123',
  assessmentId: 'assess-456',
  formats: ['pdf', 'word', 'excel'],
  questionCount: 40,
  ...overrides,
});
