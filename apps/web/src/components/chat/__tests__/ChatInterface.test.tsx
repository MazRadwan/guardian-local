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

describe('ChatInterface', () => {
  const mockAddMessage = jest.fn();
  const mockStartStreaming = jest.fn();
  const mockAppendToLastMessage = jest.fn();
  const mockFinishStreaming = jest.fn();
  const mockSetError = jest.fn();
  const mockSendMessage = jest.fn();
  const mockChangeMode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

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
    });

    (useWebSocket as jest.Mock).mockReturnValue({
      isConnected: true,
      isConnecting: false,
      sendMessage: mockSendMessage,
      requestHistory: jest.fn(),
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
    });

    render(<ChatInterface />);

    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to Guardian')).not.toBeInTheDocument();
  });

  it('shows connection status indicator', () => {
    render(<ChatInterface />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByLabelText('Connected')).toBeInTheDocument();
  });

  it('shows connecting status when connecting', () => {
    (useWebSocket as jest.Mock).mockReturnValue({
      isConnected: false,
      isConnecting: true,
      sendMessage: mockSendMessage,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    render(<ChatInterface />);

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(screen.getByLabelText('Connecting')).toBeInTheDocument();
  });

  it('shows disconnected status when disconnected', () => {
    (useWebSocket as jest.Mock).mockReturnValue({
      isConnected: false,
      isConnecting: false,
      sendMessage: mockSendMessage,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    render(<ChatInterface />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByLabelText('Disconnected')).toBeInTheDocument();
  });

  it('handles sending a message', () => {
    render(<ChatInterface />);

    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);

    expect(mockAddMessage).toHaveBeenCalledWith({
      role: 'user',
      content: 'test message',
      timestamp: expect.any(Date),
    });
    expect(mockSendMessage).toHaveBeenCalledWith('test message');
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
});
