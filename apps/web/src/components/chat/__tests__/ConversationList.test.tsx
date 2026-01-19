import { render, screen, within } from '@testing-library/react';
import { ConversationList } from '../ConversationList';
import { Conversation } from '@/stores/chatStore';

// Mock ConversationListItem to simplify testing
jest.mock('../ConversationListItem', () => ({
  ConversationListItem: jest.fn(({
    conversation,
    isActive,
    isEditing,
    onClick,
    onDelete,
    onRenameStart,
    onRenameComplete,
    onRenameCancel,
  }) => (
    <div
      data-testid={`conversation-item-${conversation.id}`}
      data-active={isActive}
      data-editing={isEditing}
      onClick={() => onClick(conversation.id)}
    >
      <span>{conversation.title}</span>
      <button onClick={(e) => {
        e.stopPropagation();
        onDelete(conversation.id);
      }}>Delete</button>
      <button onClick={(e) => {
        e.stopPropagation();
        onRenameStart(conversation.id);
      }}>Rename</button>
    </div>
  )),
}));

describe('ConversationList', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      title: 'First Conversation',
      createdAt: new Date('2025-01-13T10:00:00Z'),
      updatedAt: new Date('2025-01-13T12:00:00Z'),
      mode: 'consult',
    },
    {
      id: 'conv-2',
      title: 'Second Conversation',
      createdAt: new Date('2025-01-13T09:00:00Z'),
      updatedAt: new Date('2025-01-13T11:00:00Z'),
      mode: 'assessment',
    },
    {
      id: 'conv-3',
      title: 'Third Conversation',
      createdAt: new Date('2025-01-13T08:00:00Z'),
      updatedAt: new Date('2025-01-13T10:00:00Z'),
      mode: 'consult',
    },
  ];

  const mockOnSelectConversation = jest.fn();
  const mockOnDeleteConversation = jest.fn();
  const mockOnRenameStart = jest.fn();
  const mockOnRenameComplete = jest.fn();
  const mockOnRenameCancel = jest.fn();

  const defaultProps = {
    conversations: mockConversations,
    activeConversationId: null as string | null,
    editingConversationId: null as string | null,
    onSelectConversation: mockOnSelectConversation,
    onDeleteConversation: mockOnDeleteConversation,
    onRenameStart: mockOnRenameStart,
    onRenameComplete: mockOnRenameComplete,
    onRenameCancel: mockOnRenameCancel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty State', () => {
    it('shows empty state when no conversations', () => {
      render(
        <ConversationList
          {...defaultProps}
          conversations={[]}
        />
      );

      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    it('empty state has correct styling', () => {
      const { container } = render(
        <ConversationList
          {...defaultProps}
          conversations={[]}
        />
      );

      const emptyState = container.firstChild as HTMLElement;
      expect(emptyState).toHaveClass('flex', 'flex-1', 'items-center', 'justify-center');

      const text = screen.getByText('No conversations yet');
      expect(text).toHaveClass('text-sm', 'text-gray-500');
    });

    it('does not render conversation items when empty', () => {
      render(
        <ConversationList
          {...defaultProps}
          conversations={[]}
        />
      );

      expect(screen.queryByTestId(/conversation-item/)).not.toBeInTheDocument();
    });
  });

  describe('List Rendering', () => {
    it('renders all conversations', () => {
      render(<ConversationList {...defaultProps} />);

      expect(screen.getByText('First Conversation')).toBeInTheDocument();
      expect(screen.getByText('Second Conversation')).toBeInTheDocument();
      expect(screen.getByText('Third Conversation')).toBeInTheDocument();
    });

    it('renders correct number of conversation items', () => {
      render(<ConversationList {...defaultProps} />);

      const items = screen.getAllByTestId(/conversation-item/);
      expect(items).toHaveLength(3);
    });

    it('passes correct props to ConversationListItem', () => {
      render(
        <ConversationList
          {...defaultProps}
          activeConversationId="conv-2"
        />
      );

      const item2 = screen.getByTestId('conversation-item-conv-2');
      expect(item2).toHaveAttribute('data-active', 'true');
    });

    it('marks only active conversation as active', () => {
      render(
        <ConversationList
          {...defaultProps}
          activeConversationId="conv-2"
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-active', 'false');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-active', 'true');
      expect(screen.getByTestId('conversation-item-conv-3')).toHaveAttribute('data-active', 'false');
    });

    it('handles null activeConversationId', () => {
      render(<ConversationList {...defaultProps} />);

      const items = screen.getAllByTestId(/conversation-item/);
      items.forEach((item) => {
        expect(item).toHaveAttribute('data-active', 'false');
      });
    });
  });

  describe('Editing State (Story 25.6)', () => {
    it('passes isEditing=true to correct conversation', () => {
      render(
        <ConversationList
          {...defaultProps}
          editingConversationId="conv-2"
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-editing', 'false');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-editing', 'true');
      expect(screen.getByTestId('conversation-item-conv-3')).toHaveAttribute('data-editing', 'false');
    });

    it('handles null editingConversationId', () => {
      render(<ConversationList {...defaultProps} />);

      const items = screen.getAllByTestId(/conversation-item/);
      items.forEach((item) => {
        expect(item).toHaveAttribute('data-editing', 'false');
      });
    });
  });

  describe('Scrollable Container', () => {
    it('has scrollable container', () => {
      const { container } = render(<ConversationList {...defaultProps} />);

      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveClass('overflow-y-auto');
    });

    it('has flex-1 to take available space', () => {
      const { container } = render(<ConversationList {...defaultProps} />);

      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveClass('flex-1');
    });

    it('has gap between items', () => {
      const { container } = render(<ConversationList {...defaultProps} />);

      const itemsContainer = container.querySelector('.gap-1');
      expect(itemsContainer).toBeInTheDocument();
    });

    it('has padding around items', () => {
      const { container } = render(<ConversationList {...defaultProps} />);

      const itemsContainer = container.querySelector('.p-2');
      expect(itemsContainer).toBeInTheDocument();
    });
  });

  describe('Selection Propagation', () => {
    it('calls onSelectConversation when conversation clicked', () => {
      render(<ConversationList {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-2');
      item.click();

      expect(mockOnSelectConversation).toHaveBeenCalledWith('conv-2');
      expect(mockOnSelectConversation).toHaveBeenCalledTimes(1);
    });

    it('calls onDeleteConversation when delete clicked', () => {
      render(<ConversationList {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-1');
      const deleteButton = within(item).getByText('Delete');
      deleteButton.click();

      expect(mockOnDeleteConversation).toHaveBeenCalledWith('conv-1');
      expect(mockOnDeleteConversation).toHaveBeenCalledTimes(1);
    });

    it('does not call onSelectConversation when delete clicked', () => {
      render(<ConversationList {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-1');
      const deleteButton = within(item).getByText('Delete');
      deleteButton.click();

      expect(mockOnSelectConversation).not.toHaveBeenCalled();
    });

    it('calls onRenameStart when rename clicked', () => {
      render(<ConversationList {...defaultProps} />);

      const item = screen.getByTestId('conversation-item-conv-1');
      const renameButton = within(item).getByText('Rename');
      renameButton.click();

      expect(mockOnRenameStart).toHaveBeenCalledWith('conv-1');
      expect(mockOnRenameStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles single conversation', () => {
      render(
        <ConversationList
          {...defaultProps}
          conversations={[mockConversations[0]]}
        />
      );

      expect(screen.getByText('First Conversation')).toBeInTheDocument();
      expect(screen.queryByText('Second Conversation')).not.toBeInTheDocument();
    });

    it('handles many conversations (performance)', () => {
      const manyConversations: Conversation[] = Array.from({ length: 100 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Conversation ${i}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        mode: 'consult' as const,
      }));

      render(
        <ConversationList
          {...defaultProps}
          conversations={manyConversations}
        />
      );

      const items = screen.getAllByTestId(/conversation-item/);
      expect(items).toHaveLength(100);
    });

    it('handles conversation with no active state', () => {
      render(
        <ConversationList
          {...defaultProps}
          activeConversationId="non-existent-id"
        />
      );

      const items = screen.getAllByTestId(/conversation-item/);
      items.forEach((item) => {
        expect(item).toHaveAttribute('data-active', 'false');
      });
    });

    it('re-renders when conversations change', () => {
      const { rerender } = render(<ConversationList {...defaultProps} />);

      expect(screen.getAllByTestId(/conversation-item/)).toHaveLength(3);

      const newConversations = [...mockConversations, {
        id: 'conv-4',
        title: 'Fourth Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
        mode: 'consult' as const,
      }];

      rerender(
        <ConversationList
          {...defaultProps}
          conversations={newConversations}
        />
      );

      expect(screen.getAllByTestId(/conversation-item/)).toHaveLength(4);
      expect(screen.getByText('Fourth Conversation')).toBeInTheDocument();
    });

    it('re-renders when activeConversationId changes', () => {
      const { rerender } = render(
        <ConversationList
          {...defaultProps}
          activeConversationId="conv-1"
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-active', 'true');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-active', 'false');

      rerender(
        <ConversationList
          {...defaultProps}
          activeConversationId="conv-2"
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-active', 'false');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-active', 'true');
    });

    it('re-renders when editingConversationId changes', () => {
      const { rerender } = render(
        <ConversationList
          {...defaultProps}
          editingConversationId="conv-1"
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-editing', 'true');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-editing', 'false');

      rerender(
        <ConversationList
          {...defaultProps}
          editingConversationId="conv-2"
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-editing', 'false');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-editing', 'true');
    });
  });
});
