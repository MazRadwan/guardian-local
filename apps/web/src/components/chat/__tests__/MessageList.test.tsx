import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '../MessageList';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';

// Mock ChatMessage component
jest.mock('../ChatMessage', () => ({
  ChatMessage: ({ role, content }: { role: string; content: string }) => (
    <div data-testid={`chat-message-${role}`} role="article">{content}</div>
  ),
}));

// Mock QuestionnaireMessage component
jest.mock('../QuestionnaireMessage', () => ({
  QuestionnaireMessage: () => (
    <div data-testid="questionnaire-message" role="article">Mocked Questionnaire</div>
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

  // Story 14.1.2: Inline Questionnaire tests
  describe('Inline Questionnaire (Story 14.1.2)', () => {
    const mockQuestionnaireProps = {
      payload: {
        conversationId: 'conv-123',
        assessmentType: 'comprehensive' as const,
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        contextSummary: 'Test context',
        estimatedQuestions: 85,
        selectedCategories: null,
      },
      uiState: 'ready' as const,
      onGenerate: jest.fn(),
      onDownload: jest.fn(),
      onRetry: jest.fn(),
      insertIndex: 1, // After first message
    };

    it('renders questionnaire at correct position (middle of messages)', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'assistant', content: 'Message 2', timestamp: new Date() },
        { role: 'user', content: 'Message 3', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 1 }}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl');
      const allItems = centeredContainer?.querySelectorAll('[role="article"]');

      // Should have 4 items: 3 messages + 1 questionnaire
      expect(allItems?.length).toBe(4);

      // Questionnaire should be at index 1 (after first message)
      expect(allItems?.[1]).toHaveAttribute('data-testid', 'questionnaire-message');
    });

    it('renders questionnaire at end when insertIndex >= messages.length', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 5 }} // Beyond messages
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl');
      const allItems = centeredContainer?.querySelectorAll('[role="article"]');

      // Questionnaire should be last
      expect(allItems?.[allItems!.length - 1]).toHaveAttribute('data-testid', 'questionnaire-message');
    });

    it('does not render questionnaire when prop is undefined', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test', timestamp: new Date() },
      ];

      render(<MessageList messages={messages} />);

      expect(screen.queryByTestId('questionnaire-message')).not.toBeInTheDocument();
    });

    it('preserves message ordering with questionnaire inserted', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'First', timestamp: new Date() },
        { role: 'assistant', content: 'Second', timestamp: new Date() },
        { role: 'user', content: 'Third', timestamp: new Date() },
      ];

      render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 2 }}
        />
      );

      // Verify message content order
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });

    it('questionnaire is inside centered container (max-w-3xl)', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test message', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 1 }}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl.mx-auto');
      const questionnaire = screen.getByTestId('questionnaire-message');

      expect(centeredContainer).toContainElement(questionnaire);
    });

    it('renders questionnaire before typing indicator when both present', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          isLoading={true}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 10 }} // At end
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl');
      const children = centeredContainer?.children;

      if (children) {
        // Find indices
        const questionnaireIndex = Array.from(children).findIndex(
          (child) => child.getAttribute('data-testid') === 'questionnaire-message'
        );
        const typingIndicatorIndex = Array.from(children).findIndex(
          (child) => child.getAttribute('data-testid') === 'typing-indicator'
        );

        // Questionnaire should come before typing indicator
        expect(questionnaireIndex).toBeGreaterThan(-1);
        expect(typingIndicatorIndex).toBeGreaterThan(-1);
        expect(questionnaireIndex).toBeLessThan(typingIndicatorIndex);
      }
    });

    it('renders questionnaire at position 0 when insertIndex is 0', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Message 1', timestamp: new Date() },
        { role: 'assistant', content: 'Message 2', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 0 }}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl');
      const allItems = centeredContainer?.querySelectorAll('[role="article"]');

      // Questionnaire should be first
      expect(allItems?.[0]).toHaveAttribute('data-testid', 'questionnaire-message');
    });
  });

  // Story 14.1.3: Scroll Behavior with Questionnaire
  describe('Scroll Behavior with Questionnaire (Story 14.1.3)', () => {
    const mockQuestionnaireProps = {
      payload: {
        conversationId: 'conv-123',
        assessmentType: 'comprehensive' as const,
        vendorName: 'Test Vendor',
        solutionName: null,
        contextSummary: null,
        estimatedQuestions: 85,
        selectedCategories: null,
      },
      uiState: 'ready' as const,
      onGenerate: jest.fn(),
      onDownload: jest.fn(),
      onRetry: jest.fn(),
      insertIndex: 1,
    };

    it('questionnaire message is inside scroll container', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 1 }}
        />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto');
      const questionnaire = screen.getByTestId('questionnaire-message');

      expect(scrollContainer).toContainElement(questionnaire);
    });

    it('questionnaire message is within max-width centered container', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 1 }}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl.mx-auto');
      const questionnaire = screen.getByTestId('questionnaire-message');

      expect(centeredContainer).toContainElement(questionnaire);
    });

    it('bottom padding exists in content container', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 1 }}
        />
      );

      const centeredContainer = container.querySelector('.max-w-3xl.mx-auto');
      // Should have pb-6 class for bottom padding
      expect(centeredContainer?.className).toMatch(/pb-6/);
    });

    it('scroll-to-bottom button positioned outside scroll container', async () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test 1', timestamp: new Date() },
        { role: 'assistant', content: 'Test 2', timestamp: new Date() },
      ];

      const { container } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, insertIndex: 2 }}
        />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

      // Mock overflow
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, writable: true });

      // Trigger intersection - NOT at bottom
      await triggerIntersection(false);

      const button = screen.getByLabelText('Scroll to bottom');

      // Button should NOT be inside scroll container (prevents scrolling with content)
      expect(scrollContainer).not.toContainElement(button);

      // Button should be in the outer container
      const outerContainer = container.querySelector('.relative.flex.h-full');
      expect(outerContainer).toContainElement(button);
    });

    it('questionnaire in different states renders correctly inside scroll container', () => {
      const messages: ChatMessageType[] = [
        { role: 'user', content: 'Test', timestamp: new Date() },
      ];

      // Test with generating state
      const { container, rerender } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, uiState: 'generating', insertIndex: 1 }}
        />
      );

      let scrollContainer = container.querySelector('.overflow-y-auto');
      let questionnaire = screen.getByTestId('questionnaire-message');
      expect(scrollContainer).toContainElement(questionnaire);

      // Test with download state
      rerender(
        <MessageList
          messages={messages}
          questionnaire={{
            ...mockQuestionnaireProps,
            uiState: 'download',
            exportData: { formats: ['pdf', 'word'], assessmentId: 'assess-123' },
            insertIndex: 1,
          }}
        />
      );

      scrollContainer = container.querySelector('.overflow-y-auto');
      questionnaire = screen.getByTestId('questionnaire-message');
      expect(scrollContainer).toContainElement(questionnaire);
    });

    it('auto-scrolls when questionnaire appears (Story 14.1.3 regression)', async () => {
      const messages = [
        { role: 'user' as const, content: 'Can you generate a report?', timestamp: new Date() },
        { role: 'assistant' as const, content: 'Yes, I can generate a report for you.', timestamp: new Date() },
      ];

      const { container, rerender } = render(
        <MessageList messages={messages} />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
      expect(scrollContainer).toBeInTheDocument();

      // Mock scroll dimensions - content overflows
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, writable: true, configurable: true });

      // Simulate NOT being near bottom (IntersectionObserver reports not intersecting)
      // This is the key scenario: user has scrolled up, but questionnaire should still scroll into view
      await triggerIntersection(false);

      // Verify we're not near bottom before questionnaire appears
      expect(scrollContainer.scrollTop).toBe(100);

      // Rerender with questionnaire appearing (transitions from undefined to 'ready')
      rerender(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, uiState: 'ready', insertIndex: 2 }}
        />
      );

      // The questionnaire should be rendered and visible
      expect(screen.getByTestId('questionnaire-message')).toBeInTheDocument();

      // Scroll should have been triggered because questionnaire just appeared
      // Even though isNearBottom is false, the questionnaire appearance forces scroll
      expect(scrollContainer.scrollTop).toBe(1000); // scrollTop set to scrollHeight
    });

    it('auto-scrolls when questionnaire uiState changes', () => {
      const messages = [
        { role: 'user' as const, content: 'Test', timestamp: new Date() },
      ];

      const { container, rerender } = render(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, uiState: 'ready', insertIndex: 1 }}
        />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;

      // Transition to generating state
      rerender(
        <MessageList
          messages={messages}
          questionnaire={{ ...mockQuestionnaireProps, uiState: 'generating', insertIndex: 1 }}
        />
      );

      expect(screen.getByTestId('questionnaire-message')).toBeInTheDocument();
      expect(scrollContainer).toContainElement(screen.getByTestId('questionnaire-message'));

      // Transition to download state
      rerender(
        <MessageList
          messages={messages}
          questionnaire={{
            ...mockQuestionnaireProps,
            uiState: 'download',
            exportData: { formats: ['pdf'], assessmentId: 'assess-123' },
            insertIndex: 1,
          }}
        />
      );

      expect(screen.getByTestId('questionnaire-message')).toBeInTheDocument();
      expect(scrollContainer).toContainElement(screen.getByTestId('questionnaire-message'));
    });

    it('auto-scrolls when typing indicator appears (isLoading regression)', async () => {
      const messages = [
        { role: 'user' as const, content: 'Hello, can you help me?', timestamp: new Date() },
        { role: 'assistant' as const, content: 'Sure, I can help!', timestamp: new Date() },
      ];

      const { container, rerender } = render(
        <MessageList messages={messages} isLoading={false} />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
      expect(scrollContainer).toBeInTheDocument();

      // Mock scroll dimensions - content overflows
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, writable: true, configurable: true });

      // Simulate NOT being near bottom (IntersectionObserver reports not intersecting)
      // This is the key scenario: user has scrolled up, but typing indicator should still scroll into view
      await triggerIntersection(false);

      // Verify we're not near bottom before typing indicator appears
      expect(scrollContainer.scrollTop).toBe(100);

      // Rerender with isLoading=true (typing indicator appears)
      rerender(
        <MessageList messages={messages} isLoading={true} />
      );

      // The typing indicator should be rendered and visible
      expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();

      // Scroll should have been triggered because typing indicator just appeared
      // Even though isNearBottom is false, the typing indicator appearance forces scroll
      expect(scrollContainer.scrollTop).toBe(1000); // scrollTop set to scrollHeight
    });
  });
});
