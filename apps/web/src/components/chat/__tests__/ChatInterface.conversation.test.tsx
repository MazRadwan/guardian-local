/**
 * ChatInterface Conversation Tests
 *
 * Tests for conversation state rendering and URL handling.
 * Note: Streaming logic is tested in useChatController tests.
 * Split from ChatInterface.test.tsx for maintainability.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatInterface } from '../ChatInterface';
import { useChatStore } from '@/stores/chatStore';
import {
  createStoreMock,
  mockChatStoreWithState,
  createControllerMock,
  createAuthMock,
  createPersistenceMock,
  createUserAssessmentsMock,
} from './_testUtils';

// Mock child components
jest.mock('../MessageList', () => ({
  MessageList: React.forwardRef(({ messages, isLoading }: {
    messages: unknown[];
    isLoading: boolean;
  }, ref) => (
    <div data-testid="message-list" ref={ref as React.Ref<HTMLDivElement>}>
      Messages: {messages.length}, Loading: {isLoading.toString()}
    </div>
  )),
}));

jest.mock('../Composer', () => ({
  Composer: React.forwardRef(({
    onSendMessage,
    disabled,
  }: {
    onSendMessage: (msg: string) => void;
    disabled: boolean;
  }, ref) => (
    <div data-testid="composer" ref={ref as React.Ref<HTMLDivElement>}>
      <button onClick={() => onSendMessage('test message')} disabled={disabled}>
        Send
      </button>
    </div>
  )),
}));

jest.mock('../QuestionnairePromptCard', () => ({
  QuestionnairePromptCard: React.forwardRef(() => null),
}));

// Mock hooks
jest.mock('@/stores/chatStore');
jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/useQuestionnairePersistence');
jest.mock('@/hooks/useUserAssessments');
jest.mock('@/hooks/useChatController');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

describe('ChatInterface Conversation Management', () => {
  const mockFns = {
    setActiveConversation: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    get: jest.fn(),
  };

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
    const { useQuestionnairePersistence } = require('@/hooks/useQuestionnairePersistence');
    (useQuestionnairePersistence as jest.Mock).mockReturnValue(createPersistenceMock());

    // Setup user assessments mock
    const { useUserAssessments } = require('@/hooks/useUserAssessments');
    (useUserAssessments as jest.Mock).mockReturnValue(createUserAssessmentsMock());

    // Setup controller mock
    const { useChatController } = require('@/hooks/useChatController');
    (useChatController as jest.Mock).mockReturnValue(createControllerMock());

    // Setup store mock with selector support
    mockChatStoreWithState(createStoreMock({
      setActiveConversation: mockFns.setActiveConversation,
    }));
  });

  describe('Conversation State Rendering', () => {
    it('renders empty state when no conversation is active', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [],
        activeConversationId: null,
      }));

      render(<ChatInterface />);

      expect(screen.getByText('Welcome to Guardian')).toBeInTheDocument();
    });

    it('renders message list when conversation has messages', () => {
      const messages = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi!', timestamp: new Date() },
      ];

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages,
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(createStoreMock({ messages }));

      render(<ChatInterface />);

      expect(screen.getByTestId('message-list')).toBeInTheDocument();
      expect(screen.queryByText('Welcome to Guardian')).not.toBeInTheDocument();
    });

    it('shows loading indicator when loading conversation', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [],
        showDelayedLoading: true,
        activeConversationId: 'conv-loading',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [],
        isLoading: true,
      }));

      render(<ChatInterface />);

      expect(screen.getByText(/Loading: true/)).toBeInTheDocument();
    });
  });

  describe('Active Conversation from Controller', () => {
    it('uses activeConversationId from controller', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-from-controller',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        activeConversationId: 'conv-from-controller',
      }));

      render(<ChatInterface />);

      // Component should render message list (not empty state)
      expect(screen.getByTestId('message-list')).toBeInTheDocument();
    });

    it('shows empty state when no active conversation', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [],
        activeConversationId: null,
      }));

      render(<ChatInterface />);

      expect(screen.getByText('Welcome to Guardian')).toBeInTheDocument();
    });
  });

  describe('Streaming State', () => {
    it('disables composer during streaming', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        isStreaming: true,
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(createStoreMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        isStreaming: true,
      }));

      render(<ChatInterface />);

      const sendButton = screen.getByRole('button', { name: 'Send' });
      expect(sendButton).toBeDisabled();
    });

    it('keeps composer enabled when not streaming', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        isStreaming: false,
        isConnected: true,
        isLoading: false,
        activeConversationId: 'conv-123',
      }));

      render(<ChatInterface />);

      const sendButton = screen.getByRole('button', { name: 'Send' });
      expect(sendButton).not.toBeDisabled();
    });
  });
});
