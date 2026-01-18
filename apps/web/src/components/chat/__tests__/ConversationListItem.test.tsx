import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  const mockOnRenameStart = jest.fn();
  const mockOnRenameComplete = jest.fn();
  const mockOnRenameCancel = jest.fn();

  const defaultProps = {
    conversation: mockConversation,
    isActive: false,
    isEditing: false,
    onClick: mockOnClick,
    onDelete: mockOnDelete,
    onRenameStart: mockOnRenameStart,
    onRenameComplete: mockOnRenameComplete,
    onRenameCancel: mockOnRenameCancel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders conversation title', () => {
      render(<ConversationListItem {...defaultProps} />);

      expect(screen.getByTestId('conversation-title-conv-123')).toHaveTextContent('Test Conversation');
    });

    it('renders timestamp', () => {
      render(<ConversationListItem {...defaultProps} />);

      // Timestamp shows without " ago" suffix
      expect(screen.getByText('2 hours')).toBeInTheDocument();
    });

    it('renders MessageSquare icon', () => {
      const { container } = render(<ConversationListItem {...defaultProps} />);

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders dropdown menu trigger on hover', () => {
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      expect(menuTrigger).toBeInTheDocument();
    });
  });

  describe('Active State', () => {
    it('applies active styling when isActive is true', () => {
      render(<ConversationListItem {...defaultProps} isActive={true} />);

      const itemDiv = screen.getByTestId('conversation-item-conv-123');
      expect(itemDiv).toHaveClass('bg-blue-50');
      expect(itemDiv).toHaveClass('border-l-2');
      expect(itemDiv).toHaveClass('border-blue-500');
    });

    it('applies hover styling when isActive is false', () => {
      render(<ConversationListItem {...defaultProps} isActive={false} />);

      const itemDiv = screen.getByTestId('conversation-item-conv-123');
      expect(itemDiv).toHaveClass('hover:bg-gray-100');
    });

    it('sets aria-current to true when active', () => {
      render(<ConversationListItem {...defaultProps} isActive={true} />);

      const itemDiv = screen.getByTestId('conversation-item-conv-123');
      expect(itemDiv).toHaveAttribute('aria-current', 'true');
    });

    it('sets aria-current to false when not active', () => {
      render(<ConversationListItem {...defaultProps} isActive={false} />);

      const itemDiv = screen.getByTestId('conversation-item-conv-123');
      expect(itemDiv).toHaveAttribute('aria-current', 'false');
    });
  });

  describe('Click Interactions', () => {
    it('calls onClick with conversation id when clicked', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      fireEvent.click(item);

      expect(mockOnClick).toHaveBeenCalledWith('conv-123');
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when in editing mode', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      fireEvent.click(item);

      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('Dropdown Menu (Story 25.6)', () => {
    it('opens dropdown menu when trigger is clicked', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      await user.click(menuTrigger);

      expect(screen.getByTestId('conversation-rename-option-conv-123')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-delete-option-conv-123')).toBeInTheDocument();
    });

    it('shows Rename option in dropdown', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      await user.click(menuTrigger);

      const renameOption = screen.getByTestId('conversation-rename-option-conv-123');
      expect(renameOption).toHaveTextContent('Rename');
    });

    it('shows Delete option in dropdown', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      await user.click(menuTrigger);

      const deleteOption = screen.getByTestId('conversation-delete-option-conv-123');
      expect(deleteOption).toHaveTextContent('Delete');
    });

    it('calls onRenameStart when Rename option clicked', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      await user.click(menuTrigger);

      const renameOption = screen.getByTestId('conversation-rename-option-conv-123');
      await user.click(renameOption);

      expect(mockOnRenameStart).toHaveBeenCalledWith('conv-123');
    });

    it('calls onDelete when Delete option clicked', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      await user.click(menuTrigger);

      const deleteOption = screen.getByTestId('conversation-delete-option-conv-123');
      await user.click(deleteOption);

      expect(mockOnDelete).toHaveBeenCalledWith('conv-123');
    });

    it('does not trigger onClick when menu trigger clicked', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      await user.click(menuTrigger);

      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('Inline Rename (Story 25.6)', () => {
    it('shows input field when isEditing is true', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      expect(input).toBeInTheDocument();
    });

    it('hides title text when editing', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      expect(screen.queryByTestId('conversation-title-conv-123')).not.toBeInTheDocument();
    });

    it('input contains current title value', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123') as HTMLInputElement;
      expect(input.value).toBe('Test Conversation');
    });

    it('calls onRenameComplete with new title on Enter key', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      await user.clear(input);
      await user.type(input, 'New Title{Enter}');

      expect(mockOnRenameComplete).toHaveBeenCalledWith('conv-123', 'New Title');
    });

    it('calls onRenameCancel on Escape key', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      await user.type(input, '{Escape}');

      expect(mockOnRenameCancel).toHaveBeenCalled();
    });

    it('calls onRenameComplete on blur', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      await user.clear(input);
      await user.type(input, 'Blurred Title');
      fireEvent.blur(input);

      expect(mockOnRenameComplete).toHaveBeenCalledWith('conv-123', 'Blurred Title');
    });

    it('calls onRenameCancel if title unchanged', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      // Don't change the title
      fireEvent.blur(input);

      expect(mockOnRenameCancel).toHaveBeenCalled();
      expect(mockOnRenameComplete).not.toHaveBeenCalled();
    });

    it('calls onRenameCancel if title is empty', async () => {
      const user = userEvent.setup();
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      await user.clear(input);
      fireEvent.blur(input);

      expect(mockOnRenameCancel).toHaveBeenCalled();
      expect(mockOnRenameComplete).not.toHaveBeenCalled();
    });

    it('hides dropdown menu when editing', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      expect(screen.queryByTestId('conversation-menu-trigger-conv-123')).not.toBeInTheDocument();
    });

    it('has maxLength of 50 on input', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const input = screen.getByTestId('conversation-rename-input-conv-123');
      expect(input).toHaveAttribute('maxLength', '50');
    });
  });

  describe('Title Loading State (Story 25.5)', () => {
    it('shows "New Chat" when titleLoading is true', () => {
      const loadingConversation = {
        ...mockConversation,
        titleLoading: true,
      };
      render(<ConversationListItem {...defaultProps} conversation={loadingConversation} />);

      expect(screen.getByTestId('conversation-title-conv-123')).toHaveTextContent('New Chat');
    });

    it('shows "New Chat" when title is empty', () => {
      const emptyTitleConversation = {
        ...mockConversation,
        title: '',
      };
      render(<ConversationListItem {...defaultProps} conversation={emptyTitleConversation} />);

      expect(screen.getByTestId('conversation-title-conv-123')).toHaveTextContent('New Chat');
    });

    it('applies pulse animation when titleLoading is true', () => {
      const loadingConversation = {
        ...mockConversation,
        titleLoading: true,
      };
      render(<ConversationListItem {...defaultProps} conversation={loadingConversation} />);

      const titleElement = screen.getByTestId('conversation-title-conv-123');
      expect(titleElement).toHaveClass('animate-pulse');
    });

    it('applies muted text color when titleLoading is true', () => {
      const loadingConversation = {
        ...mockConversation,
        titleLoading: true,
      };
      render(<ConversationListItem {...defaultProps} conversation={loadingConversation} />);

      const titleElement = screen.getByTestId('conversation-title-conv-123');
      expect(titleElement).toHaveClass('text-gray-500');
    });

    it('does not apply pulse animation when titleLoading is false', () => {
      render(<ConversationListItem {...defaultProps} />);

      const titleElement = screen.getByTestId('conversation-title-conv-123');
      expect(titleElement).not.toHaveClass('animate-pulse');
    });

    it('has smooth transition class for title updates', () => {
      render(<ConversationListItem {...defaultProps} />);

      const titleElement = screen.getByTestId('conversation-title-conv-123');
      expect(titleElement).toHaveClass('transition-all');
      expect(titleElement).toHaveClass('duration-300');
    });
  });

  describe('Keyboard Support', () => {
    it('calls onClick when Enter key pressed', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      fireEvent.keyDown(item, { key: 'Enter' });

      expect(mockOnClick).toHaveBeenCalledWith('conv-123');
    });

    it('calls onDelete when Delete key pressed', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      fireEvent.keyDown(item, { key: 'Delete' });

      expect(mockOnDelete).toHaveBeenCalledWith('conv-123');
    });

    it('does not call handlers for other keys', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      fireEvent.keyDown(item, { key: 'Escape' });

      expect(mockOnClick).not.toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('ignores keyboard events when editing', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      fireEvent.keyDown(item, { key: 'Enter' });
      fireEvent.keyDown(item, { key: 'Delete' });

      expect(mockOnClick).not.toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has role="button"', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveAttribute('role', 'button');
    });

    it('has tabIndex for keyboard navigation', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveAttribute('tabIndex', '0');
    });

    it('has tabIndex -1 when editing', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveAttribute('tabIndex', '-1');
    });

    it('has descriptive aria-label', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveAttribute('aria-label', 'Test Conversation, 2 hours ago');
    });

    it('dropdown trigger has proper aria-label', () => {
      render(<ConversationListItem {...defaultProps} />);

      const menuTrigger = screen.getByTestId('conversation-menu-trigger-conv-123');
      expect(menuTrigger).toHaveAttribute('aria-label', 'Options for Test Conversation');
    });
  });

  describe('Visual Styling', () => {
    it('has correct height (48px)', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveClass('h-12'); // h-12 = 48px
    });

    it('has rounded corners', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveClass('rounded-lg');
    });

    it('has padding', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveClass('p-3'); // p-3 = 12px padding
    });

    it('has transition animation', () => {
      render(<ConversationListItem {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveClass('transition-colors');
    });

    it('applies editing background when isEditing', () => {
      render(<ConversationListItem {...defaultProps} isEditing={true} />);

      const item = screen.getByTestId('conversation-item-conv-123');
      expect(item).toHaveClass('bg-gray-50');
    });
  });

  describe('Title Truncation', () => {
    it('truncates long titles with ellipsis', () => {
      const longTitleConv = {
        ...mockConversation,
        title: 'This is a very long conversation title that should be truncated with ellipsis',
      };

      render(<ConversationListItem {...defaultProps} conversation={longTitleConv} />);

      const titleElement = screen.getByTestId('conversation-title-conv-123');
      expect(titleElement).toHaveClass('truncate');
    });
  });

  describe('Edge Cases', () => {
    it('handles conversation with special characters in title', () => {
      const specialCharConv = {
        ...mockConversation,
        title: 'Test & <Conversation> "with" special \'chars\'',
      };

      render(<ConversationListItem {...defaultProps} conversation={specialCharConv} />);

      expect(screen.getByTestId('conversation-title-conv-123')).toHaveTextContent(
        'Test & <Conversation> "with" special \'chars\''
      );
    });
  });
});
