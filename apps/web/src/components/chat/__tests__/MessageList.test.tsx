import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';

// Mock ChatMessage component
jest.mock('../ChatMessage', () => ({
  ChatMessage: ({ role, content }: { role: string; content: string }) => (
    <div data-testid={`chat-message-${role}`}>{content}</div>
  ),
}));

describe('MessageList', () => {
  it('renders empty state when no messages', () => {
    render(<MessageList messages={[]} />);

    expect(screen.getByText('Welcome to Guardian')).toBeInTheDocument();
    expect(screen.getByText(/Start a conversation to assess AI vendors/)).toBeInTheDocument();
  });

  it('does not show empty state when loading', () => {
    render(<MessageList messages={[]} isLoading={true} />);

    expect(screen.queryByText('Welcome to Guardian')).not.toBeInTheDocument();
    expect(screen.getByText('Guardian is typing...')).toBeInTheDocument();
  });

  it('renders list of messages', () => {
    const messages: ChatMessageType[] = [
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'How are you?',
        timestamp: new Date(),
      },
    ];

    render(<MessageList messages={messages} />);

    // Use getAllByTestId for multiple matches
    const userMessages = screen.getAllByTestId('chat-message-user');
    expect(userMessages).toHaveLength(2);
    expect(screen.getByTestId('chat-message-assistant')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
  });

  it('shows loading indicator when isLoading is true', () => {
    const messages: ChatMessageType[] = [
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      },
    ];

    render(<MessageList messages={messages} isLoading={true} />);

    expect(screen.getByText('Guardian is typing...')).toBeInTheDocument();
  });

  it('does not show loading indicator when isLoading is false', () => {
    const messages: ChatMessageType[] = [
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    expect(screen.queryByText('Guardian is typing...')).not.toBeInTheDocument();
  });

  it('renders multiple user and assistant messages', () => {
    const messages: ChatMessageType[] = [
      { role: 'user', content: 'Message 1', timestamp: new Date() },
      { role: 'assistant', content: 'Message 2', timestamp: new Date() },
      { role: 'user', content: 'Message 3', timestamp: new Date() },
      { role: 'assistant', content: 'Message 4', timestamp: new Date() },
    ];

    render(<MessageList messages={messages} />);

    expect(screen.getAllByTestId(/chat-message-/)).toHaveLength(4);
  });

  it('renders system messages', () => {
    const messages: ChatMessageType[] = [
      {
        role: 'system',
        content: 'System notification',
        timestamp: new Date(),
      },
    ];

    render(<MessageList messages={messages} />);

    expect(screen.getByTestId('chat-message-system')).toBeInTheDocument();
    expect(screen.getByText('System notification')).toBeInTheDocument();
  });
});
