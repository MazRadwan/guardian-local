'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Search, X, MessageSquare } from 'lucide-react';
import { Conversation } from '@/stores/chatStore';
import { formatDistanceToNow, isToday, isYesterday, isWithinInterval, subDays } from 'date-fns';

interface ConversationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
}

interface GroupedConversations {
  yesterday: Conversation[];
  previous7Days: Conversation[];
  previous30Days: Conversation[];
  older: Conversation[];
}

export function ConversationSearchModal({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
}: ConversationSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Filter conversations by search query
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group conversations by date
  const groupedConversations: GroupedConversations = filteredConversations.reduce(
    (groups, conv) => {
      const updatedAt = new Date(conv.updatedAt);
      const now = new Date();

      if (isYesterday(updatedAt)) {
        groups.yesterday.push(conv);
      } else if (isWithinInterval(updatedAt, { start: subDays(now, 7), end: now })) {
        groups.previous7Days.push(conv);
      } else if (isWithinInterval(updatedAt, { start: subDays(now, 30), end: now })) {
        groups.previous30Days.push(conv);
      } else {
        groups.older.push(conv);
      }

      return groups;
    },
    { yesterday: [], previous7Days: [], previous30Days: [], older: [] } as GroupedConversations
  );

  // Flatten groups for keyboard navigation
  const allResults = [
    ...groupedConversations.yesterday,
    ...groupedConversations.previous7Days,
    ...groupedConversations.previous30Days,
    ...groupedConversations.older,
  ];

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && allResults.length > 0) {
      e.preventDefault();
      handleSelect(allResults[selectedIndex].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (conversationId: string) => {
    onSelectConversation(conversationId);
    onClose();
  };

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
        <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
          {/* Search Input */}
          <div className="relative border-b border-gray-200 px-6 py-4">
            <Search className="absolute left-8 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-10 pr-10 text-lg outline-none placeholder:text-gray-400"
              aria-label="Search conversations"
            />
            <button
              onClick={onClose}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Results */}
          <div ref={resultsRef} className="max-h-96 overflow-y-auto p-4">
            {allResults.length === 0 ? (
              // Empty state
              <div className="py-12 text-center">
                <p className="text-gray-500">No conversations found</p>
              </div>
            ) : (
              <>
                {/* Yesterday */}
                {groupedConversations.yesterday.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                      Yesterday
                    </h3>
                    {groupedConversations.yesterday.map((conv, idx) => (
                      <ConversationSearchResult
                        key={conv.id}
                        conversation={conv}
                        isSelected={allResults.indexOf(conv) === selectedIndex}
                        dataIndex={allResults.indexOf(conv)}
                        onClick={() => handleSelect(conv.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Previous 7 Days */}
                {groupedConversations.previous7Days.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                      Previous 7 Days
                    </h3>
                    {groupedConversations.previous7Days.map((conv) => (
                      <ConversationSearchResult
                        key={conv.id}
                        conversation={conv}
                        isSelected={allResults.indexOf(conv) === selectedIndex}
                        dataIndex={allResults.indexOf(conv)}
                        onClick={() => handleSelect(conv.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Previous 30 Days */}
                {groupedConversations.previous30Days.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                      Previous 30 Days
                    </h3>
                    {groupedConversations.previous30Days.map((conv) => (
                      <ConversationSearchResult
                        key={conv.id}
                        conversation={conv}
                        isSelected={allResults.indexOf(conv) === selectedIndex}
                        dataIndex={allResults.indexOf(conv)}
                        onClick={() => handleSelect(conv.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Older */}
                {groupedConversations.older.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                      Older
                    </h3>
                    {groupedConversations.older.map((conv) => (
                      <ConversationSearchResult
                        key={conv.id}
                        conversation={conv}
                        isSelected={allResults.indexOf(conv) === selectedIndex}
                        dataIndex={allResults.indexOf(conv)}
                        onClick={() => handleSelect(conv.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

interface ConversationSearchResultProps {
  conversation: Conversation;
  isSelected: boolean;
  dataIndex: number;
  onClick: () => void;
}

function ConversationSearchResult({
  conversation,
  isSelected,
  dataIndex,
  onClick,
}: ConversationSearchResultProps) {
  return (
    <button
      data-index={dataIndex}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors
        ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}
      `}
      aria-label={`Select ${conversation.title}`}
    >
      <MessageSquare className="h-4 w-4 text-gray-400 flex-shrink-0" />
      <span className="flex-1 truncate text-sm text-gray-900">
        {conversation.title}
      </span>
    </button>
  );
}
