import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '../MessageList';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';

// Mock ChatMessage component
jest.mock('../ChatMessage', () => ({
  ChatMessage: ({ role, content }: { role: string; content: string }) => (
    <div data-testid={`chat-message-${role}`}>{content}</div>
  ),
}));

// Mock IntersectionObserver
let mockIntersectionObserverCallback: IntersectionObserverCallback;
const mockObserve = jest.fn();
const mockDisconnect = jest.fn();

global.IntersectionObserver = jest.fn().mockImplementation((callback) => {
  mockIntersectionObserverCallback = callback;
  return {
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: jest.fn(),
    root: null,
    rootMargin: '',
    thresholds: [0.1],
    takeRecords: jest.fn(),
  };
}) as unknown as typeof IntersectionObserver;

// Helper to trigger IntersectionObserver callback (wrapped in act)
const triggerIntersection = async (isIntersecting: boolean) => {
  await act(async () => {
    if (mockIntersectionObserverCallback) {
      mockIntersectionObserverCallback(
        [{ isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    }
  });
};

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
    beforeEach(() => {
      mockObserve.mockClear();
      mockDisconnect.mockClear();
    });

    it('button hidden by default when at bottom', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock no overflow (content fits in container)
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 600, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      // Trigger intersection - at bottom
      await triggerIntersection(true);

      const button = screen.queryByLabelText('Scroll to bottom');
      expect(button).not.toBeInTheDocument();
    });

    it('button appears when scrolled up with overflow', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'assistant', content: 'Message 2', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock overflow content (scrollHeight > clientHeight)
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      // Trigger intersection - NOT at bottom
      await triggerIntersection(false);

      const button = screen.getByLabelText('Scroll to bottom');
      expect(button).toBeInTheDocument();
    });

    it('button hidden when no overflow even if not intersecting', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock no overflow (content fits in container)
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 600, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      // Trigger intersection - NOT at bottom but no overflow
      await triggerIntersection(false);

      const button = screen.queryByLabelText('Scroll to bottom');
      expect(button).not.toBeInTheDocument();
    });

    it('button has correct styling and z-index', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock overflow
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      // Trigger intersection - NOT at bottom
      await triggerIntersection(false);

      const button = screen.getByLabelText('Scroll to bottom');

      // ChatGPT-style button: centered, white background, not absolutely positioned (wrapper div handles positioning)
      expect(button).toHaveClass('rounded-full', 'bg-white', 'text-gray-600');
      expect(button).toHaveClass('h-8', 'w-8');
      expect(button).toHaveAttribute('title', 'Scroll to latest message');

      // Button is inside centered wrapper with z-20
      const wrapper = button.parentElement;
      expect(wrapper).toHaveClass('z-20');
    });

    it('clicking button scrolls to bottom using scrollIntoView', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock overflow
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      // Trigger intersection - NOT at bottom
      await triggerIntersection(false);

      const button = screen.getByLabelText('Scroll to bottom');

      // Mock scrollIntoView on bottomRef
      const bottomRef = container.querySelector('.max-w-3xl > div:last-child') as HTMLElement;
      const mockScrollIntoView = jest.fn();
      if (bottomRef) {
        bottomRef.scrollIntoView = mockScrollIntoView;
      }

      await userEvent.click(button);

      // Should call scrollIntoView with smooth behavior
      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

      // Button should be immediately hidden
      await waitFor(() => {
        expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
      });
    });

    it('scroll container has overflow-y-auto for scrolling', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto');
      expect(scrollContainer).toBeInTheDocument();
      expect(scrollContainer).toHaveClass('overflow-y-auto');
      // Note: smooth scrolling is handled via JS scrollIntoView({ behavior: 'smooth' }), not CSS
    });

    it('button positioned in outer non-scrolling container', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(<MessageList messages={messages} />);

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock overflow
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      // Trigger intersection - NOT at bottom
      await triggerIntersection(false);

      const button = screen.getByLabelText('Scroll to bottom');

      // Button's parent should be the outer container with relative positioning
      const outerContainer = container.querySelector('.relative.flex.h-full');
      expect(outerContainer).toBeInTheDocument();
      expect(outerContainer).toContainElement(button);

      // Button should NOT be inside the scrolling container
      expect(scrollContainer).not.toContainElement(button);
    });

    it('IntersectionObserver is set up with correct options', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      render(<MessageList messages={messages} />);

      // IntersectionObserver should be created with threshold 0.1
      expect(global.IntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          threshold: 0.1,
        })
      );

      // Should call observe
      expect(mockObserve).toHaveBeenCalled();
    });

    it('IntersectionObserver disconnects on unmount', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { unmount } = render(<MessageList messages={messages} />);

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // Story 4.3.4: Questionnaire slot tests
  describe('questionnaireSlot', () => {
    it('renders questionnaireSlot content when provided', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      render(
        <MessageList
          messages={messages}
          questionnaireSlot={<div data-testid="test-slot">Slot Content</div>}
        />
      );

      expect(screen.getByTestId('test-slot')).toBeInTheDocument();
      expect(screen.getByText('Slot Content')).toBeInTheDocument();
    });

    it('does not render anything when questionnaireSlot is not provided', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      render(<MessageList messages={messages} />);

      expect(screen.queryByTestId('test-slot')).not.toBeInTheDocument();
    });

    it('renders slot after messages but before typing indicator', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'assistant', content: 'Message 2', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          isLoading={true}
          questionnaireSlot={<div data-testid="test-slot">Slot Content</div>}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl');
      const children = centeredContainer?.children;

      if (children) {
        // Find indices
        const slotIndex = Array.from(children).findIndex(
          (child) => child.getAttribute('data-testid') === 'test-slot'
        );
        const typingIndicatorIndex = Array.from(children).findIndex(
          (child) => child.getAttribute('data-testid') === 'typing-indicator'
        );

        // Slot should come before typing indicator
        expect(slotIndex).toBeGreaterThan(-1);
        expect(typingIndicatorIndex).toBeGreaterThan(-1);
        expect(slotIndex).toBeLessThan(typingIndicatorIndex);
      }
    });

    it('slot is inside centered container (max-w-3xl)', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaireSlot={<div data-testid="test-slot">Slot Content</div>}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl.mx-auto');
      const slot = screen.getByTestId('test-slot');

      expect(centeredContainer).toContainElement(slot);
    });
  });
});
