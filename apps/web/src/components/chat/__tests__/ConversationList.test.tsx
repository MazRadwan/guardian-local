import { render, screen, within } from '@testing-library/react';
import { ConversationList } from '../ConversationList';
import { Conversation } from '@/stores/chatStore';

// Mock ConversationListItem to simplify testing
jest.mock('../ConversationListItem', () => ({
  ConversationListItem: jest.fn(({ conversation, isActive, onClick, onDelete }) => (
    <div
      data-testid={`conversation-item-${conversation.id}`}
      data-active={isActive}
      onClick={() => onClick(conversation.id)}
    >
      <span>{conversation.title}</span>
      <button onClick={(e) => {
        e.stopPropagation();
        onDelete(conversation.id);
      }}>Delete</button>
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
      messageCount: 5,
    },
    {
      id: 'conv-2',
      title: 'Second Conversation',
      createdAt: new Date('2025-01-13T09:00:00Z'),
      updatedAt: new Date('2025-01-13T11:00:00Z'),
      mode: 'assessment',
      messageCount: 3,
    },
    {
      id: 'conv-3',
      title: 'Third Conversation',
      createdAt: new Date('2025-01-13T08:00:00Z'),
      updatedAt: new Date('2025-01-13T10:00:00Z'),
      mode: 'consult',
      messageCount: 8,
    },
  ];

  const mockOnSelectConversation = jest.fn();
  const mockOnDeleteConversation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty State', () => {
    it('shows empty state when no conversations', () => {
      render(
        <ConversationList
          conversations={[]}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    it('empty state has correct styling', () => {
      const { container } = render(
        <ConversationList
          conversations={[]}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
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
          conversations={[]}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.queryByTestId(/conversation-item/)).not.toBeInTheDocument();
    });
  });

  describe('List Rendering', () => {
    it('renders all conversations', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getByText('First Conversation')).toBeInTheDocument();
      expect(screen.getByText('Second Conversation')).toBeInTheDocument();
      expect(screen.getByText('Third Conversation')).toBeInTheDocument();
    });

    it('renders correct number of conversation items', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const items = screen.getAllByTestId(/conversation-item/);
      expect(items).toHaveLength(3);
    });

    it('passes correct props to ConversationListItem', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId="conv-2"
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const item2 = screen.getByTestId('conversation-item-conv-2');
      expect(item2).toHaveAttribute('data-active', 'true');
    });

    it('marks only active conversation as active', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId="conv-2"
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-active', 'false');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-active', 'true');
      expect(screen.getByTestId('conversation-item-conv-3')).toHaveAttribute('data-active', 'false');
    });

    it('handles null activeConversationId', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const items = screen.getAllByTestId(/conversation-item/);
      items.forEach((item) => {
        expect(item).toHaveAttribute('data-active', 'false');
      });
    });
  });

  describe('Scrollable Container', () => {
    it('has scrollable container', () => {
      const { container } = render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveClass('overflow-y-auto');
    });

    it('has flex-1 to take available space', () => {
      const { container } = render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveClass('flex-1');
    });

    it('has gap between items', () => {
      const { container } = render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const itemsContainer = container.querySelector('.gap-1');
      expect(itemsContainer).toBeInTheDocument();
    });

    it('has padding around items', () => {
      const { container } = render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const itemsContainer = container.querySelector('.p-2');
      expect(itemsContainer).toBeInTheDocument();
    });
  });

  describe('Selection Propagation', () => {
    it('calls onSelectConversation when conversation clicked', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const item = screen.getByTestId('conversation-item-conv-2');
      item.click();

      expect(mockOnSelectConversation).toHaveBeenCalledWith('conv-2');
      expect(mockOnSelectConversation).toHaveBeenCalledTimes(1);
    });

    it('calls onDeleteConversation when delete clicked', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const item = screen.getByTestId('conversation-item-conv-1');
      const deleteButton = within(item).getByText('Delete');
      deleteButton.click();

      expect(mockOnDeleteConversation).toHaveBeenCalledWith('conv-1');
      expect(mockOnDeleteConversation).toHaveBeenCalledTimes(1);
    });

    it('does not call onSelectConversation when delete clicked', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const item = screen.getByTestId('conversation-item-conv-1');
      const deleteButton = within(item).getByText('Delete');
      deleteButton.click();

      expect(mockOnSelectConversation).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles single conversation', () => {
      render(
        <ConversationList
          conversations={[mockConversations[0]]}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
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
        messageCount: i,
      }));

      render(
        <ConversationList
          conversations={manyConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const items = screen.getAllByTestId(/conversation-item/);
      expect(items).toHaveLength(100);
    });

    it('handles conversation with no active state', () => {
      render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId="non-existent-id"
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      const items = screen.getAllByTestId(/conversation-item/);
      items.forEach((item) => {
        expect(item).toHaveAttribute('data-active', 'false');
      });
    });

    it('re-renders when conversations change', () => {
      const { rerender } = render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getAllByTestId(/conversation-item/)).toHaveLength(3);

      const newConversations = [...mockConversations, {
        id: 'conv-4',
        title: 'Fourth Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
        mode: 'consult' as const,
        messageCount: 2,
      }];

      rerender(
        <ConversationList
          conversations={newConversations}
          activeConversationId={null}
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getAllByTestId(/conversation-item/)).toHaveLength(4);
      expect(screen.getByText('Fourth Conversation')).toBeInTheDocument();
    });

    it('re-renders when activeConversationId changes', () => {
      const { rerender } = render(
        <ConversationList
          conversations={mockConversations}
          activeConversationId="conv-1"
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-active', 'true');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-active', 'false');

      rerender(
        <ConversationList
          conversations={mockConversations}
          activeConversationId="conv-2"
          onSelectConversation={mockOnSelectConversation}
          onDeleteConversation={mockOnDeleteConversation}
        />
      );

      expect(screen.getByTestId('conversation-item-conv-1')).toHaveAttribute('data-active', 'false');
      expect(screen.getByTestId('conversation-item-conv-2')).toHaveAttribute('data-active', 'true');
    });
  });
});
