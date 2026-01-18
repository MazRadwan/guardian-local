/**
 * ChatInterface Download Durability Tests (Story 13.3)
 *
 * Tests for download state persistence, localStorage restoration,
 * and durable download buttons.
 * Split from ChatInterface.test.tsx for maintainability.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '../ChatInterface';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConversationMode } from '@/hooks/useConversationMode';
import {
  createStoreMock,
  mockChatStoreWithState,
  createControllerMock,
  createWebSocketMock,
  createConversationModeMock,
  createAuthMock,
  createPersistenceMock,
  createUserAssessmentsMock,
  createQuestionnairePayload,
  createExportData,
} from './_testUtils';

// Mock child components
// Story 14.1: Updated to use new `questionnaire` prop instead of deprecated `questionnaireSlot`
jest.mock('../MessageList', () => ({
  MessageList: React.forwardRef(({ messages, isLoading, questionnaire }: {
    messages: unknown[];
    isLoading: boolean;
    questionnaire?: {
      payload: { assessmentType: string };
      uiState: string;
      exportData?: { formats: string[]; assessmentId: string } | null;
      onGenerate: () => void;
      onDownload: (format: string) => void;
      onRetry: () => void;
    };
  }, ref) => (
    <div data-testid="message-list" ref={ref as React.Ref<HTMLDivElement>}>
      Messages: {messages.length}, Loading: {isLoading.toString()}
      {questionnaire && (
        <div data-testid="questionnaire-message">
          <div data-testid="questionnaire-prompt-card">
            <span data-testid="card-state">State: {questionnaire.uiState}</span>
            <span data-testid="card-type">Type: {questionnaire.payload?.assessmentType}</span>
            {questionnaire.exportData && (
              <button onClick={() => questionnaire.onDownload('pdf')} data-testid="download-btn">
                Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )),
}));

jest.mock('../Composer', () => ({
  Composer: React.forwardRef(({ disabled }: { disabled: boolean }, ref) => (
    <div data-testid="composer" ref={ref as React.Ref<HTMLDivElement>}>
      <button disabled={disabled}>Send</button>
    </div>
  )),
}));

jest.mock('../QuestionnairePromptCard', () => ({
  QuestionnairePromptCard: React.forwardRef(({ payload, uiState, onDownload }: {
    payload: { assessmentType: string };
    uiState: string;
    onDownload?: (format: string) => void;
  }, ref) => (
    <div data-testid="questionnaire-prompt-card" ref={ref as React.Ref<HTMLDivElement>}>
      <span data-testid="card-state">State: {uiState}</span>
      <span data-testid="card-type">Type: {payload?.assessmentType}</span>
      {onDownload && <button onClick={() => onDownload('pdf')} data-testid="download-btn">Download</button>}
    </div>
  )),
}));

// Mock hooks
jest.mock('@/stores/chatStore');
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useConversationMode');
jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/useQuestionnairePersistence');
jest.mock('@/hooks/useUserAssessments');
jest.mock('@/hooks/useChatController');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Epic 22.1.2: Mock the scoring API to prevent fetch interference
jest.mock('@/lib/api/scoring', () => ({
  fetchScoringResult: jest.fn().mockResolvedValue(null),
}));

describe('ChatInterface Download Durability (Story 13.3)', () => {
  const mockFns = {
    setPendingQuestionnaire: jest.fn(),
    setQuestionnaireUIState: jest.fn(),
    clearPendingQuestionnaire: jest.fn(),
    setExportReady: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    get: jest.fn(),
  };

  let mockPersistence: ReturnType<typeof createPersistenceMock>;
  let mockFetch: jest.Mock;
  let originalFetch: typeof global.fetch | undefined;

  beforeEach(() => {
    jest.clearAllMocks();

    // Save original fetch
    originalFetch = global.fetch;

    // Mock fetch for download requests
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['mock pdf content'], { type: 'application/pdf' })),
    } as Response);
    global.fetch = mockFetch;

    // Mock URL APIs
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    // Setup navigation mocks
    const { useRouter, useSearchParams } = require('next/navigation');
    (useRouter as jest.Mock).mockReturnValue({
      push: mockFns.push,
      replace: mockFns.replace,
    });
    (useSearchParams as jest.Mock).mockReturnValue({
      get: mockFns.get,
    });

    // Setup auth mock
    const { useAuth } = require('@/hooks/useAuth');
    (useAuth as jest.Mock).mockReturnValue(createAuthMock());

    // Setup persistence mock
    mockPersistence = createPersistenceMock();
    const { useQuestionnairePersistence } = require('@/hooks/useQuestionnairePersistence');
    (useQuestionnairePersistence as jest.Mock).mockReturnValue(mockPersistence);

    // Setup user assessments mock
    const { useUserAssessments } = require('@/hooks/useUserAssessments');
    (useUserAssessments as jest.Mock).mockReturnValue(createUserAssessmentsMock());

    // Setup controller mock
    const { useChatController } = require('@/hooks/useChatController');
    (useChatController as jest.Mock).mockReturnValue(createControllerMock());

    // Setup store mock
    mockChatStoreWithState(createStoreMock({
      setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
      setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
      clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      setExportReady: mockFns.setExportReady,
    }));

    // Setup WebSocket mock
    (useWebSocket as jest.Mock).mockReturnValue(createWebSocketMock());

    // Setup conversation mode mock
    (useConversationMode as jest.Mock).mockReturnValue(createConversationModeMock());
  });

  afterEach(() => {
    // Restore original fetch
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  describe('Export localStorage Restoration', () => {
    it('restores export state from localStorage on page reload', () => {
      const savedExport = createExportData();
      const savedPayload = createQuestionnairePayload();

      mockPersistence.loadExport.mockReturnValue(savedExport);
      mockPersistence.loadPayload.mockReturnValue(savedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      // No in-memory export - simulates page reload
      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        exportReadyByConversation: {},
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
        setExportReady: mockFns.setExportReady,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      // Should restore export to in-memory cache
      expect(mockFns.setExportReady).toHaveBeenCalledWith('conv-123', savedExport);
      // Should restore payload for card rendering
      expect(mockFns.setPendingQuestionnaire).toHaveBeenCalledWith(savedPayload);
      // Should set to download state
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('download');
    });

    it('prioritizes in-memory export over localStorage', () => {
      const inMemoryExport = createExportData({ assessmentId: 'assess-memory' });
      const localStorageExport = createExportData({ assessmentId: 'assess-storage' });
      const savedPayload = createQuestionnairePayload();

      mockPersistence.loadExport.mockReturnValue(localStorageExport);
      mockPersistence.loadPayload.mockReturnValue(savedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      // In-memory export exists
      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        exportReadyByConversation: { 'conv-123': inMemoryExport },
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
        setExportReady: mockFns.setExportReady,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      // In-memory wins - should NOT call setExportReady (already in memory)
      expect(mockFns.setExportReady).not.toHaveBeenCalled();
      // Should still set to download state
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('download');
    });

    it('does not restore export for inactive conversation', () => {
      const otherConvoExport = createExportData({ conversationId: 'conv-456' });

      mockPersistence.loadExport.mockReturnValue(otherConvoExport);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        exportReadyByConversation: {},
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
        setExportReady: mockFns.setExportReady,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      // Should NOT restore mismatched export
      expect(mockFns.setExportReady).not.toHaveBeenCalled();
      // UI state should be hidden (default after clear)
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('hidden');
    });
  });

  describe('handleDownload Durability', () => {
    const downloadPayload = createQuestionnairePayload();
    const exportData = createExportData();

    const setupDownloadTest = () => {
      const mockClearPending = jest.fn();
      const mockSetUIState = jest.fn();

      const storeState = createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-123',
        pendingQuestionnaire: downloadPayload,
        questionnaireUIState: 'download',
        exportReadyByConversation: { 'conv-123': exportData },
        isQuestionnaireStreamComplete: true, // Story 14.1.5: Required for download to be visible
        clearPendingQuestionnaire: mockClearPending,
        setQuestionnaireUIState: mockSetUIState,
      });

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        mode: 'assessment',
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(storeState);

      return { mockClearPending, mockSetUIState };
    };

    it('download buttons remain visible after successful download (13.3.1)', async () => {
      const { mockClearPending, mockSetUIState } = setupDownloadTest();

      render(<ChatInterface />);

      // Verify download card is rendered
      expect(screen.getByTestId('questionnaire-prompt-card')).toBeInTheDocument();
      expect(screen.getByTestId('card-state')).toHaveTextContent('State: download');

      // Reset mocks after initial render
      mockClearPending.mockClear();
      mockSetUIState.mockClear();

      // Click download button
      const downloadBtn = screen.getByTestId('download-btn');
      fireEvent.click(downloadBtn);

      // Wait for download to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/assessments/assess-456/export/pdf'),
          expect.any(Object)
        );
      });

      // KEY ASSERTION: UI state should NOT be changed after download
      expect(mockClearPending).not.toHaveBeenCalled();
      expect(mockSetUIState).not.toHaveBeenCalled();
    });

    it('allows multiple sequential downloads without regenerating (13.3.3)', async () => {
      const { mockClearPending, mockSetUIState } = setupDownloadTest();

      render(<ChatInterface />);

      // Reset mocks after initial render
      mockClearPending.mockClear();
      mockSetUIState.mockClear();

      // Download 3 times
      fireEvent.click(screen.getByTestId('download-btn'));
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByTestId('download-btn'));
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

      fireEvent.click(screen.getByTestId('download-btn'));
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

      // All downloads called export/pdf endpoint
      expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/export/pdf'), expect.any(Object));
      expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/export/pdf'), expect.any(Object));
      expect(mockFetch).toHaveBeenNthCalledWith(3, expect.stringContaining('/export/pdf'), expect.any(Object));

      // KEY ASSERTION: State should NOT be cleared after any download
      expect(mockClearPending).not.toHaveBeenCalled();
      expect(mockSetUIState).not.toHaveBeenCalled();
    });

    it('pendingQuestionnaire remains populated after download (13.3.1)', async () => {
      const quickPayload = createQuestionnairePayload({
        assessmentType: 'quick',
        vendorName: 'ImportantVendor',
        estimatedQuestions: 20,
      });

      const mockClearPending = jest.fn();
      const mockSetUIState = jest.fn();

      const storeState = createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-123',
        pendingQuestionnaire: quickPayload,
        questionnaireUIState: 'download',
        exportReadyByConversation: { 'conv-123': exportData },
        isQuestionnaireStreamComplete: true, // Story 14.1.5: Required for download to be visible
        clearPendingQuestionnaire: mockClearPending,
        setQuestionnaireUIState: mockSetUIState,
      });

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        mode: 'assessment',
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      // Verify card shows the pending payload info
      expect(screen.getByTestId('card-type')).toHaveTextContent('Type: quick');

      // Reset mocks after initial render
      mockClearPending.mockClear();
      mockSetUIState.mockClear();

      // Click download
      fireEvent.click(screen.getByTestId('download-btn'));
      await waitFor(() => expect(mockFetch).toHaveBeenCalled());

      // KEY ASSERTION: pendingQuestionnaire must NOT be cleared
      expect(mockClearPending).not.toHaveBeenCalled();

      // Card should still be visible with same content
      expect(screen.getByTestId('card-type')).toHaveTextContent('Type: quick');
    });

    it('handles download error without clearing state', async () => {
      // Mock a failed download
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response);

      const { mockClearPending, mockSetUIState } = setupDownloadTest();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<ChatInterface />);

      // Reset mocks after initial render
      mockClearPending.mockClear();
      mockSetUIState.mockClear();

      // Click download (will fail)
      fireEvent.click(screen.getByTestId('download-btn'));
      await waitFor(() => expect(mockFetch).toHaveBeenCalled());

      // Even on error, state should NOT be cleared - user can retry
      expect(mockClearPending).not.toHaveBeenCalled();
      expect(mockSetUIState).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
