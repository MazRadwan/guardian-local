/**
 * ChatInterface Core Tests
 *
 * Tests for basic rendering, message handling, and error display.
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
} from './_testUtils';

// Mock child components
jest.mock('../MessageList', () => ({
  MessageList: React.forwardRef(({ messages, isLoading, questionnaireSlot }: {
    messages: unknown[];
    isLoading: boolean;
    questionnaireSlot?: React.ReactNode;
  }, ref) => (
    <div data-testid="message-list" ref={ref as React.Ref<HTMLDivElement>}>
      Messages: {messages.length}, Loading: {isLoading.toString()}
      {questionnaireSlot && <div data-testid="questionnaire-slot">{questionnaireSlot}</div>}
    </div>
  )),
}));

jest.mock('../Composer', () => ({
  Composer: React.forwardRef(({
    onSendMessage,
    disabled,
    currentMode,
    onModeChange,
    modeChangeDisabled,
  }: {
    onSendMessage: (msg: string) => void;
    disabled: boolean;
    currentMode?: string;
    onModeChange?: (mode: string) => void;
    modeChangeDisabled?: boolean;
  }, ref) => (
    <div data-testid="composer" ref={ref as React.Ref<HTMLDivElement>}>
      <button onClick={() => onSendMessage('test message')} disabled={disabled}>
        Send
      </button>
      {onModeChange && (
        <button onClick={() => onModeChange('assessment')} disabled={modeChangeDisabled}>
          Mode: {currentMode}
        </button>
      )}
    </div>
  )),
}));

jest.mock('../QuestionnairePromptCard', () => ({
  QuestionnairePromptCard: React.forwardRef(() => null),
}));

// Mock TypingWelcome component to show text immediately (no typing animation in tests)
jest.mock('../TypingWelcome', () => ({
  TypingWelcome: ({ className }: { className?: string }) => (
    <p className={className}>Start a conversation to assess AI vendors or get guidance.</p>
  ),
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

describe('ChatInterface Core', () => {
  const mockFns = {
    addMessage: jest.fn(),
    sendMessage: jest.fn(),
    changeMode: jest.fn(),
    setError: jest.fn(),
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
    (useChatController as jest.Mock).mockReturnValue(createControllerMock({
      handleSendMessage: mockFns.sendMessage,
      handleModeChange: mockFns.changeMode,
      setError: mockFns.setError,
    }));

    // Setup store mock with selector support
    mockChatStoreWithState(createStoreMock({
      addMessage: mockFns.addMessage,
      setError: mockFns.setError,
    }));

    // Setup WebSocket mock
    (useWebSocket as jest.Mock).mockReturnValue(createWebSocketMock({
      sendMessage: mockFns.sendMessage,
    }));

    // Setup conversation mode mock
    (useConversationMode as jest.Mock).mockReturnValue(createConversationModeMock({
      changeMode: mockFns.changeMode,
    }));
  });

  describe('Rendering', () => {
    it('renders composer component', () => {
      render(<ChatInterface />);
      expect(screen.getByTestId('composer')).toBeInTheDocument();
    });

    it('shows welcome message when no messages (empty state)', () => {
      render(<ChatInterface />);
      expect(screen.getByText('Welcome to Guardian')).toBeInTheDocument();
      expect(screen.getByText('Start a conversation to assess AI vendors or get guidance.')).toBeInTheDocument();
    });

    it('shows messages when they exist (active state)', () => {
      const messages = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
      ];

      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({ messages }));
      mockChatStoreWithState(createStoreMock({ messages }));

      render(<ChatInterface />);

      expect(screen.getByTestId('message-list')).toBeInTheDocument();
      expect(screen.queryByText('Welcome to Guardian')).not.toBeInTheDocument();
    });
  });

  describe('Message Handling', () => {
    it('calls handleSendMessage from controller when sending', () => {
      const handleSendMessage = jest.fn();
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        handleSendMessage,
        activeConversationId: 'test-conv-123',
      }));

      render(<ChatInterface />);

      const sendButton = screen.getByText('Send');
      fireEvent.click(sendButton);

      expect(handleSendMessage).toHaveBeenCalledWith('test message');
    });

    it('prevents sending when not connected', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        isConnected: false,
      }));

      render(<ChatInterface />);

      const sendButton = screen.getByText('Send');
      expect(sendButton).toBeDisabled();
    });

    it('disables input when loading', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        isLoading: true,
      }));

      mockChatStoreWithState(createStoreMock({ isLoading: true }));

      render(<ChatInterface />);

      const sendButton = screen.getByText('Send');
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('displays error banner when error exists', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        error: 'Connection failed',
        setError: mockFns.setError,
      }));

      mockChatStoreWithState(createStoreMock({
        error: 'Connection failed',
        setError: mockFns.setError,
      }));

      render(<ChatInterface />);

      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('dismisses error when dismiss button clicked', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        error: 'Connection failed',
        setError: mockFns.setError,
      }));

      mockChatStoreWithState(createStoreMock({
        error: 'Connection failed',
        setError: mockFns.setError,
      }));

      render(<ChatInterface />);

      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);

      expect(mockFns.setError).toHaveBeenCalledWith(null);
    });
  });

  describe('Mode Switching', () => {
    it('handles mode change via controller', async () => {
      const handleModeChange = jest.fn();
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        handleModeChange,
      }));

      render(<ChatInterface />);

      const modeButton = screen.getByText(/Mode:/);
      fireEvent.click(modeButton);

      await waitFor(() => {
        expect(handleModeChange).toHaveBeenCalledWith('assessment');
      });
    });

    it('disables mode switcher when changing mode', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        isChanging: true,
      }));

      render(<ChatInterface />);

      const modeButton = screen.getByText(/Mode:/);
      expect(modeButton).toBeDisabled();
    });

    it('disables mode switcher when not connected', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        isConnected: false,
      }));

      render(<ChatInterface />);

      const modeButton = screen.getByText(/Mode:/);
      expect(modeButton).toBeDisabled();
    });
  });

  describe('Streaming', () => {
    it('renders composer during streaming', () => {
      const { useChatController } = require('@/hooks/useChatController');
      (useChatController as jest.Mock).mockReturnValue(createControllerMock({
        isStreaming: true,
        activeConversationId: 'conv-123',
      }));

      mockChatStoreWithState(createStoreMock({
        isStreaming: true,
        activeConversationId: 'conv-123',
      }));

      render(<ChatInterface />);

      expect(screen.getByTestId('composer')).toBeInTheDocument();
    });

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
        activeConversationId: 'conv-123',
      }));

      render(<ChatInterface />);

      const sendButton = screen.getByRole('button', { name: 'Send' });
      expect(sendButton).toBeDisabled();
    });
  });
});
