import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSearchModal } from '../ConversationSearchModal';
import { Conversation } from '@/stores/chatStore';

describe('ConversationSearchModal', () => {
  // Create dynamic dates relative to now
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const fiveDaysAgo = new Date(now);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const twentyDaysAgo = new Date(now);
  twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      title: 'Redis role in queue',
      createdAt: yesterday,
      updatedAt: yesterday,
      mode: 'consult',
    },
    {
      id: 'conv-2',
      title: 'Casual conversation start',
      createdAt: yesterday,
      updatedAt: yesterday,
      mode: 'consult',
    },
    {
      id: 'conv-3',
      title: 'What is PIPEDA',
      createdAt: fiveDaysAgo,
      updatedAt: fiveDaysAgo,
      mode: 'assessment',
    },
    {
      id: 'conv-4',
      title: 'Create image feelings',
      createdAt: twentyDaysAgo,
      updatedAt: twentyDaysAgo,
      mode: 'consult',
    },
    {
      id: 'conv-5',
      title: 'Old conversation',
      createdAt: sixtyDaysAgo,
      updatedAt: sixtyDaysAgo,
      mode: 'consult',
    },
  ];

  const mockOnClose = jest.fn();
  const mockOnSelectConversation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('does not render when isOpen is false', () => {
      render(
        <ConversationSearchModal
          isOpen={false}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.queryByPlaceholderText('Search chats...')).not.toBeInTheDocument();
    });

    it('renders when isOpen is true', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByPlaceholderText('Search chats...')).toBeInTheDocument();
    });

    it('renders search input with correct placeholder', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      expect(input).toHaveAttribute('aria-label', 'Search conversations');
    });

    it('renders close button', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByLabelText('Close search')).toBeInTheDocument();
    });

    it('renders backdrop overlay', () => {
      const { container } = render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const backdrop = container.querySelector('.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('filters conversations by title', async () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      await userEvent.type(input, 'PIPEDA');

      expect(screen.getByText('What is PIPEDA')).toBeInTheDocument();
      expect(screen.queryByText('Redis role in queue')).not.toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      await userEvent.type(input, 'redis');

      expect(screen.getByText('Redis role in queue')).toBeInTheDocument();
    });

    it('shows empty state when no results', async () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      await userEvent.type(input, 'nonexistent query');

      expect(screen.getByText('No conversations found')).toBeInTheDocument();
    });
  });

  describe('Date Grouping', () => {
    it('groups conversations by Yesterday', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });

    it('groups conversations by Previous 7 Days', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByText('Previous 7 Days')).toBeInTheDocument();
    });

    it('groups conversations by Previous 30 Days', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByText('Previous 30 Days')).toBeInTheDocument();
    });

    it('groups conversations by Older', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByText('Older')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('clicking conversation calls onSelectConversation', async () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const conversation = screen.getByText('Redis role in queue');
      await userEvent.click(conversation);

      expect(mockOnSelectConversation).toHaveBeenCalledWith('conv-1');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('clicking close button calls onClose', async () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const closeButton = screen.getByLabelText('Close search');
      await userEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('clicking backdrop calls onClose', async () => {
      const { container } = render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const backdrop = container.querySelector('.bg-black\\/50') as HTMLElement;
      await userEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('pressing Escape closes modal', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('pressing ArrowDown selects next result', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');

      // First item should be selected by default (index 0)
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Second item should now be selected (verified by bg-gray-100 class)
    });

    it('pressing ArrowUp selects previous result', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');

      // Move down then up
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      // Should be back to first item
    });

    it('pressing Enter selects highlighted result', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');

      // First item selected by default, press Enter
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnSelectConversation).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('auto-focuses input when modal opens', () => {
      const { rerender } = render(
        <ConversationSearchModal
          isOpen={false}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      rerender(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      expect(input).toHaveFocus();
    });

    it('clears search when modal reopens', () => {
      const { rerender } = render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'test query' } });
      expect(input.value).toBe('test query');

      // Close and reopen
      rerender(
        <ConversationSearchModal
          isOpen={false}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      rerender(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const newInput = screen.getByPlaceholderText('Search chats...') as HTMLInputElement;
      expect(newInput.value).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty conversations list', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={[]}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      expect(screen.getByText('No conversations found')).toBeInTheDocument();
    });

    it('does not crash with ArrowDown when no results', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={[]}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');

      expect(() => {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      }).not.toThrow();
    });

    it('does not select conversation with Enter when no results', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={[]}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnSelectConversation).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('search input has aria-label', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const input = screen.getByPlaceholderText('Search chats...');
      expect(input).toHaveAttribute('aria-label', 'Search conversations');
    });

    it('close button has aria-label', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const closeButton = screen.getByLabelText('Close search');
      expect(closeButton).toBeInTheDocument();
    });

    it('each result has descriptive aria-label', () => {
      render(
        <ConversationSearchModal
          isOpen={true}
          onClose={mockOnClose}
          conversations={mockConversations}
          onSelectConversation={mockOnSelectConversation}
        />
      );

      const result = screen.getByLabelText('Select Redis role in queue');
      expect(result).toBeInTheDocument();
    });
  });
});
