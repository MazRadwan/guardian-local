'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Conversation } from '@/stores/chatStore';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  isEditing: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  onRenameStart: (id: string) => void;
  onRenameComplete: (id: string, newTitle: string) => void;
  onRenameCancel: () => void;
}

export function ConversationListItem({
  conversation,
  isActive,
  isEditing,
  onClick,
  onDelete,
  onRenameStart,
  onRenameComplete,
  onRenameCancel,
}: ConversationListItemProps) {
  const [localTitle, setLocalTitle] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update local title when conversation title changes
  useEffect(() => {
    setLocalTitle(conversation.title);
  }, [conversation.title]);

  const handleClick = () => {
    if (!isEditing) {
      onClick(conversation.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) return;

    if (e.key === 'Enter') {
      onClick(conversation.id);
    } else if (e.key === 'Delete') {
      e.stopPropagation();
      onDelete(conversation.id);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleRenameCancel();
    }
  };

  const handleRenameSave = () => {
    const trimmedTitle = localTitle.trim();
    if (trimmedTitle && trimmedTitle !== conversation.title) {
      onRenameComplete(conversation.id, trimmedTitle);
    } else {
      handleRenameCancel();
    }
  };

  const handleRenameCancel = () => {
    setLocalTitle(conversation.title);
    onRenameCancel();
  };

  // Format timestamp as relative time
  const formattedTime = formatDistanceToNow(new Date(conversation.updatedAt), {
    addSuffix: true,
  });

  // Determine display title - show "New Chat" with pulse animation while loading
  const displayTitle = conversation.titleLoading
    ? 'New Chat'
    : conversation.title || 'New Chat';

  return (
    <div
      role="button"
      tabIndex={isEditing ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid={`conversation-item-${conversation.id}`}
      className={cn(
        'group relative flex items-center rounded-lg pl-3 pr-3 py-2 transition-colors cursor-pointer min-h-10',
        isActive
          ? 'bg-blue-50 border-l-2 border-blue-500'
          : 'hover:bg-gray-100',
        isEditing && 'bg-gray-50'
      )}
      aria-label={`${displayTitle}, ${formattedTime}`}
      aria-current={isActive ? 'true' : 'false'}
    >
      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameSave}
            data-testid={`conversation-rename-input-${conversation.id}`}
            className="flex-1 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={50}
          />
        ) : (
          <span
            data-testid={`conversation-title-${conversation.id}`}
            className={cn(
              'text-xs leading-tight font-medium text-gray-900 truncate flex-1 transition-all duration-300',
              conversation.titleLoading && 'animate-pulse text-gray-500'
            )}
          >
            {displayTitle}
          </span>
        )}
      </div>

      {/* Timestamp (hidden on active/hover, hidden during edit) */}
      {!isEditing && (
        <span className="text-xs text-gray-500 flex-shrink-0 group-hover:hidden">
          {formattedTime.replace(' ago', '')}
        </span>
      )}

      {/* Dropdown Menu (only visible on hover, hidden during edit) */}
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              data-testid={`conversation-menu-trigger-${conversation.id}`}
              className="flex items-center justify-center p-1 rounded hover:bg-gray-200 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
              aria-label={`Options for ${displayTitle}`}
            >
              <MoreHorizontal className="h-4 w-4 text-gray-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRenameStart(conversation.id);
              }}
              data-testid={`conversation-rename-option-${conversation.id}`}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Pencil className="h-4 w-4" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conversation.id);
              }}
              data-testid={`conversation-delete-option-${conversation.id}`}
              className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
