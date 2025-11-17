import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // When no messages and loading, shows 3 skeleton loaders
    const skeletons = screen.getAllByTestId('skeleton-message');
    expect(skeletons).toHaveLength(3);
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

    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
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

    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
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

  // Story 9.4: Centered content constraint tests
  describe('Centered Content Layout', () => {
    it('messages container has max-width constraint (max-w-3xl)', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      // Find the centered container (has max-w-3xl class)
      const centeredContainer = container.querySelector('.max-w-3xl');
      expect(centeredContainer).toBeInTheDocument();
    });

    it('container is horizontally centered (mx-auto)', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      // Find the centered container (has mx-auto class)
      const centeredContainer = container.querySelector('.mx-auto');
      expect(centeredContainer).toBeInTheDocument();
    });

    it('responsive padding applied (px-4)', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      // Find the centered container with padding
      const centeredContainer = container.querySelector('.px-4');
      expect(centeredContainer).toBeInTheDocument();
    });

    it('centered container wraps all messages', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'assistant', content: 'Message 2', timestamp: new Date() },
        { role: 'user', content: 'Message 3', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      // Centered container should contain all messages
      const centeredContainer = container.querySelector('.max-w-3xl.mx-auto');
      expect(centeredContainer).toBeInTheDocument();

      // All messages should be inside centered container
      const messagesInContainer = centeredContainer?.querySelectorAll('[data-testid^="chat-message-"]');
      expect(messagesInContainer).toHaveLength(3);
    });

    it('typing indicator is inside centered container', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} isLoading={true} />);

      // Centered container should contain typing indicator
      const centeredContainer = container.querySelector('.max-w-3xl.mx-auto');
      const typingIndicator = centeredContainer?.querySelector('[data-testid="typing-indicator"]');
      expect(typingIndicator).toBeInTheDocument();
    });
  });

  // Scroll-to-bottom button
  describe('Scroll-to-Bottom Button', () => {
    it('button hidden by default when at bottom', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      render(<MessageList messages={messages} />);

      const button = screen.queryByLabelText('Scroll to bottom');
      expect(button).not.toBeInTheDocument();
    });

    it('button appears when scrolled up', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'assistant', content: 'Message 2', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock scroll properties (scrolled up 100px from bottom)
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });

      fireEvent.scroll(scrollContainer);

      const button = screen.getByLabelText('Scroll to bottom');
      expect(button).toBeInTheDocument();
    });

    it('button has correct styling', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock scroll to show button
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });

      fireEvent.scroll(scrollContainer);

      const button = screen.getByLabelText('Scroll to bottom');

      expect(button).toHaveClass('absolute', 'bottom-6', 'right-6', 'rounded-full');
      expect(button).toHaveClass('bg-purple-600');
      expect(button).toHaveAttribute('title', 'Scroll to latest message');
    });

    it('clicking button triggers scroll to bottom', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock scroll properties
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      let currentScrollTop = 300;
      Object.defineProperty(scrollContainer, 'scrollTop', {
        get() {
          return currentScrollTop;
        },
        set(value: number) {
          currentScrollTop = value;
        },
      });

      // Trigger scroll to show button
      fireEvent.scroll(scrollContainer);

      const button = screen.getByLabelText('Scroll to bottom');
      await userEvent.click(button);

      // Should set scrollTop to scrollHeight
      expect(currentScrollTop).toBe(1000);
    });

    it('scroll container has scroll-smooth class', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto');
      expect(scrollContainer).toHaveClass('scroll-smooth');
      expect(scrollContainer).toHaveClass('relative');
    });
  });
});
