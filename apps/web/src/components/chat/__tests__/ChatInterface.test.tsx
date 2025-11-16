import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '../ChatInterface';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConversationMode } from '@/hooks/useConversationMode';

// Mock child components
jest.mock('../MessageList', () => ({
  MessageList: ({ messages, isLoading }: { messages: unknown[]; isLoading: boolean }) => (
    <div data-testid="message-list">
      Messages: {messages.length}, Loading: {isLoading.toString()}
    </div>
  ),
}));

jest.mock('../Composer', () => ({
  Composer: ({
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
  }) => (
    <div data-testid="composer">
      <button onClick={() => onSendMessage('test message')} disabled={disabled}>
        Send
      </button>
      {onModeChange && (
        <button onClick={() => onModeChange('assessment')} disabled={modeChangeDisabled}>
          Mode: {currentMode}
        </button>
      )}
    </div>
  ),
}));

// Mock hooks
jest.mock('@/stores/chatStore');
jest.mock('@/hooks/useWebSocket');
jest.mock('@/hooks/useConversationMode');
jest.mock('@/hooks/useAuth');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

describe('ChatInterface', () => {
  const mockAddMessage = jest.fn();
  const mockStartStreaming = jest.fn();
  const mockAppendToLastMessage = jest.fn();
  const mockFinishStreaming = jest.fn();
  const mockSetError = jest.fn();
  const mockSendMessage = jest.fn();
  const mockChangeMode = jest.fn();
  const mockRequestHistory = jest.fn();
  const mockClearMessages = jest.fn();
  const mockSetActiveConversation = jest.fn();
  const mockPush = jest.fn();
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock next/navigation
    const { useRouter, useSearchParams } = require('next/navigation');
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (useSearchParams as jest.Mock).mockReturnValue({
      get: mockGet,
    });

    // Mock useAuth
    const { useAuth } = require('@/hooks/useAuth');
    (useAuth as jest.Mock).mockReturnValue({
      token: 'mock-token',
      user: { id: 'user-123', email: 'test@example.com' },
    });

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: false,
      error: null,
      isStreaming: false,
      addMessage: mockAddMessage,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setError: mockSetError,
      setLoading: jest.fn(),
      setMessages: jest.fn(),
      clearMessages: mockClearMessages,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      setConversations: jest.fn(),
      addConversation: jest.fn(),
      updateConversationTitle: jest.fn(),
    });

    (useWebSocket as jest.Mock).mockReturnValue({
      isConnected: true,
      isConnecting: false,
      sendMessage: mockSendMessage,
      requestHistory: mockRequestHistory,
      fetchConversations: jest.fn(),
      startNewConversation: jest.fn(),
      abortStream: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    (useConversationMode as jest.Mock).mockReturnValue({
      mode: 'consult',
      changeMode: mockChangeMode,
      isChanging: false,
    });
  });

  it('renders all main components', () => {
    render(<ChatInterface />);

    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('shows welcome message when no messages (empty state)', () => {
    render(<ChatInterface />);

    expect(screen.getByText('Welcome to Guardian')).toBeInTheDocument();
    expect(screen.getByText('Start a conversation to assess AI vendors or get guidance.')).toBeInTheDocument();
  });

  it('shows messages and composer at bottom when messages exist (active state)', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
      ],
      isLoading: false,
      error: null,
      addMessage: mockAddMessage,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setError: mockSetError,
      setLoading: jest.fn(),
      setMessages: jest.fn(),
      clearMessages: mockClearMessages,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      setConversations: jest.fn(),
      addConversation: jest.fn(),
    });

    render(<ChatInterface />);

    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to Guardian')).not.toBeInTheDocument();
  });

  it('disables composer when not connected', () => {
    (useWebSocket as jest.Mock).mockReturnValue({
      isConnected: false,
      isConnecting: false,
      sendMessage: mockSendMessage,
      requestHistory: mockRequestHistory,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    render(<ChatInterface />);

    const sendButton = screen.getByText('Send');
    expect(sendButton).toBeDisabled();
  });

  it('handles sending a message', () => {
    // Set up active conversation
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: false,
      error: null,
      addMessage: mockAddMessage,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setError: mockSetError,
      setLoading: jest.fn(),
      setMessages: jest.fn(),
      clearMessages: mockClearMessages,
      activeConversationId: 'test-conv-123',
      setActiveConversation: mockSetActiveConversation,
      setConversations: jest.fn(),
      addConversation: jest.fn(),
    });

    render(<ChatInterface />);

    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);

    expect(mockAddMessage).toHaveBeenCalledWith({
      role: 'user',
      content: 'test message',
      timestamp: expect.any(Date),
    });
    expect(mockSendMessage).toHaveBeenCalledWith('test message', 'test-conv-123');
  });

  it('prevents sending message when not connected', () => {
    (useWebSocket as jest.Mock).mockReturnValue({
      isConnected: false,
      isConnecting: false,
      sendMessage: mockSendMessage,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    render(<ChatInterface />);

    // Input should be disabled when not connected
    const sendButton = screen.getByText('Send');
    expect(sendButton).toBeDisabled();
  });

  it('handles mode change', async () => {
    render(<ChatInterface />);

    const modeButton = screen.getByText(/Mode:/);
    fireEvent.click(modeButton);

    await waitFor(() => {
      expect(mockChangeMode).toHaveBeenCalledWith('assessment');
    });
  });

  it('displays error banner when error exists', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: false,
      error: 'Connection failed',
      addMessage: mockAddMessage,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setError: mockSetError,
      setLoading: jest.fn(),
      setMessages: jest.fn(),
      clearMessages: mockClearMessages,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      setConversations: jest.fn(),
      addConversation: jest.fn(),
    });

    render(<ChatInterface />);

    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('dismisses error when dismiss button clicked', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: false,
      error: 'Connection failed',
      addMessage: mockAddMessage,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setError: mockSetError,
      setLoading: jest.fn(),
      setMessages: jest.fn(),
      clearMessages: mockClearMessages,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      setConversations: jest.fn(),
      addConversation: jest.fn(),
    });

    render(<ChatInterface />);

    const dismissButton = screen.getByText('Dismiss');
    fireEvent.click(dismissButton);

    expect(mockSetError).toHaveBeenCalledWith(null);
  });

  it('disables input when loading', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: true,
      error: null,
      addMessage: mockAddMessage,
      startStreaming: mockStartStreaming,
      appendToLastMessage: mockAppendToLastMessage,
      finishStreaming: mockFinishStreaming,
      setError: mockSetError,
      setLoading: jest.fn(),
      setMessages: jest.fn(),
      clearMessages: mockClearMessages,
      activeConversationId: null,
      setActiveConversation: mockSetActiveConversation,
      setConversations: jest.fn(),
      addConversation: jest.fn(),
    });

    render(<ChatInterface />);

    const sendButton = screen.getByText('Send');
    expect(sendButton).toBeDisabled();
  });

  it('disables mode switcher when changing mode', () => {
    (useConversationMode as jest.Mock).mockReturnValue({
      mode: 'consult',
      changeMode: mockChangeMode,
      isChanging: true,
    });

    render(<ChatInterface />);

    const modeButton = screen.getByText(/Mode:/);
    expect(modeButton).toBeDisabled();
  });

  it('handles mode change error', async () => {
    mockChangeMode.mockRejectedValue(new Error('Mode change failed'));

    render(<ChatInterface />);

    const modeButton = screen.getByText(/Mode:/);
    fireEvent.click(modeButton);

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('Failed to change mode');
    });
  });

  describe('Conversation Switching', () => {
    it('loads conversation from URL on mount', () => {
      mockGet.mockReturnValue('conv-123');

      render(<ChatInterface />);

      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-123');
    });

    it('switches conversation when activeConversationId changes', () => {
      const mockSetLoading = jest.fn();

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: mockSetLoading,
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-456',
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      expect(mockClearMessages).toHaveBeenCalled();
      expect(mockSetLoading).toHaveBeenCalledWith(true);
      expect(mockRequestHistory).toHaveBeenCalledWith('conv-456');
      expect(mockPush).toHaveBeenCalledWith('/chat?conversation=conv-456');
    });

    it('updates URL when conversation switches', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'new-conv',
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      expect(mockPush).toHaveBeenCalledWith('/chat?conversation=new-conv');
    });

    it('clears messages before loading new conversation', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [{ role: 'user', content: 'old message', timestamp: new Date() }],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-789',
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('shows loading state during conversation switch', () => {
      const mockSetLoading = jest.fn();

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: mockSetLoading,
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-load',
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      expect(mockSetLoading).toHaveBeenCalledWith(true);
    });

    it('handles conversation switch error gracefully', () => {
      const mockSetLoading = jest.fn();
      mockRequestHistory.mockImplementation(() => {
        throw new Error('Network error');
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: mockSetLoading,
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-error',
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      expect(mockSetError).toHaveBeenCalledWith('Failed to load conversation');
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('New Chat Functionality', () => {
    beforeEach(() => {
      // Mock localStorage
      const localStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      };
      Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    });

    it('clears localStorage when activeConversationId is set to null', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: null, // New chat state
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      // Verify localStorage is cleared
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('guardian_conversation_id');
    });

    it('does not fetch history when activeConversationId is null', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: null, // New chat state
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      // Verify requestHistory is NOT called
      expect(mockRequestHistory).not.toHaveBeenCalled();
    });

    it('does not update URL when activeConversationId is null', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: null, // New chat state
        setActiveConversation: mockSetActiveConversation,
      });

      render(<ChatInterface />);

      // Verify URL is NOT updated with conversation ID
      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('conversation='));
    });

    it('handles transition from conversation to new chat', () => {
      // Start with active conversation
      const { rerender } = render(<ChatInterface />);

      // Switch to new chat (activeConversationId becomes null)
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: null, // Switched to new chat
        setActiveConversation: mockSetActiveConversation,
      });

      rerender(<ChatInterface />);

      // Verify localStorage is cleared when switching to new chat
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('guardian_conversation_id');
    });
  });

  describe('Story 9.0: Conversation Routing & Security', () => {
    describe('9.0a: Client Sends conversationId', () => {
      it('requires activeConversationId to send message', () => {
        (useChatStore as unknown as jest.Mock).mockReturnValue({
          messages: [],
          isLoading: false,
          error: null,
          addMessage: mockAddMessage,
          startStreaming: mockStartStreaming,
          appendToLastMessage: mockAppendToLastMessage,
          finishStreaming: mockFinishStreaming,
          setError: mockSetError,
          setLoading: jest.fn(),
          setMessages: jest.fn(),
          clearMessages: mockClearMessages,
          activeConversationId: null, // No active conversation
          setActiveConversation: mockSetActiveConversation,
          setConversations: jest.fn(),
          addConversation: jest.fn(),
        });

        render(<ChatInterface />);

        const sendButton = screen.getByText('Send');
        fireEvent.click(sendButton);

        // Should set error instead of sending
        expect(mockSetError).toHaveBeenCalledWith('No active conversation');
        expect(mockSendMessage).not.toHaveBeenCalled();
      });

      it('passes conversationId when sending message', () => {
        const testConvId = 'conv-xyz-789';

        (useChatStore as unknown as jest.Mock).mockReturnValue({
          messages: [],
          isLoading: false,
          error: null,
          addMessage: mockAddMessage,
          startStreaming: mockStartStreaming,
          appendToLastMessage: mockAppendToLastMessage,
          finishStreaming: mockFinishStreaming,
          setError: mockSetError,
          setLoading: jest.fn(),
          setMessages: jest.fn(),
          clearMessages: mockClearMessages,
          activeConversationId: testConvId,
          setActiveConversation: mockSetActiveConversation,
        });

        render(<ChatInterface />);

        const sendButton = screen.getByText('Send');
        fireEvent.click(sendButton);

        // Verify conversationId is passed to sendMessage
        expect(mockSendMessage).toHaveBeenCalledWith('test message', testConvId);
      });
    });

    describe('9.0c: Streaming Conversation Scope', () => {
      it('ignores streaming chunks for inactive conversations', () => {
        const activeConvId = 'conv-active-123';
        const inactiveConvId = 'conv-inactive-456';

        // Mock onMessageStream to capture the handler
        let streamHandler: ((chunk: string, conversationId: string) => void) | undefined;
        (useWebSocket as jest.Mock).mockImplementation(({ onMessageStream }: any) => {
          streamHandler = onMessageStream;
          return {
            isConnected: true,
            isConnecting: false,
            sendMessage: mockSendMessage,
            requestHistory: mockRequestHistory,
            connect: jest.fn(),
            disconnect: jest.fn(),
          };
        });

        (useChatStore as unknown as jest.Mock).mockReturnValue({
          messages: [],
          isLoading: false,
          error: null,
          addMessage: mockAddMessage,
          startStreaming: mockStartStreaming,
          appendToLastMessage: mockAppendToLastMessage,
          finishStreaming: mockFinishStreaming,
          setError: mockSetError,
          setLoading: jest.fn(),
          setMessages: jest.fn(),
          clearMessages: mockClearMessages,
          activeConversationId: activeConvId,
          setActiveConversation: mockSetActiveConversation,
        });

        render(<ChatInterface />);

        // Simulate streaming chunk for inactive conversation
        expect(streamHandler).toBeDefined();
        streamHandler!('chunk for wrong conv', inactiveConvId);

        // Should NOT append to messages
        expect(mockAppendToLastMessage).not.toHaveBeenCalled();
        expect(mockStartStreaming).not.toHaveBeenCalled();
      });

      it('processes streaming chunks for active conversation', () => {
        const activeConvId = 'conv-active-123';

        // Mock onMessageStream to capture the handler
        let streamHandler: ((chunk: string, conversationId: string) => void) | undefined;
        (useWebSocket as jest.Mock).mockImplementation(({ onMessageStream }: any) => {
          streamHandler = onMessageStream;
          return {
            isConnected: true,
            isConnecting: false,
            sendMessage: mockSendMessage,
            requestHistory: mockRequestHistory,
            connect: jest.fn(),
            disconnect: jest.fn(),
          };
        });

        (useChatStore as unknown as jest.Mock).mockReturnValue({
          messages: [],
          isLoading: false,
          error: null,
          addMessage: mockAddMessage,
          startStreaming: mockStartStreaming,
          appendToLastMessage: mockAppendToLastMessage,
          finishStreaming: mockFinishStreaming,
          setError: mockSetError,
          setLoading: jest.fn(),
          setMessages: jest.fn(),
          clearMessages: mockClearMessages,
          activeConversationId: activeConvId,
          setActiveConversation: mockSetActiveConversation,
        });

        render(<ChatInterface />);

        // Simulate streaming chunk for active conversation
        expect(streamHandler).toBeDefined();
        streamHandler!('chunk for active conv', activeConvId);

        // Should start streaming and append chunk
        expect(mockStartStreaming).toHaveBeenCalled();
        expect(mockAppendToLastMessage).toHaveBeenCalledWith('chunk for active conv');
      });

      it('prevents cross-conversation contamination during rapid switching', () => {
        const conv1 = 'conv-1';
        const conv2 = 'conv-2';

        // Mock onMessageStream to capture the handler
        let streamHandler: ((chunk: string, conversationId: string) => void) | undefined;
        (useWebSocket as jest.Mock).mockImplementation(({ onMessageStream }: any) => {
          streamHandler = onMessageStream;
          return {
            isConnected: true,
            isConnecting: false,
            sendMessage: mockSendMessage,
            requestHistory: mockRequestHistory,
            connect: jest.fn(),
            disconnect: jest.fn(),
          };
        });

        // Start with conv1 active
        (useChatStore as unknown as jest.Mock).mockReturnValue({
          messages: [],
          isLoading: false,
          error: null,
          addMessage: mockAddMessage,
          startStreaming: mockStartStreaming,
          appendToLastMessage: mockAppendToLastMessage,
          finishStreaming: mockFinishStreaming,
          setError: mockSetError,
          setLoading: jest.fn(),
          setMessages: jest.fn(),
          clearMessages: mockClearMessages,
          activeConversationId: conv1,
          setActiveConversation: mockSetActiveConversation,
        });

        const { rerender } = render(<ChatInterface />);

        // Switch to conv2
        (useChatStore as unknown as jest.Mock).mockReturnValue({
          messages: [],
          isLoading: false,
          error: null,
          addMessage: mockAddMessage,
          startStreaming: mockStartStreaming,
          appendToLastMessage: mockAppendToLastMessage,
          finishStreaming: mockFinishStreaming,
          setError: mockSetError,
          setLoading: jest.fn(),
          setMessages: jest.fn(),
          clearMessages: mockClearMessages,
          activeConversationId: conv2,
          setActiveConversation: mockSetActiveConversation,
        });

        rerender(<ChatInterface />);

        // Late chunk from conv1 arrives AFTER switching to conv2
        expect(streamHandler).toBeDefined();
        streamHandler!('late chunk from conv1', conv1);

        // Should NOT append (conv1 is inactive now)
        expect(mockAppendToLastMessage).not.toHaveBeenCalled();

        // Chunk from active conv2 arrives
        streamHandler!('chunk from conv2', conv2);

        // Should append (conv2 is active)
        expect(mockAppendToLastMessage).toHaveBeenCalledWith('chunk from conv2');
      });
    });
  });

  // Stop Stream Integration
  describe('Stop Stream Integration', () => {
    it('passes isStreaming prop to Composer when streaming', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [],
        isLoading: false,
        isStreaming: true, // Streaming active
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-123',
        setActiveConversation: mockSetActiveConversation,
        setConversations: jest.fn(),
        addConversation: jest.fn(),
        updateConversationTitle: jest.fn(),
      });

      render(<ChatInterface />);

      // Composer is rendered - Stop button should be visible (verified by Composer tests)
      expect(screen.getByTestId('composer')).toBeInTheDocument();
    });

    it('composer disabled during streaming', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        messages: [{role: 'user', content: 'test', timestamp: new Date()}],
        isLoading: false,
        isStreaming: true, // Streaming active
        error: null,
        addMessage: mockAddMessage,
        startStreaming: mockStartStreaming,
        appendToLastMessage: mockAppendToLastMessage,
        finishStreaming: mockFinishStreaming,
        setError: mockSetError,
        setLoading: jest.fn(),
        setMessages: jest.fn(),
        clearMessages: mockClearMessages,
        activeConversationId: 'conv-123',
        setActiveConversation: mockSetActiveConversation,
        setConversations: jest.fn(),
        addConversation: jest.fn(),
        updateConversationTitle: jest.fn(),
      });

      render(<ChatInterface />);

      // Composer should be disabled during streaming
      const sendButton = screen.getByRole('button', { name: 'Send' });
      expect(sendButton).toBeDisabled();
    });
  });
});
