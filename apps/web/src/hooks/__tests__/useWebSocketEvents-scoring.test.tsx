/**
 * Epic 15 Story 5a.7: Tests for scoring event handlers in useWebSocketEvents
 */

import { renderHook } from '@testing-library/react';
import { useWebSocketEvents } from '../useWebSocketEvents';
import { useChatStore } from '@/stores/chatStore';
import type {
  ScoringStartedPayload,
  ScoringProgressPayload,
  ScoringCompletePayload,
  ScoringErrorPayload,
} from '@/lib/websocket';

// Mock chatStore
jest.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: jest.fn(),
  },
  GENERATION_STEPS: [],
}));

describe('useWebSocketEvents - Scoring Events', () => {
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      updateScoringProgress: jest.fn(),
      setScoringResult: jest.fn(),
      resetScoring: jest.fn(),
      setScoringResultForConversation: jest.fn(), // Story 5c persistence
      clearVendorClarification: jest.fn(), // Epic 18.4.2b: Clear clarification on scoring start
    };

    (useChatStore.getState as jest.Mock).mockReturnValue(mockStore);
  });

  const createMockParams = (activeConversationId = 'conv-123') => ({
    addMessage: jest.fn(),
    setMessages: jest.fn(),
    finishStreaming: jest.fn(),
    startStreaming: jest.fn(),
    appendToLastMessage: jest.fn(),
    appendComponentToLastAssistantMessage: jest.fn(),
    setLoading: jest.fn(),
    setError: jest.fn(),
    setConversations: jest.fn(),
    addConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    removeConversationFromList: jest.fn(),
    clearDeleteConversationRequest: jest.fn(),
    requestNewChat: jest.fn(),
    setExportReady: jest.fn(),
    clearExportReady: jest.fn(),
    messages: [],
    isLoading: false,
    activeConversationId,
    conversations: [],
    newChatRequested: false,
    composerRef: { current: null },
    handleHistory: jest.fn(),
    setShouldLoadHistory: jest.fn(),
    markConversationAsJustCreated: jest.fn(),
    setActiveConversation: jest.fn(),
    setModeFromConversation: jest.fn(),
    setRegeneratingMessageIndex: jest.fn(),
    focusComposer: jest.fn(),
  });

  describe('handleScoringStarted', () => {
    it('should update scoring progress when scoring starts', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringStartedPayload = {
        conversationId: 'conv-123',
        assessmentId: 'assessment-456',
        fileId: 'file-789',
      };

      result.current.handleScoringStarted(payload);

      expect(mockStore.updateScoringProgress).toHaveBeenCalledWith({
        status: 'parsing',
        message: 'Starting analysis...',
      });
    });

    it('should ignore scoring_started for inactive conversation', () => {
      const params = createMockParams('conv-123');
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringStartedPayload = {
        conversationId: 'conv-999', // Different conversation
        assessmentId: 'assessment-456',
        fileId: 'file-789',
      };

      result.current.handleScoringStarted(payload);

      expect(mockStore.updateScoringProgress).not.toHaveBeenCalled();
    });
  });

  describe('handleScoringProgress', () => {
    it('should update scoring progress with status and message', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringProgressPayload = {
        conversationId: 'conv-123',
        status: 'scoring',
        message: 'Analyzing responses...',
        progress: 50,
      };

      result.current.handleScoringProgress(payload);

      expect(mockStore.updateScoringProgress).toHaveBeenCalledWith({
        status: 'scoring',
        message: 'Analyzing responses...',
        progress: 50,
        error: undefined,
      });
    });

    it('should ignore scoring_progress for inactive conversation', () => {
      const params = createMockParams('conv-123');
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringProgressPayload = {
        conversationId: 'conv-999',
        status: 'scoring',
        message: 'Analyzing...',
      };

      result.current.handleScoringProgress(payload);

      expect(mockStore.updateScoringProgress).not.toHaveBeenCalled();
    });
  });

  describe('handleScoringComplete', () => {
    it('should update progress and store results on completion', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringCompletePayload = {
        conversationId: 'conv-123',
        result: {
          compositeScore: 75,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: 'Test summary',
          keyFindings: ['Finding 1', 'Finding 2'],
          dimensionScores: [
            { dimension: 'Technical', score: 80, riskRating: 'low' },
            { dimension: 'Security', score: 70, riskRating: 'medium' },
          ],
          batchId: 'batch-123',
          assessmentId: 'assessment-456',
        },
        narrativeReport: 'Full narrative report...',
      };

      result.current.handleScoringComplete(payload);

      expect(mockStore.updateScoringProgress).toHaveBeenCalledWith({
        status: 'complete',
        message: 'Analysis complete!',
      });

      expect(mockStore.setScoringResult).toHaveBeenCalledWith(payload.result);

      // Story 5c: Should also save to per-conversation cache
      expect(mockStore.setScoringResultForConversation).toHaveBeenCalledWith(
        'conv-123',
        payload.result
      );
    });

    it('should ignore scoring_complete for inactive conversation', () => {
      const params = createMockParams('conv-123');
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringCompletePayload = {
        conversationId: 'conv-999',
        result: {
          compositeScore: 75,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          executiveSummary: 'Test summary',
          keyFindings: [],
          dimensionScores: [],
          batchId: 'batch-123',
          assessmentId: 'assessment-456',
        },
        narrativeReport: 'Report',
      };

      result.current.handleScoringComplete(payload);

      expect(mockStore.updateScoringProgress).not.toHaveBeenCalled();
      expect(mockStore.setScoringResult).not.toHaveBeenCalled();
      expect(mockStore.setScoringResultForConversation).not.toHaveBeenCalled();
    });
  });

  describe('handleScoringError', () => {
    it('should display user-friendly error for ASSESSMENT_NOT_FOUND', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringErrorPayload = {
        conversationId: 'conv-123',
        error: 'Assessment not found',
        code: 'ASSESSMENT_NOT_FOUND',
      };

      result.current.handleScoringError(payload);

      expect(mockStore.updateScoringProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Assessment not found. Please try again.',
        error: 'Assessment not found',
      });
    });

    it('should display user-friendly error for PARSE_FAILED', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringErrorPayload = {
        conversationId: 'conv-123',
        error: 'Parsing failed',
        code: 'PARSE_FAILED',
      };

      result.current.handleScoringError(payload);

      expect(mockStore.updateScoringProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to extract responses from the document. Please ensure you uploaded a valid Guardian questionnaire.',
        error: 'Parsing failed',
      });
    });

    it('should fallback to generic message for unknown error code', () => {
      const params = createMockParams();
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringErrorPayload = {
        conversationId: 'conv-123',
        error: 'Unknown error',
        code: 'UNKNOWN_CODE',
      };

      result.current.handleScoringError(payload);

      expect(mockStore.updateScoringProgress).toHaveBeenCalledWith({
        status: 'error',
        message: 'Unknown error',
        error: 'Unknown error',
      });
    });

    it('should ignore scoring_error for inactive conversation', () => {
      const params = createMockParams('conv-123');
      const { result } = renderHook(() => useWebSocketEvents(params));

      const payload: ScoringErrorPayload = {
        conversationId: 'conv-999',
        error: 'Error',
        code: 'SCORING_FAILED',
      };

      result.current.handleScoringError(payload);

      expect(mockStore.updateScoringProgress).not.toHaveBeenCalled();
    });
  });
});
