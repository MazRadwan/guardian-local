/**
 * ChatInterface Questionnaire Tests
 *
 * Tests for questionnaire rehydration (Story 4.3.2) and inline card rendering.
 * Split from ChatInterface.test.tsx for maintainability.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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
  createQuestionnairePayload,
} from './_testUtils';

// Mock child components
jest.mock('../MessageList', () => ({
  MessageList: React.forwardRef(({ messages, isLoading, questionnaire }: {
    messages: unknown[];
    isLoading: boolean;
    questionnaire?: {
      payload: { assessmentType: string };
      uiState: string;
      insertIndex: number;
    };
  }, ref) => (
    <div data-testid="message-list" ref={ref as React.Ref<HTMLDivElement>}>
      Messages: {messages.length}, Loading: {isLoading.toString()}
      {questionnaire && (
        <div data-testid="questionnaire-message">
          <span data-testid="card-state">State: {questionnaire.uiState}</span>
          <span data-testid="card-type">Type: {questionnaire.payload?.assessmentType}</span>
          <span data-testid="insert-index">Index: {questionnaire.insertIndex}</span>
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

// QuestionnairePromptCard no longer rendered directly by ChatInterface
// It's rendered via MessageList -> QuestionnaireMessage (Story 14.1)

// Mock hooks
jest.mock('@/stores/chatStore');
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useConversationMode');
jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/useQuestionnairePersistence');
jest.mock('@/hooks/useChatController');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

describe('ChatInterface Questionnaire', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();

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

    // Setup controller mock
    const { useChatController } = require('@/hooks/useChatController');
    (useChatController as jest.Mock).mockReturnValue(createControllerMock());

    // Setup store mock - also set up getState for rehydration effect
    const baseState = createStoreMock({
      setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
      setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
      clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      setExportReady: mockFns.setExportReady,
    });
    mockChatStoreWithState(baseState);

    // Setup WebSocket mock
    (useWebSocket as jest.Mock).mockReturnValue(createWebSocketMock());

    // Setup conversation mode mock
    (useConversationMode as jest.Mock).mockReturnValue(createConversationModeMock());
  });

  describe('Questionnaire Rehydration (Story 4.3.2)', () => {
    it('restores persisted payload on conversation switch', () => {
      const savedPayload = createQuestionnairePayload();
      mockPersistence.loadPayload.mockReturnValue(savedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockFns.clearPendingQuestionnaire).toHaveBeenCalled();
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('hidden');
      expect(mockPersistence.loadPayload).toHaveBeenCalledWith('conv-123');
      expect(mockFns.setPendingQuestionnaire).toHaveBeenCalledWith(savedPayload);
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('ready');
    });

    it('does not restore if no payload exists', () => {
      mockPersistence.loadPayload.mockReturnValue(null);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-empty',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-empty',
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockFns.clearPendingQuestionnaire).toHaveBeenCalled();
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('hidden');
      expect(mockPersistence.loadPayload).toHaveBeenCalledWith('conv-empty');
      expect(mockFns.setPendingQuestionnaire).not.toHaveBeenCalled();
    });

    it('does not rehydrate when no active conversation', () => {
      const storeState = createStoreMock({
        activeConversationId: null,
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockPersistence.loadPayload).not.toHaveBeenCalled();
      expect(mockFns.setPendingQuestionnaire).not.toHaveBeenCalled();
    });

    it('does not rehydrate when no user', () => {
      const { useAuth } = require('@/hooks/useAuth');
      (useAuth as jest.Mock).mockReturnValue(createAuthMock({
        token: null,
        user: null,
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockPersistence.loadPayload).not.toHaveBeenCalled();
      expect(mockFns.setPendingQuestionnaire).not.toHaveBeenCalled();
    });

    it('rehydrates to download state when export data exists', () => {
      const savedPayload = createQuestionnairePayload();
      mockPersistence.loadPayload.mockReturnValue(savedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        exportReadyByConversation: {
          'conv-123': { conversationId: 'conv-123', assessmentId: 'assess-1', formats: ['pdf', 'word'] },
        },
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockFns.setPendingQuestionnaire).toHaveBeenCalledWith(savedPayload);
      expect(mockFns.setQuestionnaireUIState).toHaveBeenCalledWith('download');
    });

    it('clears payload with mismatched conversationId', () => {
      const malformedPayload = createQuestionnairePayload({
        conversationId: 'wrong-conv-id',
      });
      mockPersistence.loadPayload.mockReturnValue(malformedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockPersistence.clearPayload).toHaveBeenCalledWith('conv-123');
      expect(mockFns.setPendingQuestionnaire).not.toHaveBeenCalled();
    });

    it('clears payload with missing assessmentType', () => {
      const malformedPayload = {
        conversationId: 'conv-123',
        vendorName: 'MalformedVendor',
        // assessmentType is MISSING
      };
      mockPersistence.loadPayload.mockReturnValue(malformedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockPersistence.clearPayload).toHaveBeenCalledWith('conv-123');
      expect(mockFns.setPendingQuestionnaire).not.toHaveBeenCalled();
    });

    it('skips rehydration when generation is in progress', () => {
      const savedPayload = createQuestionnairePayload();
      mockPersistence.loadPayload.mockReturnValue(savedPayload);

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        activeConversationId: 'conv-123',
      }));

      const storeState = createStoreMock({
        activeConversationId: 'conv-123',
        isGeneratingQuestionnaire: true,
        setPendingQuestionnaire: mockFns.setPendingQuestionnaire,
        setQuestionnaireUIState: mockFns.setQuestionnaireUIState,
        clearPendingQuestionnaire: mockFns.clearPendingQuestionnaire,
      });
      mockChatStoreWithState(storeState);

      render(<ChatInterface />);

      expect(mockPersistence.loadPayload).not.toHaveBeenCalled();
      expect(mockFns.setPendingQuestionnaire).not.toHaveBeenCalled();
      expect(mockFns.setQuestionnaireUIState).not.toHaveBeenCalledWith('ready');
    });
  });

  describe('Questionnaire Inline Rendering (Story 14.1)', () => {
    const mockPayload = createQuestionnairePayload();

    it('renders questionnaire message when pending questionnaire exists', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        mode: 'assessment',
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-123',
        pendingQuestionnaire: mockPayload,
        questionnaireUIState: 'ready',
        questionnaireMessageIndex: 1,
      }));

      render(<ChatInterface />);

      expect(screen.getByTestId('questionnaire-message')).toBeInTheDocument();
      expect(screen.getByTestId('card-state')).toHaveTextContent('State: ready');
      expect(screen.getByTestId('card-type')).toHaveTextContent('Type: comprehensive');
    });

    it('does not render card when questionnaireUIState is hidden', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        mode: 'assessment',
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-123',
        pendingQuestionnaire: mockPayload,
        questionnaireUIState: 'hidden',
        questionnaireMessageIndex: 1,
      }));

      render(<ChatInterface />);

      expect(screen.queryByTestId('questionnaire-message')).not.toBeInTheDocument();
    });

    it('does not render card when conversation ID mismatch', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        mode: 'assessment',
        activeConversationId: 'conv-456',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-456',
        pendingQuestionnaire: mockPayload, // conv-123
        questionnaireUIState: 'ready',
        questionnaireMessageIndex: 1,
      }));

      render(<ChatInterface />);

      expect(screen.queryByTestId('questionnaire-message')).not.toBeInTheDocument();
    });

    it('passes correct insert index to MessageList', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [
          { role: 'user', content: 'test 1', timestamp: new Date() },
          { role: 'assistant', content: 'test 2', timestamp: new Date() },
        ],
        mode: 'assessment',
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [
          { role: 'user', content: 'test 1', timestamp: new Date() },
          { role: 'assistant', content: 'test 2', timestamp: new Date() },
        ],
        activeConversationId: 'conv-123',
        pendingQuestionnaire: mockPayload,
        questionnaireUIState: 'ready',
        questionnaireMessageIndex: 2,
      }));

      render(<ChatInterface />);

      expect(screen.getByTestId('insert-index')).toHaveTextContent('Index: 2');
    });
  });
});
