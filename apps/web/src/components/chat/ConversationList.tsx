'use client';

import { ConversationListItem } from './ConversationListItem';
import { Conversation } from '@/stores/chatStore';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  editingConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameStart: (id: string) => void;
  onRenameComplete: (id: string, newTitle: string) => void;
  onRenameCancel: () => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  editingConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRenameStart,
  onRenameComplete,
  onRenameCancel,
}: ConversationListProps) {
  // Empty state
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-gray-500">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" data-testid="conversation-list">
      <div className="flex flex-col gap-1 p-2">
        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            isEditing={conversation.id === editingConversationId}
            onClick={onSelectConversation}
            onDelete={onDeleteConversation}
            onRenameStart={onRenameStart}
            onRenameComplete={onRenameComplete}
            onRenameCancel={onRenameCancel}
          />
        ))}
      </div>
    </div>
  );
}
