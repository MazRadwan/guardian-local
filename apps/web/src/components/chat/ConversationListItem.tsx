'use client';

import { MessageSquare, Trash2 } from 'lucide-react';
import { Conversation } from '@/stores/chatStore';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationListItem({
  conversation,
  isActive,
  onClick,
  onDelete,
}: ConversationListItemProps) {
  const handleClick = () => {
    onClick(conversation.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onClick
    onDelete(conversation.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onClick(conversation.id);
    } else if (e.key === 'Delete') {
      e.stopPropagation();
      onDelete(conversation.id);
    }
  };

  // Format timestamp as relative time
  const formattedTime = formatDistanceToNow(new Date(conversation.updatedAt), {
    addSuffix: true,
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        group relative flex items-center gap-3 rounded-lg p-3 transition-colors cursor-pointer
        h-12
        ${isActive ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-100'}
      `}
      aria-label={`${conversation.title}, ${formattedTime}`}
      aria-current={isActive ? 'true' : 'false'}
    >
      {/* Icon */}
      <MessageSquare className="h-4 w-4 text-gray-500 flex-shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {/* Title */}
        <span className="text-sm font-medium text-gray-900 truncate flex-1">
          {conversation.title}
        </span>
      </div>

      {/* Timestamp (hidden on active, shown on hover) */}
      <span className="text-xs text-gray-500 flex-shrink-0 group-hover:hidden">
        {formattedTime.replace(' ago', '')}
      </span>

      {/* Delete button (only visible on hover) */}
      <button
        onClick={handleDelete}
        className="hidden group-hover:flex items-center justify-center p-1 rounded hover:bg-red-50 transition-colors"
        aria-label={`Delete ${conversation.title}`}
        title="Delete conversation"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
      </button>
    </div>
  );
}
