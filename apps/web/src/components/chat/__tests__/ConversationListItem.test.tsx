import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationListItem } from '../ConversationListItem';
import { Conversation } from '@/stores/chatStore';

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn((date) => '2 hours ago'),
}));

describe('ConversationListItem', () => {
  const mockConversation: Conversation = {
    id: 'conv-123',
    title: 'Test Conversation',
    createdAt: new Date('2025-01-13T10:00:00Z'),
    updatedAt: new Date('2025-01-13T12:00:00Z'),
    mode: 'consult',
  };

  const mockOnClick = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders conversation title', () => {
      render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeInTheDocument();
    });

    it('renders timestamp', () => {
      render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      // Timestamp shows without " ago" suffix
      expect(screen.getByText('2 hours')).toBeInTheDocument();
    });

    it('renders MessageSquare icon', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders delete button with correct label', () => {
      render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByLabelText('Delete Test Conversation');
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('Active State', () => {
    it('applies active styling when isActive is true', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={true}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const itemDiv = container.firstChild as HTMLElement;
      expect(itemDiv).toHaveClass('bg-blue-50');
      expect(itemDiv).toHaveClass('border-l-2');
      expect(itemDiv).toHaveClass('border-blue-500');
    });

    it('applies hover styling when isActive is false', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const itemDiv = container.firstChild as HTMLElement;
      expect(itemDiv).toHaveClass('hover:bg-gray-100');
    });

    it('sets aria-current to true when active', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={true}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const itemDiv = container.firstChild as HTMLElement;
      expect(itemDiv).toHaveAttribute('aria-current', 'true');
    });

    it('sets aria-current to false when not active', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const itemDiv = container.firstChild as HTMLElement;
      expect(itemDiv).toHaveAttribute('aria-current', 'false');
    });
  });

  describe('Click Interactions', () => {
    it('calls onClick with conversation id when clicked', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      fireEvent.click(item);

      expect(mockOnClick).toHaveBeenCalledWith('conv-123');
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('calls onDelete when delete button clicked', () => {
      render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByLabelText('Delete Test Conversation');
      fireEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledWith('conv-123');
      expect(mockOnDelete).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onClick when delete button clicked', () => {
      render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByLabelText('Delete Test Conversation');
      fireEvent.click(deleteButton);

      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Support', () => {
    it('calls onClick when Enter key pressed', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      fireEvent.keyDown(item, { key: 'Enter' });

      expect(mockOnClick).toHaveBeenCalledWith('conv-123');
    });

    it('calls onDelete when Delete key pressed', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      fireEvent.keyDown(item, { key: 'Delete' });

      expect(mockOnDelete).toHaveBeenCalledWith('conv-123');
    });

    it('does not call handlers for other keys', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      fireEvent.keyDown(item, { key: 'Escape' });

      expect(mockOnClick).not.toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has role="button"', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveAttribute('role', 'button');
    });

    it('has tabIndex for keyboard navigation', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveAttribute('tabIndex', '0');
    });

    it('has descriptive aria-label', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveAttribute('aria-label', 'Test Conversation, 2 hours ago');
    });

    it('delete button has proper aria-label', () => {
      render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByLabelText('Delete Test Conversation');
      expect(deleteButton).toHaveAttribute('title', 'Delete conversation');
    });
  });

  describe('Visual Styling', () => {
    it('has correct height (48px)', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveClass('h-12'); // h-12 = 48px
    });

    it('has rounded corners', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveClass('rounded-lg');
    });

    it('has padding', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveClass('p-3'); // p-3 = 12px padding
    });

    it('has transition animation', () => {
      const { container } = render(
        <ConversationListItem
          conversation={mockConversation}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const item = container.firstChild as HTMLElement;
      expect(item).toHaveClass('transition-colors');
    });
  });

  describe('Title Truncation', () => {
    it('truncates long titles with ellipsis', () => {
      const longTitleConv = {
        ...mockConversation,
        title: 'This is a very long conversation title that should be truncated with ellipsis',
      };

      render(
        <ConversationListItem
          conversation={longTitleConv}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      const titleElement = screen.getByText(/This is a very long conversation/);
      expect(titleElement).toHaveClass('truncate');
    });
  });

  describe('Edge Cases', () => {
    it('handles conversation with special characters in title', () => {
      const specialCharConv = {
        ...mockConversation,
        title: 'Test & <Conversation> "with" special \'chars\'',
      };

      render(
        <ConversationListItem
          conversation={specialCharConv}
          isActive={false}
          onClick={mockOnClick}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText(/Test & <Conversation>/)).toBeInTheDocument();
    });
  });
});
