'use client';

import { useEffect } from 'react';
import { SquarePen, LogOut, MessageSquare, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationList } from './ConversationList';
import { Conversation } from '@/stores/chatStore';

interface SidebarProps {
  isOpen: boolean;
  isMinimized: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  userName?: string;
  userRole?: string;
  // Conversation management
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function Sidebar({
  isOpen,
  isMinimized,
  onToggle,
  onCloseMobile,
  onNewChat,
  onLogout,
  userName,
  userRole,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  // Mobile: drawer overlay pattern
  // Desktop: persistent sidebar with toggle

  // Keyboard support: Close mobile drawer with Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      // Only close on mobile when drawer is open
      if (e.key === 'Escape' && isOpen && window.innerWidth < 768) {
        onCloseMobile?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCloseMobile]);

  return (
    <>
      {/* Backdrop for mobile drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-200
          transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isMinimized ? 'md:w-12 bg-white' : 'md:w-64 bg-gray-50'}
          w-64 bg-gray-50
        `}
        role="navigation"
        aria-label="Sidebar navigation"
      >
        {/* Section 1: Toggle Button Only */}
        <div className="p-2">
          <button
            onClick={onToggle}
            className={`flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors ${
              isMinimized ? 'h-10 w-10' : 'h-8 w-8'
            }`}
            title={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-expanded={!isMinimized}
          >
            <PanelLeft className={`h-5 w-5 text-gray-700 ${isMinimized ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Section 2: New Chat Button */}
        <div className="p-2">
          {isMinimized ? (
            <button
              onClick={onNewChat}
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="New Chat"
              aria-label="New Chat"
            >
              <SquarePen className="h-5 w-5 text-gray-700" />
            </button>
          ) : (
            <Button
              onClick={onNewChat}
              variant="outline"
              className="w-full flex items-center gap-2 justify-start"
            >
              <SquarePen className="h-[18px] w-[18px]" />
              <span>New chat</span>
            </Button>
          )}
        </div>

        {/* Middle Section - Conversation List */}
        {isMinimized ? (
          // Minimized: Show conversation icons (first letter of title)
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex flex-col gap-2">
              {conversations.length === 0 ? (
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                  title="No conversations"
                  aria-label="No conversations"
                >
                  <MessageSquare className="h-5 w-5 text-gray-500" />
                </button>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => onSelectConversation(conversation.id)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors text-sm font-medium ${
                      conversation.id === activeConversationId
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    title={conversation.title}
                    aria-label={`Select ${conversation.title}`}
                  >
                    {conversation.title.charAt(0).toUpperCase()}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          // Expanded: Show full conversation list
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
          />
        )}

        {/* Footer Section - Logout */}
        <div className="p-3">
          {isMinimized ? (
            // Minimized: Icon only
            <button
              onClick={onLogout}
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5 text-gray-700" />
            </button>
          ) : (
            // Expanded: Full button with user info
            <div className="space-y-2">
              {userName && (
                <div className="px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">{userName}</div>
                  {userRole && (
                    <div className="text-xs text-gray-500">({userRole})</div>
                  )}
                </div>
              )}
              <Button
                onClick={onLogout}
                variant="ghost"
                className="w-full flex items-center gap-2 justify-start text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span>Logout</span>
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
